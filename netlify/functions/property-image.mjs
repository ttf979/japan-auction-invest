import { mediaStore, safeCaseId } from '../lib/archive.mjs';
import { trustedPhoto, PHOTO_POLICY } from '../lib/photo-policy.mjs';
import ingest from './ingest-case.mjs';
export default async (req) => {
  if (req.method !== 'GET') return new Response('method_not_allowed', { status: 405 });
  const u = new URL(req.url), id = u.searchParams.get('id') || '';
  if (!safeCaseId(id)) return Response.json({ok:false,error:'bad_case_id'}, {status:400});
  const debug = u.searchParams.get('debug') === '1', store = mediaStore();
  let cached = await store.getWithMetadata(`${id}/cover`, {type:'arrayBuffer'}).catch(()=>null), failure = null;
  if (!cached?.data || !trustedPhoto(cached.metadata)) {
    const url = u.searchParams.get('url');
    if (url) {
      const response = await ingest(new Request(new URL('/api/ingest-case', req.url), {
        method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({url,caseId:id})
      }));
      const result = await response.json();
      failure = result.error || (result.mainImage ? null : 'main_photo_not_ready');
      cached = await store.getWithMetadata(`${id}/cover`, {type:'arrayBuffer'}).catch(()=>null);
    }
  }
  if (cached?.data && trustedPhoto(cached.metadata)) {
    if (debug) return Response.json({ok:true,cached:true,metadata:cached.metadata}, {headers:{'cache-control':'no-store'}});
    return new Response(cached.data, {headers:{'content-type':cached.metadata.contentType,
      'cache-control':'public, max-age=300','x-photo-policy':PHOTO_POLICY,
      'x-photo-method':cached.metadata.method,'x-pdf-page':String(cached.metadata.pdfPage||'')}});
  }
  return Response.json({ok:false,error:failure||'main_photo_not_ready',policy:PHOTO_POLICY},
    {status:404,headers:{'cache-control':'no-store'}});
};
export const config={path:'/api/property-image'};
