# GetPrio Capstone Implementation Transition PRD

## Problem Statement

The current repository implements a mature multi-tenant queue platform, while the capstone context now describes GetPrio as a service marketplace and booking platform. The project needs a transition plan that preserves working queue-platform foundations and gives agents a clear path for adding marketplace, booking, role-based HCI, and IAS deliverables.

## Solution

Treat the existing queue system as an operational workflow inside the broader GetPrio marketplace. Reuse proven infrastructure for tenants, customers, vendor dashboards, platform operations, billing records, notifications, audit/security events, and permission checks. Add missing marketplace concepts in deliberate slices: discovery, profiles, services, availability, bookings, reviews, disputes, governance, and IAS documentation.

## User Stories

1. As a developer, I want to know which existing modules are reusable, so that I do not rebuild working tenant, auth, billing, or dashboard foundations.
2. As a developer, I want a clear gap list, so that marketplace and booking work can be planned in small slices.
3. As a student presenter, I want the implemented prototype to match the capstone documents, so that the demo and written deliverables tell one story.
4. As a customer, I want queue joins to evolve into or coexist with bookings, so that same-day and scheduled service flows both make sense.
5. As a vendor admin, I want current queue operations preserved while service catalog and booking management are added, so that the vendor workflow remains coherent.
6. As a platform admin, I want existing operations data extended into approval, moderation, dispute, audit, and compliance workflows, so that governance is demonstrable.
7. As a security reviewer, I want implementation gaps connected to RBAC and IAS modules, so that security work stays testable and traceable.

## Current Reusable Foundations

| Current Foundation | Reuse Direction |
| --- | --- |
| Tenant onboarding and tenant slugs | Vendor business identity and public profile ownership. |
| Customer registration and account page | Customer profile, booking history, notifications, and review ownership. |
| Vendor dashboard | Vendor admin operations shell for services, availability, bookings, staff, analytics, and queue workflow. |
| Public queue pages and join flow | Public service entry points, same-day queue mode, and booking confirmation patterns. |
| Platform dashboard | Platform admin governance shell for approvals, users, disputes, billing, audit, and compliance. |
| Billing and payment records | Checkout placeholder, payment references, subscription and transaction reporting. |
| Notification services | Booking status, queue updates, payment notices, and account security messages. |
| Auth sessions and security events | IAS Module 3 and Module 4 evidence for session management and accountability. |
| Permission helpers | Starting point for role-based access control across customer, vendor staff, vendor admin, and platform admin. |

## Gap List

| Gap | Required Direction |
| --- | --- |
| Role vocabulary mismatch | Align current `vendor`/tenant roles with Vendor Staff and Vendor Admin. |
| Queue-only product copy | Update public and planning language to marketplace and booking language while preserving queue as a workflow. |
| Vendor discovery | Add searchable vendor listings and public profile/service detail pages. |
| Service catalog | Add vendor-managed services, durations, descriptions, pricing, and visibility state. |
| Availability | Add vendor availability and staff schedule model suitable for booking. |
| Booking model | Add request, confirmation, assignment, status, cancellation, completion, and history states. |
| Reviews | Add post-service review ownership, moderation, and public display rules. |
| Disputes | Add dispute records, status workflow, sensitive evidence handling, and platform-admin resolution. |
| Platform approval | Add vendor approval queue and compliance state beyond generic tenant listing. |
| MFA and production session hardening | Complete the IAS-required flow for privileged roles and secure cookie transport. |
| IAS documents | Generate module deliverables from the same screen, endpoint, data, and risk inventory. |

## Implementation Decisions

- Do not delete existing queue PRDs or queue implementation while transitioning.
- Create new marketplace/booking docs and implementation slices beside existing queue work.
- Prefer adapter-style naming during transition when existing tenant/vendor structures do not yet match final capstone vocabulary.
- Add server-side permission checks before or alongside new privileged screens.
- Keep the platform dashboard as a separate admin surface unless consolidation is explicitly planned.
- Add schema changes incrementally and backfill tests around ownership and authorization before broad UI polish.

## Execution Checklist

### Phase 0: Baseline Alignment

