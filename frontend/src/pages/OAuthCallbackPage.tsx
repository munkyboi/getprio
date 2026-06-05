import { useEffect, useState } from "react";
import { Alert, Button, Loader, Paper, Stack, Text, Title } from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { acceptAuthToken } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const next = params.get("next") || "/";
    const token = params.get("token");
    const refreshToken = params.get("refreshToken");
    const callbackError = params.get("error");

    if (callbackError) {
      setError(callbackError);
      return;
    }

    if (!token || !refreshToken) {
      setError("Missing sign-in token. Please try again.");
      return;
    }

    acceptAuthToken(token, refreshToken);
    navigate(next, { replace: true });
  }, [acceptAuthToken, navigate]);

  return (
    <Paper className="finazze-auth-card" p={{ base: "xl", md: 44 }}>
      <Stack gap="lg" align={error ? "stretch" : "center"}>
        <Text className="finazze-section-label">Social sign-in</Text>
        <Title order={1}>{error ? "We couldn't finish that sign-in." : "Finalizing your account."}</Title>
        {error ? (
          <>
            <Alert color="red">{error}</Alert>
            <Text c="dimmed">
              You can head back to the sign-in screen and try a different provider or use your
              password instead.
            </Text>
            <Button color="dark" component={Link} to="/login">
              Return to sign in
            </Button>
          </>
        ) : (
          <>
            <Loader color="dark" />
            <Text c="dimmed" ta="center">
              We are finishing the secure handoff and loading your Prio session.
            </Text>
          </>
        )}
      </Stack>
    </Paper>
  );
}
