# Separate local application surfaces

Local/staging preparation only. No merge, DNS, certificate, production or deployment authorization. Existing 5187/5007/57110 and canonical staging services remain preserved.

| Purpose | Browser/runtime | Local port |
|---|---|---|
| Public landing | marketing frontend entry | 5190 |
| Customer directory/dashboard | customer frontend entry | 5191 |
| Vendor workspace | vendor frontend entry | 5192 |
| Platform administration | current platform-dashboard-shadcn | 5193 |
| Developer portal | developer-portal | 5194 |
| Core application/developer API | guarded core process, independent local DB | 5091 |
| Sandbox developer API | guarded sandbox process, independent local DB/secrets | 5092 |

Marketing/customer/vendor are separate Vite-selected entry graphs and output artifacts (`dist-marketing`, `dist-customer`, `dist-vendor`). Unknown `VITE_APP_SURFACE` fails configuration. Unset surface retains the previous mixed entry for compatibility. Their surface-manifest.json names source commit, API destination and actual bundled page modules. Customer does not register Vendor administration; Vendor does not register customer account/discovery fallback. Marketing has no login/register/dashboard routes.

Customer owns `/login`, `/register`, compatibility `/register/customer`; Vendor owns `/login`, `/register`, compatibility `/register/vendor`. Both login and registration pages link to both login and registration of the other application plus public home. Marketing default Login goes to Vendor; Customer login is explicitly labelled. Same-app returns preserve safe query/fragment and reject absolute/protocol-relative/control/backslash/traversal targets. Multi-role customer sign-ins stay on customer routes, including MFA completion; no account conversion or role elevation is inferred from surface.

## Explicit public frontend origins

All local browser builds/runtimes receive `VITE_LOCAL_SURFACES=1`, `VITE_MARKETING_URL=http://127.0.0.1:5190`, `VITE_CUSTOMER_APP_URL=http://127.0.0.1:5191`, `VITE_VENDOR_APP_URL=http://127.0.0.1:5192`, `VITE_PLATFORM_DASHBOARD_URL=http://127.0.0.1:5193`, `VITE_DEVELOPER_PORTAL_URL=http://127.0.0.1:5194`. Marketing/customer/vendor also receive their exact `VITE_APP_SURFACE` and `FRONTEND_PORT`; all call `VITE_API_URL=http://127.0.0.1:5091/api`. Browser cookie prefix is public configuration, not a secret: `VITE_BROWSER_COOKIE_PREFIX` must equal the new core's private `LOCAL_BROWSER_COOKIE_PREFIX`.

Shadcn Platform requires `VITE_PLATFORM_DATA_SOURCE=live`, `VITE_API_URL`, `VITE_LOCAL_SURFACES=1`, the same cookie prefix, and `PLATFORM_DASHBOARD_PORT=5193`. Do not select the old platform-dashboard package. Its Vite shared-file allowlist is restricted to types.ts, planPolicyPayload.ts, tenantCapacityDisplay.ts and helpCenterSeed.json.

Portal uses `DEVELOPER_PORTAL_PORT=5194`, `VITE_DEVELOPER_API_ORIGIN=http://127.0.0.1:5091`, `VITE_CORE_API_URL=http://127.0.0.1:5091`, `VITE_SANDBOX_API_URL=http://127.0.0.1:5092`, `VITE_MARKETING_URL`, and `VITE_LOCAL_SURFACES=1`. Its own developer cookie family and returned-CSRF bootstrap remain unchanged. Samples/OpenAPI/privacy/contact links use configured local origins. Production defaults remain the approved public domains. Local aliases adjust only localhost/127 hostname with explicit local configuration.

## API and session boundaries

