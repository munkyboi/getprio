// The Marketing surface owns the public universal entry points. Keep the
// explicit flag for other local/legacy surfaces, but do not let a missing
// build variable silently replace Marketing's login/register UI with the
// legacy cross-app fallback.
export const publicUniversalAuthEnabled = import.meta.env?.VITE_APP_SURFACE === "marketing" || import.meta.env?.VITE_PUBLIC_UNIVERSAL_AUTH === "1" || (typeof window !== "undefined" && window.location.hostname === "getprio.online");
