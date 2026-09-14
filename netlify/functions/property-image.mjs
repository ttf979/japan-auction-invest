import { getStore } from '@netlify/blobs';
import { getDocument, OPS, ImageKind } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, ImageData } from '@napi-rs/canvas';

const MEDIA_STORE = 'auction-media';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';

function esc(s='') {
  return s.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}
function resolveUrl(raw, base) {
  if (!raw) return null;
  raw = esc(raw.trim());
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  try { return new URL(raw, base).href; } catch { return null; }
}
function allowedSource(url) {
  try {
    const h = new URL(url).hostname;
    return ['xn--55q36pba3495a.com','www.xn--55q36pba3495a.com','981.jp','www.981.jp','bit.courts.go.jp','www.bit.courts.go.jp'].includes(h);
  } catch { return false; }
}
async function fetchWithTimeout(url, options={}, ms=12000){
  const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),ms);
  try { return await fetch(url,{...options,signal:ac.signal,redirect:'follow'}); }
  finally { clearTimeout(timer); }
}
const pageHeaders = {
  'user-agent': UA,
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'ja,en-US;q=0.8,en;q=0.6',
  'cache-control': 'no-cache'
};

function collectImageCandidates(html, base) {
  const out=[];
  const push=(url,score,why)=>{ const abs=resolveUrl(url,base); if(abs) out.push({url:abs,score,why}); };
  const metaPatterns=[
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/ig,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/ig,
  ];
  for(const re of metaPatterns){ let m; while((m=re.exec(html))) push(m[1],120,'meta'); }
  const imgRe=/<img\b[^>]*>/ig; let im;
  while((im=imgRe.exec(html))){
    const tag=im[0];
    const alt=(tag.match(/alt=["']([^"']*)["']/i)||[])[1]||'';
    const cls=(tag.match(/class=["']([^"']*)["']/i)||[])[1]||'';
    for(const a of ['data-original','data-src','data-lazy-src','data-image','src']){
      const m=tag.match(new RegExp(`${a}=["']([^"']+)["']`,'i'));
      if(m) push(m[1], 55 + (/物件|写真|外観|建物|photo|gallery/i.test(alt+' '+cls)?45:0), `img:${a}`);
    }
    const sm=tag.match(/srcset=["']([^"']+)["']/i);
    if(sm) for(const part of sm[1].split(',')){ const u=part.trim().split(/\s+/)[0]; if(u) push(u,65,'srcset'); }
  }
  const seen=new Set();
  return out.filter(x=>{
    if(seen.has(x.url)) return false; seen.add(x.url);
    const u=x.url.toLowerCase();
    if(/logo|icon|favicon|sprite|avatar|banner|loading|noimage|placeholder|google|map/.test(u)) x.score-=100;
    if(/auction|bukken|property|photo|image|img|upload|media|picture/.test(u)) x.score+=20;
    if(/\.(jpe?g|png|webp)(\?|$)/i.test(u)) x.score+=20;
    return x.score>0;
  }).sort((a,b)=>b.score-a.score);
}

function collectPdfCandidates(html, base) {
  const out=[]; let m;
  const linkRe=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/ig;
  while((m=linkRe.exec(html))){
    const href=resolveUrl(m[1],base); if(!href) continue;
    const text=m[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    if(/\.pdf(?:\?|$)/i.test(href) || /bit\.courts\.go\.jp\/app\/detail\/pd001\/h04/i.test(href) || /物件明細|現況調査|評価書|３点|3点|三点|物件資料|資料/i.test(text)){
      let score=10;
      if(/bit\.courts\.go\.jp\/app\/detail\/pd001\/h04/i.test(href)) score+=120;
      if(/評価書/i.test(text+href)) score+=50;
      if(/現況調査/i.test(text+href)) score+=40;
      if(/物件明細/i.test(text+href)) score+=20;
      if(/\.pdf(?:\?|$)/i.test(href)) score+=10;
      out.push({url:href,text,score});
    }
  }
  // Some sites expose PDF URLs in scripts/data attributes rather than anchors.
  const rawPdf=/["']([^"']+\.pdf(?:\?[^"']*)?)["']/ig;
  while((m=rawPdf.exec(html))){ const href=resolveUrl(m[1],base); if(href) out.push({url:href,text:'pdf',score:10}); }
  const seen=new Set();
  return out.filter(x=>!seen.has(x.url)&&seen.add(x.url)).sort((a,b)=>b.score-a.score);
}

