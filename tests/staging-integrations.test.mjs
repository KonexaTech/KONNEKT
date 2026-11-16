import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStagingIntegrations,STAGING_ORIGIN} from '../scripts/validate-staging-integrations.mjs';
const base={VITE_SUPABASE_URL:STAGING_ORIGIN,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('staging native integration configuration rejects production, unknown projects, server keys and unsafe TURN endpoints',()=>{
 assert.doesNotThrow(()=>validateStagingIntegrations(base));assert.doesNotThrow(()=>validateStagingIntegrations({...base,VITE_ONESIGNAL_APP_ID:'11111111-1111-4111-8111-111111111111',VITE_TURN_CREDENTIALS_URL:STAGING_ORIGIN+'/functions/v1/turn-credentials'}));
 for(const value of ['https://itkoagpigiifodfhoujt.supabase.co','https://other.supabase.co'])assert.throws(()=>validateStagingIntegrations({...base,VITE_SUPABASE_URL:value}));
 assert.throws(()=>validateStagingIntegrations({...base,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_PRIVATE'}));assert.throws(()=>validateStagingIntegrations({...base,VITE_ONESIGNAL_APP_ID:'PRIVATE_SERVER_KEY'}),error=>!error.message.includes('PRIVATE_SERVER_KEY'));
 for(const value of ['https://evil.invalid/credentials',STAGING_ORIGIN+'/functions/v1/turn-credentials?key=PRIVATE','http://localhost/turn',STAGING_ORIGIN+'/functions/v1/other'])assert.throws(()=>validateStagingIntegrations({...base,VITE_TURN_CREDENTIALS_URL:value}));
});
