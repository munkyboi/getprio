import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  AuthActionResponse,
  AuthIntent,
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
const STORAGE_KEY = "prio-auth";
const EMPTY_OAUTH_PROVIDERS: OAuthProviderAvailability = {
  google: false,
  facebook: false
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || "";
    if (!stored) {
      return "";
    }

    try {
      const parsed = JSON.parse(stored) as { token?: string };
      return parsed.token || "";
    } catch {
      return stored;
    }
  });
  const [refreshToken, setRefreshToken] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY) || "";
    if (!stored) {
      return "";
    }

    try {
      const parsed = JSON.parse(stored) as { refreshToken?: string };
      return parsed.refreshToken || "";
    } catch {
      return "";
    }
  });
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STORAGE_KEY)));
  const [oauthProviders, setOauthProviders] =
    useState<OAuthProviderAvailability>(EMPTY_OAUTH_PROVIDERS);
  const [oauthLoading, setOauthLoading] = useState(true);

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
    if (!token || !refreshToken) {
      setUser(null);
      setLoading(false);
      localStorage.removeItem(STORAGE_KEY);
      return undefined;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, refreshToken }));
    setLoading(true);

    apiRequest<{ user: UserSummary }>("/auth/me", { token })
      .then((data) => {
        setUser(data.user);
      })
      .catch(() => {
        setToken("");
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
      })
      .finally(() => {
        setLoading(false);
      });

    return undefined;
  }, [refreshToken, token]);

  useEffect(() => {
    const clearAuthState = () => {
      setToken("");
      setRefreshToken("");
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    };

    async function refreshAccessToken() {
      if (!refreshToken) {
        return null;
      }

      try {
        const data = await apiRequest<AuthResponse, { refreshToken: string }>(
          "/auth/refresh",
          {
            method: "POST",
            body: { refreshToken },
            skipAuthRefresh: true
          }
        );
        setToken(data.token);
        setRefreshToken(data.refreshToken);
        setUser(data.user);
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ token: data.token, refreshToken: data.refreshToken })
        );
        return data.token;
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
    async login(credentials: LoginRequest): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, LoginRequest>("/auth/login", {
        method: "POST",
        body: credentials
      });
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
      return data;
    },
    async registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, RegisterVendorRequest>("/auth/register/vendor", {
        method: "POST",
        body: payload
      });
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
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
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
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
      setToken(data.token);
      setRefreshToken(data.refreshToken);
      setUser(data.user);
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
      localStorage.removeItem(STORAGE_KEY);
      return result;
    },
    acceptAuthToken(nextToken: string, nextRefreshToken: string) {
      setLoading(true);
      setToken(nextToken);
      setRefreshToken(nextRefreshToken);
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
          await apiRequest<{ success: boolean }, { refreshToken: string }>("/auth/logout", {
            method: "POST",
            body: { refreshToken },
            token,
            skipAuthRefresh: true
          });
        }
      } catch {
        // Ignore logout transport errors and clear local auth state anyway.
      } finally {
        setToken("");
        setRefreshToken("");
        setUser(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
