import test from 'node:test';
import assert from 'node:assert/strict';
import {config as discoveryConfig} from '../netlify/functions/daily-discovery.mjs';
import {config as enrichmentConfig} from '../netlify/functions/continue-discovery.mjs';

test('daily discovery starts at 07:00 Taiwan time',()=>{
 assert.equal(discoveryConfig.schedule,'0 23 * * *');
});

test('enrichment runs hourly from 08:00 through 12:00 Taiwan time',()=>{
 assert.equal(enrichmentConfig.schedule,'0 0-4 * * *');
});
