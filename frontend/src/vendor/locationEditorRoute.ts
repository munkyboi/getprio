/** Resolve only locations authorized by the current business bootstrap. Slugs win over legacy IDs. */
export function resolveLocationEditor<T extends { id: string; slug: string }>(
  route: string,
  locations: T[],
  authorizedIds: ReadonlySet<string>,
): T | undefined {
  const allowed = locations.filter(item => authorizedIds.has(item.id));
  return allowed.find(item => item.slug === route) || allowed.find(item => item.id === route);
}

export function locationEditorPath(slug: string, search: string): string {
  return `/dashboard/locations/${encodeURIComponent(slug)}/edit${search}`;
}
