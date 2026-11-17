import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ringingTimeLeft,RING_WINDOW_MS} from '../src/services/callInvitations.js';
test('ringing has a bounded 45-second window; old, terminal and malformed calls cannot ring',()=>{
 const now=Date.parse('2026-11-17T00:00:00Z'),call={status:'ringing',created_at:new Date(now-1000).toISOString()};
 assert.equal(RING_WINDOW_MS,45000);assert.equal(ringingTimeLeft(call,now),44000);
 for(const row of [{...call,created_at:new Date(now-45000).toISOString()},{...call,status:'accepted'},{...call,status:'ended'},{...call,created_at:'invalid'},{}])assert.equal(ringingTimeLeft(row,now),0);
 assert.equal(ringingTimeLeft({...call,created_at:new Date(now+86400000).toISOString()},now),45000);
});
