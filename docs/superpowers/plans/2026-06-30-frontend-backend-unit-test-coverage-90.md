# Frontend and Backend Unit Test Coverage to 90% Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise backend and frontend unit test coverage to at least 90% each without inflating brittle end-to-end coverage or changing product behavior.

**Architecture:** Treat backend and frontend as separate coverage programs that share one measurement method and one acceptance bar. Start by measuring current coverage with repeatable commands, then close the biggest gaps in small slices: pure logic, service boundaries, route adapters, and then component/state branches that are currently untested.

**Tech Stack:** Node `node:test`, `c8`, Express route/unit tests, repository/service tests, React component tests, Vite frontend code, existing workspace scripts.

---

## Current Baseline

- Backend coverage is already measured by `npm run test:backend:coverage`.
- Frontend coverage is not currently measured by a dedicated command.
- The existing repo already has a small frontend unit test in `frontend/tests/vendorDashboardBootstrap.test.cjs`.
- The safest path is to add coverage instrumentation first, then expand test breadth by file and branch hotspot instead of guessing at coverage.
- The root workspace already exposes backend coverage at the top level, but it does not yet expose a matching frontend coverage shortcut.
- The frontend workspace currently has no test script at all, so the first implementation step is to add a repeatable `node:test` + `c8` entrypoint there.

---

### Task 1: Establish repeatable coverage measurement for both stacks

**Files:**
- Modify: `/Users/carloabella/Projects/getprio/dev/package.json`
- Modify: `/Users/carloabella/Projects/getprio/dev/frontend/package.json`
- Modify: `/Users/carloabella/Projects/getprio/dev/backend/package.json` if needed for consistency

- [ ] **Step 1: Add a frontend coverage command**

```json
{
  "scripts": {
    "test": "node --test tests/*.test.cjs",
    "test:coverage": "c8 --reporter=text-summary node --test tests/*.test.cjs"
  }
}
```

- [ ] **Step 2: Add a root convenience command**

```json
{
  "scripts": {
    "test:frontend:coverage": "npm --workspace frontend run test:coverage",
    "test:backend:coverage": "npm --workspace backend run test:coverage"
  }
}
```

- [ ] **Step 3: Verify the commands are discoverable**

Run:

```bash
npm run -s test:frontend:coverage -- --help
npm run -s test:backend:coverage -- --help
```

Expected: both commands resolve to the workspace scripts without `missing script` errors.

- [ ] **Step 4: Keep the measurement scope narrow**

Use the workspace-local `tests/*.test.cjs` pattern for the first pass. Do not expand into browser or integration coverage until the unit coverage baseline is stable and repeatable.

---

### Task 2: Measure the exact current frontend and backend baselines

**Files:**
- No code changes

- [ ] **Step 1: Run backend coverage**

Run:

```bash
npm run test:backend:coverage
```

Expected: text summary with backend percentage numbers.

- [ ] **Step 2: Run frontend coverage**

Run:

```bash
npm run test:frontend:coverage
```

Expected: text summary with frontend percentage numbers, even if the percentage is low at first.

- [ ] **Step 2b: Record the current frontend test inventory**

Run:

```bash
rg --files frontend/tests frontend/src | sed -n '1,200p'
```

Expected: a concrete inventory of the current test surface and candidate helper modules before adding new cases.

- [ ] **Step 3: Record the exact uncovered file list**

Run:

```bash
npm run test:backend:coverage -- --reporter=text
npm run test:frontend:coverage -- --reporter=text
```

Expected: coverage output that identifies the lowest-covered files and missing branches.

---

### Task 3: Lift backend coverage in the highest-risk service and route layers

**Files:**
- Modify: `/Users/carloabella/Projects/getprio/dev/backend/tests/*.test.cjs`
- Modify: `/Users/carloabella/Projects/getprio/dev/backend/src/services/*.js` only if a small testability seam is needed

- [ ] **Step 1: Add tests for the lowest-covered backend business services**

Target coverage first on files that already have pure logic and clear outcomes:

```txt
bookingService.js
bookingOtpService.js
bookingSmsAlertPaymentService.js
queueService.js
queueJoinPaymentService.js
permissions.js
sessionService.js
```

- [ ] **Step 2: Write route tests for thin adapter behavior**

Focus on endpoint contracts that are easy to assert without full browser coverage:

```txt
authRoutes.js
accountRoutes.js
platformRoutes.js
vendorRoutes.js
publicRoutes.js
```

- [ ] **Step 3: Add tests for the explicit negative paths**

Use cases that usually raise branch coverage fast:

```txt
invalid credentials
missing tenant membership
forbidden platform role
missing booking verification token
invalid booking quantity
inactive location or service
expired OTP or expired pending booking
```

- [ ] **Step 4: Re-run backend coverage and confirm the percentage climbs**

Run:

```bash
npm run test:backend:coverage
```

