import { discoveryStore } from '../lib/discovery.mjs';
import {ingestStore} from '../lib/archive.mjs';
import {mergeCatalog} from '../lib/catalog.mjs';
import {preparedCover} from '../lib/prepared-cover.mjs';
import {trustedPhoto} from '../lib/photo-policy.mjs';
import '../../data/research-rules.js';
export default async()=>{
  const store=discoveryStore(),index=ingestStore();
  const current=await store.get('current',{type:'json'}).catch(()=>null)||[];
  const items=await Promise.all(mergeCatalog(current).map(async item=>{
    const record=await index.get(`cases/${item.id}`,{type:'json'}).catch(()=>null);
    const ready=!!preparedCover(item.id)||trustedPhoto(record?.mainImage);
    const count=(record?.documents||[]).filter(d=>d.saved&&d.contentType==='application/pdf').length;
    const outcome=await store.get(`outcomes/${item.id}`,{type:'json'}).catch(()=>null)||item.outcome;
    return {...item,outcome,availability:ResearchRules.closed(item)?'ended':item.availability,imageReady:ready,imageStatus:ready?'主圖已建立':'待主圖',documentCount:count,
      bitStatus:item.availability==='ended'?'已結束／法院文件下架':count?`BIT已定位／三點件已存 ${count} 份`:item.bitStatus};
  }));
  const meta=await store.get('last-run',{type:'json'}).catch(()=>null);
  return Response.json({ok:true,items,meta,summary:{total:items.length,active:items.filter(x=>x.availability!=='ended').length,photos:items.filter(x=>x.imageReady).length,ended:items.filter(x=>x.availability==='ended').length}},{headers:{'cache-control':'no-store'}});
};
export const config={path:'/api/discoveries'};
