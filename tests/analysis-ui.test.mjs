import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../app.js',import.meta.url),'utf8').replace('init();','');
const cases=[{id:'297562',title:'Court apartment',sourceUrl:'https://xn--55q36pba3495a.com/auction/297562.html',price:10000},{id:'297473',title:'Second house',sourceUrl:'https://xn--55q36pba3495a.com/auction/297473.html',price:16330000}];
function setup(fetch){
 const nodes=new Map(),node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',value:'',classList:{add(){},remove(){},toggle(){}},focus(){this.focused=true},scrollIntoView(){this.scrolled=true}});return nodes.get(s);};
 const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[]},localStorage:{getItem:()=>null},location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},window:{scrollTo(){}},fetch,AbortSignal,AbortController,setTimeout,console});
 vm.runInContext(code,context);context.fixtures=cases;vm.runInContext('discoveries=fixtures;analyzedCases=[]',context);
 return {context,node,run:id=>vm.runInContext(`runAnalysis(${JSON.stringify(id)})`,context)};
}
const reply=record=>({ok:true,json:async()=>({ok:true,record})});
const record=id=>({caseId:id,documents:[{saved:true,contentType:'application/pdf',downloadUrl:'/api/case-document?id='+id+'&doc=01-document',type:'三點件'}]});
test('analysis shows and focuses selected case immediately, then uses saved record without ingest',async()=>{
 let resolve;const calls=[];const h=setup(url=>{calls.push(url);return new Promise(r=>resolve=r)});const pending=h.run('297562');
 assert.match(h.node('#analysisResult').innerHTML,/Court apartment/);assert.equal(h.node('#analysisResult').focused,true);assert.equal(h.node('#analysisResult').scrolled,true);
 resolve(reply(record('297562')));await pending;assert.equal(calls.length,1);assert.match(calls[0],/case-record/);assert.match(h.node('#analysisResult').innerHTML,/案件資料已載入/);
});
test('late response from previous case cannot replace current case',async()=>{
 const waiting={};const h=setup(url=>new Promise(r=>waiting[url.split('=')[1]]=r));const a=h.run('297562'),b=h.run('297473');
 waiting['297473'](reply(record('297473')));await b;waiting['297562'](reply(record('297562')));await a;
 assert.match(h.node('#analysisResult').innerHTML,/Second house/);assert.doesNotMatch(h.node('#analysisResult').innerHTML,/Court apartment/);
});
test('failed record read and ingest leave case context plus working retry control',async()=>{
 const h=setup(async()=>{throw new Error('offline')});await h.run('297562');assert.match(h.node('#analysisResult').innerHTML,/Court apartment/);assert.match(h.node('#analysisResult').innerHTML,/重試讀取/);assert.equal(typeof h.node('#analysisRetry').onclick,'function');
});
