import { discoveryStore } from '../lib/discovery.mjs';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';
function htmlFromMarkdown(md=''){return md.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<img src="$1">').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<a href="$2">$1</a>');}
async function fetchHtml(url){
  try{const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ja,en;q=0.8'},redirect:'follow'});if(r.ok)return {html:await r.text(),via:'direct'};}catch{}
  try{const r=await fetch('https://r.jina.ai/'+url,{headers:{'user-agent':UA,accept:'text/plain'}});if(r.ok)return {html:htmlFromMarkdown(await r.text()),via:'jina'};}catch{}
  return null;
}
function strip(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
function extractBit(html,base){let m;const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;while((m=re.exec(html))){let u;try{u=new URL(m[1],base).href}catch{continue}if(/bit\.courts\.go\.jp\/app\/detail\/pd001\/h04/i.test(u)){const x=new URL(u);return {bitUrl:u,courtId:x.searchParams.get('courtId'),saleUnitId:x.searchParams.get('saleUnitId')};}}return {};}
function parseDetail(item,html){const text=strip(html);const bit=extractBit(html,item.sourceUrl);const title=(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1];const p=(text.match(/([0-9][0-9,.]*)\s*万\s*円/)||[])[1];const a=(text.match(/([0-9]+(?:\.[0-9]+)?)\s*m[²2]/i)||[])[1];const age=(text.match(/築\s*([0-9]+)\s*年/)||[])[1];const court=(text.match(/([^\s　]{2,18}地方裁判所[^\s　]{0,10})/)||[])[1];return {...item,title:title?strip(title):item.title,price:item.price??(p?Number(p.replace(/,/g,''))*10000:null),area:item.area??(a?Number(a):null),age:item.age??(age?Number(age):null),court:item.court||court||null,...bit,bitStatus:bit.bitUrl?'BIT已定位／三點件URL已取得':item.bitStatus||'待BIT定位',lastCheckedAt:new Date().toISOString()};}
export default async(req)=>{
  let body={};try{body=await req.json()}catch{}
  const store=discoveryStore();let items=await store.get('current',{type:'json'}).catch(()=>null)||[];
  const wanted=new Set((body.ids||[]).map(String));
  const targets=items.filter(x=>!wanted.size||wanted.has(String(x.id))).slice(0,20);
  const byId=new Map(items.map(x=>[String(x.id),x]));
  for(const item of targets){
    const page=await fetchHtml(item.sourceUrl); if(!page)continue;
    const enriched=parseDetail(item,page.html);byId.set(String(item.id),enriched);
    if(enriched.bitUrl){
      await fetch(new URL('/api/ingest-case',req.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:item.sourceUrl,caseId:item.id,title:enriched.title||'',prefecture:enriched.prefecture||'',city:enriched.city||'',court:enriched.court||'',price:enriched.price||'',type:enriched.type||'',area:enriched.area||'',bid:enriched.bid||''})}).catch(()=>null);
    }
  }
  items=[...byId.values()].sort((a,b)=>String(b.published||b.discoveredAt||'').localeCompare(String(a.published||a.discoveredAt||''))).slice(0,600);
  await store.setJSON('current',items);
};
