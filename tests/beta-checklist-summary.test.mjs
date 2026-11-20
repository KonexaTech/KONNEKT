import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,renderMarkdown} from '../scripts/beta/summarize-checklists.mjs';
const row=(tester,date,values)=>({reason:'App bug: Beta checklist',details:['KONNEKT BETA CHECKLIST v1','Tester: '+tester,'Device: Android 14','Submitted: '+date,...values].join('\n')});
test('end-of-test rollup deduplicates testers using their most recent submissions and orders failures first',()=>{
 const records=[
  row('T01','2026-11-27T10:00:00Z',['C02: Fail - older issue','N01: Pass']),
  row('T01','2026-11-28T10:00:00Z',['C02: Pass','N01: Fail - closed app no push']),
  row('T02','2026-11-28T10:00:00Z',['C02: Fail - upload stalls','N01: Fail - never notified']),
  {reason:'App bug: Chats',details:'ignore this'},
 ];
 const result=summarize(records);
 assert.equal(result.submitted,3);
 assert.equal(result.uniqueTesters,2);
 assert.equal(result.missing,18);
 const push=result.totals.find(x=>x.id==='N01'),media=result.totals.find(x=>x.id==='C02');
 assert.equal(push.fail,2);assert.equal(media.fail,1);assert.equal(media.pass,1);
 assert.equal(result.totals[0].id,'N01');
 assert.match(renderMarkdown(result),/Missing tester reports: 18/);
 assert.match(renderMarkdown(result),/closed app no push/);
});
test('unreported and not-tested features never count as passes',()=>{
 const result=summarize([row('T03','2026-11-28T10:00:00Z',['A01: Not tested'])]);
 assert.equal(result.totals.find(x=>x.id==='A01').notTested,1);
 assert.equal(result.totals.find(x=>x.id==='A02').notTested,1);
 assert.equal(result.totals.find(x=>x.id==='A01').pass,0);
});
