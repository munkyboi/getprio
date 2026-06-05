import type {
  AuthActionResponse,
  AuthIntent,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  LoginRequest,
  OAuthProviderAvailability,
  OAuthProviderId,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterCustomerRequest,
  RegisterVendorRequest,
  UserSummary
} from "@shared";

export interface AuthContextValue {
  token: string;
  refreshToken: string;
  user: UserSummary | null;
  loading: boolean;
  oauthProviders: OAuthProviderAvailability;
  oauthLoading: boolean;
  login(credentials: LoginRequest): Promise<AuthResponse>;
  registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse>;
  completeVendorOnboarding(payload: CompleteVendorOnboardingRequest): Promise<AuthResponse>;
  registerCustomer(payload: RegisterCustomerRequest): Promise<AuthResponse>;
  requestPasswordReset(payload: PasswordResetRequest): Promise<AuthActionResponse>;
  confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<AuthActionResponse>;
  changePassword(payload: PasswordChangeRequest): Promise<AuthActionResponse>;
  acceptAuthToken(nextToken: string, nextRefreshToken: string): void;
  startOAuth(provider: OAuthProviderId, intent: AuthIntent): void;
  logout(): Promise<void>;
}
