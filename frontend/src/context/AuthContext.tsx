import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Button, Modal, Stack, Text, Title } from "@mantine/core";
import type {
  AuthActionResponse,
  AuthIntent,
  AuthLoginResponse,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  LoginRequest,
  OAuthProviderAvailability,
  OAuthProviderId,
  OAuthProvidersResponse,
  PasswordChangeRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  RegisterCustomerRequest,
  RegisterVendorRequest,
  UserSummary
} from "@shared";
import { API_BASE_URL, apiRequest, setAuthHandlers } from "../api/client";
import type { AuthContextValue } from "./AuthContext.types";

const AuthContext = createContext<AuthContextValue | null>(null);
const COOKIE_SESSION = "cookie-session";
const EMPTY_OAUTH_PROVIDERS: OAuthProviderAvailability = {
  google: false,
  facebook: false
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthProviders, setOauthProviders] =
    useState<OAuthProviderAvailability>(EMPTY_OAUTH_PROVIDERS);
  const [oauthLoading, setOauthLoading] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [expiryWarningOpen, setExpiryWarningOpen] = useState(false);

  useEffect(() => {
    apiRequest<OAuthProvidersResponse>("/auth/oauth/providers")
      .then((data) => {
        setOauthProviders({
          ...EMPTY_OAUTH_PROVIDERS,
          ...(data.providers || {})
        });
      })
      .catch(() => {
        setOauthProviders(EMPTY_OAUTH_PROVIDERS);
      })
      .finally(() => {
        setOauthLoading(false);
      });
  }, []);

  useEffect(() => {
    localStorage.removeItem("prio-auth");
    apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { skipAuthRefresh: true })
      .then((data) => {
        setUser(data.user);
        setToken(COOKIE_SESSION);
        setRefreshToken(COOKIE_SESSION);
        setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      })
      .catch(() => {
        setToken("");
        setRefreshToken("");
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!sessionExpiresAt || !user) { setExpiryWarningOpen(false); return; }
    const delay = Math.max(0, sessionExpiresAt - Date.now() - 5 * 60_000);
    const timer = window.setTimeout(() => setExpiryWarningOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [sessionExpiresAt, user]);

  useEffect(() => {
    const clearAuthState = () => {
      setToken("");
      setRefreshToken("");
      setUser(null);
      setSessionExpiresAt(null);
    };

    async function refreshAccessToken() {
      if (!refreshToken) {
        return null;
      }

      try {
        const data = await apiRequest<AuthResponse, Record<string, never>>(
          "/auth/refresh",
          {
            method: "POST",
            body: {},
            skipAuthRefresh: true
          }
        );
        setToken(COOKIE_SESSION);
        setRefreshToken(COOKIE_SESSION);
        setUser(data.user);
        setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
        setExpiryWarningOpen(false);
        return COOKIE_SESSION;
      } catch {
        clearAuthState();
        return null;
      }
    }

    setAuthHandlers({
      refreshToken: refreshAccessToken,
      onAuthFailure: clearAuthState
    });

    return () => {
      setAuthHandlers({
        refreshToken: null,
        onAuthFailure: null
      });
    };
  }, [refreshToken]);

  const value: AuthContextValue = {
    token,
    refreshToken,
    user,
    loading,
    oauthProviders,
    oauthLoading,
    async login(credentials: LoginRequest): Promise<AuthLoginResponse> {
      const data = await apiRequest<AuthLoginResponse, LoginRequest>("/auth/login", {
        method: "POST",
        body: credentials
      });
      if ("mfaRequired" in data) {
        return data;
      }
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data;
    },
    async verifyMfaChallenge(payload): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, typeof payload>("/auth/mfa/verify", {
        method: "POST",
        body: payload
      });
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data;
    },
    async registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, RegisterVendorRequest>("/auth/register/vendor", {
        method: "POST",
        body: payload
      });
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data;
    },
    async completeVendorOnboarding(
      payload: CompleteVendorOnboardingRequest
    ): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, CompleteVendorOnboardingRequest>(
        "/auth/register/vendor/complete",
        {
          method: "POST",
          body: payload,
          token
        }
      );
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data;
    },
    async registerCustomer(payload: RegisterCustomerRequest): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, RegisterCustomerRequest>(
        "/auth/register/customer",
        {
          method: "POST",
          body: payload
        }
      );
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data;
    },
    async requestPasswordReset(payload: PasswordResetRequest): Promise<AuthActionResponse> {
      return apiRequest<AuthActionResponse, PasswordResetRequest>("/auth/password-reset/request", {
        method: "POST",
        body: payload
      });
    },
    async confirmPasswordReset(payload: PasswordResetConfirmRequest): Promise<AuthActionResponse> {
      return apiRequest<AuthActionResponse, PasswordResetConfirmRequest>("/auth/password-reset/confirm", {
        method: "POST",
        body: payload
      });
    },
    async changePassword(payload: PasswordChangeRequest): Promise<AuthActionResponse> {
      const result = await apiRequest<AuthActionResponse, PasswordChangeRequest>("/account/password", {
        method: "POST",
        body: payload,
        token,
        skipAuthRefresh: true
      });
      setToken("");
      setRefreshToken("");
      setUser(null);
      setSessionExpiresAt(null);
      return result;
    },
    async refreshUser(): Promise<UserSummary | null> {
      const data = await apiRequest<{ user: UserSummary; sessionExpiresAt?: string | Date | null }>("/auth/me", { token: undefined });
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ? new Date(data.sessionExpiresAt).getTime() : null);
      return data.user;
    },
    acceptAuthToken(_nextToken: string, _nextRefreshToken: string) {
      setLoading(true);
      setToken(COOKIE_SESSION);
      setRefreshToken(COOKIE_SESSION);
    },
    startOAuth(provider: OAuthProviderId, intent: AuthIntent) {
      if (!oauthProviders[provider]) {
        throw new Error(`${provider} sign-in is not available right now.`);
      }

      const startUrl = new URL(`${API_BASE_URL}/auth/oauth/${provider}/start`);
      startUrl.searchParams.set("intent", intent);
      window.location.assign(startUrl.toString());
    },
    async logout() {
      try {
        if (refreshToken) {
          await apiRequest<{ success: boolean }, Record<string, never>>("/auth/logout", {
            method: "POST",
            body: {},
            skipAuthRefresh: true
          });
        }
      } catch {
        // Ignore logout transport errors and clear local auth state anyway.
      } finally {
        setToken("");
        setRefreshToken("");
        setUser(null);
        setSessionExpiresAt(null);
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}<Modal centered closeOnClickOutside={false} closeOnEscape={false} opened={expiryWarningOpen} onClose={() => undefined} title={<div><Text c="orange" fw={700} size="xs">SESSION SECURITY</Text><Title order={3}>Your session will expire soon</Title></div>}><Stack><Text>For your security, you’ll be signed out soon. Continue your session to keep working without losing your place.</Text><Button onClick={async () => { const next = await apiRequest<AuthResponse, Record<string, never>>("/auth/refresh", { method: "POST", body: {}, skipAuthRefresh: true }); setUser(next.user); setToken(COOKIE_SESSION); setRefreshToken(COOKIE_SESSION); setSessionExpiresAt(next.sessionExpiresAt ? new Date(next.sessionExpiresAt).getTime() : null); setExpiryWarningOpen(false); }}>Continue session</Button><Button variant="subtle" onClick={() => void value.logout()}>Sign out now</Button></Stack></Modal></AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
