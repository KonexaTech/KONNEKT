# Staging Android acceptance progress

Public release remains **NO-GO**. This document includes historical build evidence; the current scoped live messaging/recovery and push/TURN preparation records are linked below. None substitutes for physical-device acceptance.

Current evidence: [LIVE_ACCEPTANCE_2026-11-16.json](LIVE_ACCEPTANCE_2026-11-16.json), [PUSH_TURN_ACCEPTANCE_2026-11-16.json](PUSH_TURN_ACCEPTANCE_2026-11-16.json), [STAGING_PUSH_DELIVERY.md](STAGING_PUSH_DELIVERY.md) and [STAGING_TURN_CREDENTIALS.md](STAGING_TURN_CREDENTIALS.md). Three fixture accounts are available and live encrypted messaging/Realtime/recovery have passed their recorded scoped cases.

Baseline: `7102642` (merged messaging PR #13). Development branch: `development/staging-android-isolation`.

## Verified locally

- Ten Node tests passed, including 33 local database assertions for group creation, member/nonmember message and attachment access, and related authorization checks.
- Production web build passed with the existing bundle-size warning.
- Mobile web build using the existing `konnekt-staging` project passed.
- Built staging JavaScript includes `oiwtfkgrnpzirghbsvim.supabase.co` and excludes the production project reference.
- Capacitor Android generation and synchronization passed. Generated Gradle application ID and embedded Capacitor configuration both use `com.konnekt.staging`.
- Launcher branding replaces the generated background color instead of creating duplicate Android resources; repeated installation is tested.
- Microphone/camera permissions and optional hardware declarations are installed in generated Android manifests; runtime consent remains required.
- Production configuration retains `com.konnekt.app`. Staging uses the label `KONNEKT Staging`, allowing both installations to coexist without replacing production app storage or keys.

## CI build

[Staging Android APK workflow](https://github.com/siboniisozulu-alt/KONNEKT/actions/runs/43763951354)

**Result: PASS** on code commit `d368b4b`: staging web build, backend-isolation verification, native compilation, APK signature verification, and artifact upload all succeeded. Artifact: `KONNEKT-Android-API26-Staging`. This is a debug-signed test APK, not a production store release.

The first run exposed duplicate launcher color resources; the installer was repaired and tested before the final successful run. A superseded intermediate build was cancelled.

The workflow uses staging-only public API settings. Optional dispatch inputs avoid requiring repository-variable administration; repository variables take precedence. No secret or service-role key is accepted as the publishable key. The separate backend check runs before native generation.

## Still required before acceptance

- Repeat the prepared messaging/recovery cases on actual Android installations; browser and API evidence does not establish native device acceptance.
- Physical Android devices with Wi-Fi and cellular connectivity; install the staging artifact, verify voice/video media, mute/camera controls, decline, hangup, reconnect, and background/resume.
- Staging TURN credential endpoint and configured relay provider. Permanent relay secrets must stay on the server.
- Staging OneSignal application plus Android delivery credentials, then foreground/background/closed-app delivery, permission denial, logout isolation, and token rotation checks.
- Explicit release acceptance and go/no-go approval. No production database changes were made and no paid services were added.

## Prepared messaging acceptance runner

The three-account browser runner and private setup instructions are in [STAGING_MESSAGING_TESTS.md](STAGING_MESSAGING_TESTS.md). The runner has passed against staging using the three explicitly approved fixtures. The separate push/TURN runner also passed registration/session guards; provider delivery and two-phone connectivity remain pending. Current navigation is preserved.
