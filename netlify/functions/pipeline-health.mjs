export default async () => {
  const checks=[];
  for (const [name,load] of [
    ['seed',()=>import('../../data/bit-sources.json',{with:{type:'json'}})],
    ['canvas',()=>import('@napi-rs/canvas')],
    ['pdf',()=>import('pdfjs-dist/legacy/build/pdf.mjs')],
    ['ingest',()=>import('./ingest-case.mjs')]
  ]) {
    try {await load();checks.push({name,ok:true});}
    catch(e){checks.push({name,ok:false,error:String(e.message).slice(0,600)});}
  }
  return Response.json({ok:checks.every(c=>c.ok),checks},{headers:{'cache-control':'no-store'}});
};
export const config={path:'/api/pipeline-health'};