Named backend origins: CUSTOMER_APP_URL/APP_BASE_URL/CLIENT_URL point to customer; VENDOR_APP_URL to Vendor; MARKETING_URL to landing; PLATFORM_DASHBOARD_URL and DEVELOPER_PORTAL_URL to their own apps. Credentialed CORS/CSRF includes exact customer/Vendor/Platform/developer origins, with paired loopback spellings only for an actual nonproduction configured loopback port. Marketing is not granted private credentialed API access. Its auth provider remains anonymous/no session or OAuth discovery bootstrap; its API requests omit credentials, Authorization and CSRF. Only GET billing/plans, GET public/help-center and POST public/enterprise-inquiries receive its dedicated public CORS, including method-specific preflight. Contact presentation does not invent a new endpoint.

First-party customer/Vendor/Platform apps within this new stack share one API identity. Signing into a different account intentionally replaces that identity across those apps. This is not independent per-surface session isolation. The new stack uses a guarded local cookie prefix so it cannot overwrite the existing working stack's cookies on the same loopback hostname. Production/default cookie names, HttpOnly/SameSite, host-only scope and privilege checks remain unchanged. Prefix requires explicit development/test core profile, loopback origin/port and AUTH_COOKIE_SECURE=false. Sandbox is API-key-only: `/v1/*` plus `/api/health`, with no first-party auth/session/Platform routes or Set-Cookie issuance.

OAuth state signs an allowlisted surface and sanitized return. API callbacks remain on API origin; customer/Vendor callback destinations come only from configured origins. Access/refresh credentials never enter callback URLs. Password recovery chooses trusted customer/Vendor destination. Customer booking/payment/QR links remain customer; board display/approval and Vendor subscription billing links target Vendor. Staff reconciliation emails target the Vendor queue; Usage Credit checkout returns accept only the configured Vendor origin (and its development loopback alias), falling back to the configured Vendor dashboard. Existing mobile sandbox hostname compatibility is unchanged and not claimed tested.

## Guarded app-only launch and bootstrap custody

Ikan owns runtime and DB execution. `scripts/local-platform-surface-server.mjs` reads a regular mode-0600 artifact outside source, validates full source-manifest SHA256/all source-file hashes, exact development/test profile, expected port, independent loopback DB name and DB ownership nonce. It installs existing network/provider guards before application import, verifies effective configuration and database identity, and starts the application only: no provider jobs/schedulers/outbox workers. Separate fresh secrets are required for core and sandbox; no source credentials are imported.

Core DB name: `getprio_local_pool_demo_surfaces_core_<tag>`; sandbox: `getprio_local_pool_demo_surfaces_sandbox_<tag>`. NEW database comment must exactly equal `getprio-local-surfaces:<core|sandbox>:<private nonce>`, nonce at least 32 random bytes encoded hex. Only Ikan sets it on verified NEW databases. Private artifact fields: env, databaseNonce, sourceManifest, manifestSha256; fixture bootstrap additionally fixtureTag and fixtureCredentialsPath. Manifest format: sourceCommit plus files array of path/sha256 for the complete tracked source. No symlink artifact or path escaping source is accepted. Existing launchers/defaults/four-court scope validation are unchanged.

The fresh fixture helper refuses nonempty users/tenants/developer-account/project/key tables, locks those tables, and uses existing user/developer repositories, bcrypt, key-generation service and security event service. Core creates only one new tagged Platform Admin, status BOOTSTRAP_MFA_PENDING; QA must enroll MFA normally before privileged writes. Sandbox creates only its own developer identity/account/project/generated sandbox key. Credential files are outside Git mode-0600, exclusive-create, prepared/committed state; no password/key/hash/pepper is printed. Core/sandbox secrets and key hashes are never copied between databases. Customer/Free/Pro/portal registration and business configuration use normal workflows after the reviewed public catalog prerequisites are in place.

Known limit: a key minted by the core portal is stored in the core DB; it is not automatically provisioned into the isolated sandbox DB. No cross-DB synchronization feature is implemented or implied. Initial isolated Sandbox validation uses its own normal generated fixture key; portal-created-key-to-sandbox continuity remains explicitly blocked pending separate design and authorization. Actual external OAuth/provider/mobile roundtrips and deployment remain untested.

Build/type/unit evidence is separate from Ikan activation and independent QA. No real authentication, provider, retained DB or runtime mutation is performed by source validation.
