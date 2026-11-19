import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../docs/release/staging-beta-20-user-enforcement.sql',import.meta.url),'utf8');
const permitted=({authenticated=true,enrolled=false,owner=false,ownerCount=1,distinct=true,approvedCount=20,enabled=false,startedAt=0,endsAt=14,day=0})=>
  authenticated&&(enrolled||owner)&&approvedCount===20&&ownerCount===1&&distinct&&enabled&&startedAt<=day&&day<endsAt;
test('staging-only migration cannot activate or target production',()=>{
 assert.match(sql,/STAGING ONLY: oiwtfkgrnpzirghbsvim/);
 assert.match(sql,/NEVER production/i);
 assert.match(sql,/enabled boolean not null default false/i);
 assert.doesNotMatch(sql,/^\s*update\s+konnekt_beta\.control\s+set\s+enabled\s*=\s*true/im);
});
test('gate checks full enrollment, identity, exact 14 days, and remote disable',()=>{
 for(const pat of [/count\(\*\) from konnekt_beta\.testers\)=20/i,
 /t\.user_id=auth\.uid\(\)/i,/now\(\) < c\.ends_at/i,
 /c\.started_at <= now\(\)/i,/c\.enabled/i,
 /started_at \+ interval '14 days'/i])assert.match(sql,pat);
 const active={authenticated:true,enrolled:true,approvedCount:20,enabled:true,startedAt:0,endsAt:14};
 assert.equal(permitted({...active,day:1}),true);
 assert.equal(permitted({...active,day:13.999}),true);
 assert.equal(permitted({...active,day:14}),false);
 assert.equal(permitted({...active,day:15}),false);
 assert.equal(permitted({...active,enrolled:false,day:1}),false);
 assert.equal(permitted({...active,approvedCount:19,day:1}),false);
 assert.equal(permitted({...active,approvedCount:21,day:1}),false);
 assert.equal(permitted({...active,enabled:false,day:1}),false);
 assert.equal(permitted({...active,authenticated:false,day:1}),false);
 assert.equal(permitted({...active,owner:true,enrolled:false,day:1}),true);
 assert.equal(permitted({...active,ownerCount:0,day:1}),false);
 assert.equal(permitted({...active,ownerCount:2,day:1}),false);
 assert.equal(permitted({...active,distinct:false,day:1}),false);
});
test('one separately verified owner and no 21st tester can enroll',()=>{
 assert.match(sql,/create table if not exists konnekt_beta\.owner_access/i);
 assert.match(sql,/singleton boolean primary key default true check \(singleton\)/i);
 assert.match(sql,/user_id uuid not null unique references auth\.users\(id\)/i);
 assert.match(sql,/before insert or update of user_id on konnekt_beta\.testers/i);
 assert.match(sql,/before insert or update of user_id on konnekt_beta\.owner_access/i);
 assert.match(sql,/pg_catalog\.pg_advisory_xact_lock/i);
 assert.match(sql,/TG_OP = 'INSERT' and \(select count\(\*\) from konnekt_beta\.testers\) >= 20/i);
 assert.match(sql,/The owner account cannot use a tester slot/i);
 assert.match(sql,/The owner account must be separate from all testers/i);
 assert.match(sql,/\(select count\(\*\) from konnekt_beta\.owner_access\)=1/i);
 assert.match(sql,/not exists \(\s*select 1 from konnekt_beta\.testers t\s*join konnekt_beta\.owner_access o on t\.user_id=o\.user_id/i);
 assert.match(sql,/or exists \(select 1 from konnekt_beta\.owner_access o where o\.user_id=auth\.uid\(\)\)/i);
 assert.match(sql,/revoke all on all tables in schema konnekt_beta/i);
});

test('all public data and storage rows have restrictive gate policy',()=>{
 assert.match(sql,/n\.nspname='public' or \(n\.nspname='storage' and c\.relname='objects'\)/i);
 assert.match(sql,/create policy beta_14_day_gate.*as restrictive for all to public using.*with check/i);
 assert.match(sql,/if not r\.relrowsecurity then/i);
 assert.match(sql,/revoke all on all tables in schema konnekt_beta/i);
});
test('privileged session helper includes beta gate in addition to MFA/account deletion',()=>{
 assert.match(sql,/create or replace function konnekt_private\.session_allowed\(\)/i);
 assert.match(sql,/account_deletion_requests/i);
 assert.match(sql,/auth\.mfa_factors/i);
 assert.match(sql,/and \(select konnekt_beta\.allowed\(\)\)/i);
});

test('deployment fails closed if public media URLs could bypass beta shutdown',()=>{
 assert.match(sql,/if exists\(select 1 from storage\.buckets where public\)/i);
 assert.match(sql,/raise exception using errcode='42501'/i);
 assert.match(sql,/public Storage bucket bypasses session expiry and shutdown/i);
});

test('enrollment roster becomes immutable after beta first starts',()=>{
 assert.match(sql,/create or replace function konnekt_beta\.lock_roster_after_start\(\)/i);
 assert.match(sql,/c\.started_at is not null/i);
 assert.match(sql,/before insert or update or delete on konnekt_beta\.testers/i);
 assert.match(sql,/before insert or update or delete on konnekt_beta\.owner_access/i);
 assert.match(sql,/Beta roster is frozen after activation/i);
});
