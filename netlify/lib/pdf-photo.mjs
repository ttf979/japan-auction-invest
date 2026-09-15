import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
let createCanvas, ImageData, loadImage, ImageKind;

function objectPromise(objs,id){
  return new Promise(resolve=>{ try{ const direct=objs.get(id,v=>resolve(v)); if(direct) resolve(direct); }catch{ resolve(null); } });
}

async function imageObjectToJpeg(img){
  if(!img) return null;
  const w=img.width||img.bitmap?.width, h=img.height||img.bitmap?.height;
  if(!w||!h||w*h<70000) return null;
  const maxW=1400, scale=Math.min(1,maxW/w), ow=Math.max(1,Math.round(w*scale)), oh=Math.max(1,Math.round(h*scale));
  const src=createCanvas(w,h), ctx=src.getContext('2d');
  if(img.bitmap){ ctx.drawImage(img.bitmap,0,0,w,h); }
  else if(img.data){
    let rgba;
    if(img.kind===ImageKind.RGBA_32BPP||img.data.length===w*h*4) rgba=new Uint8ClampedArray(img.data.buffer,img.data.byteOffset,img.data.byteLength);
    else if(img.kind===ImageKind.RGB_24BPP||img.data.length===w*h*3){ rgba=new Uint8ClampedArray(w*h*4); for(let i=0,j=0;i<img.data.length;i+=3,j+=4){rgba[j]=img.data[i];rgba[j+1]=img.data[i+1];rgba[j+2]=img.data[i+2];rgba[j+3]=255;} }
    else return null;
    ctx.putImageData(new ImageData(rgba,w,h),0,0);
  }else return null;
  const out=createCanvas(ow,oh), octx=out.getContext('2d'); octx.drawImage(src,0,0,ow,oh);
  return out.toBuffer('image/jpeg',84);
}

export async function extractLargestPhotoFromPdf(pdfBuffer,{maxPages=40,verifiedCrop=null}={}){
  ({createCanvas,ImageData,loadImage}=await import('@napi-rs/canvas'));
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const {getDocument,OPS}=pdfjs; ImageKind=pdfjs.ImageKind;
  const root=dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const loading=getDocument({data:new Uint8Array(pdfBuffer),useSystemFonts:true,disableFontFace:true,
    wasmUrl:join(root,'wasm')+'/',standardFontDataUrl:join(root,'standard_fonts')+'/',useWorkerFetch:false,verbosity:0});
  const pdf=await loading.promise; let best=null;
  for(let p=1;p<=Math.min(pdf.numPages,maxPages);p++){
    if(verifiedCrop && p!==verifiedCrop.page)continue;
    const page=await pdf.getPage(p); let boost=1;
    try{ const tc=await page.getTextContent(); const txt=tc.items.map(x=>x.str||'').join(' '); if(/写真|外観|現況|建物|撮影|物件/i.test(txt)) boost=2.4; }catch{}
    const ops=await page.getOperatorList();
    for(let i=0;i<ops.fnArray.length;i++){
      const fn=ops.fnArray[i]; let img=null;
      if(fn===OPS.paintInlineImageXObject) img=ops.argsArray[i]?.[0]||null;
      else if(fn===OPS.paintImageXObject){ const id=ops.argsArray[i]?.[0]; if(id) img=await objectPromise(page.objs,id); }
      if(!img) continue;
      const w=img.width||img.bitmap?.width||0,h=img.height||img.bitmap?.height||0; if(w<240||h<170) continue;
      const ratio=w/h; if(ratio<0.35||ratio>4.5) continue;
      if(verifiedCrop && w===verifiedCrop.imageWidth && h===verifiedCrop.imageHeight){
        const jpeg=await imageObjectToJpeg(img);
        if(jpeg){const image=await loadImage(jpeg),[x,y,cw,ch]=verifiedCrop.rect;
          const canvas=createCanvas(cw,ch);canvas.getContext('2d').drawImage(image,x,y,cw,ch,0,0,cw,ch);
          best={body:canvas.toBuffer('image/jpeg',90),score:Infinity,page:p};break;}
      }
      // Ignore blank paper, tables and bilevel text layers in scanned court files.
      const data=img.data, channels=data?.length/(w*h);
      if(!data||![3,4].includes(channels))continue;
      let middle=0,white=0,color=0,count=0;const bins=new Set();
      const step=Math.max(1,Math.floor(w*h/15000));
      for(let k=0;k<w*h;k+=step){const j=k*channels,v=(data[j]+data[j+1]+data[j+2])/3;count++;if(v>244)white++;if(v>30&&v<225)middle++;if(Math.max(data[j],data[j+1],data[j+2])-Math.min(data[j],data[j+1],data[j+2])>25)color++;bins.add(Math.floor(v/8));}
      if(middle/count<0.35||white/count>0.55||color/count<0.15||bins.size<24)continue;
      const score=w*h*boost*(middle/count)*(1-white/count);
      if(!best||score>best.score){const body=await imageObjectToJpeg(img);if(body)best={body,score,page:p};}
    }
  }
  await loading.destroy?.();
  if(!best) return null;
  return {body:best.body,page:best.page,contentType:'image/jpeg',method:'three-doc-pdf'};
}
