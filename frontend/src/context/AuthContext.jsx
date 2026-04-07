import { createContext, useContext, useEffect, useState } from "react";
import { API_BASE_URL, apiRequest } from "../api/client";

const AuthContext = createContext(null);
const STORAGE_KEY = "prio-auth";
const EMPTY_OAUTH_PROVIDERS = {
  google: false,
  facebook: false
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STORAGE_KEY)));
  const [oauthProviders, setOauthProviders] = useState(EMPTY_OAUTH_PROVIDERS);
  const [oauthLoading, setOauthLoading] = useState(true);

  useEffect(() => {
    apiRequest("/auth/oauth/providers")
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

    apiRequest("/auth/me", { token })
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

  const value = {
    token,
    user,
    loading,
    oauthProviders,
    oauthLoading,
    async login(credentials) {
      const data = await apiRequest("/auth/login", {
        method: "POST",
        body: credentials
      });
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    async registerVendor(payload) {
      const data = await apiRequest("/auth/register/vendor", {
        method: "POST",
        body: payload
      });
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    async completeVendorOnboarding(payload) {
      const data = await apiRequest("/auth/register/vendor/complete", {
        method: "POST",
        body: payload,
        token
      });
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    async registerCustomer(payload) {
      const data = await apiRequest("/auth/register/customer", {
        method: "POST",
        body: payload
      });
      setToken(data.token);
      setUser(data.user);
      return data;
    },
    acceptAuthToken(nextToken) {
      setLoading(true);
      setToken(nextToken);
    },
    startOAuth(provider, intent) {
      if (!oauthProviders[provider]) {
        throw new Error(`${provider} sign-in is not available right now.`);
      }

      const startUrl = new URL(`${API_BASE_URL}/auth/oauth/${provider}/start`);
      startUrl.searchParams.set("intent", intent);
      window.location.assign(startUrl.toString());
    },
    logout() {
      setToken("");
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
