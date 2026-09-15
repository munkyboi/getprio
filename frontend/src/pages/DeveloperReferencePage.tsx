import "./DeveloperReferencePage.css";

const endpoints = [
  { method: "GET", path: "/", description: "Identify the API version and environment." },
  { method: "GET", path: "/health", description: "Check API availability and environment." },
  { method: "GET", path: "/queues/:tenantSlug", description: "Read a public-safe queue snapshot with a queues:read API key." },
  { method: "GET", path: "/queues/:tenantSlug/locations", description: "List active locations available for queue reads." },
  { method: "GET", path: "/queues/:tenantSlug/locations/:locationSlug", description: "Read a public-safe queue snapshot for one location." },
  { method: "GET", path: "/queues/:tenantSlug/stream", description: "Stream redacted queue snapshots as Server-Sent Events." },
  { method: "GET", path: "/queues/:tenantSlug/locations/:locationSlug/stream", description: "Stream one location's queue snapshots as Server-Sent Events." },
  { method: "POST", path: "/queues/:tenantSlug/tickets", description: "Issue a ticket at the tenant's primary location with a queues:write API key." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/tickets", description: "Issue a ticket at one location with a queues:write API key." },
  { method: "POST", path: "/queues/:tenantSlug/call-next", description: "Call the next waiting ticket at the tenant's primary location." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/call-next", description: "Call the next waiting ticket at one location." },
  { method: "POST", path: "/queues/:tenantSlug/current/serve", description: "Serve the current called ticket at the tenant's primary location." },
  { method: "POST", path: "/queues/:tenantSlug/current/skip", description: "Skip the current called ticket at the tenant's primary location." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/current/serve", description: "Serve the current called ticket at one location." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/current/skip", description: "Skip the current called ticket at one location." },
  { method: "POST", path: "/queues/:tenantSlug/tickets/:ticketId/cancel", description: "Cancel a waiting ticket by ID." },
  { method: "POST", path: "/queues/:tenantSlug/tickets/:ticketId/restore", description: "Restore a skipped ticket by ID." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId/cancel", description: "Cancel a waiting ticket at one location." },
  { method: "POST", path: "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId/restore", description: "Restore a skipped ticket at one location." },
  { method: "GET", path: "/queues/:tenantSlug/tickets/:ticketId", description: "Read one ticket's status without exposing customer contact details." },
  { method: "GET", path: "/queues/:tenantSlug/locations/:locationSlug/tickets/:ticketId", description: "Read one location ticket's status without exposing customer contact details." }
];

export default function DeveloperReferencePage() {
  return (
    <main className="developer-reference" data-testid="developer-reference">
      <header className="developer-reference-header">
        <a href="/">GetPrio Developers</a>
        <span>Versioned API reference</span>
      </header>
      <section className="developer-reference-content" aria-labelledby="developer-reference-title">
        <p className="developer-reference-eyebrow">GETPRIO QUEUE API · V1</p>
        <h1 id="developer-reference-title">API reference</h1>
        <p className="developer-reference-note">
          Metadata and health checks are public. Browser execution is disabled for queue requests; use a server-side key issued for the matching environment with queues:read or queues:write as required.
        </p>
        <p><a href="https://api.getprio.online/v1/openapi.json">Download the OpenAPI 3.1 document</a></p>
        <div className="developer-reference-endpoints">
          {endpoints.map((endpoint) => (
            <article key={endpoint.path}>
              <span>{endpoint.method}</span>
              <code>{endpoint.path}</code>
              <p>{endpoint.description}</p>
            </article>
          ))}
        </div>
        <h2>Example</h2>
        <pre><code>{"curl https://sandbox-api.getprio.online/v1/queues/example-tenant/tickets \\\n  -X POST \\\n  -H 'X-API-Key: gpk_sbx_...' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"customerName\":\"Ada Lovelace\"}'"}</code></pre>
      </section>
    </main>
  );
}
