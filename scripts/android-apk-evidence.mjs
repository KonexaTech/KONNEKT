import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Inputs are output from successful Android SDK verifiers, never app-supplied metadata.
export function apkEvidence({badging,signature,apk,commit,expectedPackage,expectedCertificate,previous}) {
 const packageLine=badging.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/m);
 const sdk=badging.match(/^sdkVersion:'(\d+)'/m);
 const signers=[...signature.matchAll(/^(?:Signer #(\d+)|V[1-4] Signer:) certificate SHA-256 digest: ([a-f0-9]{64})\s*$/gmi)];
 const certificates=[...new Set(signers.map(s=>s[2].toLowerCase()))];
 if(!packageLine||packageLine[1]!==expectedPackage)throw Error('APK package does not match the intended installation.');
 if(!sdk||Number(sdk[1])!==26)throw Error('APK must declare Android 8.0 / API 26 as its minimum.');
 if(!/^Number of signers: 1\s*$/m.test(signature)||signers.some(s=>s[1]&&s[1]!=='1')||certificates.length!==1)throw Error('Expected exactly one verified APK signing certificate.');
 const certificate=certificates[0];
 if(expectedCertificate&&certificate!==expectedCertificate.toLowerCase())throw Error('APK signing certificate does not match the configured key.');
 if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('An exact source commit is required.');
 if(previous&&(previous.package!==packageLine[1]||previous.certificateSha256!==certificate||Number(previous.versionCode)>Number(packageLine[2])))throw Error('APK cannot establish update continuity with the supplied previous evidence.');
 return {sourceCommit:commit,apkSha256:createHash('sha256').update(apk).digest('hex'),package:packageLine[1],versionCode:Number(packageLine[2]),versionName:packageLine[3],minSdk:26,certificateSha256:certificate,debuggable:/^application-debuggable\s*$/m.test(badging),signing:expectedCertificate?'OWNER_CONFIGURED_KEY':'TEMPORARY_FRESH_INSTALL_ONLY',physicalInstallation:'BLOCKED',physicalUpdate:'BLOCKED',pushDelivery:'BLOCKED'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [apkPath,apksigner,aapt,output,previousPath]=process.argv.slice(2);
 if(!apkPath||!apksigner||!aapt||!output)throw Error('Usage: android-apk-evidence.mjs APK APKSIGNER AAPT OUTPUT [PREVIOUS_EVIDENCE]');
 const signature=execFileSync(apksigner,['verify','--min-sdk-version','26','--verbose','--print-certs',apkPath],{encoding:'utf8'});
 const badging=execFileSync(aapt,['dump','badging',apkPath],{encoding:'utf8'});
 if(process.env.KONNEKT_REQUIRE_STABLE_SIGNING==='true'&&!process.env.EXPECTED_STAGING_CERTIFICATE)throw Error('Stable staging APK evidence requires a verified signing certificate output.');
 const evidence=apkEvidence({apk:readFileSync(apkPath),signature,badging,commit:process.env.GITHUB_SHA,expectedPackage:process.env.KONNEKT_EXPECTED_PACKAGE,expectedCertificate:process.env.EXPECTED_STAGING_CERTIFICATE,previous:previousPath?JSON.parse(readFileSync(previousPath,'utf8')):undefined});
 writeFileSync(output,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
}
