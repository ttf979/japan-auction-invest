import { bitUrl, blockedPage, PHOTO_POLICY, trustedPhoto } from '../lib/photo-policy.mjs';
import seeds from '../../data/bit-sources.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { extractLargestPhotoFromPdf } from '../lib/pdf-photo.mjs';
import { discoveryStore } from '../lib/discovery.mjs';
import { ingestStore, documentStore, mediaStore, safeCaseId, safeFilePart } from '../lib/archive.mjs';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';
const allowed=['xn--55q36pba3495a.com','www.xn--55q36pba3495a.com','981.jp','www.981.jp','bit.courts.go.jp','www.bit.courts.go.jp'];
const hdr={'user-agent':UA,'accept-language':'ja,en-US;q=0.8,en;q=0.6','cache-control':'no-cache'};

function resolveUrl(raw,base){ try{return new URL(String(raw||'').replace(/&amp;/g,'&'),base).href;}catch{return null;} }
function allowedUrl(url){ try{return allowed.includes(new URL(url).hostname);}catch{return false;} }
async function f(url,options={},ms=18000){ const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms); try{return await fetch(url,{...options,signal:ac.signal,redirect:'follow'});}finally{clearTimeout(t);} }
function strip(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function htmlFromMarkdown(md=''){
  return md.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<a href="$2">$1</a>');
}
async function fetchHtml(source){
  try{const r=await f(source,{headers:{...hdr,accept:'text/html,application/xhtml+xml,*/*;q=0.8'}},15000);if(r.ok){const html=await r.text();if(!blockedPage(html))return {html,via:'direct',status:r.status,finalUrl:r.url||source};}}catch{}
  try{const r=await f('https://r.jina.ai/'+source,{headers:{'user-agent':UA,accept:'text/plain'}},18000);if(r.ok){const html=htmlFromMarkdown(await r.text());if(!blockedPage(html))return {html,via:'jina',status:r.status,finalUrl:source};}}catch{}
  throw new Error('source_fetch_failed');
}
function documentCandidates(html,base){
  const out=[]; let m;
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
  while((m=re.exec(html))){
    const url=resolveUrl(m[1],base); if(!url)continue;
    const text=strip(m[2]); const isBit=/bit\.courts\.go\.jp/i.test(url);
    const isBitBundle=isBit&&(/\/app\/detail\/pd001\/h04/i.test(url)||/物件資料|３点|3点|三点/i.test(text));
    const looksDoc=/\.pdf(?:\?|$)/i.test(url)||/物件明細|現況調査|評価書|評價書|３点|3点|三点|物件資料/i.test(text);
    if(!looksDoc&&!isBitBundle)continue;
    let score=10,type='document';
    if(isBitBundle){score+=250;type='三點件一括';}
    if(/物件明細/i.test(text+url)){score+=80;type='物件明細書';}
    if(/現況調査/i.test(text+url)){score+=100;type='現況調査報告書';}
    if(/評価書|評價書/i.test(text+url)){score+=90;type='評価書';}
    out.push({url,text,type,score});
  }
  const raw=/["']([^"']+\.pdf(?:\?[^"']*)?)["']/ig;
  while((m=raw.exec(html))){const url=resolveUrl(m[1],base);if(url)out.push({url,text:'pdf',type:'document',score:5});}
  const seen=new Set();return out.filter(x=>!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>b.score-a.score);
}
function bitIds(url){try{const u=new URL(url);return {courtId:u.searchParams.get('courtId')||null,saleUnitId:u.searchParams.get('saleUnitId')||null};}catch{return {courtId:null,saleUnitId:null};}}
async function fetchResource(item,referer){
  item={...item,url:bitUrl(item.url)}; if(!item.url)throw new Error('untrusted_document_source');
  const r=await f(item.url,{headers:{...hdr,accept:'application/pdf,text/html,image/*,*/*;q=0.8',referer}},30000);
  if(!r.ok)throw new Error(`http_${r.status}`); if(!bitUrl(r.url||item.url))throw new Error('untrusted_redirect');
  const ct=(r.headers.get('content-type')||'application/octet-stream').toLowerCase();
  const buf=await r.arrayBuffer();if(buf.byteLength<800)throw new Error('resource_too_small');
  const head=new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0,8)));
  if(head.startsWith('%PDF'))return {kind:'pdf',contentType:'application/pdf',bytes:buf,finalUrl:r.url||item.url};
  if(ct.includes('html')||head.trimStart().startsWith('<!DOCT')||head.trimStart().startsWith('<html'))return {kind:'html',contentType:'text/html; charset=utf-8',bytes:buf,html:new TextDecoder('utf-8').decode(buf),finalUrl:r.url||item.url};
  return {kind:'binary',contentType:ct,bytes:buf,finalUrl:r.url||item.url};
}
async function updateDiscovery(id,patch){
  try{const store=discoveryStore();const items=await store.get('current',{type:'json'}).catch(()=>null)||[];let changed=false;const next=items.map(x=>{if(String(x.id)!==String(id))return x;changed=true;return {...x,...patch};});if(changed)await store.setJSON('current',next);}catch{}
}

