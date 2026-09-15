export default async(req)=>{
 const r=await fetch(new URL('/.netlify/functions/discovery-scan-background',req.url),{method:'POST',signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error('Discovery scan could not start');
};
// UTC 23:00 = Taiwan 07:00. This leaves one hour for the background scan
// before the 08:00 enrichment window begins.
export const config={schedule:'0 23 * * *'};
