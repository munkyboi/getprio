import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Group, Modal, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { apiRequest } from "../api";

type AppleReviewAccount = {
  id: string;
  status: string;
  username: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type DeveloperProject = {
  id: string;
  developerAccountId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  appleReviewAccount: AppleReviewAccount | null;
};

type AppleReviewCredentials = {
  username: string;
  email: string;
  password: string;
  expiresAt: string;
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "--";
}

export function DeveloperProjectsPage({ token }: { token: string }) {
  const [projects, setProjects] = useState<DeveloperProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyProjectId, setBusyProjectId] = useState("");
  const [credentials, setCredentials] = useState<{ projectName: string; value: AppleReviewCredentials; warning: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<{ projects: DeveloperProject[] }>("/platform/developer-projects", { token });
      setProjects(data.projects);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load developer projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function rotateAppleReviewAccount(project: DeveloperProject) {
    setBusyProjectId(project.id);
    try {
      const accountPath = project.appleReviewAccount
        ? `/platform/developer-projects/${project.id}/sandbox/test-accounts/${project.appleReviewAccount.id}/reset`
        : `/platform/developer-projects/${project.id}/sandbox/test-accounts/apple-review`;
      const result = await apiRequest<{ credentials: AppleReviewCredentials; warning: string }>(accountPath, { method: "POST", token, body: {} });
      setCredentials({ projectName: project.name, value: result.credentials, warning: result.warning });
      await load();
      notifications.show({ color: "teal", title: project.appleReviewAccount ? "Apple review credentials reset" : "Apple review account created", message: `${project.name} now has a 30-day Sandbox review account.` });
    } catch (caught) {
      notifications.show({ color: "red", title: "Account not created", message: caught instanceof Error ? caught.message : "Please try again." });
    } finally {
      setBusyProjectId("");
    }
  }

  return <Stack gap="lg">
    <Group justify="space-between" align="flex-start">
      <div>
        <Title order={2}>Developer projects</Title>
        <Text c="dimmed">Provision Apple App Review credentials from the platform side. Project developers cannot create or reset these accounts.</Text>
      </div>
      <Button variant="light" mih={44} loading={loading} onClick={() => void load()}>Refresh</Button>
    </Group>
    <Alert color="blue" title="Platform-controlled review credentials">Each active project can have one Apple review Sandbox account. Credentials are shown once and expire after 30 days.</Alert>
    {error ? <Alert color="red" title="Developer projects unavailable">{error}</Alert> : null}
    {loading ? <Text role="status">Loading developer projects…</Text> : <SimpleGrid cols={{ base: 1, md: 2 }}>
      {projects.map((project) => <Card className="portal-card" withBorder key={project.id} padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div><Title order={3}>{project.name}</Title><Text c="dimmed" size="sm">Project ID {project.id}</Text></div>
            <Badge color={project.status === "active" ? "teal" : "gray"}>{project.status}</Badge>
          </Group>
          {project.appleReviewAccount ? <div><Text fw={700}>Apple review account provisioned</Text><Text c="dimmed" size="sm">{project.appleReviewAccount.email} · expires {formatDate(project.appleReviewAccount.expiresAt)}</Text></div> : <Text c="dimmed">No Apple review account provisioned.</Text>}
          <Button loading={busyProjectId === project.id} onClick={() => void rotateAppleReviewAccount(project)}>{project.appleReviewAccount ? "Reset 30-day credentials" : "Create 30-day review account"}</Button>
        </Stack>
      </Card>)}
    </SimpleGrid>}
    {!loading && !projects.length ? <Text c="dimmed">No active developer projects.</Text> : null}
    <Modal centered opened={Boolean(credentials)} onClose={() => setCredentials(null)} title={<div><Text className="portal-label">APPLE APP REVIEW</Text><Title order={3}>Sandbox credentials</Title></div>} closeButtonProps={{ "aria-label": "Close credentials" }}>
      {credentials ? <Stack gap="md"><Text>{credentials.projectName} · copy these values into App Store Connect now.</Text><Card withBorder><Stack gap="xs"><Text><strong>Username:</strong> {credentials.value.username}</Text><Text><strong>Email:</strong> {credentials.value.email}</Text><Text><strong>Password:</strong> {credentials.value.password}</Text><Text><strong>Expires:</strong> {formatDate(credentials.value.expiresAt)}</Text></Stack></Card><Alert color="yellow">{credentials.warning}</Alert><Button onClick={() => setCredentials(null)}>I saved these credentials</Button></Stack> : null}
    </Modal>
  </Stack>;
}
