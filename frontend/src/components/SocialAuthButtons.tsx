import type { OAuthProviderId } from "@shared";
import { useAuth } from "../context/AuthContext";
import type { SocialAuthButtonsProps } from "./SocialAuthButtons.types";

const PROVIDER_OPTIONS: Array<{ id: OAuthProviderId; label: string }> = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" }
];

export default function SocialAuthButtons({ intent }: SocialAuthButtonsProps) {
  const { oauthLoading, oauthProviders, startOAuth } = useAuth();
  const hasConfiguredProvider = Object.values(oauthProviders).some(Boolean);

  return (
    <div className="stack gap-sm">
      <div className="auth-divider">
        <span>Or continue with</span>
      </div>
      <div className="social-auth-list">
        {PROVIDER_OPTIONS.map((provider) => {
          const enabled = Boolean(oauthProviders[provider.id]);

          return (
            <button
              key={provider.id}
              className={`social-auth-button provider-${provider.id}`}
              disabled={oauthLoading || !enabled}
              onClick={() => startOAuth(provider.id, intent)}
              type="button"
            >
              Continue with {provider.label}
            </button>
          );
        })}
      </div>
      {!oauthLoading && !hasConfiguredProvider ? (
        <p className="muted-text subtle-text">
          Social sign-in buttons stay disabled until the provider credentials are added to the
          server environment.
        </p>
      ) : null}
    </div>
  );
}
