# Queue policy form sections — local acceptance

2026-10-17, actual Opera, local VD Sports Club / Demo Courts. No PR publication or policy/data changes for this slice.

Policy forms now use the existing accessible shadcn/Base UI tabs: General (labels and reload), Duration (mode, visibility, base/count bounds/default), Resources (assignment and execution confirmation), Extras (selection requirements). All sections contain actual current controls or capability guidance. There is no dialog eyebrow. Content-sized inset tabs keep44px height; compact horizontal padding fits all four labels on one row at375px, wrapping only when the actual parent is narrower.

Draft state is owned above all sections; mounted panels retain controls across tab changes. Submit validates the whole draft, including hidden sections. Section-tagged validation opens and focuses the invalid tab, links it to the error summary, and clears that validation message after input changes. Busy/unknown save state disables tab navigation and controls and retains the original pending-command/retry, revision and permission boundaries. No API payload/version changes.

## Actual Opera

URL: `http://127.0.0.1:5187/dashboard/services?workspace=administration&business=vd-sports-club`; Services → Queue policy → edit card. Own updated preview remains on the Active policy grid; original queue review tab retained.

- Configured BasicEquipment revision7: General/Duration/Resources/Extras available; only selected section visible. Current base60/max8/default2 read without writes.
- Unsaved label "Session draft only" survived tab switches, keyboard navigation and Cancel → Keep editing. Cancel → Discard removed only that own local edit; reopening showed original Duration label.
- Fractional base1.5 entered in Duration, then submitted from Extras: Duration automatically selected/focused, value retained, error visible, zero PUT requests.
- Keyboard ArrowRight moved General→Duration→Resources and activated/focused each tab.
- Unconfigured Court2 revision0: submit from Extras with blank numeric fields opened/focused Duration. After local numeric edits, a blank hidden service label opened/focused General. Restored label with missing assignment opened/focused Resources. Network observation across these invalid submissions recorded zero PUT requests. Own local edits discarded.
- Desktop1440×1000, narrow375×700 and short375×500 verified. At375 all four tabs were on one row, each44px high; widths approximately72/77/90/62px. Document width375, no horizontal overflow. Short viewport kept Cancel/Save visible; focusing a duration field scrolled it above the footer. Every tab remains keyboard accessible.
- No fixture policy save, ticket/draft creation, or resource mutation occurred. Original theme retained; viewport override cleared after checks.

## Evidence and validation

Directory `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice/`:

- queue-policy-tabs-general-1440.png
- queue-policy-tabs-validation-1440.png
- queue-policy-tabs-duration-375.png
- queue-policy-tabs-short-375.png
- queue-policy-tabs-short-field-375.png
- queue-policy-tabs-unconfigured-validation-375.png

291 full frontend tests pass, including validation section classification. Typecheck, focused lint, build and diff checks pass. Existing build chunk-size advisory remains. Previous committed-response-loss/retry evidence remains in vendor-v4-configurable-intake-acceptance.md; no unnecessary new policy save was issued for this presentation change. Broader role/runtime/rework gates stay separate.
