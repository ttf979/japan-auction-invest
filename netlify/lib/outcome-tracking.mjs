import {discoveryStore,fetchText} from './discovery.mjs';
import {mergeCatalog} from './catalog.mjs';
import {parseOutcome,nextOutcome} from './outcome-parser.mjs';
import '../../data/research-rules.js';
export async function trackOutcomes(){
 const store=discoveryStore(),now=new Date();
 const current=await store.get('current',{type:'json'})||[];
 const due=[];
 for(const item of mergeCatalog(current).filter(x=>ResearchRules.closed(x,now))){
  const prev=await store.get(`outcomes/${item.id}`,{type:'json'})||item.outcome||{};
  if(!prev.nextCheckAt||Date.parse(prev.nextCheckAt)<=now.getTime())due.push({item,prev});
 }
 const reports=await Promise.all(due.slice(0,12).map(async({item,prev})=>{
  let result,error;try{const page=await fetchText(item.sourceUrl);result=parseOutcome(page.text,item,now);}catch(e){error=e.message;}
  const latest=await store.get(`outcomes/${item.id}`,{type:'json'})||prev;
  // An older overlapping job must not replace a more recent attempt.
  if(Date.parse(latest.lastAttemptAt||'1970-01-01')>now.getTime())return {id:item.id,status:'newer_attempt_retained'};
  const updated=nextOutcome(latest,result,error,now);await store.setJSON(`outcomes/${item.id}`,updated);
  return {id:item.id,status:updated.lastAttemptStatus,result:updated.status||'unpublished'};
 }));
 const summary={at:now.toISOString(),due:due.length,checked:reports.length,reports};await store.setJSON('outcomes-last-run',summary);return summary;
}
