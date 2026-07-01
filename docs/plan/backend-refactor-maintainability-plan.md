# Backend Refactor Plan

This plan targets the backend hotspots that are currently too large or too coupled to stay maintainable as the app grows.

## Goals

- Reduce the size and responsibility of `backend/src/services/queueService.js`.
- Split `backend/src/routes/vendorRoutes.js` and `backend/src/routes/authRoutes.js` into smaller route modules.
- Move workflow logic out of route handlers and into focused application services.
- Isolate pure business rules from database and side-effect code.
- Keep the public API behavior stable while improving testability.

## Current Hotspots

- `backend/src/services/queueService.js` is the main monolith.
- `backend/src/routes/vendorRoutes.js` mixes queue, catalog, staff, location, billing, upload, and serialization concerns.
- `backend/src/routes/authRoutes.js` mixes login, registration, OAuth, password reset, and token/session logic.
- `backend/src/services/notificationService.js` and `backend/src/services/queueJoinPaymentService.js` contain multiple workflow branches that deserve smaller internal helpers.
- `backend/src/repositories/*` are mostly thin, but a few modules still carry too much domain formatting and branching.

## Refactor Sequence

### Phase 1: Extract pure queue logic

Target files:

- `backend/src/services/queueService.js`
- `backend/src/services/queueLifecycle.js`
- `backend/src/services/queueEvents.js`
- `backend/src/services/storeHoursService.js`

Work:

- Move queue date-key, recovery-deadline, ticket-number, lookup-code, and public redaction helpers into a small `queueHelpers` module.
- Separate snapshot assembly from ticket mutation workflows.
- Split queue-day state transitions into a dedicated workflow module.
- Keep `queueService.js` as the orchestration entry point only.

Acceptance:

- The main queue service is materially smaller and easier to scan.
- Pure helpers can be unit tested without database setup.

### Phase 2: Split vendor routes by domain

Target files:

- `backend/src/routes/vendorRoutes.js`

New route modules:

- `backend/src/routes/vendorQueueRoutes.js`
- `backend/src/routes/vendorCatalogRoutes.js`
- `backend/src/routes/vendorAvailabilityRoutes.js`
- `backend/src/routes/vendorStaffRoutes.js`
- `backend/src/routes/vendorBillingRoutes.js`
- `backend/src/routes/vendorLocationRoutes.js`

Work:

- Move route handlers into domain-specific routers.
- Keep request validation and HTTP response wiring in routes.
- Move shared formatter functions into mappers or serializers instead of duplicate inline blocks.
- Leave auth middleware and tenant access checks centralized.

Acceptance:

- Each route file is small enough to review without context switching.
- No endpoint behavior changes.

### Phase 3: Split auth routes into workflow slices

Target files:

- `backend/src/routes/authRoutes.js`
- `backend/src/services/authService.js`
- `backend/src/services/passwordResetService.js`
- `backend/src/services/sessionService.js`
- `backend/src/services/oauthService.js`

New route modules:

- `backend/src/routes/authLoginRoutes.js`
- `backend/src/routes/authRegistrationRoutes.js`
- `backend/src/routes/authOAuthRoutes.js`
- `backend/src/routes/authPasswordRoutes.js`

Work:

- Move login, registration, OAuth, password reset, and session endpoints into focused modules.
- Keep shared auth response shaping in one helper.
- Make session and refresh-token behavior explicit in the service layer.

Acceptance:

- Auth routes are easier to reason about and less likely to regress when session rules change.

### Phase 4: Extract workflow services

Target files:

- `backend/src/services/bookingService.js`
- `backend/src/services/bookingSmsAlertPaymentService.js`
- `backend/src/services/queueJoinPaymentService.js`
- `backend/src/services/notificationService.js`
- `backend/src/services/locationPaymentQrUploadService.js`
- `backend/src/services/publicBoardThemeUploadService.js`

Work:

- Break multi-branch services into smaller workflow helpers.
- Separate upload validation from storage operations.
- Separate payment state evaluation from queue-ticket creation.
- Separate notification selection from message delivery.

Acceptance:

- Each service does one workflow or one adapter job.
- Branch-heavy code becomes easier to cover with unit tests.

### Phase 5: Normalize repository boundaries

Target files:

- `backend/src/repositories/users.js`
- `backend/src/repositories/tenants.js`
- `backend/src/repositories/storeLocations.js`
- `backend/src/repositories/vendorServices.js`
- `backend/src/repositories/tickets.js`
- `backend/src/repositories/bookings.js`

Work:

- Keep repositories focused on persistence and mapping.
- Move formatting, defaults, and business rules out of repositories where possible.
- Standardize return shapes and naming across repositories.

Acceptance:

- Repository methods are predictable and thin.
- Business logic is not duplicated inside persistence functions.

### Phase 6: Add composition boundaries

Target files:

- `backend/src/app.ts`
- `backend/src/server.ts`

Work:

- Keep `app.ts` as the HTTP composition root only.
- Introduce explicit module wiring for refactored workflows if constructor injection becomes useful.
- Avoid adding new cross-imports between unrelated services.

Acceptance:

- The app remains easy to bootstrap for tests and future deployment changes.

## Test Strategy

- Add unit tests for pure helpers first.
- Add service-level tests for each extracted workflow before moving route handlers.
- Keep route tests focused on request/response behavior, not business logic.
- Preserve the existing test harness style unless a module genuinely requires a new one.
- Every refactor slice must include matching test updates before the code is considered complete.
- If a file is split or a branch is moved, add or adjust tests in the same change set.
- Do not leave extracted logic untested just because the original monolith still has broad coverage.

## Suggested Execution Order

1. Extract queue helpers.
2. Split `vendorRoutes.js`.
3. Split `authRoutes.js`.
4. Refactor payment and notification workflows.
5. Tighten repository boundaries.
6. Re-run backend coverage and use the hotspots report to decide the next slice.

## Success Criteria

- Large backend modules are broken into smaller units.
- New logic is easier to test without integration scaffolding.
- Coverage increases without requiring brittle end-to-end tests for every branch.
- Future feature work lands in smaller, more obvious files.
- Unit tests are added or updated alongside every refactor step.
