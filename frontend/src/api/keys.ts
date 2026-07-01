export const queryKeys = {
  vendorDashboard: {
    bootstrap: (token: string | undefined, tenantSlug: string, locationSlug: string, locationQuery: string) =>
      ["vendor-dashboard-bootstrap", token, tenantSlug, locationSlug, locationQuery] as const,
    staff: (token: string | undefined, tenantSlug: string) =>
      ["vendor-dashboard-staff", token, tenantSlug] as const,
    services: (token: string | undefined, tenantSlug: string, isOwner: boolean, isAdmin: boolean) =>
      ["vendor-dashboard-services", token, tenantSlug, isOwner, isAdmin] as const,
    availability: (
      token: string | undefined,
      tenantSlug: string,
      locationSlug: string,
      isOwner: boolean,
      isAdmin: boolean
    ) => ["vendor-dashboard-availability", token, tenantSlug, locationSlug, isOwner, isAdmin] as const,
    counters: (token: string | undefined, tenantSlug: string, locationSlug: string) =>
      ["vendor-dashboard-counters", token, tenantSlug, locationSlug] as const,
    history: (
      token: string | undefined,
      tenantSlug: string,
      locationSlug: string,
      section: string,
      hasActiveSubscription: boolean
    ) => ["vendor-dashboard-history", token, tenantSlug, locationSlug, section, hasActiveSubscription] as const,
    clients: (
      token: string | undefined,
      tenantSlug: string,
      locationSlug: string,
      section: string,
      hasActiveSubscription: boolean,
      locationQuery: string
    ) => ["vendor-dashboard-clients", token, tenantSlug, locationSlug, section, hasActiveSubscription, locationQuery] as const,
    bookings: (
      token: string | undefined,
      tenantSlug: string,
      locationSlug: string,
      page: number,
      search: string,
      status: string,
      date: string
    ) => ["vendor-dashboard-bookings", token, tenantSlug, locationSlug, page, search, status, date] as const,
    bookingAlerts: (token: string | undefined, tenantSlug: string, locationSlug: string) =>
      ["vendor-dashboard-booking-alerts", token, tenantSlug, locationSlug] as const
  },
  customerAccount: {
    overview: (token: string | undefined) => ["customer-account", token] as const
  }
} as const;
