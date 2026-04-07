import { useEffect, useState } from "react";
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
    const callbackError = params.get("error");

    if (callbackError) {
      setError(callbackError);
      return;
    }

    if (!token) {
      setError("Missing sign-in token. Please try again.");
      return;
    }

    acceptAuthToken(token);
    navigate(next, { replace: true });
  }, [acceptAuthToken, navigate]);

  return (
    <section className="card auth-card oauth-callback-card stack gap-md narrow">
      <span className="eyebrow">Social sign-in</span>
      <h1>{error ? "We couldn't finish that sign-in" : "Finalizing your account"}</h1>
      {error ? (
        <>
          <p className="error-text">{error}</p>
          <p className="muted-text subtle-text">
            You can head back to the sign-in screen and try a different provider or use your
            password instead.
          </p>
          <Link className="primary-button" to="/login">
            Return to sign in
          </Link>
        </>
      ) : (
        <p className="muted-text subtle-text">
          We are finishing the secure handoff and loading your Prio session.
        </p>
      )}
    </section>
  );
}
