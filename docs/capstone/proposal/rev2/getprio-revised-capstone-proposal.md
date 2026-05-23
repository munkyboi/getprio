# GetPrio: A Multi-Tenant QR-Based Digital Queue Management and Platform Operations System

**Revised Capstone Project Proposal, Rev. 2**  
**Track Concentration:** Web Applications Development  
**Primary Targeted SDG:** SDG 9 - Industry, Innovation and Infrastructure  
**Supporting SDGs:** SDG 8 - Decent Work and Economic Growth; SDG 11 - Sustainable Cities and Communities  
**Prepared by:** Roberto Carlo Abella  
**Adviser:** Prof. Jovelyn Cuizon  
**Date:** May 2026

## Project Summary

GetPrio is a web-based digital queue management platform for service-oriented establishments that need a faster and more transparent way to manage walk-in and remote customers. The revised application extends the original Prio concept from a single queue prototype into a multi-tenant platform with vendor dashboards, QR-based queue joining, customer account access, public live queue boards, branch/location management, service counters, staff roles, notification delivery tracking, payment-enabled queue joining, subscription plans, and a separate platform operations dashboard.

The system is designed for small and medium-sized service providers such as clinics, school offices, salons, government desks, retail service counters, and similar establishments where physical waiting lines often create crowding, uncertainty, and operational pressure. Customers can join queues through QR links or online forms, verify queue joins through one-time passcodes, monitor queue movement from a public board, and receive email or SMS alerts when they are near the front of the line. Vendors can control ticket flow, configure queue behavior, issue walk-in tickets, manage locations and counters, review customer history, and customize public board themes. Platform administrators can monitor tenants, users, subscriptions, queue fees, payments, and billing events through a dedicated operations portal.

## Introduction

Many service establishments still depend on manual queue logs, paper numbers, verbal announcements, or simple first-come-first-served lists. These methods are familiar, but they create recurring problems: customers must stay near the service area, staff repeatedly answer questions about queue progress, and missed turns or disorganized ticket handling can disrupt service flow. In high-traffic environments, these issues can increase crowding and reduce both customer satisfaction and staff productivity.

Digital queue systems help address these problems by letting users join, monitor, and receive updates about their queue status. However, many available systems are either enterprise-oriented, costly, appointment-focused, or limited to a single organization. Smaller local establishments often need a practical web platform that can support multiple independent vendors while still keeping each vendor's data, queue settings, locations, and staff access separated.

GetPrio responds to this gap by providing a tenant-aware queue platform that supports vendor self-service and platform-level administration. The revised application no longer focuses only on queue issuance and display. It now includes operational requirements that make the system closer to a deployable software-as-a-service prototype: subscription plans, queue join fees, PayMongo-ready payment records, OTP-secured public joins, notification delivery logs, configurable public board design, staff/counter attribution, and platform-wide monitoring.

## Statement of the Problem

The project addresses the general problem of inefficient queue management in service-oriented establishments. Specifically, it seeks to answer the following questions:

1. How can a web application reduce the need for customers to physically wait near service counters?
2. How can vendors manage queue flow, staff assignments, service counters, and customer tickets in a tenant-specific dashboard?
3. How can customers receive reliable queue visibility and near-turn alerts without requiring a complex mobile application?
4. How can a platform administrator monitor tenants, payments, subscriptions, and operational activity across multiple vendors?
5. How can queue records, ticket numbers, payment records, notifications, and public board settings be stored securely and consistently in a relational database?

## Objectives

### General Objective

To develop GetPrio, a multi-tenant QR-based digital queue management and platform operations system that improves customer flow, vendor service efficiency, and platform-level manageability through a responsive web application.

### Specific Objectives

1. To implement vendor registration, tenant creation, login, and role-based access for customers, vendors, staff, and platform administrators.
2. To allow customers to join queues through QR-based public links and online join pages with OTP verification support.
3. To generate tenant-specific daily ticket numbers, lookup codes, and queue positions using reliable PostgreSQL-backed counters.
4. To provide vendor controls for walk-in ticket issuance, call-next, serve-current, skip-current, ticket history, and customer tracking.
5. To support branch/location records, store hours, service counters, staff membership, and counter assignments.
6. To provide live public queue monitoring using Server-Sent Events so browsers can receive queue updates without WebSocket complexity.
7. To send and record near-turn and called-ticket notifications through email or SMS provider integrations, with local development fallbacks.
8. To support payment and subscription workflows through queue join payment records, billing checkout sessions, billing events, and configurable subscription plans.
9. To provide a platform operations dashboard for monitoring tenants, users, queue fees, subscriptions, join payments, and billing events.
10. To allow vendors to customize public board themes, including branding colors and uploaded board assets.

## Scope and Limitations

### Scope

The revised system covers the following functional areas:

