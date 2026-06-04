# GetPrio V1 Stability PRD

## Scope

This PRD defines the v1 stabilization work for:

```txt
Vendor operations completeness
```

The goal is to ensure a vendor can operate GetPrio daily without manual DB intervention, hidden admin-only workarounds, or operational ambiguity.

---

## 1. Product Context

Vendor operations are the business core of GetPrio. If vendor staff and vendor admins cannot reliably:

- manage live queues
- issue walk-ins
- assign counters
- manage staff
- control locations
- update queue settings

then the platform is not stable even if public/customer flows work.

---

## 2. Problem Statement

The codebase already contains substantial vendor functionality:

- dashboard snapshot
- call next / serve / skip flows
- locations
- counters
- staff invitations
- billing view hooks
- public board theme management

The remaining risk is operational incompleteness:

- role boundaries may not be explicit enough
- queue actions and admin actions can still overlap awkwardly
- some workflows may require route knowledge rather than clear product behavior
- tenant setup and daily operation are not yet documented as a closed operational loop

---

## 3. Objectives

### Primary Objective

Make vendor-side operations complete, reliable, and role-correct for stable v1 daily use.

### Secondary Objectives

- Separate live queue operations from tenant administration
- Reduce operator error under active queue conditions
- Ensure tenant admins can configure required business objects without engineer intervention

### Non-Objectives

- advanced workforce analytics
- staff performance ranking
- ETA staff insights
- appointment scheduling

---

## 4. Operating Roles

### Vendor Staff

Focus:

- live queue execution
- assigned location/counter work

### Vendor Admin

Focus:

- business configuration
- staff and counter management
- queue policies
- history and reporting access

### Vendor Owner

Focus:

- all vendor admin functions
- billing-sensitive and ownership-sensitive actions

---

## 5. Core Operational Areas

Stable v1 vendor operations must fully cover:

1. Live queue operations
2. Walk-in issuance
3. Location management
4. Service counter management
5. Staff invitation and membership management
6. Queue settings and open/close controls
7. Public board theme/configuration
8. Tenant billing visibility

---

## 6. Live Queue Operations

## 6.1 Required Staff Actions

Stable v1 must support:

- view current ticket
- view waiting queue
- call next ticket
- mark current ticket served
- skip current ticket
- cancel current or waiting ticket if policy allows
- requeue allowed skipped/unserved tickets
- issue walk-in ticket

### UX Requirement

These actions must be available from one operational surface without forcing staff through configuration screens.

### Safety Requirement

Each destructive or state-changing action must:

- validate permissions
- validate current queue status
- return updated queue snapshot

---

## 6.2 Counter and Location Context

Stable v1 vendor operations must always know the active scope:

```txt
tenant
location
counter optional
```

Requirements:

- actions must not accidentally operate on the wrong location
- dashboards must clearly identify active location
- future counter scoping must be supported without reworking route structure

---

## 7. Walk-In Ticket Issuance

Stable v1 walk-in flow requirements:

- fast ticket creation by staff/admin
- same lifecycle model as public/online tickets
- join channel stored as vendor/staff-generated
- optional customer contact fields
- no hidden field requirements that slow the operator

### Validation

- minimal required input
- no duplicate assumptions about authenticated customer account

---

## 8. Location Management

Vendor admin must be able to:

- create locations
- edit location metadata
- manage open/closed state inputs via store hours
- choose primary location
- activate/deactivate locations where allowed

### Invariants

- every tenant must have a valid primary operating location
- location slug uniqueness must hold per tenant
- queue and public URLs must resolve correctly per location

---

## 9. Service Counter Management

Vendor admin must be able to:

- create counters
- update counter details
- activate/deactivate counters
- assign staff to counters

### Future-Proofing Requirement

Counter model must remain compatible with future:

- stricter staff counter scoping
- service-lane logic
- ETA staff basis

Stable v1 does not need full lane orchestration, but must not block it.

---

## 10. Staff Management

Stable v1 must support:

- invite staff/admin
- accept invitation
- view current tenant members
- revoke or deactivate access
- enforce role limits from subscription entitlements

### Role Rules

- only owner/admin can invite staff
- only owner or sufficiently privileged admin can manage roles
- staff cannot escalate self-role

### Operational Requirement

Membership state must cleanly support:

- active
- inactive
- pending invite
- expired invite
- revoked invite

---

## 11. Queue Settings

Vendor admin must be able to manage stable v1 queue settings, including:

- queue prefix
- average service minutes baseline
- near-turn notification threshold
- queue open/close day controls
- customer join availability rules linked to store hours/closure

### Design Rule

Queue settings that affect operations must not be scattered across unrelated screens or hidden fields.

---

## 12. Public Board Management

Vendor admin must be able to:

- manage theme
- upload branding assets
- preview resolved public-board look
- apply theme per tenant or per location

### Stability Requirement

Theme customization must not break:

- public readability
- queue visibility
- privacy constraints
- board availability

---

## 13. Billing Visibility

Vendor admin or owner must be able to:

- view current subscription state
- view plan entitlements affecting operations
- understand staff seat and location limits
- access billing checkout flows

### Role Rule

Billing write actions should remain owner/admin only.

---

## 14. Operational Data Requirements

Stable v1 vendor dashboard should surface enough data for daily decisions:

- current ticket
- waiting count
- recent history
- queue closed/open state
- location status
- usage-sensitive indicators tied to plan limits

Do not overload the operator screen with platform-style analytics.

---

## 15. API Requirements

Vendor operations should be grouped consistently by:

- tenant
- location when applicable
- operational domain

Required stable API areas:

```txt
dashboard snapshot
walk-in issuance
call next
current ticket resolution
queue close/reopen
locations CRUD
counters CRUD
staff invitations
staff membership management
theme management
billing visibility
```

### API Rule

Operational endpoints must return data shaped for direct UI refresh without requiring multiple follow-up requests for the same user action where practical.

---

## 16. Failure States

Stable v1 must explicitly handle:

- queue closed for the day
- location closed
- no waiting tickets
- current ticket already exists when calling next
- seat limit exceeded for staff invites
- inactive tenant subscription limiting certain actions
- invalid location/counter scope

Operators need actionable messages, not generic server failures.

---

## 17. Acceptance Criteria

- Staff can run the live queue end to end from one clear workflow
- Vendor admin can configure locations, counters, staff, and queue settings without DB edits
- Queue actions are location-correct and role-correct
- Seat and entitlement limits are enforced cleanly
- Billing visibility is clear enough to explain operational limitations
- Public board customization does not break queue use

---

## 18. Recommended Implementation Order

### Phase 1

- Audit live queue action completeness
- Remove route-level inconsistencies

### Phase 2

- Stabilize location/counter context handling
- Tighten role constraints for vendor staff/admin/owner

### Phase 3

- Finish staff management and invite lifecycle
- Enforce plan-seat and location/counter limits consistently

### Phase 4

- Polish public board theme and queue settings administration as a complete configuration loop

---

## 19. Final Recommendation

Do not treat the vendor dashboard as one screen with mixed responsibilities.

For stable v1, vendor operations should be treated as two product surfaces:

- live operations
- tenant administration

That separation will reduce operator error now and prevent painful dashboard refactors later.
