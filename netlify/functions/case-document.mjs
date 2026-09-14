import { ingestStore, documentStore, safeCaseId, safeDocId, safeFilePart } from '../lib/archive.mjs';

export default async(req)=>{
  if(req.method!=='GET')return new Response('method_not_allowed',{status:405});
  const u=new URL(req.url),id=u.searchParams.get('id')||'',doc=u.searchParams.get('doc')||'';
  if(!safeCaseId(id)||!safeDocId(doc))return new Response('bad_request',{status:400});
  const record=await ingestStore().get(`cases/${id}`,{type:'json'}).catch(()=>null);if(!record)return new Response('not_found',{status:404});
  const entry=(record.documents||[]).find(x=>x.documentId===doc&&x.saved&&x.storageKey);if(!entry)return new Response('document_not_found',{status:404});
  const got=await documentStore().getWithMetadata(entry.storageKey,{type:'arrayBuffer'}).catch(()=>null);if(!got?.data)return new Response('document_missing',{status:404});
  const ext=(entry.contentType||'').includes('pdf')?'pdf':(entry.contentType||'').includes('html')?'html':'bin';
  const name=`${id}_${safeFilePart(entry.type||doc)}.${ext}`;
  return new Response(got.data,{headers:{'content-type':got.metadata?.contentType||entry.contentType||'application/octet-stream','content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'cache-control':'private, no-store'}});
};
export const config={path:'/api/case-document'};
