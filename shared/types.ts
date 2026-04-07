export type OAuthProviderId = "google" | "facebook";
export type AuthIntent = "login" | "register_customer" | "register_vendor";
export type UserRole = "customer" | "vendor";
export type TenantRole = "owner" | "staff";
export type JoinChannel = "online" | "qr" | "vendor";
export type TicketStatus = "waiting" | "called" | "served" | "skipped" | "cancelled";

export interface TenantMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: TenantRole;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: UserRole[];
  emailVerified: boolean;
  hasPassword: boolean;
  oauthProviders: OAuthProviderId[];
  lastLoginProvider: string | null;
  tenants: TenantMembershipSummary[];
}

export interface OAuthProviderAvailability {
  google: boolean;
  facebook: boolean;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  queuePrefix: string;
  averageServiceMinutes: number;
  notificationThreshold: number;
  contactEmail: string;
  contactPhone: string;
  joinUrl: string;
  monitorUrl: string;
}

export interface QueueStats {
  waitingCount: number;
  servedToday: number;
  currentTicketNumber: string | null;
  estimatedWaitMinutes: number;
}

export interface QueueCurrentTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  calledAt: string | Date | null;
}

export interface QueueListTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  status: TicketStatus;
  position: number;
  joinChannel: JoinChannel;
  createdAt: string | Date;
}

export interface QueueHistoryTicket {
  id: string;
  ticketNumber: string;
  customerName: string;
  status: TicketStatus;
  updatedAt: string | Date;
}

export interface QueueFocusTicket {
  id: string;
  lookupCode: string;
  ticketNumber: string;
  customerName: string;
  status: TicketStatus;
  position: number | null;
  estimatedWaitMinutes: number;
  joinedAt: string | Date;
}

export interface QueueSnapshot {
  tenant: TenantSummary;
  stats: QueueStats;
  current: QueueCurrentTicket | null;
  nextUp: QueueListTicket[];
  history: QueueHistoryTicket[];
  focusTicket: QueueFocusTicket | null;
}

export interface AuthResponse {
  token: string;
  user: UserSummary;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterCustomerRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterVendorRequest {
  tenantName: string;
  tenantSlug: string;
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface CompleteVendorOnboardingRequest {
  tenantName: string;
  tenantSlug: string;
  name: string;
  email: string;
  phone: string;
}

export interface JoinQueueRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notes: string;
  joinChannel: JoinChannel;
}

export interface CreateWalkInTicketRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notes: string;
}

export interface UpdateTenantSettingsRequest {
  queuePrefix: string;
  averageServiceMinutes: number | string;
  notificationThreshold: number | string;
  contactEmail: string;
  contactPhone: string;
}

export interface TicketMutationResponse {
  ticket: {
    id: string;
    lookupCode?: string;
    ticketNumber: string;
    customerName?: string;
    status: TicketStatus;
  };
  snapshot: QueueSnapshot;
}

export interface QueueHistoryResponse {
  tickets: QueueHistoryTicket[];
}

export interface OAuthProvidersResponse {
  providers: OAuthProviderAvailability;
}
