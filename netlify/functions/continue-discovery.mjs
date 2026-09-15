export default async(req)=>{const r=await fetch(new URL('/.netlify/functions/enrich-discoveries-background',req.url),{method:'POST'});if(!r.ok)throw new Error('案件補件排程未啟動');};
export const config={schedule:'45 * * * *'};
