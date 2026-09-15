import prepared from '../../data/prepared-covers.json' with {type:'json'};
import seeds from '../../data/bit-sources.json' with {type:'json'};
import {bitUrl,PHOTO_POLICY} from './photo-policy.mjs';
export function preparedCover(id){
  const p=prepared[id],seed=seeds[id];
  if(!p?.body||!seed?.pdfSha256||p.pdfSha256!==seed.pdfSha256||!bitUrl(p.source)||bitUrl(p.source)!==bitUrl(seed.bitUrl))return null;
  return {data:Buffer.from(p.body,'base64'),metadata:{policy:PHOTO_POLICY,source:bitUrl(p.source),contentType:'image/jpeg',method:'three-doc-pdf',pdfPage:p.page,pdfSha256:p.pdfSha256,preparedAt:p.preparedAt}};
}
