export const sourceHome='https://xn--55q36pba3495a.com/';
export const strip=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
export function assertSourcePage(text){const visible=strip(text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));if(/Just a moment|Verify you are human|Access denied|Forbidden/i.test(visible)||!/<(?:article|dt)\b/i.test(text))throw new Error('來源頁受阻或無可解析案件');}
export function dates(s){let year;return [...String(s||'').matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/g)].flatMap(m=>{year=m[1]||year;return year?[`${year}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`]:[];});}
export function pageLinks(html,url){
 assertSourcePage(html);
 const items=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].flatMap(m=>{
  const a=m[1].match(/href="([^" ]*\/auction\/(\d+)\.html)"/);if(!a)return [];
  const title=strip((m[1].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)||[])[1]);
  const day=(m[1].match(/datetime="(\d{4}-\d{2}-\d{2})"/)||[])[1];
  return [{id:a[2],sourceUrl:new URL(a[1],url).href,title,published:day||null,availability:'unknown',detailState:'pending',discoveredAt:new Date().toISOString()}];
 });
 const next=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].find(m=>strip(m[2]).includes('もっと見る'));
 return {items,next:next?new URL(next[1].replaceAll('&amp;','&'),url).href:null};
}
export function parseDetail(html,item,now=new Date()){
 assertSourcePage(html);const fields=new Map();for(const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)){const k=strip(m[1]);if(!fields.has(k))fields.set(k,strip(m[2]));}
 const get=k=>fields.get(k)||'',number=s=>{const m=s.match(/^([\d,]+(?:\.\d+)?)/);return m?Number(m[1].replaceAll(',','')):null;};
 const links=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:new URL(m[1].replaceAll('&amp;','&'),sourceHome),text:strip(m[2])}));
 const tag=key=>links.find(x=>x.url.searchParams.has(key))?.text?.replace(/^\S*\s*(?=[\u3040-\u9fff])/, '')||'';
 const bit=links.find(x=>['bit.courts.go.jp','www.bit.courts.go.jp'].includes(x.url.hostname)&&x.url.pathname==='/app/detail/pd001/h04');
 if(!get('事件番号')||!get('管轄裁判所'))throw new Error('案件識別欄位不足');
 const bid=get('入札期間')||get('特別売却期間'),ds=dates(bid),op=dates(get('開札日'));
 const age=links.find(x=>x.url.searchParams.has('agmax'))?.text.match(/築\s*(\d+)年/);
 const station=links.find(x=>x.url.searchParams.has('sid'))?.text||'',walk=links.find(x=>x.url.searchParams.has('wmax'))?.text||'';
 return {...item,officialVerified:false,officialEvidence:null,caseNumber:get('事件番号'),court:get('管轄裁判所'),price:number(get('売却基準価額')),area:number(get('専有面積')||get('延床面積')||get('土地面積 (合計)')),age:age?Number(age[1]):null,address:get('住居表示')||get('所在地 (地番)')||get('所在地'),prefecture:links.find(x=>x.url.searchParams.has('pid')&&!x.url.searchParams.has('q'))?.text||null,city:links.find(x=>x.url.searchParams.has('pid')&&x.url.searchParams.has('q'))?.text||null,type:links.find(x=>x.url.searchParams.has('grp'))?.text||null,propertyUse:get('種類'),station:station+' '+walk,bid,bidStart:ds[0]||null,bidEnd:ds.length>1?ds.at(-1):null,openingDate:op[0]||null,bitUrl:bit?.url.href||null,availability:/終了/.test(get('状態'))?'ended':/閲覧可能|入札受付/.test(get('状態'))?'active':'unknown',sourceVerifiedAt:now.toISOString(),detailState:'awaiting_official'};
}
