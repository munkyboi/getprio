import { Button, Container, Group, Image, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { Link } from "react-router-dom";

type ResourceErrorStateProps = {
  backLabel: string;
  backTo: string;
  error?: string;
  onRetry: () => void;
  resourceName: string;
  status?: number | null;
};

export default function ResourceErrorState({
  backLabel,
  backTo,
  error,
  onRetry,
  resourceName,
  status
}: ResourceErrorStateProps) {
  const isNotFound = status === 404;
  const normalizedResourceName = resourceName.toLowerCase();

  return (
    <Container className="not-found-page resource-error-state" size="lg">
      <div className="not-found-copy">
        <Stack align="flex-start" gap="md">
          <Text className="prio-label">{isNotFound ? "Not found" : "We need another try"}</Text>
          <Title className="not-found-title" order={1}>
            {isNotFound ? "This link is unavailable." : "We couldn’t load this page."}
          </Title>
          <Text c="dimmed" className="not-found-lead">
            {isNotFound
              ? `The ${normalizedResourceName} may have been removed, or the link may no longer be available.`
              : error || `We couldn’t load this ${normalizedResourceName}. Please check your connection and try again.`}
          </Text>
          <Group className="not-found-actions resource-error-actions" gap="sm">
            {!isNotFound ? (
              <Button leftSection={<IconRefresh size={18} />} onClick={onRetry} size="lg">
                Try again
              </Button>
            ) : null}
            <Button component={Link} leftSection={<IconArrowLeft size={18} />} size="lg" to={backTo} variant={isNotFound ? "filled" : "light"}>
              {backLabel}
            </Button>
          </Group>
        </Stack>
      </div>
      <Image
        alt="A customer finding their way with help from a service attendant"
        className="not-found-illustration"
        src="/illustrations/generated/not-found-wayfinding-transparent.png"
      />
    </Container>
  );
}
