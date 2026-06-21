export type OAuthProviderId = "google" | "facebook";
export type AuthIntent = "login" | "register_customer" | "register_vendor";
export type UserRole = "customer" | "vendor" | "platform_admin";
export type TenantRole = "owner" | "admin" | "staff";
export type JoinChannel = "online" | "qr" | "vendor";
export type TicketStatus = "waiting" | "called" | "served" | "skipped" | "cancelled" | "unserved";
export type SubscriptionPlanSlug = "economical" | "pro" | "enterprise";
export type SubscriptionStatus = "active" | "unpaid" | "past_due" | "canceled" | "expired";
export type BillingInterval = "monthly" | "annual" | "custom";
export type SmsBundleType = "none" | "fixed" | "custom";
export type SupportLevel = "self_serve" | "standard" | "sla";
export type HistoryExportRange = "today" | "week" | "month" | "quarter" | "year";

export interface SubscriptionEntitlements {
  locations: number;
  counters: number;
  staffSeats: number;
  monthlyTickets: number;
  monthlyTransactionalEmails: number | null;
  historyDays: number;
  historyLabel: string;
  emailAlerts: boolean;
  smsAllowance: number;
  smsBundleType: SmsBundleType;
  qrJoinPage: boolean;
  publicQueueBoard: boolean;
  basicDashboard: boolean;
  queueSettings: boolean;
  brandedQueuePages: boolean;
  analytics: boolean;
  csvExport: boolean;
  pdfExport: boolean;
  allowedHistoryExportRanges: HistoryExportRange[];
  advancedRoles: boolean;
  slaSupport: boolean;
  supportLevel: SupportLevel;
  customDomain: boolean;
  sso: boolean;
}

export interface SubscriptionPlan {
  slug: SubscriptionPlanSlug;
  name: string;
  price: {
    currency: "PHP";
    monthlyAmountCents: number;
    monthlyDisplay: string;
    annualAmountCents: number;
    annualDisplay: string;
  };
  bestFor: string;
  checkoutEnabled: boolean;
  entitlements: SubscriptionEntitlements;
  included: string[];
}

export interface BillingAddOn {
  slug: string;
  name: string;
  priceDisplay: string;
}

export interface TenantSubscriptionSummary {
  id: string;
  planSlug: SubscriptionPlanSlug;
  planName: string;
  status: SubscriptionStatus;
  provider: string;
  billingInterval: BillingInterval;
  currentPeriodStart: string | Date | null;
  currentPeriodEnd: string | Date | null;
  entitlements: SubscriptionEntitlements;
}

export interface BillingOverviewResponse {
  plans: SubscriptionPlan[];
  addOns: BillingAddOn[];
  subscription: TenantSubscriptionSummary | null;
}

export interface CreateCheckoutRequest {
  planSlug: SubscriptionPlanSlug;
  billingInterval: Extract<BillingInterval, "monthly" | "annual">;
}

export interface CheckoutSessionResponse {
  checkoutSession: {
    id: string;
    provider: string;
    providerCheckoutSessionId: string;
    checkoutUrl: string;
    status: string;
    planSlug: SubscriptionPlanSlug;
    billingInterval: BillingInterval;
    amountCents: number;
    currency: "PHP";
  };
}

export interface CheckoutSyncResponse {
  synced: boolean;
  paid: boolean;
  subscription?: TenantSubscriptionSummary | null;
  billing: BillingOverviewResponse;
}

export interface QueueFeeSetting {
  planSlug: SubscriptionPlanSlug;
  enabled: boolean;
  amountCents: number;
  currency: "PHP";
  updatedAt: string | Date;
}

export interface QueueFeeSummary {
  enabled: boolean;
  amountCents: number;
  currency: "PHP";
  displayAmount: string;
  planSlug: SubscriptionPlanSlug;
}

export interface TenantMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: TenantRole;
  isActive?: boolean;
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

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AuthActionResponse {
  success: boolean;
  message: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  queuePrefix: string;
  averageServiceMinutes: number;
  notificationThreshold: number;
  autoPauseEnabled: boolean;
  autoPauseThreshold: number | null;
  autoResumeEnabled: boolean;
  autoResumeVacancyPercent: number | null;
  contactEmail: string;
  contactPhone: string;
  joinUrl: string;
  monitorUrl: string;
  isActive: boolean;
  queueFee: QueueFeeSummary;
}