Goal: make the current prototype, docs, and route map describe the same capstone product.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Confirm route inventory | Developer | Current public, customer, vendor, and platform routes listed against capstone roles. | Existing app routes | Every implemented route has a role and screen purpose. |
| Align role vocabulary | Developer | Mapping from current roles to Guest, Customer, Vendor Staff, Vendor Admin, and Platform Admin. | Current auth/RBAC model | No PRD or UI plan uses unexplained `vendor`/tenant role language. |
| Mark reusable queue flows | Developer | Queue workflow documented as same-day service operation within marketplace. | Current queue implementation | Queue pages are preserved and no longer described as the whole product. |
| Confirm HCI screen backlog | Designer/developer | Required screens checked against role-based HCI PRD. | Capstone role list | Missing screens are visible in the backlog. |
| Confirm IAS traceability model | Developer/student | Screen, form, endpoint, data, and risk mapping format selected. | IAS module requirements | Modules 1 to 4 can reference the same inventory. |

### Phase 1: Marketplace Discovery Foundation

Goal: let guests and customers discover vendors and understand services before booking.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Vendor public profile model | Developer | Vendor profile fields for public name, description, categories, contact display, location, and visibility. | Tenant foundation | Public profile can be shown without exposing private vendor/admin data. |
| Vendor discovery API | Developer | Search/list endpoint for public vendor cards. | Vendor profile model | Guests can search active/approved vendors only. |
| Vendor discovery screen | Frontend | Search and filter screen for public vendor listings. | Vendor discovery API | Screen appears in public navigation and handles empty/error states. |
| Vendor profile screen | Frontend | Public profile and service summary page. | Vendor profile model | Screen shows public services and booking entry point. |
| Discovery security checks | Developer | Validation and output filtering for search/profile data. | Discovery API | Tests prove private fields are not returned. |

### Phase 2: Service Catalog and Availability

Goal: give vendor admins the ability to define what customers can book.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Service catalog model | Developer | Services with name, description, duration, price display, active state, and tenant ownership. | Vendor role mapping | Vendor admins can manage only their own services. |
| Service catalog UI | Frontend | Vendor admin service management screen. | Service catalog API | Create, read, update, deactivate flows are available. |
| Pricing rules | Developer | Capstone-friendly pricing fields and payment placeholder integration. | Service catalog model | Customer-facing price display is consistent with checkout placeholder. |
| Availability model | Developer | Vendor availability blocks and exceptions suitable for booking. | Tenant/location model | Booking flow can ask for valid dates/times only. |
| Availability UI | Frontend | Vendor admin availability calendar or schedule form. | Availability API | Vendor admins can define and update bookable availability. |

### Phase 3: Customer Booking Flow

Goal: support booking request, confirmation, history, and customer ownership.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Booking domain model | Developer | Booking states for pending, confirmed, rescheduled, completed, canceled, disputed, and reviewed. | Services and availability | State transitions are explicit and testable. |
| Booking request API | Developer | Customer booking creation endpoint. | Booking model | Customers can create bookings for valid services/times. |
| Booking request screen | Frontend | Customer booking flow with service, schedule, notes, and contact details. | Booking API | Booking form validates required fields and shows safe errors. |
| Booking confirmation screen | Frontend | Confirmation page with booking reference, status, service, vendor, and next steps. | Booking request screen | Customer sees only their own booking. |
| Booking history | Frontend/backend | Customer booking history endpoint and screen. | Booking model | Customer cannot access another customer's bookings. |
| Checkout placeholder | Frontend/backend | Payment reference/status placeholder tied to booking. | Booking model | Payment reference cannot activate another user's booking. |

### Phase 4: Vendor Operations

Goal: make vendor-side booking work role-aware for staff and admins.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Vendor staff role mapping | Developer | Distinction between Vendor Staff and Vendor Admin in tenant membership. | Role vocabulary alignment | Staff cannot access admin-only service/pricing/staff screens. |
| Assigned bookings API | Developer | Staff-scoped assigned booking list and detail endpoints. | Booking model | Staff sees assigned bookings only. |
| Staff dashboard | Frontend | Assigned bookings, schedule, and limited customer detail screen. | Assigned bookings API | Customer PI is limited to what assigned staff need. |
| Vendor booking management | Frontend/backend | Vendor admin booking list and state-change actions. | Booking model | Admin can manage vendor-owned bookings only. |
| Vendor analytics | Frontend/backend | Booking and service performance summaries. | Booking operations | Analytics are tenant-scoped and do not leak other vendors. |

