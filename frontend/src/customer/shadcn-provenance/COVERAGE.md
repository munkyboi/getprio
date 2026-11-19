# Customer shadcn/ui correction

Baseline bc95a3d01096e2e8651608265aeac0021bfe439b. Official @shadcn, base-nova, Base UI, CLI4.23.0; full raw CLI-view source and SHA evidence are retained alongside installed source. Upstream source is retained as text to avoid compiling duplicate modules. Local modifications are explicit in ../shadcn-provenance.json.

## Active component coverage

- components/ui.tsx is now an export barrel for actual registry-derived source. It no longer hand-implements Button/Card/Badge/Input/Alert/Avatar/Menu/Skeleton/Separator.
- Every direct Base UI import outside components/shadcn was removed.
- CustomerShell: real Button, DropdownMenu group/items, Avatar/image/fallback; existing navigation and session commands unchanged.
- CustomerPage StatusBadge/heading: real Badge/Separator/Alert/Button; same status intent, title and subtitle CSS.
- CustomerDialog: real Dialog/Content/Title/Description/Close. ControlledDrawer/ResponsiveDrawer/Join camera/Booking OTP: real Sheet/Content/Title/Description/Close; same mounted content responds via CSS below960/bottom and960+/right. Busy and dirty-close callbacks and footer portal remain unchanged.
- Account personal-info/security/preference forms: Field/FieldLabel, Input/Textarea, Checkbox/Switch and Tabs/List/Trigger. Idle MFA discard and all commands unchanged. Existing native required/autocomplete/disabled/OTP normalization preserved.
- BookingFields: real Select/Trigger/Value/Content/Group/Item, Popover/Trigger/Content and Calendar. Existing selected date, today boundary and required branch semantics retained.
- Booking form: FieldGroup/Field/FieldLabel, Input/Textarea and ToggleGroup/Item for timing. Resource selection uses registry Checkbox with approved full-card choice treatment rather than hand-authored role=checkbox Button.
- Contact verification method selection: ToggleGroup/Item, existing method setter and busy protections unchanged.
- All remaining native action buttons and textareas in Customer presentation now use registry Button/Textarea. Explicit native status labels remain semantic status text.
- Home/Reviews swipe: real Carousel/Content/Item and API selection listeners. Home preserves focusability, Home/End and Left/Right controls; select/reInit update selected indicator. Dots use real Button. Empty Home body composes Empty inside approved Card.
- Customer toasts: official Toast/Toaster. Customer-owned notification dispatch now writes directly to the Customer-scoped shadcn toast manager; Mantine notification UI is not mounted.

## Deliberate domain / non-UI exceptions

- Ticket cutouts, pass cover250/logo120, vendor cover/logo, card anatomy, lifecycle rows and layout are domain presentation; no registry widget replaces these specialized layouts.
- Semantic routing links remain React Router Link. Resource/slot/member models and booking/auth/API controllers are unchanged.
- Legacy shared controllers remain logic seams for other surfaces, but the Customer entry no longer mounts MantineProvider, Mantine styles, or the Mantine notification store. Customer-visible presentations use the Customer-scoped registry components.
- Presentation fields that wrap their control retain native label association through FieldLabel. Field frames use display:contents to preserve approved geometry; booking sibling labels/controls use actual Field and FieldGroup.
- No new API endpoint, request body, permission, database, provider, auth destination, or live fixture mutation.
- Existing CSS role recipes customize genuine registry component source. The Customer-only utility stylesheet loads Tailwind theme/utilities without preflight; no Vendor configuration or global preset is modified.

## Verification boundaries

Source/module compliance, rendered prototype fidelity and runtime activation are separate gates. This package does not activate5191, change APIs/DBs, create a PR, merge or deploy.

## Successor finite review corrections
- InputGroup, InputGroupInput, InputGroupAddon and InputGroupButton: Explore search, password visibility fields and booking quantity steppers. Existing commands and values retained.
- Collapsible: booking summary, verified email/phone disclosures. `keepMounted` preserves draft controller state.
- FieldSet/FieldLegend: resource member choices and booking timing groups. ToggleGroup: booking type choices.
- Actual CardHeader/CardContent/CardFooter/Separator replace raw slot stand-ins in ticket, booking, submitted and join entry views.
- Toast dispatch is Customer-scoped and uses the official shadcn/Base UI manager. Controller/API contracts are unchanged.
- Select/Popover positioners 1100 and top-right ToastViewport 2000 preserve overlays above drawer1001. No controller/API contracts changed.

## Shared session warning seam
AuthProvider retains all original timers, state, effects, refresh/logout commands and default Mantine presentation for other surfaces. Customer main supplies the registry Dialog renderer, with outside/Escape dismissal cancelled and no close button. Focused tests compare original controller statements and reconstructed legacy return byte-for-byte and verify exact refresh state transitions.

## Final reachable-route fallback coverage
Exactly11 shared files contain additive optional Customer presentation seams: AuthContext, MaintenanceBoundary, AppErrorBoundary, CustomerDashboardPage, CustomerAccountPage, CustomerBookingDetailPage, JoinedQueuePage, OAuthCallbackPage, LoginPage, RegisterCustomerPage, CustomerApp. Original default visual branches and controller statements are retained. Tests normalize only explicitly listed optional injections; all original effects, guards, handlers and default JSX remain compared unchanged.

| Reachable mode | Customer presentation | Evidence boundary |
| --- | --- | --- |
| Maintenance pending / forced / error / notice | Card, Skeleton, Alert, Button; original heading focus/refetch | Unit controlled fixtures + independent browser pending |
| App render failure / unknown route | Card/Button fallback / Customer404 | Unit controlled fixtures + independent browser pending |
| Home/account initial auth loading | CustomerLoading Card/Skeleton | Source seam/wiring checks; browser pending |
| Booking missing /404/error | CustomerBookingUnavailable Card/actions;404 omits retry | Controlled fixtures; original loadBooking command |
| Arrival QR loading/error/owner missing/retry | CustomerArrivalCode/Status Alert/Button; existing SVG retained | Controlled fixtures; original rotation/disposal unchanged |
| OAuth waiting/error | CustomerOAuthCallback Card/Alert/Button | Controlled fixtures; original safe redirect/effects unchanged |
| Reset-token recovery / MFA | CustomerLoginFallback Field/InputGroup/Button; original RHF/submit; OtpInputField controller has Customer renderer so auto-verify/dedupe retained | Controlled recovery fixture + source invariance; real recovery/OTP pending |
| Stateful registration/claim | CustomerRegistrationFallback; same RHF username/phone commands and claim handoff | Controlled field fixture + source controller equality; real registration pending |
| Session expiry | CustomerSessionWarning Dialog/Button, no dismiss control | Exact request/setter, dismissal and legacy-default tests |

Legacy controller imports remain outside the Customer presentation layer; no Customer visual branch renders Mantine controls through these reachable modes. QR SVG/canvas and external security-provider widget are domain/provider output. No all-device/live/provider acceptance claim.

Required build profile now records VITE_PUBLIC_UNIVERSAL_AUTH=1 explicitly, with public5190 and existing local origins/API unchanged. Source-constant fallback presence in a bundle alone is not proof of reachable rendering; independent QA must check compiled flag1 public redirect.
