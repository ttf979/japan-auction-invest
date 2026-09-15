import {discoveryStore,fetchText} from '../lib/discovery.mjs';
import {parseDetail} from '../lib/source-catalog.mjs';
import {createHash} from 'node:crypto';
export default async()=>{
 const store=discoveryStore(),now=new Date();const current=await store.get('current',{type:'json'})||[];
 const targets=current.filter(x=>x.detailState!=='ready'&&(!x.nextDetailCheckAt||Date.parse(x.nextDetailCheckAt)<=now.getTime())).sort((a,b)=>String(a.nextDetailCheckAt||'').localeCompare(String(b.nextDetailCheckAt||''))).slice(0,20);
 for(const item of targets){
  let updated;
  try{
   updated=parseDetail((await fetchText(item.sourceUrl)).text,item);
   updated.officialVerified=false;updated.officialEvidence=null;
   if(!updated.bitUrl)throw new Error('法院連結尚未取得');
   if(updated.bitUrl){const r=await fetch(updated.bitUrl,{signal:AbortSignal.timeout(35000)});const b=new Uint8Array(await r.arrayBuffer());if(!r.ok||!['www.bit.courts.go.jp','bit.courts.go.jp'].includes(new URL(r.url).hostname)||Buffer.from(b.slice(0,5)).toString()!=='%PDF-')throw new Error('法院PDF尚未核驗');updated.officialVerified=true;updated.detailState='ready';updated.officialEvidence={url:r.url,pdfSha256:createHash('sha256').update(b).digest('hex'),verifiedAt:new Date().toISOString()};updated.bitStatus='法院PDF已核驗／待逐項研究';}
  }catch(e){updated={...(updated||item),detailState:'retry',detailError:e.message,nextDetailCheckAt:new Date(Date.now()+86400000).toISOString()};}
  const latest=await store.get('current',{type:'json'})||[];
  await store.setJSON('current',latest.map(x=>x.id===item.id&&Date.parse(x.sourceVerifiedAt||'1970-01-01')<=Date.parse(updated.sourceVerifiedAt||new Date().toISOString())?{...x,...updated}:x));
 }
};
