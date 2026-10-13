export const operationSections = new Set(["queue", "bookings", "clients", "history", "account"]);

export function sectionWorkspace(section, requested, canAdmin) {
  if (!canAdmin) return "operations";
  if (section === "account") return requested === "administration" ? requested : "operations";
  return operationSections.has(section) ? "operations" : "administration";
}

/** @template {{ section: string }} T
 * @param {T[]} items
 * @param {string} workspace
 * @returns {T[]}
 */
export function workspaceItems(items, workspace) {
  return items.filter((item) => item.section === "account" ||
    operationSections.has(item.section) === (workspace === "operations"));
}

export function workspacePath(section, workspace, search = "", hash = "") {
  const params = new URLSearchParams(search);
  params.set("workspace", workspace);
  return `/dashboard/${section}?${params.toString()}${hash}`;
}

export function preferenceKey(userId, tenantSlug) {
  return `getprio.vendor.workspace:${userId}:${tenantSlug}`;
}

/** @template {{ isActive?: boolean }} T @param {T[]} memberships @returns {T[]} */
export function activeMemberships(memberships = []) {
  return memberships.filter((membership) => membership.isActive !== false);
}

export function rememberedTenantWorkspace(userId, tenant, storage) {
  if (tenant.role === "staff") return "operations";
  return readPreference(preferenceKey(userId, tenant.slug), storage) === "administration"
    ? "administration" : "operations";
}

export function readPreference(key, storage) {
  try { return (storage || window.localStorage).getItem(key); } catch { return null; }
}

export function savePreference(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* Optional preferences cannot block operations. */ }
}
