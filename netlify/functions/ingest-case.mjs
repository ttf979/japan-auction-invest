import { getStore } from '@netlify/blobs';
import { ensureDriveFolder, upsertDriveFile, driveConfigStatus, upsertDriveIndexCase } from '../lib/drive.mjs';
import { extractLargestPhotoFromPdf } from '../lib/pdf-photo.mjs';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';
const allowed=['xn--55q36pba3495a.com','www.xn--55q36pba3495a.com','981.jp','www.981.jp','bit.courts.go.jp','www.bit.courts.go.jp'];
function env(k){ try{return Netlify.env.get(k);}catch{return null;} }
function resolveUrl(raw,base){ try{return new URL(String(raw||'').replace(/&amp;/g,'&'),base).href;}catch{return null;} }
function allowedUrl(url){ try{return allowed.includes(new URL(url).hostname);}catch{return false;} }
async function f(url,options={},ms=18000){ const ac=new AbortController(),t=setTimeout(()=>ac.abort(),ms); try{return await fetch(url,{...options,signal:ac.signal,redirect:'follow'});}finally{clearTimeout(t);} }
const hdr={'user-agent':UA,'accept-language':'ja,en-US;q=0.8,en;q=0.6','cache-control':'no-cache'};

function htmlFromMarkdown(md=''){
  return md
    .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<img src="$1">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<a href="$2">$1</a>');
}

function documentCandidates(html,base){
  const out=[]; let m;
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
  while((m=re.exec(html))){
    const url=resolveUrl(m[1],base); if(!url)continue;
    const text=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    const isBit=/bit\.courts\.go\.jp/i.test(url);
    const isBitBundle=isBit && (/\/app\/detail\/pd001\/h04/i.test(url)||/物件資料|３点|3点|三点/i.test(text));
    const looksDoc=/\.pdf(?:\?|$)/i.test(url)||/物件明細|現況調査|評価書|評價書|３点|3点|三点|物件資料/i.test(text);
    if(!looksDoc&&!isBitBundle) continue;
    let score=10,type='document';
    if(isBitBundle){score+=250;type='三點件一括';}
    if(/物件明細/i.test(text+url)){score+=80;type='物件明細書';}
    if(/現況調査/i.test(text+url)){score+=100;type='現況調査報告書';}
    if(/評価書|評價書/i.test(text+url)){score+=90;type='評価書';}
    out.push({url,text,type,score});
  }
  const raw=/["']([^"']+\.pdf(?:\?[^"']*)?)["']/ig;
  while((m=raw.exec(html))){const url=resolveUrl(m[1],base);if(url)out.push({url,text:'pdf',type:'document',score:5});}
  const seen=new Set();
  return out.filter(x=>!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>b.score-a.score);
}

function bitIds(url){
  try{const u=new URL(url);return {courtId:u.searchParams.get('courtId')||null,saleUnitId:u.searchParams.get('saleUnitId')||null};}
  catch{return {courtId:null,saleUnitId:null};}
}

async function fetchHtml(source){
  try{
    const r=await f(source,{headers:{...hdr,accept:'text/html,application/xhtml+xml,*/*;q=0.8'}},15000);
    if(r.ok)return {html:await r.text(),via:'direct',status:r.status};
  }catch{}
  // No Firecrawl. Jina Reader is only a transport fallback for HTML pages blocked from Netlify IPs.
  try{
    const r=await f('https://r.jina.ai/'+source,{headers:{'user-agent':UA,accept:'text/plain'}},18000);
    if(r.ok)return {html:htmlFromMarkdown(await r.text()),via:'jina',status:r.status};
  }catch{}
  throw new Error('source_fetch_failed');
}

async function downloadPdf(item,source){
  const r=await f(item.url,{headers:{...hdr,accept:'application/pdf,*/*;q=0.8',referer:source}},30000);
  if(!r.ok) throw new Error(`pdf_http_${r.status}`);
  const ct=(r.headers.get('content-type')||'').toLowerCase();
  const buf=await r.arrayBuffer();
  if(buf.byteLength<10000)throw new Error('pdf_too_small');
  if(!ct.includes('pdf') && !/bit\.courts\.go\.jp\/app\/detail\/pd001\/h04/i.test(item.url) && !/\.pdf(?:\?|$)/i.test(item.url)) throw new Error(`not_pdf_${ct||'unknown'}`);
  return buf;
}