Expected: backend statements, branches, functions, and lines all move toward 90% and the report identifies any remaining hotspots.

---

### Task 4: Add frontend unit tests for pure UI logic and state branches

**Files:**
- Create or modify: `/Users/carloabella/Projects/getprio/dev/frontend/tests/*.test.cjs`
- Modify: `/Users/carloabella/Projects/getprio/dev/frontend/src/lib/*.js`
- Modify: `/Users/carloabella/Projects/getprio/dev/frontend/src/utils/*.js`

- [ ] **Step 1: Add tests for pure helper logic first**

Prioritize utilities that do not need a browser:

```txt
frontend/src/lib/vendorDashboardBootstrap.js
frontend/src/utils/dates.js
frontend/src/utils/errors.js
frontend/src/utils/formatters.js
```

- [ ] **Step 2: Add tests for auth and route gating helpers**

Cover small decision functions and guard logic in:

```txt
frontend/src/context/AuthContext.tsx
frontend/src/App.tsx
frontend/src/pages/LoginPage.tsx
frontend/src/pages/RegisterCustomerPage.tsx
frontend/src/pages/RegisterVendorPage.tsx
```

- [ ] **Step 3: Add tests for stateful branch-heavy components**

Choose components with lots of conditional render paths and isolate the logic where needed:

```txt
frontend/src/pages/CustomerAccountPage.tsx
frontend/src/pages/BookingRequestPage.tsx
frontend/src/pages/VendorProfilePage.tsx
frontend/src/pages/VendorDashboardPage.tsx
```

- [ ] **Step 4: Re-run frontend coverage and confirm the percentage climbs**

Run:

```bash
npm run test:frontend:coverage
```

Expected: coverage summary appears and branch coverage improves materially after helper and state tests land.

- [ ] **Step 5: Prefer extraction over brittle DOM assertions**

If a page component has several nested conditional branches, move the branching logic into a small helper under `frontend/src/lib/` or `frontend/src/utils/` first, then test that helper directly. Keep component tests focused on rendering and wiring.

---

### Task 5: Close the biggest frontend gaps by moving logic out of components

**Files:**
- Modify: `/Users/carloabella/Projects/getprio/dev/frontend/src/pages/*.tsx`
- Create: `/Users/carloabella/Projects/getprio/dev/frontend/src/lib/*.js`
- Create: `/Users/carloabella/Projects/getprio/dev/frontend/src/lib/*.ts`

- [ ] **Step 1: Extract repeatable decision logic into small pure modules**

Move logic such as:

```txt
route selection
redirect destination resolution
booking payload assembly
notification preference normalization
display label formatting
```

into small files that are trivial to unit test.

- [ ] **Step 2: Add focused unit tests for the extracted modules**

Each extracted module should have a direct test file with:

```txt
happy path
missing input path
fallback path
one invalid input path
```

- [ ] **Step 3: Keep component tests shallow**

Do not try to unit test every DOM branch inside a giant page component if the branch can be proven in a helper module instead.

- [ ] **Step 4: Re-run frontend coverage after each extraction batch**

Run:

```bash
npm run test:frontend:coverage
```

Expected: branch coverage improves as component conditionals shrink.

---

### Task 6: Add a coverage gate and stop once both stacks are at or above 90%

**Files:**
- Modify: `/Users/carloabella/Projects/getprio/dev/package.json`
- Modify: `/Users/carloabella/Projects/getprio/dev/backend/package.json`
- Modify: `/Users/carloabella/Projects/getprio/dev/frontend/package.json`
- Optionally add: `/Users/carloabella/Projects/getprio/dev/.github/workflows/*.yml` if CI gating is desired

- [ ] **Step 1: Add or tighten coverage thresholds**

Use thresholds that match the target:

```json
{
  "c8": {
    "check-coverage": true,
    "lines": 90,
    "branches": 90,
    "functions": 90,
    "statements": 90
  }
}
```

- [ ] **Step 2: Run both coverage commands back to back**

Run:

```bash
npm run test:backend:coverage
npm run test:frontend:coverage
```

Expected: both report at least 90% for the metrics required by the chosen threshold.

- [ ] **Step 3: Keep the suite maintainable**

If a final push to 90% requires dozens of brittle UI tests, move logic into helper modules instead of adding fragile component assertions.

---

## Acceptance Criteria

- Backend coverage is at least 90% on statements, branches, functions, and lines.
- Frontend coverage is at least 90% on statements, branches, functions, and lines.
- Coverage is measured by repeatable commands in `package.json`.
- The added tests focus on durable logic, route contracts, and isolated frontend decision helpers.
- No production behavior changes are introduced just to satisfy coverage.

## Suggested Execution Order

1. Add frontend coverage tooling.
2. Measure current backend and frontend baselines.
3. Raise backend coverage first, since it already has a working coverage command.
4. Add frontend helper tests and extract logic from large page components.
5. Tighten the threshold only after both stacks are comfortably near 90%.
