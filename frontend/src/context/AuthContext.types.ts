import type {
  AuthIntent,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  LoginRequest,
  OAuthProviderAvailability,
  OAuthProviderId,
  RegisterCustomerRequest,
  RegisterVendorRequest,
  UserSummary
} from "@shared";

export interface AuthContextValue {
  token: string;
  user: UserSummary | null;
  loading: boolean;
  oauthProviders: OAuthProviderAvailability;
  oauthLoading: boolean;
  login(credentials: LoginRequest): Promise<AuthResponse>;
  registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse>;
  completeVendorOnboarding(payload: CompleteVendorOnboardingRequest): Promise<AuthResponse>;
  registerCustomer(payload: RegisterCustomerRequest): Promise<AuthResponse>;
  acceptAuthToken(nextToken: string): void;
  startOAuth(provider: OAuthProviderId, intent: AuthIntent): void;
  refreshUser(): Promise<UserSummary | null>;
  logout(): void;
}