- Customer-facing landing, registration, login, account, queue join, ticket lookup, and public queue monitor pages.
- Vendor-facing dashboard sections for queue operations, locations, staff, clients, history, reports, and settings.
- Platform administrator dashboard for tenant, user, fee, subscription, payment, and billing-event oversight.
- REST API services for authentication, account management, public queue access, vendor operations, billing, payment webhook handling, and platform operations.
- PostgreSQL database schema for tenants, users, memberships, locations, store hours, counters, tickets, OTPs, notification deliveries, public board themes/assets, queue fees, subscription plans, subscriptions, checkout sessions, queue join payments, and billing events.
- Integrations prepared for email, SMS, Cloudflare Turnstile, PayMongo, OAuth login, and Backblaze B2 S3-compatible asset uploads.
- Docker-based local development support for the frontend, backend, platform dashboard, and database.

### Limitations

- The system is a capstone prototype and may require additional compliance, monitoring, and security hardening before production deployment.
- SMS, email, payment, OAuth, CAPTCHA, and object-storage behavior depends on configured third-party provider accounts.
- The system focuses on first-in-first-out queue flow and does not yet implement advanced appointment scheduling, priority lanes, or complex service routing.
- Offline operation is not included; the application requires network access to the backend and database.
- The platform operations dashboard is intended for administrative monitoring and configuration, not full customer support case management.

## Target Users and Personas

### Vendor Owner or Queue Manager

The vendor owner or queue manager operates the service desk for a clinic, salon, campus office, government desk, or small business counter. This user needs to issue tickets quickly, know who is waiting, call the next customer, assign staff, configure counters, review history, and reduce repeated queue-status inquiries.

### Vendor Staff

Vendor staff members assist with day-to-day queue processing. They need controlled access to queue actions, customer records, and history without necessarily having full owner-level settings or billing permissions.

### Customer

The customer joins a queue either on-site through a QR code or remotely through a join page. This user needs a simple form, a clear ticket number, queue visibility, and optional notifications when their turn is approaching.

### Platform Administrator

The platform administrator monitors the overall GetPrio system. This user needs visibility into tenant activity, users, payment records, subscription plans, fee settings, and billing events in order to operate the platform as a SaaS-style service.

## Proposed Features

### Core Customer Features

- Customer registration and login.
- QR-based queue join links.
- OTP-based join verification through email or SMS.
- Ticket number and lookup code generation.
- Public queue board with live updates.
- Ticket cancellation and lookup support.
- Customer account page for queue-related information.

### Core Vendor Features

- Vendor onboarding and tenant workspace creation.
- Queue dashboard showing waiting, called, served, skipped, and cancelled tickets.
- Walk-in ticket creation.
- Call-next, serve-current, skip-current, and queue-history actions.
- Tenant settings for queue prefix, average service minutes, notification threshold, contact email, and contact phone.
- Location and store-hour management.
- Service counter creation and staff assignment.
- Staff and client management views.
- Queue history and basic reporting.
- Public board theme customization and branded asset uploads.

### Platform Operations Features

- Platform admin login using role-based access.
- Overview metrics for tenants, users, revenue, subscriptions, and queue join payments.
- Queue fee configuration by plan.
- Subscription plan management.
- Tenant, user, subscription, join-payment, and billing-event lists.
- Platform settings such as enterprise inquiry contact configuration.

### Billing and Monetization Features

- Subscription plans for economical, pro, and enterprise use cases.
- Tenant subscription records with plan entitlements.
- Billing checkout session records.
- Queue join payment records with PayMongo-oriented provider fields.
- Payment webhook route for billing event processing.
- Queue fee settings configurable by platform administrators.

## Development Platform and Tools

| Area | Technology / Tool |
| --- | --- |
| Frontend Application | React, Vite, TypeScript, Mantine UI, React Router |
| Vendor and Customer UI | Responsive browser-based web application |
| Platform Dashboard | Separate React + Vite operations dashboard |
| Backend | Node.js, Express, TypeScript/JavaScript |
| Database | PostgreSQL with relational tables, indexes, constraints, and triggers |
| Real-Time Updates | Server-Sent Events for public queue monitoring |
| Authentication | JWT-based API authentication, password login, OAuth account support |
| Notifications | Email/SMS delivery services with delivery logs and local console fallbacks |
| Payments | PayMongo-ready checkout/session/payment records and webhook route |
| CAPTCHA / Abuse Protection | Cloudflare Turnstile-ready public join protection |
| Asset Storage | Backblaze B2 S3-compatible signed upload URLs for public board assets |
| Deployment Support | Docker, Docker Compose, environment-based configuration |
| Development Tools | Git, npm, Visual Studio Code, browser developer tools |

## System Architecture Overview

GetPrio uses a three-application structure connected through a shared backend API and PostgreSQL database:

