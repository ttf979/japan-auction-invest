export default async(req)=>{if(req.method!=='POST')return new Response('',{status:405});const r=await fetch(new URL('/.netlify/functions/discovery-scan-background',req.url),{method:'POST'});return Response.json({ok:r.ok,queued:r.ok},{status:r.ok?202:502});};
export const config={path:'/api/refresh-discoveries'};
