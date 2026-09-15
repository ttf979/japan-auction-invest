export default async(req)=>{
 const r=await fetch(new URL('/.netlify/functions/enrich-discoveries-background',req.url),{method:'POST',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('案件補件排程未啟動');
};
// UTC 00:00-04:00 = Taiwan 08:00-12:00.
export const config={schedule:'0 0-4 * * *'};
