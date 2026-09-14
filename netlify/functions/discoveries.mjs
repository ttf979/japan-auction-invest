import { discoveryStore } from '../lib/discovery.mjs';
export default async()=>{
  const store=discoveryStore();
  const items=await store.get('current',{type:'json'}).catch(()=>null)||[];
  const meta=await store.get('last-run',{type:'json'}).catch(()=>null);
  return Response.json({ok:true,items,meta},{headers:{'cache-control':'no-store'}});
};
export const config={path:'/api/discoveries'};
