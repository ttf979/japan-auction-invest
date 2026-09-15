import test from 'node:test';import assert from 'node:assert/strict';
import '../data/research-rules.js';
import {parseOutcome,nextOutcome} from '../netlify/lib/outcome-parser.mjs';
import {mergeCatalog} from '../netlify/lib/catalog.mjs';
const now=new Date('2026-09-15T15:00:00Z'),R=globalThis.ResearchRules;
test('research never recommends unknown deadlines or missing official references',()=>{
 const x={officialVerified:true,bitUrl:'https://www.bit.courts.go.jp/app/detail',caseNumber:'令和08年(ケ)第1号',age:3,station:'徒歩10分',sourceVerifiedAt:now.toISOString()};
 assert.equal(R.screen(x,now).eligible,false);assert.equal(R.screen({...x,bidEnd:'2026-02-30'},now).eligible,false);
 assert.equal(R.screen({...x,bidEnd:'2026-10-01'},now).eligible,true);assert.equal(R.screen({...x,bidEnd:'2026-10-01',bitUrl:null},now).eligible,false);
 assert.equal(R.finite(null),false);assert.equal(R.finite(0),true);
});
test('closing uses Japan date boundary and does not depend on opening day',()=>{
 const x={bidEnd:'2026-09-15',openingDate:'2026-09-25'};
 assert.equal(R.closed(x,new Date('2026-09-15T14:59:59Z')),false);assert.equal(R.closed(x,now),true);
});
test('result price uses exact sale label and preserves known amounts on missing data',()=>{
 const item={caseNumber:'令和07年(ケ)第12号',sourceUrl:'https://example.com'};
 const base=item.caseNumber+'<dl><dt>売却基準価額</dt><dd>29,604,000円</dd><dt>開札結果</dt><dd>売却</dd>';
 assert.equal(parseOutcome(base+'</dl>',item,now).salePrice,null);
 const sold=parseOutcome(base+'<dt>売却価額</dt><dd>25,888,888円</dd></dl>',item,now);
 assert.equal(sold.salePrice,25888888);assert.equal(sold.sourceLevel,'secondary');
 assert.equal(nextOutcome(sold,{status:'unpublished',salePrice:null},null,now).salePrice,25888888);
 assert.equal(nextOutcome(sold,null,'failure',now).salePrice,25888888);
 assert.equal(nextOutcome(sold,null,'failure',now).nextCheckAt,'2026-09-18T15:00:00.000Z');
 assert.throws(()=>parseOutcome('Cloudflare',item,now));
});
test('new verified catalog metadata survives a deploy seed',()=>{
 const item=mergeCatalog([{id:'297580',sourceUrl:'https://xn--55q36pba3495a.com/auction/297580.html',availability:'ended',sourceVerifiedAt:'2026-09-17T00:00:00Z'}]).find(x=>x.id==='297580');
 assert.equal(item.availability,'ended');
});
