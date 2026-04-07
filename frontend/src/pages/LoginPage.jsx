import { useEffect, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, user } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.tenants?.length) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user]);

  if (loading) {
    return <div className="card">Loading session...</div>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await login(form);
      navigate(result.user.tenants.length ? "/dashboard" : "/", { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card auth-card stack gap-md narrow">
      <span className="eyebrow">Sign in</span>
      <h1>Access your vendor or customer account</h1>
      <form className="stack gap-sm" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            required
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <SocialAuthButtons intent="login" />
      <p>
        New here? <Link to="/register/vendor">Create a vendor workspace</Link> or{" "}
        <Link to="/register/customer">register as a customer</Link>.
      </p>
    </section>
  );
}
