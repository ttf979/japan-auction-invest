import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
if(process.env.NETLIFY==='true'||process.env.PREPARE_COVERS==='1'){
  const {extractLargestPhotoFromPdf}=await import('../netlify/lib/pdf-photo.mjs');
  const seeds=JSON.parse(readFileSync('data/bit-sources.json','utf8')), prepared={};
  for(const [id,seed] of Object.entries(seeds)){
    try{
    const response=await fetch(seed.bitUrl,{signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw new Error(`BIT download failed for ${id}: ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(Buffer.from(bytes.slice(0,5)).toString()!=='%PDF-')throw new Error(`BIT response is not PDF for ${id}`);
    const hash=createHash('sha256').update(bytes).digest('hex');
    if(seed.pdfSha256&&hash!==seed.pdfSha256){console.warn(`Official PDF changed for ${id}; photo awaits review`);continue;}
    const photo=await extractLargestPhotoFromPdf(bytes,{maxPages:64,verifiedCrop:seed.photoCrop,verifiedPageCrop:seed.photoPageCrop});
    if(!photo){console.warn(`No verified cover for ${id}`);continue;}
    prepared[id]={pdfSha256:hash,body:Buffer.from(photo.body).toString('base64'),contentType:photo.contentType,
      page:photo.page,method:photo.method,source:seed.bitUrl,preparedAt:new Date().toISOString()};
    console.log(`BIT photo prepared: case ${id}, PDF page ${photo.page}, ${photo.body.length} bytes`);
    }catch(error){console.warn(`Case ${id} awaits documents: ${error.message}`);}
  }
  writeFileSync('data/prepared-covers.json',JSON.stringify(prepared));
}
mkdirSync('public', {recursive:true});
for (const name of ['index.html','app.js','styles.css','data']) cpSync(name,`public/${name}`,{recursive:true});
const manifest=JSON.parse(readFileSync('DEPLOY_MANIFEST.json','utf8'));
writeFileSync('public/DEPLOY_MANIFEST.json',JSON.stringify({...manifest,commit:process.env.COMMIT_REF||null,deployId:process.env.DEPLOY_ID||null}));
