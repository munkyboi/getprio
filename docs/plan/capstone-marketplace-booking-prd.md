# GetPrio Marketplace and Booking Product PRD

## Problem Statement

GetPrio needs to present a coherent capstone product beyond queue management: customers should discover service vendors, evaluate services, request bookings, complete payment-related steps, receive notifications, and leave reviews. Vendors need operational tools to manage services, staff, availability, bookings, and business performance. Platform admins need governance tools for vendor approval, moderation, disputes, audit logs, reports, and compliance.

The product plan must connect those capabilities to the existing codebase, which currently implements a strong multi-tenant queue foundation. The PRD should guide new product work without discarding reusable tenant, customer, billing, dashboard, notification, and platform-admin infrastructure.

## Solution

Build GetPrio as a role-aware service marketplace and booking platform. Public users can browse vendors and service details. Customers can create accounts, book services, manage transactions, receive notifications, and submit reviews. Vendor staff can work assigned bookings and schedules with limited access. Vendor admins can manage the business-side operating model. Platform admins can govern the marketplace.

Queue functionality may remain a supported vendor workflow, especially for walk-in or same-day service operations, but it should be framed as one operational mode inside the broader booking marketplace.

## User Stories

1. As a guest, I want to browse vendors publicly, so that I can decide whether GetPrio has services relevant to me.
2. As a guest, I want to search vendors by service, category, location, rating, or availability, so that I can find a suitable provider quickly.
3. As a guest, I want to view a vendor profile, so that I can understand services, price ranges, location, reviews, and booking options before registering.
4. As a guest, I want to register as a customer, so that I can book services and manage my booking history.
5. As a customer, I want to manage my profile and contact details, so that vendors can confirm service requests and notifications reach me.
6. As a customer, I want to request a booking for a selected service and time, so that I can reserve a vendor service.
7. As a customer, I want booking confirmation details, so that I know the vendor, service, schedule, price, and next steps.
8. As a customer, I want a payment or checkout placeholder, so that the capstone can demonstrate transaction handling without requiring a full payment production launch.
9. As a customer, I want notifications for booking status changes, so that I know whether a booking is pending, approved, rescheduled, completed, or canceled.
10. As a customer, I want to view booking history, so that I can track upcoming and past services.
11. As a customer, I want to submit a review after completed service, so that I can share service feedback.
12. As a vendor staff member, I want to see only assigned bookings and schedules, so that I can perform my work without accessing unrelated business data.
13. As a vendor staff member, I want limited customer details for assigned bookings, so that I can deliver the service while respecting privacy.
14. As a vendor admin, I want to manage business profile details, so that customers see accurate public information.
15. As a vendor admin, I want to manage service catalog entries, so that customers can book the right service with clear descriptions and pricing.
16. As a vendor admin, I want to manage staff records and roles, so that operational access matches team responsibilities.
17. As a vendor admin, I want to manage pricing and availability, so that customers can book valid services at valid times.
18. As a vendor admin, I want booking management tools, so that I can approve, assign, reschedule, cancel, or complete service requests.
19. As a vendor admin, I want vendor analytics, so that I can understand demand, bookings, revenue indicators, and operational load.
20. As a platform admin, I want a vendor approval queue, so that marketplace vendors can be reviewed before becoming publicly visible.
21. As a platform admin, I want user moderation tools, so that abusive or risky accounts can be suspended or reviewed.
22. As a platform admin, I want dispute resolution tools, so that customer-vendor issues can be tracked and resolved.
23. As a platform admin, I want audit logs, so that sensitive administrative and account actions are accountable.
24. As a platform admin, I want reports and compliance dashboards, so that the capstone can demonstrate governance and oversight.

## Implementation Decisions

- Keep tenant/business identity as the foundation for vendor accounts.
- Treat the current queue dashboard as a reusable vendor operations foundation, not as the complete product surface.
- Add marketplace concepts for vendor profiles, service catalog, availability, booking requests, reviews, disputes, and moderation.
- Preserve existing customer registration, login, account, notification, billing, public link, and platform operations foundations where they fit.
- Model booking ownership explicitly: customers may access only their own bookings, vendor staff may access only assigned bookings, vendor admins may access vendor-owned bookings, and platform admins may access governance-level records.
- Treat queue tickets and booking records as related but distinct concepts. Queue tickets represent live service flow; bookings represent scheduled or requested services.
- Use server-side authorization for every privileged action. UI hiding is not sufficient.
- Keep payment work capstone-friendly: payment references and placeholder checkout states are acceptable unless a production payment provider is explicitly in scope.

## Testing Decisions

- Test external behavior at API and workflow boundaries rather than internal implementation details.
- Add authorization tests for customer booking ownership, vendor staff assignment boundaries, vendor admin tenant scope, and platform admin-only actions.
- Add booking state tests for pending, confirmed, rescheduled, completed, canceled, disputed, and reviewed paths.
- Add validation tests for vendor profile, service catalog, booking request, review submission, and dispute forms.
- Reuse the current backend test style for high-risk routes and repositories.

## Out of Scope

- Full production payment certification.
- Native mobile apps.
- Real OAuth provider launch unless already configured.
- Real penetration testing against third-party systems without written authorization.
- Full accounting, payroll, or inventory management.

## Further Notes

This PRD is the product backbone for capstone planning. It should be used together with the role-based HCI screen PRD and IAS security/privacy PRD so screens, data, permissions, and security documentation remain consistent.
