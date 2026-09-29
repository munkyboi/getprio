import type {
  AuthActionResponse,
  AuthIntent,
  AuthLoginResponse,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  EmailMfaChallengeResponse,
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
  login(credentials: LoginRequest): Promise<AuthLoginResponse>;
  verifyMfaChallenge(payload: { challengeToken: string; code?: string; recoveryCode?: string; method?: "totp" | "email" }): Promise<AuthResponse>;
  sendEmailMfaCode(payload: { challengeToken: string }): Promise<EmailMfaChallengeResponse>;
  registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse>;
  completeVendorOnboarding(payload: CompleteVendorOnboardingRequest): Promise<AuthResponse>;
  registerCustomer(payload: RegisterCustomerRequest): Promise<AuthResponse>;
  requestPasswordReset(payload: PasswordResetRequest): Promise<AuthActionResponse>;
  confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<AuthActionResponse>;
  changePassword(payload: PasswordChangeRequest): Promise<AuthActionResponse>;
  refreshUser(): Promise<UserSummary | null>;
  acceptAuthToken(nextToken: string, nextRefreshToken: string): void;
  startOAuth(provider: OAuthProviderId, intent: AuthIntent): void;
  logout(): Promise<void>;
}