1. The customer/vendor frontend handles landing pages, authentication, vendor dashboard workflows, public queue joins, and live queue boards.
2. The platform dashboard provides a separate administrative interface for GetPrio operators.
3. The backend exposes REST and streaming endpoints for authentication, queue operations, public access, billing, and platform administration.
4. PostgreSQL stores all core platform records, including tenant data, user roles, locations, queue tickets, counters, OTPs, subscriptions, payments, billing events, notification deliveries, and public board themes.
5. External providers are used only when configured, allowing the prototype to run locally with fallbacks while remaining ready for real provider integration.

This architecture supports separation of concerns between customer/vendor usage and platform administration while preserving a shared source of truth in the backend and database.

## Data Management

The revised application uses PostgreSQL instead of the earlier MongoDB-oriented proposal. This change better supports the updated requirements because the system now has many relational entities: tenants, users, tenant memberships, locations, service counters, staff assignments, tickets, subscriptions, payments, notification deliveries, and billing events.

Important data design decisions include:

- Tenant-aware records for separating vendor data.
- Unique slugs for tenants and locations.
- Daily ticket sequences scoped by tenant, location, and date.
- Lookup codes for customer ticket access.
- Indexed ticket status and creation fields for queue retrieval.
- Role arrays for customer, vendor, staff, and platform administrator access.
- JSONB fields for flexible theme settings, plan entitlements, and provider metadata.
- Database triggers for automatic `updated_at` maintenance.

## Methodology

The project will follow an iterative prototyping methodology suitable for web application development:

1. Requirements refinement: Identify queueing workflows, user roles, tenant boundaries, and platform administration needs.
2. System design: Prepare database schema, API route structure, frontend route map, and dashboard layout.
3. Core implementation: Build authentication, tenant creation, ticket generation, queue control, and public queue monitoring.
4. Extended implementation: Add locations, counters, staff, notifications, public board customization, payments, subscriptions, and platform operations.
5. Testing and validation: Test queue ordering, ticket uniqueness, user permissions, payment state records, notification logging, and live queue updates.
6. Documentation and presentation: Prepare proposal, system documentation, deployment notes, and defense materials.

## Evaluation Criteria

The system may be evaluated using the following criteria:

- Functional completeness: The system performs the stated customer, vendor, and platform workflows.
- Queue correctness: Ticket numbers, queue positions, and status changes remain accurate under normal use.
- Usability: Customers can join and track queues easily, while vendors can operate the dashboard with minimal friction.
- Reliability: API routes, database constraints, and live updates behave consistently during demonstrations.
- Security and access control: Protected routes require authentication and role-appropriate access.
- Data integrity: Tenant data, tickets, counters, payments, and subscriptions are stored without cross-tenant conflicts.
- Maintainability: Code is organized into frontend, backend, platform dashboard, shared types, and database modules.
- Deployment readiness: The system can run locally through documented npm and Docker workflows.

## Expected Outputs

The expected deliverables are:

1. A working GetPrio customer/vendor web application.
2. A working GetPrio platform operations dashboard.
3. A backend API with authentication, queue, vendor, public, billing, and platform routes.
4. A PostgreSQL schema and migration set.
5. Local development and deployment documentation.
6. Revised capstone proposal and presentation materials.
7. Demonstration data or workflow scripts for capstone presentation.

## Project Timeline

| Phase | Activities | Expected Output |
| --- | --- | --- |
| Phase 1 | Proposal revision, requirements review, scope confirmation | Approved revised proposal |
| Phase 2 | Database and API stabilization | Stable schema, routes, and shared types |
| Phase 3 | Customer and vendor workflow completion | Queue join, public board, dashboard operations |
| Phase 4 | Platform operations and billing workflows | Admin dashboard, plans, fees, payments, subscriptions |
| Phase 5 | Testing, documentation, and deployment preparation | Tested prototype and deployment notes |
| Phase 6 | Capstone presentation preparation | Final paper, presentation, and demonstration script |

## Significance of the Study

### For Customers

GetPrio reduces uncertainty by allowing customers to join a queue, receive a ticket, monitor progress, and receive alerts without remaining physically near the service counter.

### For Vendors

GetPrio improves queue handling by giving vendors a dashboard for issuing tickets, managing queue movement, organizing staff and counters, and reviewing service history.

### For Platform Operators

GetPrio demonstrates how a queue management application can be operated as a multi-tenant platform with subscription plans, fee settings, payment monitoring, and administrative oversight.

### For Future Researchers and Developers

The project can serve as a reference for building tenant-aware web applications that combine real-time updates, relational database design, role-based access, payment records, and provider integrations.

## Conclusion

GetPrio is a revised and expanded capstone project that moves beyond a simple digital queue prototype. The updated application now represents a practical multi-tenant queue management and operations platform. By combining QR-based queue joining, live public monitoring, vendor queue controls, staff and counter management, notification support, payment-aware workflows, subscription plans, public board customization, and platform administration, the project provides a stronger technical and operational foundation for capstone evaluation.

The proposal remains feasible for a web applications development capstone because the workflows are clear, demonstrable, and measurable. At the same time, the revised scope reflects a more complete software product direction that can support real service environments in the future.
