import { runDiscovery } from '../lib/discovery.mjs';
export default async(req)=>{
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  try{
    const out=await runDiscovery();
    if(out.newIds.length){
      fetch(new URL('/.netlify/functions/enrich-discoveries-background',req.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:out.newIds.slice(0,30)})}).catch(()=>{});
    }
    return Response.json({ok:true,added:out.added,found:out.found,total:out.total,via:out.via});
  }catch(e){return Response.json({ok:false,error:e.message||String(e)},{status:502});}
};
export const config={path:'/api/refresh-discoveries'};