async function fetchPageText(source){
  try{
    const r=await fetchWithTimeout(source,{headers:pageHeaders},12000);
    if(r.ok) return {html:await r.text(),via:'direct',status:r.status};
  }catch{}
  // No Firecrawl. Jina Reader is only a fallback transport for blocked HTML.
  try{
    const reader='https://r.jina.ai/'+source;
    const r=await fetchWithTimeout(reader,{headers:{'user-agent':UA,'accept':'text/plain'}},15000);
    if(r.ok){
      const md=await r.text();
      // Convert markdown images/links to tiny HTML-like anchors so the same parsers can reuse them.
      const html=md
        .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<img src="$1">')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)[^)]*\)/g,'<a href="$2">$1</a>');
      return {html,via:'jina',status:r.status};
    }
  }catch{}
  return null;
}

async function tryRemoteImage(candidate, source){
  try{
    const r=await fetchWithTimeout(candidate.url,{headers:{'user-agent':UA,'accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8','referer':source}},9000);
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!r.ok || !ct.startsWith('image/')) return null;
    const body=await r.arrayBuffer();
    if(body.byteLength<4000) return null;
    return {body,contentType:ct,source:candidate.url,method:'page-image'};
  }catch{return null;}
}

function objectPromise(objs,id){
  return new Promise(resolve=>{
    try{
      const direct=objs.get(id, value=>resolve(value));
      if(direct) resolve(direct);
    }catch{ resolve(null); }
  });
}

async function imageObjectToJpeg(img){
  if(!img) return null;
  const w=img.width||img.bitmap?.width, h=img.height||img.bitmap?.height;
  if(!w||!h||w*h<70000) return null;
  const maxW=1200, scale=Math.min(1,maxW/w), ow=Math.max(1,Math.round(w*scale)), oh=Math.max(1,Math.round(h*scale));
  const src=createCanvas(w,h), sctx=src.getContext('2d');
  if(img.bitmap){
    sctx.drawImage(img.bitmap,0,0,w,h);
  }else if(img.data){
    let rgba;
    if(img.kind===ImageKind.RGBA_32BPP || img.data.length===w*h*4){
      rgba=new Uint8ClampedArray(img.data.buffer,img.data.byteOffset,img.data.byteLength);
    }else if(img.kind===ImageKind.RGB_24BPP || img.data.length===w*h*3){
      rgba=new Uint8ClampedArray(w*h*4);
      for(let i=0,j=0;i<img.data.length;i+=3,j+=4){rgba[j]=img.data[i];rgba[j+1]=img.data[i+1];rgba[j+2]=img.data[i+2];rgba[j+3]=255;}
    }else return null;
    sctx.putImageData(new ImageData(rgba,w,h),0,0);
  }else return null;
  const out=createCanvas(ow,oh), octx=out.getContext('2d');
  octx.drawImage(src,0,0,ow,oh);
  return out.toBuffer('image/jpeg',82);
}

async function extractLargestPhotoFromPdf(pdfBuffer){
  const loading=getDocument({data:new Uint8Array(pdfBuffer),useSystemFonts:true,disableFontFace:true});
  const pdf=await loading.promise;
  let best=null;
  const maxPages=Math.min(pdf.numPages,64);
  for(let p=1;p<=maxPages;p++){
    const page=await pdf.getPage(p);
    let photoBoost=1;
    try{
      const tc=await page.getTextContent();
      const txt=tc.items.map(x=>x.str||'').join(' ');
      if(/写真|外観|現況|建物|撮影|物件/i.test(txt)) photoBoost=2.2;
    }catch{}
    const ops=await page.getOperatorList();
    for(let i=0;i<ops.fnArray.length;i++){
      const fn=ops.fnArray[i]; let img=null;
      if(fn===OPS.paintInlineImageXObject){ img=ops.argsArray[i]?.[0]||null; }
      else if(fn===OPS.paintImageXObject){ const id=ops.argsArray[i]?.[0]; if(id) img=await objectPromise(page.objs,id); }
      if(!img) continue;
      const w=img.width||img.bitmap?.width||0, h=img.height||img.bitmap?.height||0;
      if(w<220||h<160) continue;
      const ratio=w/h; if(ratio<0.35||ratio>4.5) continue;
      const score=w*h*photoBoost;
      if(!best||score>best.score) best={img,score,page:p};
    }
    if(best?.score>2500000) break;
  }
  await loading.destroy?.();
  if(!best) return null;
  const body=await imageObjectToJpeg(best.img);
  return body?{body,contentType:'image/jpeg',method:'three-doc-pdf',page:best.page}:null;
}

