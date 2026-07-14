import { Button, Container, Group, Image, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <Container className="not-found-page" size="lg">
      <div className="not-found-copy">
        <Stack align="flex-start" gap="md">
          <Text className="prio-label">Error 404</Text>
          <Title className="not-found-title" order={1}>This page took a detour.</Title>
          <Text c="dimmed" className="not-found-lead">
            The page you’re looking for may have moved, or the link may be out of date.
          </Text>
          <Group className="not-found-actions" gap="sm">
            <Button component={Link} leftSection={<IconArrowLeft size={18} />} size="lg" to="/">
              Back to home
            </Button>
            <Button component={Link} leftSection={<IconSearch size={18} />} size="lg" to="/vendors" variant="light">
              Browse vendors
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
