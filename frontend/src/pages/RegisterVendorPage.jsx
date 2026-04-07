import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { useAuth } from "../context/AuthContext";

const PROVIDER_LABELS = {
  google: "Google",
  facebook: "Facebook"
};

export default function RegisterVendorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { completeVendorOnboarding, loading, registerVendor, user } = useAuth();
  const [form, setForm] = useState({
    tenantName: "",
    tenantSlug: "",
    name: "",
    email: "",
    phone: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: current.email || user.email || "",
      phone: current.phone || user.phone || ""
    }));
  }, [user]);

  const oauthProviderLabel = useMemo(() => {
    const oauthProvider = searchParams.get("oauth");
    return PROVIDER_LABELS[oauthProvider] || "";
  }, [searchParams]);

  if (loading) {
    return <div className="card">Loading session...</div>;
  }

  const isAuthenticatedFlow = Boolean(user);
  const hasTenantMemberships = Boolean(user?.tenants?.length);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (isAuthenticatedFlow) {
        await completeVendorOnboarding({
          tenantName: form.tenantName,
          tenantSlug: form.tenantSlug,
          name: form.name,
          email: form.email,
          phone: form.phone
        });
      } else {
        await registerVendor(form);
      }

      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card auth-card stack gap-md">
      <span className="eyebrow">{isAuthenticatedFlow ? "Vendor workspace" : "Vendor onboarding"}</span>
      <h1>
        {isAuthenticatedFlow
          ? hasTenantMemberships
            ? "Create another tenant-ready queue workspace"
            : "Finish setting up your tenant workspace"
          : "Create a tenant-ready queue workspace"}
      </h1>
      {isAuthenticatedFlow ? (
        <p className="muted-text subtle-text">
          {oauthProviderLabel
            ? `Signed in with ${oauthProviderLabel}. Finish the workspace details below.`
            : "You're signed in. Finish the workspace details below to create your vendor tenant."}
        </p>
      ) : (
        <SocialAuthButtons intent="register_vendor" />
      )}
      <form className="grid two-up gap-sm" onSubmit={handleSubmit}>
        <label className="field">
          <span>Business name</span>
          <input
            required
            value={form.tenantName}
            onChange={(event) => setForm((current) => ({ ...current, tenantName: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Tenant slug</span>
          <input
            required
            placeholder="acme-clinic"
            value={form.tenantSlug}
            onChange={(event) => setForm((current) => ({ ...current, tenantSlug: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Owner name</span>
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
        {!isAuthenticatedFlow ? (
          <label className="field">
            <span>Password</span>
            <input
              required
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
        ) : null}
        {error ? <p className="error-text full-span">{error}</p> : null}
        <button className="primary-button full-span" disabled={submitting} type="submit">
          {submitting
            ? isAuthenticatedFlow
              ? "Finishing workspace..."
              : "Creating workspace..."
            : isAuthenticatedFlow
              ? hasTenantMemberships
                ? "Create workspace"
                : "Finish workspace setup"
              : "Create workspace"}
        </button>
      </form>
    </section>
  );
}