async function tryPdfPhotos(pdfCandidates, source){
  for(const c of pdfCandidates.slice(0,4)){
    try{
      const r=await fetchWithTimeout(c.url,{headers:{...pageHeaders,'accept':'application/pdf,*/*;q=0.8','referer':source}},18000);
      const ct=(r.headers.get('content-type')||'').toLowerCase();
      if(!r.ok) continue;
      const buf=await r.arrayBuffer();
      if(buf.byteLength<20000||buf.byteLength>60_000_000) continue;
      const head=new TextDecoder('latin1').decode(new Uint8Array(buf.slice(0,5)));
      const looksPdf=ct.includes('pdf')||head.startsWith('%PDF')||/\.pdf(?:\?|$)/i.test(c.url);
      if(!looksPdf) continue;
      const found=await extractLargestPhotoFromPdf(buf);
      if(found) return {...found,source:c.url};
    }catch{}
  }
  return null;
}

function fallbackSvg(title='日本法拍物件') {
  const safe=String(title).slice(0,30).replace(/[<>&"']/g,'');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18344f"/><stop offset="1" stop-color="#b98b46"/></linearGradient></defs><rect width="900" height="600" fill="url(#g)"/><path d="M220 390V250l230-145 230 145v140M315 490V295h270v195M410 490V365h80v125" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="18"/><text x="46" y="535" fill="white" font-size="30" font-family="sans-serif" font-weight="700">${safe}</text><text x="46" y="572" fill="rgba(255,255,255,.75)" font-size="18" font-family="sans-serif">主圖尚待三點件取得</text></svg>`;
}

async function cacheResult(store,key,result,meta={}){
  if(!result?.body) return;
  const arr=result.body instanceof ArrayBuffer?result.body:result.body.buffer.slice(result.body.byteOffset,result.body.byteOffset+result.body.byteLength);
  await store.set(key,arr,{metadata:{contentType:result.contentType,method:result.method,source:result.source||null,...meta}});
}

export default async (req) => {
  if(req.method!=='GET') return new Response('method_not_allowed',{status:405});
  const u=new URL(req.url), source=u.searchParams.get('url'), id=u.searchParams.get('id')||'unknown', title=u.searchParams.get('title')||'日本法拍物件';
  if(!source||!allowedSource(source)) return new Response('bad_or_missing_url',{status:400});
  const store=getStore(MEDIA_STORE,{consistency:'strong'}), key=`${id}/cover`;
  const debug=u.searchParams.get('debug')==='1';

  try{
    const cached=await store.getWithMetadata(key,{type:'arrayBuffer'});
    if(cached?.data){
      if(debug) return Response.json({ok:true,cached:true,metadata:cached.metadata});
      return new Response(cached.data,{headers:{'content-type':cached.metadata?.contentType||'image/jpeg','cache-control':'public, max-age=3600','netlify-cdn-cache-control':'public, durable, s-maxage=604800'}});
    }
  }catch{}

  const page=await fetchPageText(source);
  const debugInfo={pageVia:page?.via||null,imageCandidates:0,pdfCandidates:0};
  if(page?.html){
    const imgs=collectImageCandidates(page.html,source); debugInfo.imageCandidates=imgs.length;
    for(const c of imgs.slice(0,24)){
      const found=await tryRemoteImage(c,source);
      if(found){ await cacheResult(store,key,found,{pageVia:page.via});
        if(debug) return Response.json({ok:true,cached:false,method:found.method,source:found.source,...debugInfo});
        return new Response(found.body,{headers:{'content-type':found.contentType,'cache-control':'public, max-age=3600','netlify-cdn-cache-control':'public, durable, s-maxage=604800'}});
      }
    }
    const pdfs=collectPdfCandidates(page.html,source); debugInfo.pdfCandidates=pdfs.length;
    const pdfPhoto=await tryPdfPhotos(pdfs,source);
    if(pdfPhoto){ await cacheResult(store,key,pdfPhoto,{pageVia:page.via,pdfPage:pdfPhoto.page});
      if(debug) return Response.json({ok:true,cached:false,method:pdfPhoto.method,source:pdfPhoto.source,page:pdfPhoto.page,...debugInfo});
      return new Response(pdfPhoto.body,{headers:{'content-type':pdfPhoto.contentType,'cache-control':'public, max-age=3600','netlify-cdn-cache-control':'public, durable, s-maxage=604800'}});
    }
  }
  if(debug) return Response.json({ok:false,error:'no_main_photo_found',...debugInfo},{status:404});
  // Return a real error so the browser can fall back to a page preview instead of silently showing an SVG placeholder.
  return new Response('main_photo_not_ready',{status:404,headers:{'cache-control':'no-store'}});
};

export const config={path:'/api/property-image'};
