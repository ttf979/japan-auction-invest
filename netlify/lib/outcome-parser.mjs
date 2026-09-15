export function parseOutcome(html,item,now=new Date()){
 const clean=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const text=clean(html);
 if(/Just a moment|Cloudflare|Access denied|Forbidden|captcha/i.test(text)||!item.caseNumber||!text.includes(item.caseNumber))throw new Error('source_identity_or_page_failed');
 const fields=new Map([...html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)].map(m=>[clean(m[1]),clean(m[2])]));
 if(!fields.has('開札結果')&&!fields.has('売却価額'))throw new Error('result_fields_unavailable');
 const rawStatus=fields.get('開札結果')||'', rawPrice=fields.get('売却価額')||'';
 const m=rawPrice.match(/^([\d,]+)\s*円$/),price=m?Number(m[1].replaceAll(',','')):null;
 return {status:price>0&&rawStatus==='売却'?'sold':/不売/.test(rawStatus)?'unsold':/取下|取消/.test(rawStatus)?'withdrawn':'unpublished',salePrice:price>0&&rawStatus==='売却'?price:null,rawStatus,rawLabel:'売却価額',sourceUrl:item.sourceUrl,sourceLevel:'secondary',verification:'待法院核對',checkedAt:now.toISOString()};
}
export function nextOutcome(previous,result,error,now=new Date()){
 const keep=error||(result?.status==='unpublished'&&['sold','unsold','withdrawn'].includes(previous?.status));
 return {...previous,...(!keep?result:{}),lastAttemptAt:now.toISOString(),lastAttemptStatus:error?'fetch_failed':'success',lastObservedStatus:error?null:result.status,nextCheckAt:new Date(now.getTime()+3*86400000).toISOString()};
}
