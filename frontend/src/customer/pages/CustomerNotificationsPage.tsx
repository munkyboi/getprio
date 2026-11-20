import { FieldLabel } from "../components/shadcn/field";
import type { CustomerNotificationSettings } from "@shared";
import { Switch } from "../components/shadcn/switch";
import { RefreshCw, Ticket, CalendarDays } from "lucide-react";
import { CustomerDialog } from "../components/details/CustomerDialog";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell as IconBell,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../api/client";
import { getErrorMessage } from "../../utils/errors";
import {
  groupInboxNotifications,
  notificationListLink,
} from "../components/account/inboxPresentation";
import { Button, Card } from "../components/ui";
import {
  CustomerPage,
  CustomerError,
} from "../components/account/CustomerPage";
type Inbox = {
  notifications: Array<{
    id: string;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
    kind: string;
  }>;
  unreadCount: number;
  totalCount: number;
  nextCursor: string | null;
  snapshotCutoff: string;
};
export default function CustomerNotificationsPage() {
  const { user, token, loading } = useAuth();
  const [pages, setPages] = useState<string[]>([]);
  const [clearOpen, setClearOpen] = useState(false);
  const [loaded, setLoaded] = useState<Inbox["notifications"]>([]);
  const client = useQueryClient();
  const cursor = pages.at(-1);
  const inbox = useQuery({
    queryKey: ["customer-inbox", user?.id, cursor],
    queryFn: ({ signal }) =>
      apiRequest<Inbox>(
        `/account/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { token: token!, signal },
      ),
    enabled: !!token,
  });
  useEffect(() => {
    if (inbox.data)
      setLoaded((old) =>
        cursor
          ? [
              ...new Map(
                [...old, ...inbox.data.notifications].map((n) => [n.id, n]),
              ).values(),
            ]
          : inbox.data.notifications,
      );
  }, [inbox.data, cursor]);
  const preference = useQuery({
    queryKey: ["customer-notification-preference", user?.id],
    queryFn: () =>
      apiRequest<{ notificationSettings: CustomerNotificationSettings }>(
        "/account/notification-settings",
        { token: token! },
      ),
    enabled: !!token,
  });
  const toggle = useMutation({
    mutationFn: (queueAlerts: boolean) =>
      apiRequest<{ notificationSettings: CustomerNotificationSettings }>(
        "/account/notification-settings",
        {
          method: "PATCH",
          token: token!,
          body: { ...preference.data!.notificationSettings, queueAlerts },
        },
      ),
    onSuccess: (data) => {
      client.setQueryData(["customer-notification-preference", user?.id], data);
      void client.invalidateQueries({ queryKey: ["customer-account", token] });
    },
  });
  const action = useMutation({
    mutationFn: ({ path, before }: { path: string; before?: string }) =>
      apiRequest(`/account/notifications/${path}`, {
        method: "POST",
        token: token!,
        body: before ? { before } : undefined,
      }),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["customer-inbox", user?.id] }),
  });
  if (loading) return <p role="status">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <CustomerPage
      title="Notifications"
      subtitle="Updates about your queues and bookings."
    >
      <div className="customer-inbox-preference inbox-preference">
        <FieldLabel className="customer-switch-row">
          <span>
            <strong>Queue alerts</strong>
            <p>Updates as your place in line changes.</p>
          </span>
          {preference.data ? <Switch
            aria-label="Queue alerts"
            className="customer-switch"
            checked={preference.data?.notificationSettings.queueAlerts ?? false}
            disabled={!preference.data || toggle.isPending}
            onCheckedChange={(value) => toggle.mutate(value)}
          >

          </Switch> : <span role="status">{preference.error ? "Setting unavailable" : "Loading setting…"}</span>}
        </FieldLabel>
        <Link to="/account/notification-settings?from=inbox">
          Notification settings
        </Link>
        {preference.error ? <CustomerError error={getErrorMessage(preference.error)} retry={() => void preference.refetch()} /> : null}
        {toggle.error ? (
          <CustomerError error={getErrorMessage(toggle.error)} />
        ) : null}
      </div>
      <div className="customer-action-row customer-inbox-actions">
        <Button
          variant="outline"
          disabled={
            !inbox.data?.snapshotCutoff ||
            action.isPending ||
            !inbox.data.unreadCount
          }
          onClick={() =>
            action.mutate({
              path: "read-all",
              before: inbox.data!.snapshotCutoff,
            })
          }
        >
          Mark all read
        </Button>
        <Button
          variant="outline"
          disabled={!inbox.data?.totalCount || action.isPending}
          onClick={() => setClearOpen(true)}
        >
          Empty inbox
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setPages([]);
            void inbox.refetch();
          }}
        >
          <RefreshCw />
          Refresh
        </Button>
      </div>
      <p className="inbox-summary">
          {inbox.data?.unreadCount ?? "—"} unread ·{" "}
          {inbox.data?.totalCount ?? "—"} total
        </p>
      {inbox.isLoading ? <p role="status">Loading notifications…</p> : null}
      {inbox.error || action.error ? (
        <CustomerError
          error={getErrorMessage(inbox.error || action.error)}
          retry={() => void inbox.refetch()}
        />
      ) : null}
      <div className="customer-record-list">
        {groupInboxNotifications(loaded).map((group) => (
          <section
            key={group.key}
            aria-label={group.label}
            className="inbox-group"
          >
            <h2>{group.label}</h2>
            {group.notifications.map((n) => (
              <div key={n.id}>
              <Button variant="ghost" type="button" className="inbox-row" data-slot="button" key={n.id} data-read={!!n.readAt} disabled={action.isPending} onClick={() => { if (!n.readAt) action.mutate({path: `${encodeURIComponent(n.id)}/read`}); }}>
                {n.kind.includes("booking") ? <CalendarDays /> : n.kind.includes("queue") ? <Ticket /> : <IconBell />}
                <span className="inbox-notification-copy"><strong>{n.title}</strong><span>{n.body}</span><time>{new Date(n.createdAt).toLocaleTimeString("en-PH", {hour:"numeric",minute:"2-digit"})}</time></span>
                {!n.readAt ? <span className="inbox-unread-dot" aria-label="Unread" /> : null}
              </Button>
              {notificationListLink(n.kind) ? <Link to={notificationListLink(n.kind)!.to}>{notificationListLink(n.kind)!.label}</Link> : null}
              </div>
            ))}
          </section>
        ))}
        {inbox.data?.notifications.length === 0 ? (
          <Card>
            <h2>You&apos;re all caught up</h2>
            <p>New updates will appear here.</p>
          </Card>
        ) : null}
      </div>
      <div className="customer-action-row">
        {inbox.data?.nextCursor ? (
          <Button
            variant="outline"
            onClick={() => setPages((p) => [...p, inbox.data!.nextCursor!])}
          >
            Load more
          </Button>
        ) : null}
      </div>
      <CustomerDialog
        title="Empty your inbox?"
        description="This removes notifications in the current snapshot. New updates will still arrive."
        open={clearOpen}
        busy={action.isPending}
        onOpenChange={setClearOpen}
        footer={
          <>
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() => setClearOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={action.isPending || !inbox.data?.snapshotCutoff}
              onClick={() =>
                action.mutate(
                  { path: "clear", before: inbox.data!.snapshotCutoff },
                  {
                    onSuccess: () => {
                      setClearOpen(false);
                      setPages([]);
                    },
                  },
                )
              }
            >
              Empty inbox
            </Button>
          </>
        }
      />
    </CustomerPage>
  );
}