export default async(req)=>{
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  let input={};try{input=await req.json();}catch{return Response.json({ok:false,error:'invalid_json'},{status:400});}
  const source=input.url||input.sourceUrl;const guessed=String(input.caseId||input.id||((source||'').match(/auction\/(\d+)/)||[])[1]||'').trim();
  if(!source||!allowedUrl(source))return Response.json({ok:false,error:'bad_or_missing_url'},{status:400});
  const id=guessed||`case-${Date.now()}`;if(!safeCaseId(id))return Response.json({ok:false,error:'bad_case_id'},{status:400});

  const prior=await ingestStore().get(`cases/${id}`,{type:'json'}).catch(()=>null);
  const known=bitUrl(prior?.bitUrl)||bitUrl(seeds[id]?.bitUrl)||bitUrl(source);
  let page={html:'',via:'saved-bit-reference'};
  if(!known){try{page=await fetchHtml(source);}catch(e){return Response.json({ok:false,error:e.message,caseId:id},{status:502});}}
  const discovered=(known?[{url:known,type:'三點件一括',score:999}]:documentCandidates(page.html,source).map(x=>({...x,url:bitUrl(x.url)})).filter(x=>x.url)).slice(0,10);
  const primaryBit=discovered.find(x=>/bit\.courts\.go\.jp/i.test(x.url));const ids=bitIds(primaryBit?.url||'');
  const docsStore=documentStore(), media=mediaStore(), index=ingestStore();
  if(page.html)await docsStore.set(`${id}/source.html`,page.html,{metadata:{contentType:'text/html; charset=utf-8',sourceUrl:source,fetchedAt:new Date().toISOString(),via:page.via}});

  const queue=[...discovered.slice(0,5)];const seen=new Set();const saved=[];let bestPhoto=null;
  while(queue.length&&saved.length<8){
    const item=queue.shift();if(!item?.url||seen.has(item.url))continue;seen.add(item.url);
    try{
      const res=await fetchResource(item,source);const docId=`${String(saved.length+1).padStart(2,'0')}-${safeFilePart(item.type||'document')}`;let ext=res.kind==='pdf'?'pdf':res.kind==='html'?'html':'bin';const key=`${id}/${docId}.${ext}`;
      await docsStore.set(key,res.bytes,{metadata:{contentType:res.contentType,originalUrl:item.url,type:item.type||'document',fetchedAt:new Date().toISOString()}});
      const entry={documentId:docId,type:item.type||'document',originalUrl:item.url,storageKey:key,contentType:res.contentType,size:res.bytes.byteLength,saved:true,downloadUrl:`/api/case-document?id=${encodeURIComponent(id)}&doc=${encodeURIComponent(docId)}`};saved.push(entry);
      if(res.kind==='pdf'){
        try{const p=await extractLargestPhotoFromPdf(res.bytes,{maxPages:64,verifiedCrop:createHash('sha256').update(new Uint8Array(res.bytes)).digest('hex')===seeds[id]?.pdfSha256?seeds[id].photoCrop:null});if(p&&(!bestPhoto||item.type==='現況調査報告書'||item.type==='三點件一括'))bestPhoto={...p,from:item.type||'document',source:item.url};}catch(e){entry.photoError=e.message;}
      }else if(res.kind==='html'){
        if(/bit\.courts\.go\.jp/i.test(item.url)){
          const nested=documentCandidates(res.html,item.url).filter(x=>!seen.has(x.url));for(const n of nested.slice(0,5))queue.push(n);
        }
      }
    }catch(e){saved.push({documentId:`failed-${saved.length+1}`,type:item.type||'document',originalUrl:item.url,error:e.message,saved:false});}
  }

  let mainImage=null;if(bestPhoto?.body){const body=bestPhoto.body instanceof ArrayBuffer?bestPhoto.body:bestPhoto.body.buffer.slice(bestPhoto.body.byteOffset,bestPhoto.body.byteOffset+bestPhoto.body.byteLength);await media.set(`${id}/cover`,body,{metadata:{policy:PHOTO_POLICY,contentType:bestPhoto.contentType||'image/jpeg',method:bestPhoto.method||'three-doc-pdf',source:bestPhoto.source||null,pdfType:bestPhoto.from||null,pdfPage:bestPhoto.page||null,fetchedAt:new Date().toISOString()}});mainImage={policy:PHOTO_POLICY,source:bestPhoto.source,storageKey:`${id}/cover`,contentType:bestPhoto.contentType||'image/jpeg',method:bestPhoto.method||'three-doc-pdf',pdfType:bestPhoto.from||null,pdfPage:bestPhoto.page||null};}

  if(!mainImage && trustedPhoto(prior?.mainImage))mainImage=prior.mainImage;
  const allDocs=[...(prior?.documents||[]).filter(d=>d.saved&&!saved.some(n=>n.saved&&n.documentId===d.documentId)),...saved];
  const record={caseId:id,sourceUrl:source,sourceSite:new URL(source).hostname,ingestedAt:new Date().toISOString(),pageVia:page.via,courtId:ids.courtId,saleUnitId:ids.saleUnitId,bitUrl:primaryBit?.url||null,hints:{title:input.title||null,prefecture:input.prefecture||null,city:input.city||null,court:input.court||null,price:input.price||null,type:input.type||null,area:input.area||null,bid:input.bid||null},documents:allDocs,mainImage};
  await index.setJSON(`cases/${id}`,record);
  const successful=allDocs.filter(x=>x.saved&&x.contentType==='application/pdf').length;
  await updateDiscovery(id,{bitUrl:record.bitUrl||undefined,courtId:record.courtId||undefined,saleUnitId:record.saleUnitId||undefined,bitStatus:record.bitUrl?(successful?`BIT已定位／三點件已存 ${successful} 份`:'BIT已定位／文件待重試'):'待BIT定位',imageStatus:mainImage?'主圖已建立':'待主圖',documentCount:successful,lastCheckedAt:new Date().toISOString()});
  return Response.json({ok:!!mainImage,error:mainImage?null:(successful?'main_photo_not_ready':'three_docs_not_found'),...record,storage:'netlify-blobs',savedCount:successful});
};

export const config={path:'/api/ingest-case'};
