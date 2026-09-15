import test from 'node:test';
import assert from 'node:assert/strict';
import {bitUrl,blockedPage,trustedPhoto,PHOTO_POLICY} from '../netlify/lib/photo-policy.mjs';
test('BIT canonical URL rejects lookalike and unrelated sources',()=>{
  assert.equal(bitUrl('https://bit.courts.go.jp/app/detail?a=1'),'https://www.bit.courts.go.jp/app/detail?a=1');
  for(const u of ['https://bit.courts.go.jp.evil.test/x','https://example.org/pdf','https://user:pass@www.bit.courts.go.jp/x']) assert.equal(bitUrl(u),null);
});
test('old and screenshot caches cannot become covers',()=>{
  assert.equal(trustedPhoto({method:'page-image',source:'https://www.bit.courts.go.jp/x'}),false);
  assert.equal(trustedPhoto({policy:PHOTO_POLICY,method:'three-doc-pdf',source:'https://image.thum.io/x'}),false);
  assert.equal(trustedPhoto({policy:PHOTO_POLICY,method:'three-doc-pdf',source:'https://www.bit.courts.go.jp/x'}),true);
  assert.equal(blockedPage('<title>Just a moment...</title>'),true);
});
