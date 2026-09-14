import { getDocument, OPS, ImageKind } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, ImageData } from '@napi-rs/canvas';

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

export async function extractLargestPhotoFromPdf(pdfBuffer,{maxPages=40}={}){
  const loading=getDocument({data:new Uint8Array(pdfBuffer),useSystemFonts:true,disableFontFace:true});
  const pdf=await loading.promise; let best=null;
  for(let p=1;p<=Math.min(pdf.numPages,maxPages);p++){
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
      const score=w*h*boost; if(!best||score>best.score) best={img,score,page:p};
    }
  }
  await loading.destroy?.();
  if(!best) return null;
  const body=await imageObjectToJpeg(best.img); return body?{body,page:best.page,contentType:'image/jpeg'}:null;
}
