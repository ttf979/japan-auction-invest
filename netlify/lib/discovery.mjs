import { getStore, getDeployStore } from '@netlify/blobs';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';
const HOME='https://xn--55q36pba3495a.com/';

export function discoveryStore(){
  try{
    const ctx=Netlify.context?.deploy?.context;
    return ctx==='production' ? getStore('auction-discoveries',{consistency:'strong'}) : getDeployStore('auction-discoveries',{consistency:'strong'});
  }catch{return getStore('auction-discoveries',{consistency:'strong'});}
}

function htmlFromMarkdown(md=''){
  return md
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<a href="$2">$1</a>');
}

async function fetchText(url){
  const ctrl=new AbortController(), t=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept-language':'ja,en;q=0.8','cache-control':'no-cache'},signal:ctrl.signal,redirect:'follow'});
    if(r.ok)return {text:await r.text(),via:'direct'};
  }catch{}finally{clearTimeout(t);}
  const c2=new AbortController(),t2=setTimeout(()=>c2.abort(),15000);
  try{
    const r=await fetch('https://r.jina.ai/'+url,{headers:{'user-agent':UA,accept:'text/plain'},signal:c2.signal});
    if(r.ok)return {text:htmlFromMarkdown(await r.text()),via:'jina'};
  }catch{}finally{clearTimeout(t2);}
  throw new Error('source_fetch_failed');
}

function strip(s=''){return String(s).replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function numFromPrice(t=''){
  const m=t.match(/([0-9][0-9,.]*)\s*万\s*円?/); if(m)return Math.round(Number(m[1].replace(/,/g,''))*10000);
  const y=t.match(/([0-9][0-9,.]*)\s*円/); return y?Math.round(Number(y[1].replace(/,/g,''))):null;
}
function areaFromText(t=''){const m=t.match(/([0-9]+(?:\.[0-9]+)?)\s*m[²2]/i);return m?Number(m[1]):null;}
function ageFromText(t=''){const m=t.match(/築\s*([0-9]+)\s*年/);return m?Number(m[1]):null;}
function auctionLinks(html){
  const out=[]; const re=/<a\b[^>]*href=["']([^"']*\/auction\/(\d+)\.html[^"']*)["'][^>]*>([\s\S]*?)<\/a>/ig; let m;
  while((m=re.exec(html))){
    let sourceUrl; try{sourceUrl=new URL(m[1],HOME).href;}catch{continue;}
    const around=strip(html.slice(Math.max(0,m.index-650),Math.min(html.length,re.lastIndex+900)));
    const title=strip(m[3])||`案件 ${m[2]}`;
    const prefecture=(around.match(/(北海道|東京都|(?:京都|大阪)府|.{2,4}県)/)||[])[1]||null;
    const city=(around.match(/(?:都|道|府|県)([^\s　]{2,12}?[市区町村])/ )||[])[1]||null;
    out.push({id:m[2],published:new Date().toISOString().slice(0,10),sourceUrl,title,price:numFromPrice(around),area:areaFromText(around),age:ageFromText(around),prefecture,city,type:/マンション/.test(around)?'マンション':/土地/.test(around)?'土地':/戸建/.test(around)?'戸建て':null,court:(around.match(/([^\s　]{2,18}地方裁判所[^\s　]{0,10})/)||[])[1]||null,bid:null,station:null,address:null,tags:['新着'],bitStatus:'待BIT定位',imageStatus:'待三點件',discoveredAt:new Date().toISOString()});
  }
  const map=new Map();for(const x of out)if(!map.has(x.id))map.set(x.id,x);return [...map.values()];
}

export async function runDiscovery(){
  const page=await fetchText(HOME);
  const incoming=auctionLinks(page.text).slice(0,120);
  const store=discoveryStore();
  const current=await store.get('current',{type:'json'}).catch(()=>null)||[];
  const map=new Map(current.map(x=>[String(x.id),x]));
  let added=0;
  for(const x of incoming){const prev=map.get(String(x.id));if(!prev){added++;map.set(String(x.id),x);}else map.set(String(x.id),{...prev,...Object.fromEntries(Object.entries(x).filter(([,v])=>v!=null&&v!=='')),discoveredAt:prev.discoveredAt||x.discoveredAt});}
  const items=[...map.values()].sort((a,b)=>String(b.published||b.discoveredAt||'').localeCompare(String(a.published||a.discoveredAt||''))).slice(0,600);
  await store.setJSON('current',items);
  await store.setJSON('last-run',{at:new Date().toISOString(),via:page.via,found:incoming.length,added,total:items.length});
  return {items,added,found:incoming.length,total:items.length,via:page.via,newIds:incoming.filter(x=>!current.some(y=>String(y.id)===String(x.id))).map(x=>x.id)};
}
