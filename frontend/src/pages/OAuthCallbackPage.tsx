import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Loader } from "@mantine/core";
import { Alert, LoginPresentation, Paper, Stack, Text, Title } from "../vendor/LoginPresentation";
import { OperationButton } from "../vendor/OperationsUi";
import { isVendorLoginContext, vendorSignInRetryPath } from "../vendor/authContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  // Auth context recreates refreshUser after session updates; that must not restart a handoff.
  const refreshUserRef = useRef(refreshUser);
  useEffect(() => { refreshUserRef.current = refreshUser; }, [refreshUser]);
  const [error, setError] = useState("");
  const { hash } = useLocation();
  const callbackParams = useMemo(() => new URLSearchParams(hash.replace(/^#/, "")), [hash]);
  const next = callbackParams.get("next") || "/";
  const vendor = isVendorLoginContext(next);

  useEffect(() => {
    let current = true;
    setError("");
    const callbackError = callbackParams.get("error");

    if (callbackError) {
      setError(callbackError);
      return;
    }

    refreshUserRef.current()
      .then((nextUser) => {
        if (!current) return;
        if (!nextUser) throw new Error("Missing secure sign-in session.");
        navigate(next, { replace: true });
      })
      .catch((cause) => { if (current) setError(cause instanceof Error ? cause.message : "Unable to finish sign-in."); });
    return () => { current = false; };
  }, [callbackParams, next, navigate]);

  return (
    <LoginPresentation vendor={vendor} busy={!error}>
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
            {vendor ? <OperationButton onClick={() => navigate(vendorSignInRetryPath(next))}>Return to sign in</OperationButton> : <Button color="dark" component={Link} to="/login">
              Return to sign in
            </Button>}
          </>
        ) : (
          <>
            {vendor ? <p className="ops-muted" role="status" aria-busy="true">Finishing sign-in…</p> : <Loader color="dark" />}
            <Text c="dimmed" ta="center">
              We are finishing the secure handoff and loading your Prio session.
            </Text>
          </>
        )}
      </Stack>
    </Paper>
    </LoginPresentation>
  );
}
