import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectControls, instrumentControls } from '../scripts/audit/control-inventory.mjs';
test('control inventory identifies handlers and dependencies without converting visibility or source presence into PASS', () => {
  const rows = inspectControls(`import {send} from '../services/send'; function Screen(){ const save=()=>{client.from('messages').insert({});send();};return <><TouchableOpacity accessibilityLabel="Send" onPress={save}/><Switch disabled onValueChange={()=>{}}/><audio controls aria-label="Voice playback"/><Text>Not a control</Text></>}`, 'Fixture.jsx');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].labels[0], 'Send');
  assert(rows[0].declaredDependencies.some(ref => ref.kind === 'table' && ref.name === 'messages'));
  assert(rows[0].declaredDependencies.some(ref => ref.kind === 'imported-handler'));
  assert.equal(rows[1].result, 'NOT IMPLEMENTED');
  assert(rows.every(row => row.result !== 'PASS' && row.evidence === null));
});
test('control instrumentation preserves handlers and adds source IDs without altering input values or production code', () => {
  const code = '<><TouchableOpacity onPress={send}><Text>Send</Text></TouchableOpacity><audio controls/><input placeholder="Password" onChange={change}/></>';
  const instrumented = instrumentControls(code, 'Fixture.jsx');
  assert.match(instrumented, /dataSet=\{\{qaControl:/);
  assert.match(instrumented, /data-qa-control=/);
  assert.match(instrumented, /onPress=\{send\}/);
  assert.equal(inspectControls(instrumented).length, 3);
});
