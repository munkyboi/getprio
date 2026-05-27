import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  AuthIntent,
  AuthResponse,
  CompleteVendorOnboardingRequest,
  LoginRequest,
  OAuthProviderAvailability,
  OAuthProviderId,
  OAuthProvidersResponse,
  RegisterCustomerRequest,
  RegisterVendorRequest,
  UserSummary
} from "@shared";
import { API_BASE_URL, apiRequest } from "../api/client";
import type { AuthContextValue } from "./AuthContext.types";

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "prio-auth";
const EMPTY_OAUTH_PROVIDERS: OAuthProviderAvailability = {
  google: false,
  facebook: false
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STORAGE_KEY)));
  const [oauthProviders, setOauthProviders] =
    useState<OAuthProviderAvailability>(EMPTY_OAUTH_PROVIDERS);
  const [oauthLoading, setOauthLoading] = useState(true);

  async function refreshUser(): Promise<UserSummary | null> {
    if (!token) {
      setUser(null);
      return null;
    }

    const data = await apiRequest<{ user: UserSummary }>("/auth/me", { token });
    setUser(data.user);
    return data.user;
  }

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
    if (!token) {
      setUser(null);
      setLoading(false);
      localStorage.removeItem(STORAGE_KEY);
      return undefined;
    }

    localStorage.setItem(STORAGE_KEY, token);
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
  }, [token]);

  const value: AuthContextValue = {
    token,
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
      setUser(data.user);
      return data;
    },
    async registerVendor(payload: RegisterVendorRequest): Promise<AuthResponse> {
      const data = await apiRequest<AuthResponse, RegisterVendorRequest>("/auth/register/vendor", {
        method: "POST",
        body: payload
      });
      setToken(data.token);
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
      setUser(data.user);
      return data;
    },
    acceptAuthToken(nextToken: string) {
      setLoading(true);
      setToken(nextToken);
    },
    startOAuth(provider: OAuthProviderId, intent: AuthIntent) {
      if (!oauthProviders[provider]) {
        throw new Error(`${provider} sign-in is not available right now.`);
      }

      const startUrl = new URL(`${API_BASE_URL}/auth/oauth/${provider}/start`);
      startUrl.searchParams.set("intent", intent);
      window.location.assign(startUrl.toString());
    },
    refreshUser,
    logout() {
      setToken("");
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
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
