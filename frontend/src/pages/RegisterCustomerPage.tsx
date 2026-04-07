import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { RegisterCustomerRequest } from "@shared";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/errors";

export default function RegisterCustomerPage() {
  const navigate = useNavigate();
  const { loading, registerCustomer, user } = useAuth();
  const [form, setForm] = useState<RegisterCustomerRequest>({
    name: "",
    email: "",
    phone: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !user.tenants?.length) {
      navigate("/", { replace: true });
    }
  }, [navigate, user]);

  if (loading) {
    return <div className="card">Loading session...</div>;
  }

  if (user && !user.tenants?.length) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await registerCustomer(form);
      navigate("/", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card auth-card stack gap-md narrow">
      <span className="eyebrow">Customer account</span>
      <h1>Queue remotely and save your contact details</h1>
      <form className="stack gap-sm" onSubmit={handleSubmit}>
        <label className="field">
          <span>Name</span>
          <input
            required
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
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
          <span>Phone</span>
          <input
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
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
          {submitting ? "Creating account..." : "Register account"}
        </button>
      </form>
      <SocialAuthButtons intent="register_customer" />
    </section>
  );
}
