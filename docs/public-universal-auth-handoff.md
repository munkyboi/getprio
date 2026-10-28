# Public universal authentication — implementation handoff

Scope: public Marketing login and registration, selected Customer/Vendor destination, exact auth transport/CORS/CSRF capability, and app compatibility forwarding. Baseline `183900edecc5306e4f3bbb3994dfa0bb4888931a`; branch `codex/public-universal-auth-20261028`. No database migration.

## Behavior

Marketing owns `/login`, `/register`, and the legacy registration aliases. Vendor is the default tab; `?app=customer` preselects Customer. The tab stays locked during authentication and MFA. Password/TOTP/email/recovery use existing endpoints. A signed-in account is offered an explicit continuation or normal logout to switch accounts. Customer selection never infers Vendor destination from tenant membership. Vendor continuation requires an existing active membership; selecting a tab does not create one. Required MFA enrollment sends the account to its existing app security screen. The server continues to own all account, tenant, and MFA enforcement.

Public registration submits the existing Customer/Vendor registration contracts, including active server-managed business category IDs. This follows the latest explicit human requirement that registration live on the public website. The approved static concept still contains an older “registration stays app-owned” section; that stale wording is not an implementation requirement.

App `/login`, `/register` and aliases forward to the trusted Marketing origin when the feature is enabled. Recovery-token screens, Customer ticket claim/prefill state, authenticated Vendor business completion, and existing OAuth callbacks retain compatibility handlers. Cross-origin forwarding carries only app intent, sanitized next, and supported status fields; it does not serialize registration PII, router state, credentials, or tokens.

OAuth start sends the selected Customer/Vendor surface into the existing signed, expiring provider-bound state and uses the existing app-owned callback. Password-reset requests likewise keep the existing selected-app recovery destination. No provider callback registration changes are required by this source slice.

## Feature switches and activation

Both switches default off:

- API: `PUBLIC_UNIVERSAL_AUTH_ENABLED=1`
- All affected frontend builds: `VITE_PUBLIC_UNIVERSAL_AUTH=1`

Ikan must build Marketing, Customer, and Vendor with the existing reviewed exact local application origins, API URL and cookie namespace, plus the source identity. Current local compilation artifacts are compile checks only and must not be activated as configured previews. API and frontend switches need coordinated activation after independent source review. Existing services, databases, profiles, fixtures, origins, cookies and providers were not changed during implementation.

When enabled, distinct Marketing receives credentialed CORS only for exact method/path pairs in `publicAuthPolicy`; CSRF reuses this same backend policy. Authenticated unsafe requests still require the existing signed cookie/header token and trusted fetch-site/content-type rules. The browser auth transport rejects other paths; ordinary marketing transport continues omitting credentials. Marketing remains denied for account, Vendor, Platform, Developer, billing and queue/booking private APIs. Public business categories are a finite read needed for Vendor registration.

## Producer validation

- 15 backend checks PASS: actual TypeScript app imports both config loaders, flag-on auth preflights, flag-off existing policy, private-route and wrong-origin/method rejection, registration intent validation, CSRF token enforcement, pre-auth exceptions, cookie namespace and no Domain attribute, sandbox separation.
- 13 frontend checks PASS: both actual forms, accessible tab structure, password autocomplete, exact transport capabilities and frontend/backend policy parity, safe returns, membership-dependent destinations, explicit MFA enrollment route, compatibility forwarding, and unchanged anonymous landing bootstrap.
- 31 existing OAuth/MFA/session security checks PASS. These are source/unit tests; their success does not prove provider/device acceptance.
- Frontend and backend typechecks PASS; Marketing/Customer/Vendor and backend builds PASS. Vite retains existing chunk-size warnings and Customer/Vendor generated chart-selector CSS warnings.
- `git diff --check` PASS.

Dependencies were consumed read-only through a local ignored `node_modules` symlink to an existing complete frozen dependency tree. No dependency manifest or lockfile changed. The first incomplete tree lacked backend type declarations; the complete tree resolved that environment failure without source suppression.

## Independent acceptance remaining

Actual Customer/Free/Pro password login and registration, MFA including email delivery, refresh/logout, role denial, browser cross-origin cookies/CSRF, provider OAuth, recovery links, mobile keyboard/viewport behavior, approved-design fidelity and computed contrast remain UNTESTED. Producer SSR proves form structure, not rendered/interactive acceptance. Independent QA should test the exact frozen source before Ikan builds a candidate. No merge, push, deployment, DNS/provider mutation or production operation is included.

## Rollback

Keep existing API/frontend artifacts and profiles. Disable the frontend feature switch to restore direct app auth entry and public navigation targets; disable the API switch to restore distinct Marketing's prior public-only CORS policy. Recreate only the reviewed API and Marketing/Customer/Vendor artifacts under Ikan's lease. No data migration, credential reset, session invalidation or database restoration is required. Existing sessions and all other application surfaces retain their original behavior.
