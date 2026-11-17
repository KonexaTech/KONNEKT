# Reference-photo theme — 17 November 2026

The owner approved merging the existing fixes and requested the supplied photo's theme. PR #20 merged as `2eadc66`; PR #21 was brought up to date with it, passed combined CI run `44058939870` and merged as `939ca63`. This theme branch starts from that combined main. Public release remains HOLD; publishing, production database changes and provider activation are separate decisions.

## Visual changes

| Role | Color |
| --- | --- |
| Main canvas | Near-black `#05030A` |
| Surfaces | `#0C0714`, `#181025` |
| Royal purple | `#6A0DAD` |
| Solar gold | `#FFC107` |
| Sunset orange | `#FF6B00` |
| Electric indigo | `#3A0CA3` |
| Neon cyan | `#00E6FF` |

The existing K mark gains an original CSS gradient/orbit treatment; the wordmark highlights KT in gold. Selected tabs use purple/indigo with a gold indicator. Follow actions use gold with dark text, followed states retain readable light text on dark surfaces, chat bubbles/actions use purple, and Welcome's orange signup action now has dark text. Existing analytics cards adopt the same palette rather than the legacy green/light colors. No portrait, promotional statistics, sample activity or live-broadcast feature from the reference image is added.

The five approved tabs remain Chats, Reels, Status, Discover and Profile, in the same positions as PR #21. Calls remains under All Features. Layout, routes, labels, account data, encryption, providers, signing, package IDs and feature availability are retained. The official Connecting people everywhere tagline remains.

Rendered tests found the existing SafeAreaView theme class was not reaching the DOM. Applying it to the existing inner div enables the intended shared rules without adding a wrapper or changing geometry. Light mode retains readable selected-tab styling and logo lettering. Decorations use static CSS, not animation, new assets, dependencies or network services.

## Files

Modified: `App.jsx`, `src/konnekt-theme.css`, and the existing `src/screens/` files `CallsScreen.jsx`, `ChatConversationScreen.jsx`, `ChatsScreen.jsx`, `CreatorAnalyticsScreen.jsx`, `DiscoverScreen.jsx`, `FeatureHubScreen.jsx`, `LoginScreen.jsx`, `ProfileScreen.jsx`, `StatusScreen.jsx`, `WatchScreen.jsx`, `WelcomeScreen.jsx`. Screen edits are palette/text-color changes; the shell also adds stable visual test hooks and theme-class forwarding.

New: `tests/browser/reference-theme.test.mjs` and this document. The three added browser cases check actual computed colors, tab order, overflow, light-mode selection, chat access and public login at phone/desktop widths. Fixture previews were visually inspected; they are not live-user screenshots or physical-device evidence. Full exact-source CI and APK evidence belong in the PR description.

No migration or public website publication occurs. The staging APK uses the existing workflow and package identity; temporary signing cannot pass stable installation/update acceptance. Physical calls/push/performance, native installation, private-media/audience transition, recovery/deletion/restore and production security acceptance remain separate release gates. Rank activation and financial/live features remain disabled as before.

Local verification: clean npm ci, lint, 71 unit/database/service-worker tests, all 67 browser tests, both production builds, six compiled navigation smoke checks, six additional compiled theme/interaction checks (three per website/mobile bundle), and zero production dependency vulnerabilities passed. Phone/desktop fixture previews were inspected. Physical-device acceptance is not claimed.
