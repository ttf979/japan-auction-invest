import {runDiscovery,discoveryStore} from '../lib/discovery.mjs';
export default async(req)=>{try{await runDiscovery();const r=await fetch(new URL('/.netlify/functions/enrich-discoveries-background',req.url),{method:'POST'});if(!r.ok)throw new Error('補件排程失敗');}catch(e){await discoveryStore().setJSON('last-run',{at:new Date().toISOString(),status:'failed',error:e.message});throw e;}};
