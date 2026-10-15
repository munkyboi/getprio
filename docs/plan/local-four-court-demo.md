# Disposable local four-court fixture and acceptance harness

This fixture supports the coordinated local resource-pool queue demo. Queue owns dispatch/timing, API owns the guarded operational read/router and Vendor owns authenticated UI integration. This script/test slice supplies the full application database and executable capacity/session evidence. It does not deliver the UI or certify HTTP authorization/dispatch. No production activation, migration edit, customer prediction or model rollout is authorized by it.

## Create a fresh interactive fixture

With an explicitly owned local PostgreSQL test server and a role allowed to create databases:

```sh
LOCAL_POOL_DEMO_ADMIN_URL=postgresql://postgres@127.0.0.1:55494/getprio_test \
  node scripts/local-four-court-demo.mjs /tmp/four-court-private.json
```

The administration URL must be literal loopback `127.0.0.1`, with maintenance database `postgres`, `getprio_test` or `getprio_ledger_test`, and no query/fragment connection overrides. The script verifies the actual database and server address, creates a fresh unpredictable `getprio_local_pool_demo_<uuid>` database and verifies it is empty before running real `database/init.sql` and all unapplied migrations in filename order. There is no target-database option and no rebuild of an existing application database. Bootstrap/seeding failure removes only the new database owned by that invocation.

The sole tracking exception drops `public.location_resource_pools.resource_pools_tracking_disabled_check` inside that new database. `resource_ledger_coverage_disabled_check` remains enforced with writer coverage false. No global or existing database constraint is changed. The exact local guard marker is `public.local_pool_demo_scopes(tenant_id,location_id,fixture_key)` with `fixture_key='four-court-v1'`. It is a local scope allowlist, not forecast provenance.

The kept-alive fixture has VD Sports Club (`vd-sports-club`), Demo Courts (`demo-courts`), one dispatch counter (`court-dispatch`), an owner with normal password and active TOTP, an active synthetic Pro subscription, open current Queue Day, service timing, one known single-unit service, Courts capacity four and eight waiting tickets with captured plans. The fixture creates synthetic facts directly; it does not claim those facts were admitted through HTTP or audited production issuance. Notification preferences are off, payment/provider flows are not invoked, and the generated environment selects console email.

Output is an exclusive new mode-0600 private JSON file. It includes `databaseUrl`, `tenantSlug`, `locationSlug`, `counterSlug`, `admin` credentials/TOTP, `env` secrets and exact `fixture` IDs. Do not print the file into chat or public logs. Stdout includes only the artifact path, generated database name, counts and false readiness flags. Existing files are never overwritten. Keep the generated database alive while the coordinated API/UI acceptance runs; credentials and database disposal belong to that local demo lifecycle.

The generated configuration intends API `http://127.0.0.1:5007/api` and frontend `http://127.0.0.1:5187`, with `LOCAL_POOL_DEMO_ENABLED=1` and development mode. The API owner must verify effective process configuration, actual loopback database identity and exact marker before starting guarded commands; a credential file is not proof of a running backend. Worktree `.env.local` overrides and other shell settings must not redirect the process. No original account or normal localhost session is modified by fixture creation.

The artifact explicitly blanks actual Resend/SendGrid/SMTP, Twilio, FCM and PayMongo credential settings rather than relying on an unused `EMAIL_PROVIDER` variable. A fresh-process test loads the actual application configuration with inherited sentinel credentials, applies the artifact settings, and verifies actual console email fallback while external fetches are prohibited. This test does not waive the API owner's effective startup check for worktree overrides.

## Automated acceptance

```sh
RESOURCE_LEDGER_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55494/getprio_test \
  node --test backend/tests/localPooledResourceDemo.test.cjs
```

Tests create separate fresh full-schema databases and remove them after connections close. The interactive fixture is not consumed by these tests. They exercise real resource ledger scope transactions, resource-session helpers and timing repository writes:

- Five simultaneous starts admit exactly four sessions/units and reject the fifth with capacity 409, without committing a failed command/timing start.
- Overdue expected ends retain occupancy. Explicit completion and interruption release capacity, then waiting replacement starts fit; interruption retains its reason.
- Protected booking reservation converts into one allocation rather than being counted twice.
- Writer coverage cannot be set true; unsafe administration targets are rejected before connection. CLI artifacts are private/exclusive and secrets stay out of stdout/stderr.

The harness sets called-ticket preconditions directly and uses an explicit fixture authorizer. It is not actual call-next, login/MFA, route/RBAC, customer view or browser acceptance. Queue/API/Vendor must additionally demonstrate the normal authenticated sequence and real UI. Complete production writers, provenance/reconciliation, protected-work coverage, forecast snapshots, privacy and AI evaluation remain separately gated; inference stays `not_ready`.
