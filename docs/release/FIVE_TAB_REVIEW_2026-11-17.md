# Five-tab navigation review

Prepared separately at the owner's explicit request on 17 November. Baseline is main `e5c6a69`. This PR is not approved for merge or publication.

Proposed tabs, in order: **Chats, Reels, Status, Discover, Profile**. Existing branding, colors and screen implementations remain. The initial signed-in landing stays Reels; existing call invitation and chat call routes remain available.

Calls becomes a secondary screen through Profile → All Features → Calls. Its existing history, people search, voice/video actions and signalling are retained, with an accessible Back button to the feature hub. Group calls remain reachable from group conversations. No account storage, encryption identities, package IDs, signing settings or database changes are involved.

Modified source: App.jsx (tab list only), FeatureHubScreen.jsx (existing-style Calls row), CallsScreen.jsx (Back control). Navigation assertions and call-lifecycle entry/return selectors are adapted; a dedicated test checks five-tab order and Calls access/Back at phone and desktop widths. Other call assertions remain intact.

Review this navigation decision independently from the competitive-foundations PR. Neither PR should be merged automatically. Physical Android installation/calls/push, stable signing and public-release acceptance remain separate gates. Public release remains HOLD.

Local verification passed: clean dependency installation, lint, 46 browser cases covering existing messaging/auth/calls/social behavior and five-tab Calls access, both production builds and six compiled smoke checks. Compiled checks also exercise Calls and Back at phone and desktop widths. Full independent CI and Android workflow results are recorded in the PR description. No physical-device acceptance is claimed.
