/** Local Google callback is registered for localhost, not IP loopback hosts. */
export function localGoogleAvailable(enabled: boolean, localSurfaces: boolean, hostname: string | undefined): boolean {
  const host = hostname?.toLowerCase();
  return enabled && !(localSurfaces && (host === "127.0.0.1" || host === "[::1]" || host === "::1"));
}
