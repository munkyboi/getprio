# GetPrio Capstone PRD Index

This index is the planning entry point for the current GetPrio capstone direction: a service marketplace and booking platform with role-aware HCI screens and Information Assurance and Security deliverables.

The older v1 stability PRDs remain useful implementation history for the queue platform already in the repository. Use this capstone PRD set when planning new screens, routes, documentation, Figma flows, RBAC, privacy analysis, or vulnerability assessment work.

## PRD Set

- [Marketplace and Booking Product PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/capstone-marketplace-booking-prd.md)
- [Role-Based HCI Screen PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/capstone-role-based-hci-screens-prd.md)
- [IAS Security and Privacy PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/capstone-ias-security-privacy-prd.md)
- [Implementation Transition PRD](/Users/carloabella/Projects/getprio/dev/docs/plan/capstone-implementation-transition-prd.md)

## Product Architecture Thread

All capstone artifacts should trace the same product architecture:

1. HCI/Figma user flows define role-visible screens, forms, endpoints, and actions.
2. IAS Module 1 maps CIA, IAAA, and OWASP concerns to those same features.
3. IAS Module 2 maps collected data to privacy classification, legal basis, risks, and mitigations.
4. IAS Module 3 maps authentication, RBAC, session management, and login flow to the same roles/screens.
5. IAS Module 4 maps every endpoint, form, and input field to likely risks, evidence, severity, and remediation.

## Role Model

| Role | Primary Product Area |
| --- | --- |
| Guest | Vendor discovery, public vendor profiles, login, registration, and password recovery. |
| Customer | Vendor search, booking, payments, notifications, profile, booking history, and reviews. |
| Vendor Staff | Assigned bookings, schedules, booking detail, and limited customer information. |
| Vendor Admin | Business profile, services, staff, pricing, availability, bookings, and analytics. |
| Platform Admin | Vendor approval, moderation, disputes, audit logs, reporting, and compliance. |

## Recommended Build Order

1. Confirm route map and screen inventory across public, customer, vendor staff, vendor admin, and platform admin roles.
2. Add or revise Figma/HCI screens from the role-based PRD.
3. Update authentication, session, RBAC, and unauthorized-state flows.
4. Add marketplace and booking domain models while preserving reusable queue-platform foundations.
5. Draft IAS Modules 1 to 4 from the security/privacy PRD.
6. Backfill focused tests for authorization, booking ownership, payment state, review moderation, and admin actions.

## Current Repo Constraint

The current implementation is still primarily a multi-tenant queue platform. It already includes useful foundations for tenant onboarding, customer accounts, vendor dashboards, platform operations, billing records, public views, notifications, audit/security events, and permission checks. New capstone work should reuse those foundations where practical, but should name the broader marketplace/booking concepts explicitly so the prototype, documentation, and presentation do not remain queue-only.
