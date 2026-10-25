/** Explicit local-preview opt-in; never a production resource-readiness assertion. */
export function isLocalPoolPreviewEnabled({dev, localSurfaces, localPoolDemo, hostname}: {
  dev: boolean; localSurfaces?: string; localPoolDemo?: string; hostname: string;
}) {
  return Boolean((dev || localSurfaces === "1") && localPoolDemo === "1" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(hostname));
}

export const localPoolPreviewEnabled = isLocalPoolPreviewEnabled({
  dev: import.meta.env?.DEV === true,
  localSurfaces: import.meta.env?.VITE_LOCAL_SURFACES,
  localPoolDemo: import.meta.env?.VITE_LOCAL_POOL_DEMO,
  hostname: typeof window === "undefined" ? "" : window.location.hostname,
});
