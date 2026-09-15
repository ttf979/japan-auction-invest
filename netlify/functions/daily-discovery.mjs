export default async(req)=>{const r=await fetch(new URL('/.netlify/functions/discovery-scan-background',req.url),{method:'POST'});if(!r.ok)throw new Error('Discovery scan could not start');};
export const config={schedule:'30 0 * * *'};
