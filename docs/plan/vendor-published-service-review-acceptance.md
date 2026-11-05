# Published request services: disclosure and typography

Status: local preview accepted through focused source and actual Opera checks. No PR/deployment claim.

## Scope and behavior

Published cards and Request review use the existing Base UI/shadcn Accordion composition for each root service. Intake is unchanged. Root service values use frozen `serviceSelectionId`; each request instance has independent Base UI panel IDs. Multiple services can remain open. Initial expansion prioritizes services with actionable children or relevant resource waits/interruption, then the current stage service or first service. User expansion is local component state and survives ordinary request refresh; it does not write data or imply workflow state.

The trigger has a left chevron, service name, resource/extra counts and projected execution-status counts. Named extra members count separately; units and duration are not conflated. Available child action counts give an explicit “expand to manage” affordance. The plan’s request action buttons stay outside service panels. Waiting reasons remain outside panels in semantic info/warning alerts. Collapsing does not change values, allowed actions, revisions, allocation history or parentage.

Hierarchy uses the incumbent font: request20px/600, service18px/600, resource16px/600, extra14px/500 and metadata13px/400. Resource total duration is expressed in hours/minutes separately from resource quantity. Exact count × base-minute calculations remain visible, along with every attempt, allocation unit and timing. Named member labels no longer repeat their enclosing extra service name. Quote unavailable remains explicit; no zero price is invented. Started-resource release guidance is concise and secondary. Outcome extras retain the explicitly approved4px semantic border,16px inline inset,8px vertical padding and member separation.

## Verification

-10 focused tests passed, including exact revision/group guards, permitted outcomes, named-member summary counts, human durations, initial/multiple expansion, capability gating and preserved request action/wait markup. Frontend typecheck and focused ESLint passed; diff whitespace check passed. No full suite rerun for this bounded slice.
- Actual own Opera tab5671 read VD019 waiting, then independently user-started VD019 in service, and Served QA28. No Call/Start/Skip/Amend/outcome command was issued by this verification. User tabs/forms were not clicked, closed or reloaded.
- VD019 Enter collapsed and Space reopened the service. Waiting reason and request Call/Amend stayed visible while collapsed. The full resource/extra text was identical before/after; reopening restored the same `aria-controls` panel identity. Base UI omits that attribute while the panel is closed. A normal Refresh requests preserved the chosen collapsed state.
- Desktop and375px light/dark checked. Computed type roles20/18/16/14/13px; documentWidth375 at375px; extra border4px and inset16px; no horizontal clipping. Served QA28 retained named Trainers A/C, separate completion/release times and allocation history under its service.
- Temporary viewport/theme changes restored to desktop dark. Preview retained in own5671 at the current VD019 branch-bound review.
- Impeccable detector found only the existing4px outcome side border. This is an intentional pinned Carlo requirement; retained rather than replacing the approved outcome hierarchy. No other findings.

Evidence directory: `/Users/carloabella/.codex/visualizations/2026/10/17/vendor-multiservice`. Captures: `published-services-desktop-{light,dark}.png`, `published-services-375-{light,dark}.png`, `published-services-collapsed-desktop-dark.png`, `published-services-collapsed-375-light.png`, and `published-services-completed-{desktop,375}-dark.png`.

VD019’s waiting/in-service captures are time-specific observations. Its Start at23:23:20 Manila occurred independently during verification; no claim that the user’s request remained unchanged in external state follows from read-only UI work.
