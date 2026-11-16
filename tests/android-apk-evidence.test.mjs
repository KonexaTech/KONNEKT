import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apkEvidence} from '../scripts/android-apk-evidence.mjs';
const cert='a'.repeat(64);
const fixture={badging:"package: name='com.konnekt.staging' versionCode='1' versionName='1.0'\nsdkVersion:'26'\napplication-debuggable\n",signature:`Signer #1 certificate SHA-256 digest: ${cert}\n`,apk:Buffer.from('fixture APK'),commit:'b'.repeat(40),expectedPackage:'com.konnekt.staging'};
test('APK evidence binds exact bytes, source, package, SDK and signer without claiming physical acceptance',()=>{
 const ephemeral=apkEvidence(fixture);assert.equal(ephemeral.signing,'TEMPORARY_FRESH_INSTALL_ONLY');assert.match(ephemeral.apkSha256,/^[a-f0-9]{64}$/);
 const stable=apkEvidence({...fixture,expectedCertificate:cert,previous:ephemeral});assert.equal(stable.signing,'OWNER_CONFIGURED_KEY');
 for(const gate of ['physicalInstallation','physicalUpdate','pushDelivery'])assert.equal(stable[gate],'BLOCKED');
 assert.equal(stable.debuggable,true);
});
test('wrong package, SDK, certificate, source or update identity cannot pass artifact verification',()=>{
 for(const extra of [{expectedPackage:'com.konnekt.app'},{badging:fixture.badging.replace("'26'","'27'")},{expectedCertificate:'c'.repeat(64)},{signature:''},{signature:fixture.signature+fixture.signature.replace('#1','#2')},{commit:'main'},{previous:{package:fixture.expectedPackage,certificateSha256:'c'.repeat(64),versionCode:1}},{previous:{package:fixture.expectedPackage,certificateSha256:cert,versionCode:2}}])assert.throws(()=>apkEvidence({...fixture,...extra}));
});
