# Voice and private attachment repair

Candidate starts from `94de4b608857a35fe4b809129037b2770d42deef` on `development/voice-media-release-20261122`.

The earlier uncommitted implementation in the separate `KONNEKT-acceptance` checkout was reconciled with current main using a three-way patch. Current main's purple/gold styles and passkey recovery were preserved. Current main exposes six tabs: Chats, Reels, Status, Discover, Calls and Profile. This candidate preserves that inspected navigation unchanged; it does not reapply an older five-tab change. No production database changes or account deletions were performed.

## Confirmed defects and changes

- Empty recordings could reach upload; validate supported MIME, nonzero bytes and upload caps before encryption. The recorder additionally requires 200 ms of active recording.
- A committed message whose success response was lost could be sent twice on retry. Keep one cryptographically generated UUID per in-memory draft, reconcile that exact owned message and storage path, serialize overlapping attempts and rely on the existing message primary key.
- Interrupted/unconfirmed sends retain their encrypted object when it cannot be proved unused. Cleanup runs only through the existing membership/ownership checks. There is no durable plaintext outbox.
- Pause/resume, explicit cancel, preview, elapsed active duration, microphone errors and background interruption now have explicit recorder states. Recorder tracks stop on discard, permission cancellation, errors, backgrounding and unmount.
- Audio playback coordinates players, supports native seeking and play/pause, adds 1×/1.5×/2× speed and pauses on backgrounding.
- Voice duration, format and size metadata are inside the encrypted message body. The existing `audio` message type, private chat bucket and ECDH/AES-GCM implementation are retained. Legacy voice messages remain readable.
- Private PDF/plain-text attachments use the existing encrypted attachment flow. HTML and unknown document types are rejected. File-size checks reserve the GCM tag before encryption. Public social-upload types are not expanded.
- The generic attachment opener is correctly labelled. Personal information opens the existing Profile editor; Reels shortcuts open the canonical tab route. Conversation rows expose stable IDs for unambiguous test selection without merging existing histories.

## Evidence boundaries

Browser fixtures exercise actual client encryption/decryption and byte round trips with an isolated API harness. They do not prove live Supabase authorization, Realtime delivery or physical microphone/speaker operation. The earlier live staging voice test and later partial extended run preceded this candidate and do not establish acceptance of this exact commit. The requested extended live rerun was not performed after automatic approval review rejected it because of a usage limit.

Upload progress reports actual stages, not a fabricated byte percentage. Browser recording support remains dependent on MediaRecorder and the installed Android WebView. No codec conversion, group calling, push-provider or signing changes are introduced here.

Final executed checks and remaining launch gates are recorded in the application release report.