export default async(req)=>{
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  let input={}; try{input=await req.json();}catch{return Response.json({ok:false,error:'invalid_json'},{status:400});}
  const source=input.url||input.sourceUrl, caseId=String(input.caseId||input.id||'').trim();
  if(!source||!allowedUrl(source))return Response.json({ok:false,error:'bad_or_missing_url'},{status:400});
  const id=caseId||((source.match(/auction\/(\d+)/)||[])[1])||`case-${Date.now()}`;

  let page; try{page=await fetchHtml(source);}catch(e){return Response.json({ok:false,error:e.message,caseId:id},{status:502});}
  const discovered=documentCandidates(page.html,source).slice(0,8);
  if(!discovered.length)return Response.json({ok:false,error:'three_docs_not_found',caseId:id,pageVia:page.via},{status:404});
  const bundle=discovered.find(x=>x.type==='三點件一括');
  const docs=bundle?[bundle]:discovered.filter(x=>['物件明細書','現況調査報告書','評価書','document'].includes(x.type)).slice(0,3);

  const cfg=driveConfigStatus();
  if(!cfg.configured)return Response.json({ok:false,error:'drive_not_configured',missing:cfg.missing,caseId:id,pageVia:page.via,discoveredDocs:discovered.map(x=>({type:x.type,url:x.url,text:x.text}))},{status:503});

  const rawRoot=env('GDRIVE_CASE_FILES_FOLDER_ID'), threeRoot=env('GDRIVE_THREE_DOCS_FOLDER_ID'), imageRoot=env('GDRIVE_IMAGES_FOLDER_ID'), analysisRoot=env('GDRIVE_ANALYSIS_FOLDER_ID');
  if(!rawRoot||!threeRoot||!imageRoot||!analysisRoot)return Response.json({ok:false,error:'drive_folder_env_missing',caseId:id},{status:503});

  const folderName=`${id}_${String(input.city||input.title||'案件').replace(/[\\/:*?"<>|]/g,'_')}`;
  const [rawFolder,docFolder,imgFolder,analysisFolder]=await Promise.all([
    ensureDriveFolder(folderName,rawRoot),ensureDriveFolder(folderName,threeRoot),ensureDriveFolder(folderName,imageRoot),ensureDriveFolder(folderName,analysisRoot)
  ]);

  const primaryBit=discovered.find(x=>/bit\.courts\.go\.jp/i.test(x.url));
  const ids=bitIds(primaryBit?.url||'');
  const sourceRecord={
    caseId:id,sourceUrl:source,sourceSite:new URL(source).hostname,ingestedAt:new Date().toISOString(),pageVia:page.via,
    courtId:ids.courtId,saleUnitId:ids.saleUnitId,bitUrl:primaryBit?.url||null,
    hints:{title:input.title||null,prefecture:input.prefecture||null,city:input.city||null,court:input.court||null,price:input.price||null,type:input.type||null,area:input.area||null,bid:input.bid||null},
    discoveredDocuments:discovered.map(x=>({type:x.type,url:x.url,text:x.text}))
  };
  await upsertDriveFile({name:`${id}_source.json`,parentId:rawFolder.id,mimeType:'application/json',bytes:new TextEncoder().encode(JSON.stringify(sourceRecord,null,2))});

  const saved=[]; let bestPhoto=null;
  for(const item of docs){
    try{
      const buf=await downloadPdf(item,source); const bytes=new Uint8Array(buf);
      const safeType=item.type==='三點件一括'?'三點件一括':item.type;
      const file=await upsertDriveFile({name:`${id}_${safeType}.pdf`,parentId:docFolder.id,mimeType:'application/pdf',bytes});
      saved.push({type:item.type,url:item.url,drive:file,size:buf.byteLength});
      const photo=await extractLargestPhotoFromPdf(buf,{maxPages:64});
      if(photo&&(!bestPhoto||item.type==='現況調査報告書'||item.type==='三點件一括')) bestPhoto={...photo,from:item.type};
    }catch(e){saved.push({type:item.type,url:item.url,error:e.message});}
  }

  let imageDrive=null;
  if(bestPhoto){
    imageDrive=await upsertDriveFile({name:`${id}_main.jpg`,parentId:imgFolder.id,mimeType:'image/jpeg',bytes:bestPhoto.body});
    const media=getStore('auction-media',{consistency:'strong'});
    await media.set(`${id}/cover`,bestPhoto.body,{metadata:{contentType:'image/jpeg',method:'three-doc-drive',pdfType:bestPhoto.from,pdfPage:bestPhoto.page,driveFileId:imageDrive.id}});
  }

  const record={
    caseId:id,sourceUrl:source,ingestedAt:new Date().toISOString(),pageVia:page.via,
    rawFolder,docFolder,imgFolder,analysisFolder,courtId:ids.courtId,saleUnitId:ids.saleUnitId,bitUrl:primaryBit?.url||null,
    documents:saved,mainImage:imageDrive?{...imageDrive,pdfType:bestPhoto.from,pdfPage:bestPhoto.page}:null
  };
  const index=getStore('auction-ingest',{consistency:'strong'});
  await index.setJSON(`cases/${id}`,record);

  try{
    record.indexResult=await upsertDriveIndexCase({
      caseId:id,sourceUrl:source,courtId:ids.courtId,saleUnitId:ids.saleUnitId,bitUrl:primaryBit?.url||null,
      court:input.court||'',prefecture:input.prefecture||'',city:input.city||'',title:input.title||'',type:input.type||'',price:input.price||'',area:input.area||'',bid:input.bid||'',
      docStatus:saved.some(x=>x.drive)?'已存Drive':'下載失敗',docFolderUrl:docFolder.webViewLink||'',imageStatus:imageDrive?'已建立':'待建立',imageFolderUrl:imgFolder.webViewLink||'',analysisFolderUrl:analysisFolder.webViewLink||'',updatedAt:new Date().toISOString(),error:saved.filter(x=>x.error).map(x=>`${x.type}:${x.error}`).join(' | ')
    });
  }catch(e){record.indexUpdateError=e.message;}

  return Response.json({ok:true,...record});
};

export const config={path:'/api/ingest-case'};
