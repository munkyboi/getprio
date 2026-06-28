# GetPrio MVP Capstone Proposal

## Project Title

GetPrio MVP Capstone Proposal: Service Marketplace and Booking Platform

## Project Overview

GetPrio is a service marketplace and booking platform that connects customers with vendors, supports public vendor discovery, enables service bookings, and preserves a queue-based operational workflow for same-day service execution. The MVP focuses on the core product slice needed to demonstrate a working capstone: public discovery, role-aware booking, vendor operations, manual payment proof handling, notifications, and security-conscious access control.

## Problem Statement

Current local service discovery is fragmented. Customers need a single place to browse vendors, view services, schedule bookings, and receive booking updates, while vendors need a controlled dashboard to manage services, availability, bookings, and live operations. The capstone MVP addresses this by combining marketplace discovery with booking and queue execution in one coherent platform.

## MVP Goals

- Provide a public-facing vendor discovery experience for guests and customers.
- Allow customers to create bookings from valid service slots instead of free-form datetime entry.
- Support vendor-side booking review, payment proof verification, and check-in.
- Preserve the queue lifecycle as the source of truth for live service-day execution.
- Enforce role-aware access for Guest, Customer, Vendor Staff, Vendor Admin, and Platform Admin.
- Support the IAS deliverables with traceable screens, forms, endpoints, and data handling rules.

## MVP Scope

### Public and Guest Experience

- Landing page
- Vendor search and discovery
- Vendor profile and service details
- Login, register, forgot password, and reset password

### Customer Experience

- Customer dashboard
- Booking request flow
- Booking confirmation and booking history
- Payment placeholder for manual QR-based proof submission
- Reviews and notifications
- Profile and account settings

### Vendor Experience

- Vendor dashboard
- Service catalog management
- Booking management
- Availability and scheduling
- Assigned operational work for staff
- Live queue handling after customer check-in

### Platform Admin Experience

- Platform admin dashboard
- Vendor approval queue
- User management and moderation
- Disputes, audit logs, and compliance reporting

## Core Product Decisions

- Bookings reserve future service intent and do not automatically create queue tickets.
- Queue tickets are created or linked when a vendor-side user checks in the customer.
- Booking slots are computed from availability, service duration, and capacity.
- Payment-required services use manual proof upload and vendor verification instead of full payment gateway processing.
- Privileged roles require stronger authentication and server-side authorization, not just hidden UI.

## Security and Privacy Direction

The MVP is also an IAS-ready prototype. The proposal must align product screens with:

- CIA and IAAA mapping
- privacy impact assessment and data classification
- authentication, session management, and RBAC design
- attack surface mapping and vulnerability assessment

The implementation should avoid insecure shortcuts such as plaintext password storage or token storage in localStorage.

## Expected Deliverables

1. A working MVP prototype that demonstrates discovery, booking, vendor operations, and queue handoff.
2. A role-based screen inventory that maps to the capstone HCI requirements.
3. IAS module outputs grounded in the same screens, data fields, and workflows.
4. Supporting technical documentation that describes the implemented scope and security controls.

## Out of Scope for the MVP

- Full production payment processing
- Native mobile applications
- External penetration testing without written authorization
- Complex monetization features beyond the manual payment-proof flow
- Rewriting the queue platform from scratch

## Success Criteria

The MVP is successful if a reviewer can:

- discover a vendor publicly,
- create a valid booking request,
- see vendor-side booking handling,
- confirm the booking lifecycle into the queue flow,
- and trace the same product through the IAS documentation.

## Suggested Next Step

Use this document as the standalone MVP proposal reference, while keeping the existing modified capstone proposal as the broader project narrative.
