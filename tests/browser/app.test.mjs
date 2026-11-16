import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, openFeature, ME, OTHER, CHAT } from './helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

const run = async (options, action) => {
  const app = await setup(server.base, options);
  try { await action(app); assert.deepEqual(app.errors, [], 'No uncaught browser errors'); }
  finally { await app.close(); }
};

test('public forms validate empty inputs and show rejected login; successful login opens app', async () => run({ signedIn: false }, async ({ page, failures }) => {
  await page.getByText('LOG IN', { exact: true }).click();
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await page.getByText('Enter your email address and password.', { exact: true }).waitFor();
  await page.getByPlaceholder('Email address').fill('fixture@example.test');
  await page.getByPlaceholder('Password', { exact: true }).fill('wrong-password');
  failures.set('POST:token', { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await page.getByText('Invalid login credentials', { exact: true }).waitFor();
  failures.delete('POST:token');
  await page.getByRole('button', { name: 'LOG IN', exact: true }).click();
  await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
}));

test('signup validates passwords and recovery request targets this Pages base', async () => run({ signedIn: false }, async ({ page, requests }) => {
  await page.getByText('SIGN UP', { exact: true }).click();
  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click();
  await page.getByText('Complete your name, username, email and password fields.', { exact: true }).waitFor();
  for (const [placeholder, value] of [['Full name', 'Fixture'], ['Username (3–20 characters)', 'fixture'], ['Email address', 'fixture@example.test'], ['Create password (at least 8 characters)', 'password123'], ['Confirm password', 'different123']]) await page.getByPlaceholder(placeholder, { exact: true }).fill(value);
  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click();
  await page.getByText('The passwords do not match.', { exact: true }).waitFor();
  await page.getByPlaceholder('Confirm password', { exact: true }).fill('password123');
  await page.getByRole('button', { name: 'CREATE ACCOUNT', exact: true }).click();
  await page.getByText('Account created. Check your email and confirm your address before logging in.', { exact: true }).waitFor();
  const signup = requests.find(r => r.path.endsWith('/signup'));
  assert.equal(signup.body.data.username, 'fixture');
  await page.getByText('‹ Back', { exact: true }).click();
  await page.getByText('LOG IN', { exact: true }).click();
  await page.getByPlaceholder('Email address').fill('fixture@example.test');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByText('Password reset instructions have been sent. Check your email.', { exact: true }).waitFor();
  assert.ok(requests.find(r => r.path.endsWith('/recover')).search.includes('redirect_to='));
}));

for (const width of [320, 390, 1280]) test(`six tabs and retained session work at ${width}px`, async () => run({ width }, async ({ page }) => {
  for (const tab of ['Reels', 'Chats', 'Status', 'Discover', 'Calls', 'Profile']) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    assert.equal(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${tab} does not overflow`);
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Reels', exact: true }).waitFor();
}));

test('signout removes protected content', async () => run({}, async ({ page }) => {
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await page.getByText('LOG OUT', { exact: true }).click();
  await page.getByText('SIGN UP', { exact: true }).waitFor();
  assert.equal(await page.getByText('My Profile', { exact: true }).count(), 0);
}));

test('account deletion confirmation cancels safely and submits only after confirmation', async () => run({}, async ({ page, requests }) => {
  await openFeature(page, 'Account settings');
  await page.getByRole('button', { name: /Delete account Submit/ }).click();
  await page.getByText('Submit deletion request', { exact: true }).click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(requests.filter(r => r.method === 'POST' && r.path.endsWith('/account_deletion_requests')).length, 0);
  await page.getByText('Submit deletion request', { exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button').last().click();
  await page.getByText('Request submitted', { exact: true }).first().waitFor();
  assert.equal(requests.filter(r => r.method === 'POST' && r.path.endsWith('/account_deletion_requests')).length, 1);
}));

test('followers use backend records and follow-back persists', async () => run({ db: { follows: [{ follower_id: OTHER, followed_id: ME }] } }, async ({ page, requests }) => {
  await openFeature(page, 'Followers');
  await page.getByText('Other Member', { exact: true }).waitFor();
  await page.getByText('Follow back', { exact: true }).click();
  await page.getByText('Following', { exact: true }).waitFor();
  assert.ok(requests.some(r => r.method === 'POST' && r.path.endsWith('/follows') && r.body.followed_id === OTHER));
}));

test('notification read failure rolls back and then success persists', async () => run({ db: { notifications: [{ id: CHAT, recipient_id: ME, type: 'message', body: 'Fixture update', read_at: null }] } }, async ({ page, failures, requests }) => {
  await openFeature(page, 'Notifications');
  failures.set('PATCH:notifications', { message: 'Fixture denied' });
  await page.getByRole('button', { name: 'Unread notification: Fixture update' }).click();
  await page.getByText('Could not mark notification as read: Fixture denied').waitFor();
  await page.getByRole('button', { name: 'Unread notification: Fixture update' }).waitFor();
  failures.delete('PATCH:notifications');
  await page.getByRole('button', { name: 'Unread notification: Fixture update' }).click();
  await page.getByRole('button', { name: 'Read notification: Fixture update' }).waitFor();
  assert.equal(requests.filter(r => r.method === 'PATCH' && r.path.endsWith('/notifications')).length, 2);
}));

test('encrypted message and attachment send preserve ciphertext and do not duplicate', async () => run({}, async ({ page, db, requests }) => {
  await page.getByRole('tab', { name: 'Chats', exact: true }).click();
  await page.getByText('Other Member', { exact: true }).click();
  // Register the recipient's key, as their independent device would.
  db.profiles[1].encryption_public_key = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
  });
  await page.getByPlaceholder('Message securely…').fill('Secret fixture message');
  const sent = page.waitForResponse(response => response.url().includes('/rest/v1/messages') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await sent;
  await page.getByText('Secret fixture message', { exact: true }).waitFor();
  let writes = requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.is_encrypted, true);
  assert.notEqual(writes[0].body.body, 'Secret fixture message');
  const attached = page.waitForResponse(response => response.url().includes('/rest/v1/messages') && response.request().method() === 'POST');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach media', exact: true }).click();
  await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image-data') });
  await attached;
  writes = requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages'));
  assert.equal(writes.length, 2);
  assert.equal(writes[1].body.media_encrypted, true);
  assert.ok(writes[1].body.media_encryption_iv);
}));

test('key backup restores, rejects wrong passphrase and refuses key replacement', async () => run({}, async ({ page, db }) => {
  await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
  const result = await page.evaluate(async me => {
    const encryption = await import('/KONNEKT/src/konnektEncryption.js');
    const first = await encryption.ensureKonnektIdentity(me);
    const fingerprint = await encryption.getKonnektIdentityFingerprint(first.publicJwk);
    await encryption.createKonnektKeyBackup('a long fixture passphrase');
    let rejected = false;
    try { await encryption.restoreKonnektKeyBackup('incorrect passphrase'); } catch { rejected = true; }
    await encryption.restoreKonnektKeyBackup('a long fixture passphrase');
    return { rejected, fingerprint, restored: await encryption.getKonnektIdentityFingerprint((await encryption.getStoredKonnektIdentity(me)).publicJwk) };
  }, ME);
  assert.equal(result.rejected, true);
  assert.equal(result.fingerprint, result.restored);
  db.profiles[0].encryption_public_key = '{"different":"key"}';
  const rejection = await page.evaluate(async me => {
    try { await (await import('/KONNEKT/src/konnektEncryption.js')).ensureKonnektIdentity(me); return false; }
    catch (error) { return error.message.includes('No key was changed'); }
  }, ME);
  assert.equal(rejection, true);
}));

test('voice-note send encrypts media and body; missing peer key prevents upload', async () => run({}, async ({ page, db, requests }) => {
  await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
  db.profiles[1].encryption_public_key = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
  });
  await page.evaluate(async ({ me, chat }) => {
    const { sendEncryptedVoiceMessage } = await import('/KONNEKT/src/services/voiceMessages.js');
    await sendEncryptedVoiceMessage(new File(['voice fixture bytes'], 'fixture.webm', { type: 'audio/webm' }), chat, me);
  }, { me: ME, chat: CHAT });
  const writes = requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages'));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.is_encrypted, true);
  assert.equal(writes[0].body.media_encrypted, true);
  assert.notEqual(writes[0].body.body, 'Voice note');
  db.profiles[1].encryption_public_key = null;
  const error = await page.evaluate(async ({ me, chat }) => {
    try {
      await (await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(new File(['bytes'], 'fixture.webm', { type: 'audio/webm' }), chat, me);
    } catch (error) { return error.message; }
  }, { me: ME, chat: CHAT });
  assert.match(error, /before sending secure voice notes/);
  assert.equal(requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages')).length, 1);
}));

test('status validates empty content and publishes a text update with expiry', async () => run({}, async ({ page, requests }) => {
  await openFeature(page, 'Create a status');
  await page.getByText('PUBLISH STATUS', { exact: true }).click();
  await page.getByText('Write an update or attach a photo or video.', { exact: true }).waitFor();
  await page.getByPlaceholder("What's happening?", { exact: true }).fill('Fixture status');
  const response = page.waitForResponse(r => r.url().includes('/rest/v1/statuses') && r.request().method() === 'POST');
  await page.getByText('PUBLISH STATUS', { exact: true }).click();
  await response;
  const request = requests.find(r => r.method === 'POST' && r.path.endsWith('/statuses'));
  assert.equal(request.body.text_content, 'Fixture status');
  assert.equal(request.body.media_type, 'text');
  assert.ok(Date.parse(request.body.expires_at) > Date.now() + 23 * 3600000);
}));

test('password change reauthenticates and handles rejected and successful changes', async () => run({}, async ({ page, failures, requests }) => {
  await openFeature(page, 'Change password');
  await page.getByPlaceholder('Enter current password').fill('current-password');
  await page.getByPlaceholder('Enter new password').fill('new-password123');
  await page.getByPlaceholder('Confirm new password').fill('new-password123');
  failures.set('POST:token', { msg: 'Invalid login credentials' });
  await page.getByText('Update password', { exact: true }).click();
  await page.getByRole('alertdialog').getByText('Invalid login credentials').waitFor();
  assert.equal(requests.filter(r => r.method === 'PUT' && r.path.endsWith('/user')).length, 0);
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  failures.delete('POST:token');
  await page.getByText('Update password', { exact: true }).click();
  await page.getByRole('alertdialog').getByText('Password changed', { exact: true }).waitFor();
  assert.equal(requests.filter(r => r.method === 'PUT' && r.path.endsWith('/user')).length, 1);
}));

test('long conversations load the latest 300 messages rather than the oldest 300', async () => {
  const messages = Array.from({ length: 305 }, (_, i) => ({ id: `message-${i+1}`, conversation_id: CHAT, sender_id: OTHER, body: `Message number ${i+1}`, is_encrypted: false, created_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }));
  await run({ db: { messages } }, async ({ page }) => {
    await page.getByRole('tab', { name: 'Chats', exact: true }).click();
    await page.getByText('Other Member', { exact: true }).click();
    await page.getByText('Message number 6', { exact: true }).waitFor();
    assert.equal(await page.getByText('Message number 1', { exact: true }).count(), 0);
  });
});

test('incoming group-call decline executes its update and session change dismisses stale dialogs', async () => run({ db: {
  group_call_sessions: [{ id: CHAT, conversation_id: CHAT, call_type: 'voice', created_by: OTHER, status: 'active' }],
  group_call_participants: [{ call_id: CHAT, user_id: ME, status: 'invited' }]
} }, async ({ page, requests }) => {
  await page.getByRole('alertdialog').getByText('Group call invitation', { exact: true }).waitFor();
  const response = page.waitForResponse(r => r.url().includes('/rest/v1/group_call_participants') && r.request().method() === 'PATCH');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Decline', exact: true }).click();
  await response;
  assert.ok(requests.some(r => r.method === 'PATCH' && r.body?.status === 'declined'));
  await page.evaluate(async () => {
    (await import('/KONNEKT/src/components/Alert.jsx')).Alert.alert('Stale confirmation', 'Must close on signout', [{ text: 'Delete', onPress: () => { throw new Error('Must not execute'); } }]);
  });
  await page.getByRole('alertdialog').waitFor();
  await page.evaluate(async () => { await (await import('/KONNEKT/src/lib_supabase.js')).supabase.auth.signOut(); });
  await page.getByText('SIGN UP', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alertdialog').count(), 0);
}));


test('sending an attachment preserves a newer composer draft', async () => run({}, async ({ page, db, requests }) => {
  await page.getByRole('tab', { name: 'Chats', exact: true }).click();
  db.profiles[1].encryption_public_key = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
  });
  await page.getByText('Other Member', { exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Attach media"]')?.getAttribute('aria-disabled'));
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/rest/v1/messages', async route => {
    if (route.request().method() === 'POST') { started(); await pending; }
    await route.fallback();
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Attach media', exact: true }).click();
  await (await chooser).setFiles({ name: 'draft.png', mimeType: 'image/png', buffer: Buffer.from('fixture-image') });
  await began;
  await page.getByPlaceholder('Message securely…').fill('Next message draft');
  const response = page.waitForResponse(r => r.url().includes('/rest/v1/messages') && r.request().method() === 'POST');
  release();
  await response;
  await page.waitForTimeout(300);
  assert.equal(await page.getByPlaceholder('Message securely…').inputValue(), 'Next message draft');
  assert.equal(requests.filter(r => r.path === '/rest/v1/messages' && r.method === 'POST').length, 1);
}));


test('voice-note failures clean unused uploads and invalid conversation IDs make no requests', async () => run({}, async ({ page, db, requests, failures }) => {
  await page.getByRole('tab', { name: 'Profile', exact: true }).waitFor();
  const attempt = chat => page.evaluate(async ({ me, chat }) => {
    try {
      const { sendEncryptedVoiceMessage } = await import('/KONNEKT/src/services/voiceMessages.js');
      await sendEncryptedVoiceMessage(new File(['fixture voice'], 'failed.webm', { type: 'audio/webm' }), chat, me);
    } catch (error) { return error.message; }
  }, { me: ME, chat });
  const before = requests.length;
  assert.match(await attempt('undefined'), /active conversation/);
  // Unrelated initial feed requests may finish in the background.
  assert.equal(requests.slice(before).filter(r => r.search.includes('undefined') || r.path.includes('/storage/')).length, 0);
  db.profiles[1].encryption_public_key = await page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
  });
  failures.set('POST:messages', { message: 'Fixture message rejected' });
  assert.match(await attempt(CHAT), /Fixture message rejected/);
  const uploads = requests.filter(r => r.method === 'POST' && r.path.includes('/storage/v1/object/'));
  const removals = requests.filter(r => r.method === 'DELETE' && r.path.includes('/storage/v1/object/'));
  assert.equal(uploads.length, 1);
  assert.equal(removals.length, 1);
  assert.equal(removals[0].body.prefixes[0], uploads[0].path.split('/konnekt-chat-media/')[1]);
  assert.equal(db.messages.length, 0);
}));


test('profile loads and saves when wildcard profile reads are denied', async () => run({}, async ({ page, context, db, requests }) => {
  await context.route('**/rest/v1/profiles?**', route => {
    if(route.request().method()==='GET' && new URL(route.request().url()).searchParams.get('select')==='*') return route.fulfill({status:403,json:{message:'permission denied for table profiles'}});
    return route.fallback();
  });
  await page.getByRole('tab',{name:'Profile',exact:true}).click();
  await page.getByPlaceholder('Your name',{exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('Your name',{exact:true}).inputValue(),'Fixture Member');
  await page.getByPlaceholder('Your name',{exact:true}).fill('Fixture Updated');
  await page.getByText('SAVE PROFILE',{exact:true}).click();
  await page.getByText('Profile saved successfully.',{exact:true}).waitFor();
  assert.equal(db.profiles.find(row=>row.id===ME).full_name,'Fixture Updated');
  await page.reload();
  await page.getByRole('tab',{name:'Profile',exact:true}).click();
  await page.getByPlaceholder('Your name',{exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('Your name',{exact:true}).inputValue(),'Fixture Updated');
  const read=requests.filter(r=>r.path.endsWith('/profiles')&&r.method==='GET').at(-1);
  assert(!new URLSearchParams(read.search).get('select').split(',').includes('phone'));
}));


test('voice notes are reachable from chat, encrypt sends and release recording tracks', async () => run({}, async ({ page, db, requests }) => {
  db.profiles[1].encryption_public_key=await page.evaluate(async()=>{
    const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return JSON.stringify(await crypto.subtle.exportKey('jwk',pair.publicKey));
  });
  await page.evaluate(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const context=new AudioContext();const oscillator=context.createOscillator();const destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();window.__voiceStream=destination.stream;return destination.stream;
    };
  });
  await page.getByRole('tab',{name:'Chats',exact:true}).click();await page.getByText('Other Member',{exact:true}).click();
  await page.getByRole('button',{name:'Record voice note',exact:true}).click();
  await page.getByText('Start recording',{exact:true}).click();await page.getByText('Stop recording',{exact:true}).waitFor();
  await page.waitForTimeout(500);await page.getByText('Stop recording',{exact:true}).click();await page.getByText('Send voice note',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__voiceStream.getTracks().every(track=>track.readyState==='ended')),true);
  await page.getByText('Send voice note',{exact:true}).click();await page.getByRole('alertdialog').waitFor();
  const writes=requests.filter(r=>r.method==='POST'&&r.path.endsWith('/messages'));assert.equal(writes.length,1);assert.equal(writes[0].body.is_encrypted,true);assert.equal(writes[0].body.media_encrypted,true);assert.notEqual(writes[0].body.body,'Voice note');
}));


test('leaving voice recording while permission is pending stops any late-granted stream',async()=>run({},async({page,db})=>{
  db.profiles[1].encryption_public_key=await page.evaluate(async()=>{const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveKey']);return JSON.stringify(await crypto.subtle.exportKey('jwk',pair.publicKey));});
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.__grantVoice=()=>{const context=new AudioContext();const oscillator=context.createOscillator();const destination=context.createMediaStreamDestination();oscillator.connect(destination);oscillator.start();window.__lateVoice=destination.stream;resolve(destination.stream);};});});
  await page.getByRole('tab',{name:'Chats',exact:true}).click();await page.getByText('Other Member',{exact:true}).click();await page.getByRole('button',{name:'Record voice note',exact:true}).click();
  await page.getByText('Start recording',{exact:true}).click();await page.waitForFunction(()=>typeof window.__grantVoice==='function');
  await page.getByText('‹ Back',{exact:true}).click();await page.getByPlaceholder('Message securely…').waitFor();
  await page.evaluate(()=>window.__grantVoice());await page.waitForFunction(()=>window.__lateVoice.getTracks().every(track=>track.readyState==='ended'));
}));


test('unenforced privacy controls cannot promise restrictions and blocked count comes from data',async()=>run({db:{user_blocks:[]}},async({page,requests})=>{
  await openFeature(page,'Account settings');
  await page.getByRole('switch').first().waitFor();
  assert.equal(await page.getByRole('switch').count(),3);
  for(const control of await page.getByRole('switch').all())assert.equal(await control.isDisabled(),true);
  await page.getByText(/^‹(?: Back.*)?$/).first().click();
  const countResponse=page.waitForResponse(response=>response.request().method()==='HEAD'&&response.url().includes('/rest/v1/user_blocks'));
  await page.getByRole('button',{name:'Open Privacy settings',exact:true}).click();
  await countResponse;
  await page.getByText(/Audience restrictions and receipt controls are unavailable/).waitFor();
  assert.equal(await page.getByLabel('Read receipts (unavailable)',{exact:true}).isDisabled(),true);
  assert.equal(await page.getByText('3',{exact:true}).count(),0);
  assert(requests.some(r=>r.method==='HEAD'&&r.path.endsWith('/user_blocks')));
}));


for (const width of [390, 1280]) {
 test(`deferred live and payment routes remain inert and return to core features at width ${width}`,async()=>run({width},async({page,requests})=>{
  await page.evaluate(()=>{
    window.testMediaRequests=0;
    navigator.mediaDevices.getUserMedia=async()=>{window.testMediaRequests++;throw new Error('Deferred route requested media');};
  });
  await page.getByRole('tab',{name:'Profile',exact:true}).click();
  await page.getByText('☰  ALL FEATURES',{exact:true}).click();
  for (const label of ['Live rooms','Creator earnings','Creator monetisation','Creator subscriptions','Brand partnerships']) {
    await page.getByRole('button',{name:`Open ${label}`,exact:true}).click();
    await page.getByText('Unavailable in this release',{exact:true}).waitFor();
    assert.equal(await page.getByPlaceholder(/bank|card|live title/i).count(),0);
    await page.getByRole('button',{name:'‹ Back',exact:true}).click();
    await page.getByText('All features',{exact:true}).waitFor();
  }
  await page.getByRole('button',{name:'Open Creator studio',exact:true}).click();
  await page.getByText('Go live (unavailable)',{exact:true}).click();
  await page.getByText('Unavailable in this release',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.testMediaRequests),0);
  assert.equal(requests.filter(r=>/live_stream|payment|payout|subscription|gift/.test(r.path)).length,0);
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name));
  assert(!loaded.some(url=>/\/screens\/(LiveStream|CreatorEarnings|CreatorPayout|CreatorMonetization|CreatorSubscriptions|CreatorBrandPartnerships)/.test(url)),'deferred implementations must not mount or load');
  await page.getByRole('button',{name:'‹ Back',exact:true}).click();
  await page.getByText('‹ Back',{exact:true}).click();
  await page.getByRole('button',{name:'Open Discover people',exact:true}).click();
  await page.getByLabel('Search Discover').waitFor();
 }));
}


test('route chunks load on demand and a failed screen download offers reload without replacing keys',async()=>{
 const f=await setup(server.base);try{
  const {page,context,db}=f;await page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  await page.evaluate(async me=>{const {ensureKonnektIdentity}=await import('/KONNEKT/src/services/konnektEncryption.js');await ensureKonnektIdentity(me);},ME);
  const initialKey=db.profiles.find(row=>row.id===ME).encryption_public_key;
  assert(initialKey,'registered key required before testing reload preservation');
  const loaded=await page.evaluate(()=>performance.getEntriesByType('resource').map(item=>item.name));
  assert(!loaded.some(url=>url.includes('/screens/DiscoverScreen.jsx')),'Discover should not load in initial route');
  // Vite may append an HMR timestamp; the simulated outage must catch that URL too.
  const chunk=/\/src\/screens\/DiscoverScreen\.jsx(?:\?.*)?$/;
  let blocked=0;
  const outage=route=>{blocked++;return route.abort();};await context.route(chunk,outage);
  await page.getByRole('tab',{name:'Discover',exact:true}).click();await page.getByText('KONNEKT could not open this screen',{exact:true}).waitFor();
  assert(blocked>0,'a real screen request must be blocked');
  await context.unroute(chunk,outage);await page.getByRole('button',{name:'Reload KONNEKT',exact:true}).click();await page.getByRole('tab',{name:'Profile',exact:true}).waitFor();
  await page.evaluate(async me=>{const {ensureKonnektIdentity}=await import('/KONNEKT/src/services/konnektEncryption.js');await ensureKonnektIdentity(me);},ME);
  assert.equal(db.profiles.find(row=>row.id===ME).encryption_public_key,initialKey);
  for(const error of f.errors)assert.match(error,/DiscoverScreen|dynamically imported/);
 }finally{await f.close();}
});
