import { OperationButton } from "../vendor/OperationsUi";
import { Separator } from "../vendor/components/ui/separator";
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBrandFacebook, IconBrandGoogle } from "@tabler/icons-react";
import type { OAuthProviderId } from "@shared";
import { useAuth } from "../context/AuthContext";
import type { SocialAuthButtonsProps } from "./SocialAuthButtons.types";

const PROVIDER_OPTIONS: Array<{
  id: OAuthProviderId;
  label: string;
  Icon: typeof IconBrandGoogle;
}> = [
  { id: "google", label: "Google", Icon: IconBrandGoogle },
  { id: "facebook", label: "Facebook", Icon: IconBrandFacebook },
];

export default function SocialAuthButtons({
  iconOnly = false,
  intent,
  returnPath,
  vendor = false,
  disabled = false,
}: SocialAuthButtonsProps) {
  const { oauthLoading, oauthProviders, startOAuth } = useAuth();
  const hasConfiguredProvider = PROVIDER_OPTIONS.some(({ id }) =>
    Boolean(oauthProviders[id]),
  );

  if (vendor)
    return (
      <div className="queue-stack">
        <Separator />
        <p className="ops-muted">Or continue with a connected account</p>
        <div className="ops-grid-2">
          {PROVIDER_OPTIONS.map(({ id, label, Icon }) => (
            <OperationButton
              key={id}
              variant="outline"
              disabled={disabled || oauthLoading || !oauthProviders[id]}
              data-provider={id}
              onClick={() => startOAuth(id, intent, returnPath)}
            >
              <Icon aria-hidden data-icon="inline-start" />
              Continue with {label}
            </OperationButton>
          ))}
        </div>
        {!oauthLoading && !hasConfiguredProvider ? (
          <p className="ops-muted">
            Social sign-in is currently unavailable. Use the form below.
          </p>
        ) : null}
      </div>
    );
  return (
    <Stack gap="md">
      <Divider label="Or continue with" labelPosition="center" />
      {iconOnly ? (
        <Group gap="md" justify="center">
          {PROVIDER_OPTIONS.map((provider) => {
            const enabled = Boolean(oauthProviders[provider.id]);
            const ProviderIcon = provider.Icon;

            return (
              <Tooltip
                key={provider.id}
                label={`Continue with ${provider.label}`}
                withArrow
              >
                <ActionIcon
                  aria-label={`Continue with ${provider.label}`}
                  className="auth-social-icon-action"
                  data-provider={provider.id}
                  disabled={disabled || oauthLoading || !enabled}
                  onClick={() => startOAuth(provider.id, intent, returnPath)}
                  size={56}
                  type="button"
                  variant="outline"
                >
                  <ProviderIcon aria-hidden size={24} stroke={1.9} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Group>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {PROVIDER_OPTIONS.map((provider) => {
            const enabled = Boolean(oauthProviders[provider.id]);
            const ProviderIcon = provider.Icon;

            return (
              <Button
                className="auth-social-action"
                color="dark"
                disabled={disabled || oauthLoading || !enabled}
                key={provider.id}
                data-provider={provider.id}
                leftSection={
                  <ProviderIcon aria-hidden size={20} stroke={1.9} />
                }
                onClick={() => startOAuth(provider.id, intent, returnPath)}
                size="lg"
                type="button"
                variant="outline"
              >
                Continue with {provider.label}
              </Button>
            );
          })}
        </SimpleGrid>
      )}
      {!oauthLoading && !hasConfiguredProvider ? (
        <Text c="dimmed" size="sm">
          Social sign-in buttons stay disabled until provider credentials are
          added to the server environment.
        </Text>
      ) : null}
    </Stack>
  );
}
