import { runDiscovery } from '../lib/discovery.mjs';
export default async(req)=>{
  try{
    const out=await runDiscovery();
    if(out.newIds.length){
      await fetch(new URL('/.netlify/functions/enrich-discoveries-background',req.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:out.newIds.slice(0,40)})}).catch(()=>null);
    }
    console.log('daily-discovery',JSON.stringify({added:out.added,found:out.found,total:out.total}));
  }catch(e){console.error('daily-discovery-failed',e);}
};
export const config={schedule:'30 0 * * *'};
