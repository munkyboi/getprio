/** Groups the returned page only; never infers notification targets from message text. */
export function groupInboxNotifications<T extends { createdAt: string }>(
  notifications: T[],
  now = new Date(),
) {
  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const groups = new Map<
    string,
    { key: string; label: string; notifications: T[] }
  >();
  for (const notification of notifications) {
    const date = new Date(notification.createdAt);
    const valid = Number.isFinite(date.getTime());
    const key = valid ? dayKey(date) : "unknown";
    const label = !valid
      ? "Earlier updates"
      : key === dayKey(now)
        ? "Today"
        : key === dayKey(yesterday)
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-PH", {
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(date);
    const group = groups.get(key) ?? { key, label, notifications: [] };
    group.notifications.push(notification);
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function notificationListLink(
  kind: string,
): { to: string; label: string } | null {
  if (kind.startsWith("booking"))
    return { to: "/account/bookings", label: "View all bookings" };
  if (kind.startsWith("queue") || kind.startsWith("ticket"))
    return { to: "/account/tickets", label: "View all queue tickets" };
  return null;
}