### Phase 5: Reviews, Disputes, and Governance

Goal: complete the marketplace trust and platform administration story.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| Review model | Developer | Review ownership, rating, content, moderation state, and public visibility. | Completed bookings | Customers can review only completed own bookings. |
| Review UI | Frontend | Customer review form and public review display. | Review API | Stored content is sanitized before display. |
| Dispute model | Developer | Dispute records, status, participants, and evidence metadata. | Booking model | Disputes are linked to booking ownership and platform review. |
| Dispute UI | Frontend | Customer/vendor dispute entry and platform admin resolution views. | Dispute API | Sensitive dispute details are role-limited. |
| Vendor approval queue | Platform admin | Approval, rejection, and compliance status for vendors. | Vendor profile model | Unapproved vendors are not publicly listed. |
| Moderation and audit logs | Platform admin | User moderation, review moderation, dispute actions, and audit log screens. | Platform permissions | All platform actions require platform admin permissions. |
| Reports/compliance dashboard | Platform admin | Compliance and marketplace health reporting screen. | Governance data | Report data is aggregate or properly permissioned. |

### Phase 6: IAS Hardening and Deliverables

Goal: close the capstone security, privacy, and vulnerability assessment loop.

| Item | Owner | Deliverable | Depends On | Acceptance Check |
| --- | --- | --- | --- | --- |
| MFA-required flow | Developer | MFA challenge for Platform Admin and Vendor Admin. | Auth/session foundation | Privileged roles cannot complete login without MFA. |
| Session expiry warning | Frontend/backend | Warning modal before access token/session expiry. | Session model | User can continue or sign out intentionally. |
| CSRF plan | Developer | Anti-CSRF protection plan for cookie-authenticated state-changing requests. | Session transport decision | IAS Module 3 documents chosen control. |
| Attack surface map | Developer/student | Endpoint, form, input, risk, severity, and remediation table. | Screen and endpoint inventory | Module 4 can be completed without inventing generic surfaces. |
| Privacy inventory | Developer/student | Data fields, PI/SPI classification, purpose, retention, and legal basis. | Data model inventory | Module 2 uses actual GetPrio data categories. |
| Security requirements worksheet | Developer/student | CIA, IAAA, and OWASP mapping. | Product and screen inventory | Module 1 is app-specific. |
| High-risk tests | Developer | Tests for auth, RBAC, booking ownership, payment reference, reviews, disputes, and admin actions. | Implemented flows | Critical role-boundary behavior has automated coverage. |

## First Sprint Recommendation

Start with Phase 0 and the first two items of Phase 1:

1. Confirm the current route inventory and map each route to Guest, Customer, Vendor Staff, Vendor Admin, or Platform Admin.
2. Define the current-to-capstone role mapping, especially `vendor`, tenant owner/admin, tenant staff, and `platform_admin`.
3. Add a vendor public profile model that can reuse existing tenant data without exposing private tenant settings.
4. Add a public vendor discovery endpoint that returns only active/approved public fields.

This creates the foundation for HCI screens, IAS traceability, and marketplace/booking work without disturbing the working queue platform.

## Testing Decisions

- Preserve existing queue tests while adding marketplace and booking tests.
- Prioritize tests where data crosses role boundaries: booking ownership, vendor staff assignment, vendor admin tenant scope, and platform admin governance.
- Add regression tests before changing current queue behavior.
- Use browser tests for role-based navigation, access denied screens, login recovery, MFA, and session expiry.

## Out of Scope

- Rewriting the app from scratch.
- Removing queue operations.
- Full production payment launch.
- Native mobile applications.
- Real external security testing without authorization.

## Further Notes

This PRD is the bridge between the repo's current state and the capstone direction. It should be the first file agents read when a task mentions both the existing queue platform and the newer marketplace/booking requirements.