export interface StoreHourSummary {
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

export interface StoreOpenStatus {
  isOpen: boolean;
  timezone: string;
  summary: string;
  today: StoreHourSummary | null;
  nextOpenAt: string | Date | null;
}

export interface StoreLocationSummary {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  isPrimary: boolean;
  isActive: boolean;
  joinUrl: string;
  monitorUrl: string;
  openStatus: StoreOpenStatus;
  hours: StoreHourSummary[];
}

export type StoreLocationWithHours = StoreLocationSummary;

export interface StoreLocationsResponse {
  locations: StoreLocationWithHours[];
  activeLocationLimit: number;
}

export interface VendorServiceSummary {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  priceAmountCents: number;
  currency: "PHP";
  priceDisplay: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface VendorServicesResponse {
  services: VendorServiceSummary[];
}

export interface SaveVendorServiceRequest {
  name: string;
  slug?: string;
  description?: string;
  durationMinutes: number;
  priceAmountCents: number;
  priceDisplay?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface VendorServiceResponse {
  service: VendorServiceSummary;
}

export interface VendorAvailabilityBlockSummary {
  id: string;
  tenantId: string;
  locationId: string;
  serviceId: string | null;
  weekday: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  isActive: boolean;
  notes: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface VendorAvailabilityExceptionSummary {
  id: string;
  tenantId: string;
  locationId: string;
  serviceId: string | null;
  exceptionDate: string | Date;
  startsAt: string;
  endsAt: string;
  isAvailable: boolean;
  capacity: number | null;
  reason: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface VendorAvailabilityResponse {
  blocks: VendorAvailabilityBlockSummary[];
  exceptions: VendorAvailabilityExceptionSummary[];
}

export interface SaveVendorAvailabilityBlockRequest {
  locationSlug?: string;
  serviceSlug?: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  isActive?: boolean;
  notes?: string;
}

export interface SaveVendorAvailabilityExceptionRequest {
  locationSlug?: string;
  serviceSlug?: string;
  exceptionDate: string;
  startsAt?: string;
  endsAt?: string;
  isAvailable: boolean;
  capacity?: number | null;
  reason?: string;
}

export interface VendorAvailabilityBlockResponse {
  block: VendorAvailabilityBlockSummary;
}

export interface VendorAvailabilityExceptionResponse {
  exception: VendorAvailabilityExceptionSummary;
}

export type BookingStatus = "pending" | "confirmed" | "rescheduled" | "completed" | "canceled" | "disputed" | "reviewed";
export type BookingPaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";

export interface CustomerBookingSummary {
  id: string;
  reference: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  locationId: string;
  locationName: string;
  locationSlug: string;
  serviceId: string;
  serviceName: string;
  serviceSlug: string;
  servicePriceDisplay: string;
  scheduledStartAt: string | Date;
  scheduledEndAt: string | Date;
  status: BookingStatus;
  notes: string;
  paymentReference: string;
  paymentStatus: BookingPaymentStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CustomerBookingsResponse {
  bookings: CustomerBookingSummary[];
}

export interface CreateCustomerBookingRequest {
  tenantSlug: string;
  locationSlug: string;
  serviceSlug: string;
  scheduledStartAt: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
  paymentReference?: string;
}

export interface CustomerBookingResponse {
  booking: CustomerBookingSummary;
}

export type PublicBoardThemePresetId = "classic" | "neura" | "clinic";
export type PublicBoardThemeAssetType = "background" | "logo";
export type PublicBoardThemeScope = "fallback" | "tenant" | "location";

export interface PublicBoardThemeSettings {
  presetId: PublicBoardThemePresetId;
  heroTitle: string;
  heroSubtitle: string;
  logoUrl: string;
  backgroundImageUrl: string;
  pageBackgroundColor: string;
  cardBackgroundColor: string;
  cardAlpha: number;
  cardBorderSize: number;
  cardBorderRadius: number;
  cardBorderColor: string;
  headerColor: string;
  subheaderColor: string;
  bodyColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  buttonBorderColor: string;
}

export interface PublicBoardThemeResponse {
  scope: PublicBoardThemeScope;
  theme: PublicBoardThemeSettings;
}

export interface SavePublicBoardThemeRequest {
  theme: PublicBoardThemeSettings;
  applyToAllLocations: boolean;
}

export interface PublicBoardThemeUploadRequest {
  assetType: PublicBoardThemeAssetType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  locationSlug?: string;
}

export interface PublicBoardThemeUploadResponse {
  asset: {
    id: string;
    assetType: PublicBoardThemeAssetType;
    objectKey: string;
    publicUrl: string;
    contentType: string;
    sizeBytes: number;
  };
  upload?: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresInSeconds: number;
  };
}

export interface CreateStoreLocationRequest {
  name: string;
  slug: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  isPrimary: boolean;
  isActive: boolean;
}

export type UpdateStoreLocationRequest = CreateStoreLocationRequest;

export interface UpdateStoreHoursRequest {
  hours: StoreHourSummary[];
}

export interface QueueStats {
  waitingCount: number;
  servedToday: number;
  currentTicketNumber: string | null;
  estimatedWaitMinutes: number;
}

export interface QueueUsage {
  periodStart: string | Date;
  periodEnd: string | Date | null;
  emailsSentThisPeriod: number;
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
  isCarriedOver?: boolean;
  carryOverCount?: number;
  carriedOverAt?: string | Date | null;
}

export interface QueueHistoryTicket {
  id: string;
  lookupCode?: string;
  ticketNumber: string;
  customerName: string;
  status: TicketStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
  serviceCounterId?: string | null;
  rejoinDeadlineAt?: string | Date | null;
  servicePriorityBand?: "carry_over" | "recovery" | "normal";
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

export interface QueueDayStatus {
  isClosed: boolean;
  isPaused: boolean;
  queueDateKey: string;
  closedAt: string | Date | null;
  reopenedAt: string | Date | null;
  closureReason: string | null;
  pausedAt: string | Date | null;
  resumedAt: string | Date | null;
  pauseReason: string | null;
  pauseMode: "manual" | "auto_threshold" | null;
}

export interface QueueIntakeStatus {
  autoPauseEnabled: boolean;
  autoPauseThreshold: number | null;
  autoResumeEnabled: boolean;
  autoResumeVacancyPercent: number | null;
  currentWaitingCount: number;
  fillRatio: number | null;
  thresholdRemaining: number | null;
  resumeWaitingCount: number | null;
  state: "disabled" | "open" | "near_limit" | "paused";
  stateLabel: string;
}

export interface QueueSnapshot {
  tenant: TenantSummary;
  location: StoreLocationSummary | null;
  publicBoardTheme: PublicBoardThemeResponse;
  queueDay: QueueDayStatus;
  queueIntake: QueueIntakeStatus;
  stats: QueueStats;
  current: QueueCurrentTicket | null;
  nextUp: QueueListTicket[];
  overflow: QueueListTicket[];
  recovery: QueueHistoryTicket[];
  history: QueueHistoryTicket[];
  usage: QueueUsage;
  focusTicket: QueueFocusTicket | null;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
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

export interface PublicVendorLocation {
  name: string;
  slug: string;
  city: string;
  province: string;
  country: string;
  isPrimary: boolean;
  hours: StoreHourSummary[];
}

export interface PublicVendorProfile {
  name: string;
  slug: string;
  category: string;
  description: string;
  imageUrl: string;
  locations: PublicVendorLocation[];
  publicBoardTheme?: PublicBoardThemeResponse | null;
  location: {
    name: string;
    slug: string;
    city: string;
    province: string;
    country: string;
  };
}

export interface PublicVendorListResponse {
  vendors: PublicVendorProfile[];
}

export interface PublicVendorProfileResponse {
  vendor: PublicVendorProfile;
}

export interface JoinQueueRequest {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notifyByEmail: boolean;
  notifyBySms: boolean;
  notes: string;
  joinChannel: JoinChannel;
  turnstileToken?: string;
}

export type OtpDeliveryChannel = "email" | "sms";

export interface RequestJoinOtpResponse {
  otpId: string;
  expiresAt: string | Date;
  resendAvailableAt: string | Date;
  deliveryChannel: OtpDeliveryChannel;
  deliveryTarget: string;
}

export interface VerifyJoinOtpRequest {
  otpId: string;
  code: string;
}

export interface CancelQueueTicketRequest {
  customerEmail?: string;
  customerPhone?: string;
}

export interface QueueJoinPaymentSummary {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  otpId: string;
  planSlug: SubscriptionPlanSlug;
  provider: string;
  providerCheckoutSessionId: string | null;
  checkoutUrl: string | null;
  amountCents: number;
  currency: "PHP";
  status: "pending" | "paid" | "failed" | "expired" | "canceled";
  ticketId: string | null;
  ticketLookupCode: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface QueueJoinPaymentResponse {
  requiresPayment: boolean;
  queueFee: QueueFeeSummary;
  payment?: QueueJoinPaymentSummary;
  checkoutSession?: {
    id: string;
    provider: string;
    providerCheckoutSessionId: string;
    checkoutUrl: string;
    status: string;
    amountCents: number;
    currency: "PHP";
  };
  ticket?: TicketMutationResponse["ticket"];
  snapshot?: QueueSnapshot;
}

export interface QueueJoinPaymentSyncResponse {
  synced: boolean;
  paid: boolean;
  payment: QueueJoinPaymentSummary;
  ticket?: TicketMutationResponse["ticket"];
  snapshot?: QueueSnapshot;
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
  autoPauseEnabled: boolean;
  autoPauseThreshold: number | string;
  autoResumeEnabled: boolean;
  autoResumeVacancyPercent: number | string;
  contactEmail: string;
  contactPhone: string;
}

export interface PlatformOverviewResponse {
  totals: {
    tenants: number;
    users: number;
    activeSubscriptions: number;
    queueJoinPayments: number;
    paidQueueJoinPayments: number;
    queueJoinRevenueCents: number;
    failedQueueJoinPayments: number;
  };
  queueFees: QueueFeeSetting[];
  recentPayments: QueueJoinPaymentSummary[];
  analytics: {
    revenueTrend: Array<{ period: string; amountCents: number }>;
    paymentStatusMix: Array<{ status: string; count: number }>;
    subscriptionsByPlan: Array<{ planSlug: SubscriptionPlanSlug; count: number }>;
    tenantGrowth: Array<{ period: string; count: number }>;
    userGrowth: Array<{ period: string; count: number }>;
  };
}

export interface PlatformQueueFeesResponse {
  queueFees: QueueFeeSetting[];
}

export interface PlatformSettingsResponse {
  settings: {
    enterpriseInquiryEmail: string;
  };
}

export interface UpdatePlatformSettingsRequest {
  enterpriseInquiryEmail: string;
}

export interface UpdatePlatformQueueFeesRequest {
  queueFees: Array<{
    planSlug: SubscriptionPlanSlug;
    enabled: boolean;
    amountCents: number;
  }>;
}

export interface PlatformPlansResponse {
  plans: SubscriptionPlan[];
}

export interface UpdatePlatformPlanRequest {
  plan: SubscriptionPlan;
}

export interface ServiceCounterSummary {
  id: string;
  tenantId: string;
  locationId: string;
  name: string;
  slug: string;
  isActive: boolean;
  assignedUserIds: string[];
}

export interface VendorStaffSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: TenantRole;
  isActive?: boolean;
  assignedCounterIds: string[];
}

export interface VendorStaffResponse {
  staff: VendorStaffSummary[];
  staffSeatLimit: number;
}

export interface AddVendorStaffRequest {
  email: string;
  role: TenantRole;
}

export interface UpdateVendorStaffRequest {
  role?: TenantRole;
  isActive?: boolean;
}

export interface SaveServiceCounterRequest {
  name: string;
  slug: string;
  isActive: boolean;
  assignedUserIds: string[];
}

export interface ServiceCountersResponse {
  counters: ServiceCounterSummary[];
  counterLimit: number;
}

export interface PlatformListResponse<T> {
  items: T[];
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

export interface VendorClientSummary {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  visitCount: number;
  latestTicketNumber: string;
  latestStatus: TicketStatus;
  latestVisitAt: string | Date;
  notifyByEmail: boolean;
  notifyBySms: boolean;
}

export interface VendorClientsResponse {
  historyDays: number;
  historyLabel: string;
  clients: VendorClientSummary[];
}

export interface CustomerAccountTicketSummary {
  id: string;
  lookupCode: string;
  ticketNumber: string;
  tenantName: string;
  tenantSlug: string;
  locationName: string;
  locationSlug: string;
  status: TicketStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CustomerAccountOverviewResponse {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    emailVerified: boolean;
  };
  tickets: CustomerAccountTicketSummary[];
}

export interface CustomerAccountHistoryResponse {
  tickets: CustomerAccountTicketSummary[];
}

export interface OAuthProvidersResponse {
  providers: OAuthProviderAvailability;
}

export interface EnterpriseInquiryRequest {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  message: string;
}

export interface EnterpriseInquiryResponse {
  sent: boolean;
}
