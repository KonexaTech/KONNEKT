# KONNEKT — Approved app-wide bold design standard

**Owner decision, 20 November 2026:** The bold purple-and-gold mobile design demonstrated in the KONNEKT visual preview is the **default visual identity across the entire app**, not just the six main tabs. PR #30 implemented the first main-screen pass; this document records the continuing standard.

## Non-negotiable presentation style
- Deep near-black / royal-purple surfaces (#05030A, #0C0714, #181025, #6A0DAD) and indigo (#3A0CA3); avoid unrelated green, white and blue full-screen themes.
- Gold (#FFC107) marks high-priority controls and active navigation; orange (#FF6B00) for energetic primary actions; cyan (#00E6FF) for focused small highlights.
- Bold, readable screen headings (typically 28–32 px / weight 800–900), clear names and labels, readable contrast, substantial rounded action buttons (prefer 44 px minimum touch targets).
- Immersive Reels without replacing real playback with a static image; chat bubbles and composers stay familiar, but have KONNEKT visual identity.
- Light mode remains usable and legible; no unconditional white-on-white or black-on-black UI overrides.

## Apply to every working route
- Welcome, login, registration, recovery, MFA and verification.
- Chats, direct/group conversations, attachments, chat details, contacts and searches.
- Reels, comments, creation, creator dashboards and live-stream surfaces.
- Status, viewer, replies and privacy.
- Discover, follows, profiles and groups.
- Calls, notifications, settings, safety, account management, moderation, support and reports.

## Functional constraints
- Keep the six owner-approved tabs **Chats · Reels · Status · Discover · Calls · Profile**, their order and routing. Calls was restored by the owner on 20 November 2026, with its existing call-history and voice/video workflows preserved.
- No functionality, backend/RLS, data model, public media access, auth, encryption, posting/calling, accessibility semantics or production release-policy changes as part of visual migration.
- No unsafe blanket CSS overrides. Update visual styles in each active React Native Web screen, retaining state and event handlers.
- Separate draft PRs or small reviewable commits; run lint, tests, browser checks, web/mobile builds and manual Android width checks.
- Do not equate visually complete with 20-tester security gate, signed staging APK or public release readiness.

## Current state at time of audit
90 `src/screens/*.jsx` routes/components exist in the repository. PR #30 changed styles directly in six screen components plus `App.jsx` and `src/konnekt-theme.css`. Other screens still contain inconsistent old green, white, or blue styling (confirmed in `GroupChatScreen.jsx`, `ChatDetailsScreen.jsx`, `NotificationsScreen.jsx`, and the authentication screens). This rolling branch targets those inconsistencies. Remaining routes require an explicit audit before claiming 100% coverage.
