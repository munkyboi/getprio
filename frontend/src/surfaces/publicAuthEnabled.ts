export const publicUniversalAuthEnabled = import.meta.env?.VITE_PUBLIC_UNIVERSAL_AUTH === "1" || (typeof window !== "undefined" && window.location.hostname === "getprio.online");
