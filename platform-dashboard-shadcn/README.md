# GetPrio Platform dashboard

Standalone Shadcn/ui foundation for the Platform control plane rework.

This slice establishes the visual shell, grouped Platform navigation, light/dark theme tokens, Shadcn data tables, and typed read-model contracts across the Platform control plane. The UI runs against fixture data by default and can switch to authenticated Platform endpoints without coupling the composition to transport details.

Set `VITE_PLATFORM_DATA_SOURCE=live` to read from the authenticated backend aggregates. Live mode first calls `GET /api/auth/me`, requires the `platform_admin` role, and uses the existing cookie session, CSRF token, password login, and MFA challenge flow before loading any Platform read model. The live adapter expects `VITE_API_URL` to point at the API root, defaulting to `http://localhost:5001/api` for this worktree.

Fixture mode is intentionally unauthenticated for local visual work. Do not promote the fixture-backed build to a hosted Platform URL; use live mode with the backend auth/session contract for deployment verification.

The first backend read models are:

- `GET /api/platform/viewer-context`
- `GET /api/platform/overview`
- `GET /api/platform/service-health`
- `GET /api/platform/queues`
- `GET /api/platform/tenants/read-model`
- `GET /api/platform/users/read-model`
- `GET /api/platform/security-audit/read-model`
- `GET /api/platform/billing/read-model`
- `GET /api/platform/moderation/read-model`
- `GET /api/platform/settings/read-model`
- `GET /api/platform/release-readiness/read-model`
- `GET /api/platform/developer-projects/read-model`
- `GET /api/platform/developer-projects/:projectId/governance`

Each response uses `{ data, meta, errors }`, and the routes retain the existing Platform Admin permission boundary.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run build
npm run lint
```

The lint command currently reports warnings from generated Shadcn primitives. The dashboard composition itself is warning-free.

## Sidebar interaction checks

Help Center opens Overview and expands its submenu. Its separate chevron expands
or collapses without leaving the current page; direct links reveal the selected
section. Menu visibility still follows the viewer's Help Center capability.

Start a local fixture dashboard, then run the browser checks in another terminal:

```bash
VITE_PLATFORM_DATA_SOURCE=fixture npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
npm run test:sidebar:browser
```

The browser check covers label navigation, chevron toggling, keyboard operation,
direct links, desktop icon-only navigation, and mobile navigation. It uses
Playwright CLI and requires a local fixture dashboard, not a production session.
