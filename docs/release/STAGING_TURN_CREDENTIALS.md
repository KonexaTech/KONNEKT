# Staging TURN credential endpoint

Public release remains **HOLD**. The endpoint is prepared for an owner-supplied, zero-cost relay with compatible coturn REST authentication; no relay/server/provider or paid service was created.

`turn-credentials` issues HMAC-SHA1 coturn REST credentials with a fixed five-minute expiry and a random nonce, without exposing a user UUID or permanent relay secret. The supported wire protocol is [coturn's time-limited REST credential scheme](https://github.com/coturn/coturn/wiki/turnserver#turn-rest-api). These credentials alone do not prove relay connectivity or media delivery.

The function validates the genuine Supabase user and then calls `konnekt_authorize_turn` with the same expected user. The RPC checks actual Auth-session existence/expiry, the account, ban state and the existing MFA/deletion guard. Another user's ID cannot authorize issuance; a signed but logged-out JWT is insufficient. Only authenticated callers may execute that narrow boolean authorization function. The endpoint is staging-only, has an explicit native/local/staging-web origin allowlist, permits GET/OPTIONS, prevents caching, uses bounded authorization fetches and does not accept client-supplied relay URLs, TTLs or usernames.

Configure these **server-only** staging Edge Function secrets privately:

- `KONNEKT_TURN_SECRET`: a strong shared REST secret (at least 32 characters), identical to the owner's coturn `static-auth-secret`.
- `KONNEKT_TURN_URLS`: JSON array of one to four reachable `turn:` / `turns:` URLs, with optional UDP/TCP transport. Userinfo, arbitrary protocols and extra query credentials are rejected.

Configure the owner's relay with `use-auth-secret`, a valid realm/certificate, appropriate listening/firewall ports, allocation/user/bandwidth quotas and a hard zero-cost usage limit. Do not substitute an untrusted public relay or permanent credentials in Vite. Put only `https://oiwtfkgrnpzirghbsvim.supabase.co/functions/v1/turn-credentials` in `KONNEKT_STAGING_TURN_CREDENTIALS_URL` or the APK's optional public `staging_turn_credentials_url` dispatch input.

Without server secrets the deployed endpoint intentionally returns `503 {"status":"turn_not_configured"}`. The existing client retains its STUN fallback; cross-network calling is **BLOCKED**, not accepted. With owner configuration, verify authenticated issuance, wrong/revoked/MFA-denied sessions, UDP and TCP/TLS connectivity, an actual relay-selected candidate pair, two-way voice/video, reconnect and long calls across credential expiry on two Android devices across Wi-Fi and mobile data. Existing allocations and previously issued relay credentials have provider-specific lifetime behavior; verify it rather than claiming immediate revocation or long-call continuity from a unit test.
