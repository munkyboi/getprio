import { useEffect, useMemo, useState } from "react";
import { Alert, Anchor, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import type {
  AcceptStaffInvitationResponse,
  StaffInvitationPreviewResponse
} from "@shared";
import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function StaffInvitePage() {
  const { token: inviteToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { token, user, loading, refreshUser, logout } = useAuth();
  const [preview, setPreview] = useState<StaffInvitationPreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const redirectPath = useMemo(
    () => `/staff/invite/${encodeURIComponent(inviteToken || "")}`,
    [inviteToken]
  );
  const authQuery = `?redirect=${encodeURIComponent(redirectPath)}`;

  useEffect(() => {
    if (!inviteToken) {
      return;
    }

    setError("");
    apiRequest<StaffInvitationPreviewResponse>(`/vendor/staff-invitations/${inviteToken}`)
      .then(setPreview)
      .catch((previewError) => setError(getErrorMessage(previewError)));
  }, [inviteToken]);

  if (!inviteToken) {
    return <Navigate to="/" replace />;
  }

  const invitation = preview?.invitation;
  const normalizedUserEmail = (user?.email || "").trim().toLowerCase();
  const invitedEmail = (invitation?.email || "").trim().toLowerCase();
  const emailMatches = Boolean(normalizedUserEmail && invitedEmail && normalizedUserEmail === invitedEmail);
  const canAccept = Boolean(token && invitation?.status === "pending" && emailMatches);

  async function acceptInvite() {
    if (!inviteToken) {
      return;
    }

    setAccepting(true);
    setError("");

    try {
      await apiRequest<AcceptStaffInvitationResponse>(
        `/vendor/staff-invitations/${inviteToken}/accept`,
        {
          method: "POST",
          token
        }
      );
      await refreshUser();
      navigate("/dashboard", { replace: true });
    } catch (acceptError) {
      setError(getErrorMessage(acceptError));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <Card className="finazze-auth-card" p={{ base: "xl", md: 44 }}>
      <Stack gap="lg">
        <div>
          <Text className="finazze-section-label">Staff invitation</Text>
          <Title order={1}>
            {invitation ? `Join ${invitation.tenantName}` : "Review invitation"}
          </Title>
          {invitation ? (
            <Text c="dimmed" mt="sm">
              This invitation is for {invitation.email} and grants vendor {invitation.role} access.
            </Text>
          ) : null}
        </div>

        {error ? <Alert color="red">{error}</Alert> : null}

        {invitation?.status && invitation.status !== "pending" ? (
          <Alert color="yellow">
            This invitation is {invitation.status}. Ask a vendor admin to send a new invite.
          </Alert>
        ) : null}

        {loading || (!preview && !error) ? <Text c="dimmed">Loading invitation...</Text> : null}

        {invitation?.status === "pending" && !user ? (
          <Stack gap="sm">
            <Text c="dimmed" size="sm">
              Sign in or create a GetPrio customer account using {invitation.email} to accept.
            </Text>
            <Group>
              <Button component={Link} to={`/login${authQuery}`} color="dark">
                Sign in
              </Button>
              <Button component={Link} to={`/register/customer${authQuery}`} variant="light">
                Register
              </Button>
            </Group>
          </Stack>
        ) : null}

        {invitation?.status === "pending" && user && !emailMatches ? (
          <Stack gap="sm">
            <Alert color="red">
              You are signed in as {user.email || "another account"}. Sign in as {invitation.email} to accept this invite.
            </Alert>
            <Button variant="light" onClick={logout}>
              Sign out
            </Button>
          </Stack>
        ) : null}

        {canAccept ? (
          <Stack gap="sm">
            <Text c="dimmed" size="sm">
              You are signed in as {user?.email}. Accepting adds this account to the vendor dashboard.
            </Text>
            <Button color="dark" disabled={accepting} onClick={acceptInvite}>
              {accepting ? "Accepting..." : "Accept invitation"}
            </Button>
          </Stack>
        ) : null}

        {!user ? (
          <Text c="dimmed" size="sm">
            Need a different account?{" "}
            <Anchor component={Link} to="/login">Sign in from login</Anchor>
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
