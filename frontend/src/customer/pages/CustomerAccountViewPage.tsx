import { customerTicketStatus } from "../utils/customerTicketStatus";
import { CustomerLoading } from "../components/CustomerFallbackPresentations";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/shadcn/collapsible";
import { Field, FieldLabel, FieldGroup, FieldContent, FieldDescription } from "../components/shadcn/field";
import { CustomerDialog } from "../components/details/CustomerDialog";
import { CustomerSecurityTask } from "../components/security/CustomerSecurityView";
import { CustomerFavorites } from "./CustomerFavoritesPage";
import { PersonalInfoDrawer } from "../components/security/PersonalInfoDrawer";
import PhoneChangePanel from "../../components/PhoneChangePanel";
import {
  CustomerEmailChangeView,
  CustomerPhoneChangeView,
} from "../components/security/CustomerVerifiedChanges";
import { CustomerSecurityView } from "../components/security/CustomerSecurityView";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "../components/shadcn/tabs";
import { Switch } from "../components/shadcn/switch";
import {
  Camera as IconCamera,
  UserRound as IconUser,
  Heart as IconHeart,
  Sun as IconSun,
  Bell as IconBell,
  ShieldCheck as IconShield,
  LogOut as IconLogout,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import CustomerAccountPage, {
  type CustomerAccountPresentationModel,
} from "../../pages/CustomerAccountPage";
import { useAuth } from "../../context/AuthContext";
import { buildJoinedQueuePathWithTicket } from "../../queuePaths";
import {
  formatDateTime,
  formatBookingScheduleDate,
  formatBookingScheduleTimeRange,
} from "../../utils/dates";
import { BookingSelect } from "../components/booking/BookingFields";
import { useCustomerTheme } from "../CustomerTheme";
import {
  Button,
  Card, CardHeader, CardTitle, CardContent,
  Input,
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "../components/ui";
import { ResponsiveDrawer } from "../components/vendor/ResponsiveDrawer";
import {
  CustomerPage,
  CustomerError,
  StatusBadge,
} from "../components/account/CustomerPage";
function ListTabs({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(String(v))}>
      <TabsList className="customer-segmented-tabs" aria-label="Visit history">
        <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
function Pagination({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (v: number) => void;
}) {
  return total > 1 ? (
    <div className="customer-action-row">
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span>
        Page {page} of {total}
      </span>
      <Button
        variant="outline"
        disabled={page >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  ) : null;
}
function AccountView({
  model: m,
}: {
  model: CustomerAccountPresentationModel;
}) {
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "history" ? "history" : "upcoming";
  const { logout, token, refreshUser } = useAuth();
  const theme = useCustomerTheme();
  const title =
    m.section === "tickets"
      ? "Queue tickets"
      : m.section === "bookings"
        ? "Bookings"
        : m.section === "notifications"
          ? "Notification settings"
          : m.section === "security"
            ? "Security"
            : "Profile";
  const tickets = m.tickets.filter((t) =>
    view === "upcoming"
      ? ["waiting", "called"].includes(t.status)
      : !["waiting", "called"].includes(t.status),
  );
  const bookings = m.bookings.filter((b) =>
    view === "upcoming"
      ? ["pending", "confirmed", "rescheduled"].includes(b.status)
      : !["pending", "confirmed", "rescheduled"].includes(b.status),
  );
  return (
    <CustomerPage
      title={title}
      subtitle={
        m.section === "tickets"
          ? "Review your current and past queue visits."
          : m.section === "bookings"
            ? "Review your upcoming and past appointments."
            : m.section === "settings"
              ? "Manage your account and preferences."
              : undefined
      }
      back={
        m.section === "notifications"
          ? params.get("from") === "inbox"
            ? "/account/notifications"
            : "/account/settings"
          : m.section === "security"
            ? "/account/settings"
            : m.section === "tickets" || m.section === "bookings"
              ? "/account/lists"
              : undefined
      }
    >
      {m.loading ? (
        <p role="status">Loading your account…</p>
      ) : m.error && m.section !== "security" ? (
        <CustomerError error={m.error} retry={m.refresh} />
      ) : null}
      {m.section === "tickets" || m.section === "bookings" ? (
        <>
          <ListTabs
            value={view}
            onChange={(v) => {
              setParams({ view: v });
            }}
          />
          {m.section === "bookings" ? (
            <div className="customer-page-stack">
              <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                Search bookings
                <Input
                  value={m.bookingSearch}
                  onChange={(e) => m.setBookingSearch(e.target.value)}
                  placeholder="Business or service"
                />
              </FieldLabel></Field>
              <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                Status
                <BookingSelect
                  label="Booking status"
                  disabled={false}
                  value={m.bookingStatusFilter}
                  onChange={(value) =>
                    m.setBookingStatusFilter(
                      value as typeof m.bookingStatusFilter,
                    )
                  }
                  options={[
                    "all",
                    "pending",
                    "confirmed",
                    "rescheduled",
                    "completed",
                    "canceled",
                    "reviewed",
                    "disputed",
                  ].map((value) => ({
                    value,
                    label:
                      value === "all"
                        ? "All statuses"
                        : value.replaceAll("_", " "),
                  }))}
                />
              </FieldLabel></Field>
              <div className="customer-two-columns">
                <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                  From
                  <Input
                    type="date"
                    value={m.bookingDateRange[0] || ""}
                    onChange={(e) =>
                      m.setBookingDateRange((r) => [
                        e.target.value || null,
                        r[1],
                      ])
                    }
                  />
                </FieldLabel></Field>
                <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                  Until
                  <Input
                    type="date"
                    value={m.bookingDateRange[1] || ""}
                    onChange={(e) =>
                      m.setBookingDateRange((r) => [
                        r[0],
                        e.target.value || null,
                      ])
                    }
                  />
                </FieldLabel></Field>
              </div>
            </div>
          ) : null}
          {m.section === "tickets" ? (
            <div className="customer-record-list">
              {tickets.map((t) => (
                <Link
                  className={view === "history" ? "customer-record-card customer-history-row" : "customer-record-card"}
                  key={t.id}
                  to={buildJoinedQueuePathWithTicket(
                    t.tenantSlug,
                    t.lookupCode,
                    t.locationSlug,
                  )}
                >
                  <div className="customer-inline-between">
                    <h2>{t.tenantName}</h2>
                    <StatusBadge status={customerTicketStatus(t).label} />
                  </div>
                  <strong className="customer-ticket-number">
                    {t.ticketNumber}
                  </strong>
                  <p>{t.locationName}</p>
                  <small>Joined {formatDateTime(t.createdAt)}</small>
                  <IconChevronRight className="customer-record-chevron" />
                </Link>
              ))}
              {!m.loading && !m.error && !tickets.length ? (
                <Card>
                  <h2>
                    {view === "upcoming"
                      ? "No active queue tickets"
                      : "No past queue tickets on this page"}
                  </h2>
                  <p>Your queue visits will appear here.</p>
                </Card>
              ) : null}
              <Pagination
                page={m.ticketPage}
                total={m.ticketPagination?.totalPages || 1}
                onChange={m.setTicketPage}
              />
            </div>
          ) : (
            <div className="customer-record-list">
              {bookings.map((b) => (
                <Link
                  className={view === "history" ? "customer-record-card customer-history-row" : "customer-record-card"}
                  key={b.id}
                  to={`/account/bookings/${b.id}`}
                >
                  <div className="customer-inline-between">
                    <h2>{b.tenantName}</h2>
                    <StatusBadge status={b.status} />
                  </div>
                  <strong>{b.reference}</strong>
                  <p>
                    {b.locationName} · {b.serviceName}
                  </p>
                  <p>{formatBookingScheduleDate(b.scheduledStartAt)}</p>
                  <p>
                    {formatBookingScheduleTimeRange(
                      b.scheduledStartAt,
                      b.scheduledEndAt,
                    )}
                  </p>
                  <StatusBadge status={b.paymentStatus} />
                  <IconChevronRight className="customer-record-chevron" />
                </Link>
              ))}
              {!m.loading && !m.error && !bookings.length ? (
                <Card>
                  <h2>
                    No {view === "upcoming" ? "upcoming" : "past"} bookings on
                    this page
                  </h2>
                  <p>Browse vendors to plan your next visit.</p>
                </Card>
              ) : null}
              <Pagination
                page={m.bookingPage}
                total={m.bookingPagination?.totalPages || 1}
                onChange={m.setBookingPage}
              />
            </div>
          )}
        </>
      ) : null}
      {m.section === "settings" ? (
        <>
          <Card className="customer-profile-summary profile-head">
            <PersonalInfoDrawer
              title="Profile photo"
              description="Choose a photo that helps people recognise you."
              busy={m.uploadingAvatar}
              dirty={Boolean(m.avatarFile)}
              onDiscard={() => m.handleAvatarFileChange(null)}
              trigger={
                <><Avatar>
                  {m.account?.user.avatarUrl ? (
                    <AvatarImage src={m.account.user.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {(m.account?.user.name || m.user.name).slice(0, 1)}
                  </AvatarFallback>
                </Avatar><IconCamera className="customer-profile-camera" aria-hidden="true" /></>
              }
              footer={
                <Button
                  disabled={!m.avatarFile || m.uploadingAvatar}
                  onClick={() => void m.handleAvatarUpload()}
                >
                  {m.uploadingAvatar ? "Saving…" : "Save photo"}
                </Button>
              }
            >
              <div className="customer-page-stack">
                <img
                  className="customer-avatar-large-preview"
                  src={
                    m.avatarPreviewUrl ||
                    m.account?.user.avatarUrl ||
                    "/logo.svg"
                  }
                  alt="Profile photo preview"
                />
                <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                  {m.avatarFile ? "Change selection" : "Choose photo"}
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) =>
                      m.handleAvatarFileChange(e.target.files?.[0] || null)
                    }
                  />
                </FieldLabel></Field>
                <p>
                  JPEG, PNG or WebP.
                  {m.maxImageUploadKb ? ` Up to ${m.maxImageUploadKb} KB.` : ""}
                </p>
              </div>
            </PersonalInfoDrawer>
            <div>
              <h2>{m.account?.user.displayName || m.user.name}</h2>
              <p>{m.account?.user.email || m.user.email}</p>
              {m.account?.user.emailVerified === false ? <p className="email-unverified">Email not verified</p> : null}
            </div>
          </Card>
          <Card className="customer-profile-menu">
            <h2>Account</h2>
            <PersonalInfoDrawer
              busy={m.savingProfile || m.uploadingAvatar}
              dirty={
                Boolean(m.avatarFile) ||
                m.profileForm.name !== (m.account?.user.name || m.user.name) ||
                (m.profileForm.displayName || "") !==
                  (m.account?.user.displayName || "")
              }
              onDiscard={() => {
                m.setProfileForm({
                  name: m.account?.user.name || m.user.name,
                  displayName: m.account?.user.displayName || "",
                });
                m.handleAvatarFileChange(null);
              }}
              footer={
                <Button
                  form="customer-personal-info"
                  type="submit"
                  disabled={m.savingProfile}
                >
                  {m.savingProfile ? "Saving…" : "Save details"}
                </Button>
              }
              trigger={
                <>
                  <IconUser />
                  <span className="customer-settings-copy">
                    <strong>Personal info</strong>
                    <span>Name, email, and account details</span>
                  </span>
                  <IconChevronRight />
                </>
              }
            >
              <form
                id="customer-personal-info"
                className="customer-page-stack"
                onSubmit={m.handleProfileSave}
              >
                <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                  Full name
                  <Input
                    required
                    value={m.profileForm.name}
                    onChange={(e) =>
                      m.setProfileForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </FieldLabel></Field>
                <Field className="customer-shadcn-field"><FieldLabel className="customer-field">
                  Display name
                  <Input
                    maxLength={60}
                    value={m.profileForm.displayName || ""}
                    onChange={(e) =>
                      m.setProfileForm((f) => ({
                        ...f,
                        displayName: e.target.value,
                      }))
                    }
                  />
                </FieldLabel></Field>
              </form>
              <Field className="customer-shadcn-field customer-contact-field"><FieldLabel className="customer-field">
                Email
                <Input readOnly value={m.account?.user.email || m.user.email || ""} />
              </FieldLabel>
                <Collapsible className="customer-verified-change">
                  <CollapsibleTrigger render={<Button variant="link" className="customer-contact-change-link" />}>Change email</CollapsibleTrigger>
                  <CollapsibleContent keepMounted>{m.emailChange}</CollapsibleContent>
                </Collapsible>
              </Field>
              <Field className="customer-shadcn-field customer-contact-field"><FieldLabel className="customer-field">
                Phone
                <Input readOnly value={m.account?.user.phone || m.user.phone || ""} />
              </FieldLabel>
                <Collapsible className="customer-verified-change">
                  <CollapsibleTrigger render={<Button variant="link" className="customer-contact-change-link" />}>Change phone</CollapsibleTrigger>
                  <CollapsibleContent keepMounted>
                  <PhoneChangePanel
                    token={token || ""}
                    currentPhone={m.account?.user.phone || m.user.phone}
                    onCompleted={async () => {
                      await refreshUser();
                      m.refresh();
                    }}
                    renderPresentation={(model) => (
                      <CustomerPhoneChangeView model={model} />
                    )}
                  />
                  </CollapsibleContent>
                </Collapsible>
              </Field>
            </PersonalInfoDrawer>
            <ResponsiveDrawer
              title="Favorites"
              description="Your saved vendors"
              trigger={
                <>
                  <IconHeart />
                  <span className="customer-settings-copy">
                    <strong>Favorites</strong>
                    <span>Your saved vendors</span>
                  </span>
                  <IconChevronRight />
                </>
              }
            >
              <CustomerFavorites />
            </ResponsiveDrawer>
            <h2>Settings</h2>
            <ResponsiveDrawer
              title="Appearance"
              trigger={
                <>
                  <IconSun />
                  <span className="customer-settings-copy">
                    <strong>Appearance</strong>
                    <span>Light, dark, or system</span>
                  </span>
                  <IconChevronRight />
                </>
              }
            >
              <div className="customer-page-stack">
                <p>Choose how GetPrio looks on this device.</p>
                <Tabs
                  value={theme.preference}
                  onValueChange={(v) =>
                    theme.setPreference(v as "light" | "dark" | "system")
                  }
                >
                  <TabsList
                    className="customer-segmented-tabs"
                    aria-label="Appearance"
                  >
                    {(["light", "dark", "system"] as const).map((v) => (
                      <TabsTrigger value={v} key={v}>
                        {v[0].toUpperCase() + v.slice(1)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            </ResponsiveDrawer>
            <Button
              variant="ghost"
              render={<Link to="/account/notification-settings" />}
            >
              <IconBell />
              <span className="customer-settings-copy">
                <strong>Notifications</strong>
                <span>Queue alerts and booking reminders</span>
              </span>
              <IconChevronRight />
            </Button>
            <h2>Security</h2>
            {(
              [
                ["password", "Password", "Change your password"],
                [
                  "mfa",
                  "Multi-factor authentication",
                  "Manage sign-in verification",
                ],
                ["deletion", "Delete account", "Request account deletion"],
              ] as const
            ).map(([task, label, description]) => (
              <PersonalInfoDrawer
                key={task}
                title={label}
                description={description}
                busy={false}
                dirty={false}
                onDiscard={() => {}}
                footer={<></>}
                trigger={
                  <>
                    <IconShield />
                    <span className="customer-settings-copy">
                      <strong>{label}</strong>
                      <span>{description}</span>
                    </span>
                    <IconChevronRight />
                  </>
                }
              >
                <CustomerSecurityTask.Provider value={task}>
                  {m.security}
                </CustomerSecurityTask.Provider>
              </PersonalInfoDrawer>
            ))}
            <Button variant="ghost" onClick={() => setLogoutOpen(true)}>
              <IconLogout />
              <span className="customer-settings-copy">
                <strong>Log out</strong>
                <span>Sign out of your account</span>
              </span>
              <IconChevronRight />
            </Button>
            <CustomerDialog
              title="Log out?"
              description="You can sign back in whenever you need."
              open={logoutOpen}
              onOpenChange={setLogoutOpen}
              footer={
                <>
                  <Button
                    variant="outline"
                    onClick={() => setLogoutOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => void logout()}>Log out</Button>
                </>
              }
            />
          </Card>
        </>
      ) : null}
      {m.section === "notifications" ? (
        <Card className="customer-notification-card">
          <CardHeader><CardTitle>Your alerts</CardTitle></CardHeader>
          <CardContent><FieldGroup className="customer-notification-fields">
          {(["queueAlerts", "bookingAlerts"] as const).map((key) => (
            <Field orientation="horizontal" className="customer-notification-row" key={key}>
              <FieldContent>
                <FieldLabel htmlFor={`customer-notification-${key}`}>
                  {key === "queueAlerts" ? "Queue alerts" : "Booking reminders"}
                </FieldLabel>
                <FieldDescription>
                  {key === "queueAlerts"
                    ? "Updates as your place in line changes."
                    : "Updates about your scheduled visits."}
                </FieldDescription>
              </FieldContent>
              <Switch
                id={`customer-notification-${key}`}
                className="customer-switch"
                checked={m.notificationSettings[key]}
                disabled={m.savingNotificationSettings}
                onCheckedChange={(v) => void m.handleNotificationToggle(key, v)}
              />
            </Field>
          ))}
          <Field className="customer-notification-contact"><FieldLabel className="customer-field">
            Preferred contact method
            <BookingSelect
              label="Preferred contact method"
              disabled={m.savingNotificationSettings}
              value={m.notificationSettings.preferredContactMethod}
              options={[
                { value: "in_app", label: "In-app / push" },
                { value: "email", label: "Email" },
                { value: "sms", label: "SMS" },
              ]}
              onChange={(value) =>
                void m.onPreferredContactChange(
                  value as typeof m.notificationSettings.preferredContactMethod,
                )
              }
            />
          </FieldLabel></Field>
          <Field className="customer-notification-browser">
          <h3>Browser notifications</h3>
          <FieldDescription>
            {m.browserPermission === "denied"
              ? "Notifications are blocked in your browser settings."
              : m.browserPushSubscribed
                ? "This browser is connected."
                : "Allow alerts in this browser."}
          </FieldDescription>
          <Button
            variant="outline"
            disabled={
              !m.browserNotificationsSupported ||
              !m.browserNotificationsSecure ||
              m.requestingBrowserPermission ||
              m.browserPushSubscribed
            }
            onClick={() => void m.handleRequestBrowserPermission()}
          >
            {m.requestingBrowserPermission
              ? "Connecting…"
              : "Enable browser notifications"}
          </Button>
          </Field>
          </FieldGroup></CardContent>
        </Card>
      ) : null}
      {m.section === "security" ? m.security : null}
    </CustomerPage>
  );
}
export default function CustomerAccountViewPage() {
  return (
    <CustomerAccountPage
      renderLoading={CustomerLoading}
      renderSecurityPresentation={(model) => (
        <CustomerSecurityView model={model} />
      )}
      renderEmailChangePresentation={(model) => (
        <CustomerEmailChangeView model={model} />
      )}
      renderPresentation={(model) => <AccountView model={model} />}
    />
  );
}
