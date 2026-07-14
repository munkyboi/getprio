import { Button, Divider, SimpleGrid, Stack, Text } from "@mantine/core";
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
    <Stack gap="md">
      <Divider label="Or continue with" labelPosition="center" />
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {PROVIDER_OPTIONS.map((provider) => {
          const enabled = Boolean(oauthProviders[provider.id]);

          return (
            <Button
              className="auth-social-action"
              color="dark"
              disabled={oauthLoading || !enabled}
              key={provider.id}
              onClick={() => startOAuth(provider.id, intent)}
              size="lg"
              type="button"
              variant="outline"
            >
              Continue with {provider.label}
            </Button>
          );
        })}
      </SimpleGrid>
      {!oauthLoading && !hasConfiguredProvider ? (
        <Text c="dimmed" size="sm">
          Social sign-in buttons stay disabled until provider credentials are added to the
          server environment.
        </Text>
      ) : null}
    </Stack>
  );
}
