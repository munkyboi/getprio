# Vendor service and weekly availability audit

Date: 3 October 2026. Scope: current Service form, weekly availability form, and reported booking-list visibility. Resource tracking remains disabled; no operational resource feature is introduced here.

## Reported booking: BKG-01759526

Live browser evidence established that the vendor dashboard was filtered to **Ayala Center Cebu**, while the customer booking flow selected **SM Seaside Cebu**. Switching the dashboard Location selector to SM Seaside Cebu showed BKG-01759526 in the list. It initially appeared pending with payment proof; a later observation showed confirmed and paid after user activity. The agent did not confirm, reject, cancel, or change the booking.

This was a branch-filter mismatch, not an observed missing database record. The list remains intentionally scoped to the selected branch, matching server-side authorization. The UI change explains this scope next to the list and resets pagination when tenant or branch changes, so an old page number cannot hide a short list at another branch.

## Findings and changes

| Finding | Change |
| --- | --- |
| Empty Branch inventory section promised courts/slots without any controls | Restore ordinary branch enablement, booking capacity, numeric price override, and display-price label controls using the existing service contract. Use business-neutral language. |
| Editing a service defaulted unassigned branches to enabled, invisibly extending its availability on save | Preserve disabled/unassigned branches. New services initially enable only the selected branch; other branches require explicit selection. Wait for branch configuration to load before opening the form. |
| Allow units could be interpreted as people, simultaneous resources, or physical inventory | Rename to Allow multiple duration units and explain duration/price multiplication. Quantity is not resource demand. |
| Manual payment could imply automatic checkout | State that the customer submits proof and the vendor reviews it; no automatic payment collection is implied. |
| Price display override could be mistaken for the charged price | Separate numeric prices from optional customer display labels, including existing branch overrides. |
| Slug is technical language and the form briefly showed a duplicate error while checking | Name it Booking link identifier, explain its purpose, and show only settled validation messages. |
| Scope / Service and state did not explain the rule | Use Booking availability / Where this schedule applies, Branch, Applies to, and Use this weekly schedule, with descriptions of all-service capacity and disabled-rule behavior. |
| New-rule weekday changes used dashboard-selected branch hours instead of the form-selected branch | Derive defaults from the branch selected inside the availability form. |
| Inactive services vanished from option lists while editing their saved rules | Keep the rule's currently selected inactive service visible and label it Not offered for booking. Do not silently reinterpret a saved rule as All services. |
| Booking lists did not explain the branch filter | Add explicit branch context and guidance; preserve filters and tenant/location authorization. |

## Existing booking semantics checked against source

- A service is bookable only when the service and its branch assignment are enabled. Global service activation does not replace branch assignment.
- Booking quantity multiplies base duration and numeric price. It does not define customer count or physical-resource units.
- `bookingCapacityScope: service` counts overlapping items for that service. `location` counts overlapping items across the branch. An all-services availability rule or exception imposes location scope regardless of the service setting.
- Current `resolveEffectiveCapacity` uses **the higher** of branch service capacity and matching rule/exception capacity. This audit exposes that behavior and does not replace it with a minimum, add resource enforcement, or rewrite existing configuration. A different policy requires a separate compatibility decision.
- Disabled weekly rules are ignored. If the branch has no enabled weekly rules, booking logic falls back to business hours and fallback capacity. Disabling the last rule does not close booking intake; an unavailable date exception is the existing way to block a date.
- Weekly windows must fit branch business hours; overnight windows keep their Ends next day flag. Existing date exceptions and capacity selection remain authoritative.
- Current service-specific rules and all-service rules can overlap; booking logic selects a matching rule rather than creating a combined resource ledger. This release does not promise independent resource allocation or precedence changes.

## Evidence and limits

Live production inspection confirmed the booking branch mismatch and the old form fields. Forms were opened and closed without saving configuration. Source review covered form initialization and serialization, booking-list request scope, availability matching, and effective-capacity calculation. Focused lint and frontend TypeScript checks validate the change statically. No production configuration or stored booking data was changed by the audit. Updated-form save behavior and mobile/tablet/desktop visual acceptance still require validation on the updated build before deployment acceptance.

Broader campaign and customer-rating removal stays with its delegated scope; historical data and unrelated files are untouched.
