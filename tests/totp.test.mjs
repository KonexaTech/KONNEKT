import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totp} from '../scripts/acceptance/totp.mjs';
test('private staging authenticator generator follows the RFC 6238 SHA-1 vectors',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 for(const [seconds,code] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']])assert.equal(totp(secret,seconds*1000),code);
 assert.throws(()=>totp('invalid!'),/Invalid private/);
});
