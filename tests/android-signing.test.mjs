import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configureStagingSigning } from '../scripts/android-staging-signing.mjs';

test('stable signing fails without secrets and preserves one certificate across repeated configuration without writing passwords to Gradle', () => {
  const root=mkdtempSync(join(tmpdir(),'konnekt-signing-test-'));
  try {
    mkdirSync(join(root,'android/app'),{recursive:true});writeFileSync(join(root,'android/app/build.gradle'),'android {}\n');
    assert.throws(()=>configureStagingSigning({projectRoot:root,tempRoot:root,env:{}}),/requires.*secret/);
    const key=join(root,'fixture.keystore');
    const env={...process.env,KONNEKT_STAGING_KEYSTORE_PASSWORD:'fixture-store-password',KONNEKT_STAGING_KEY_PASSWORD:'fixture-store-password',KONNEKT_STAGING_KEY_ALIAS:'staging'};
    execFileSync('keytool',['-genkeypair','-keystore',key,'-storepass:env','KONNEKT_STAGING_KEYSTORE_PASSWORD','-keypass:env','KONNEKT_STAGING_KEY_PASSWORD','-alias','staging','-keyalg','RSA','-keysize','2048','-validity','30','-dname','CN=Disposable Local Fixture','-noprompt'],{env,stdio:'ignore'});
    env.KONNEKT_STAGING_KEYSTORE_BASE64=readFileSync(key).toString('base64');
    const first=configureStagingSigning({projectRoot:root,tempRoot:root,env});
    const second=configureStagingSigning({projectRoot:root,tempRoot:root,env});
    assert.equal(first.sha256,second.sha256);assert.match(first.sha256,/^[a-f0-9]{64}$/);
    assert.equal(statSync(first.keystore).mode&0o777,0o600);
    const gradle=readFileSync(join(root,'android/app/build.gradle'),'utf8');
    assert.equal(gradle.split('// BEGIN KONNEKT STAGING SIGNING').length,2);
    assert(!gradle.includes(env.KONNEKT_STAGING_KEYSTORE_PASSWORD));
    assert(!gradle.includes(env.KONNEKT_STAGING_KEYSTORE_BASE64));
    assert.throws(()=>configureStagingSigning({projectRoot:root,tempRoot:root,env:{...env,KONNEKT_STAGING_KEYSTORE_BASE64:'invalid'}}),/encoding/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
