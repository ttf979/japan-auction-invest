import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCatalog} from '../netlify/lib/catalog.mjs';
import seeds from '../data/bit-sources.json' with {type:'json'};
test('catalog removes search-page placeholders and merges duplicate source identities',()=>{
 const rows=mergeCatalog([{id:'alias',sourceUrl:'https://xn--55q36pba3495a.com/auction/297580.html'}, {id:'placeholder',sourceUrl:'https://xn--55q36pba3495a.com/auction/find'}]);
 assert.equal(rows.filter(x=>x.id==='297580').length,1);
 assert.equal(rows.some(x=>x.id==='placeholder'||x.id==='alias'),false);
 assert.equal(rows.filter(x=>x.availability==='active').length,255);
 assert.equal(rows.filter(x=>x.availability==='ended').length,10);
});
test('verified closed status wins over stale active store metadata',()=>{
 const item=mergeCatalog([{id:'297583',sourceUrl:'https://xn--55q36pba3495a.com/auction/297583.html',availability:'active'}]).find(x=>x.id==='297583');
 assert.equal(item.availability,'ended');
});
test('all photo regions are bound to distinct official PDF hashes and valid coordinates',()=>{
 assert.ok(Object.keys(seeds).length>=14);assert.equal(new Set(Object.values(seeds).map(x=>x.pdfSha256)).size,Object.keys(seeds).length);
 for(const seed of Object.values(seeds)){
  assert.match(seed.pdfSha256,/^[0-9a-f]{64}$/);assert.equal(new URL(seed.bitUrl).hostname,'www.bit.courts.go.jp');
  if(seed.photoPageCrop){const [x,y,w,h]=seed.photoPageCrop.rect;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1&&y+h<=1);}
 }
});
