import "./DeveloperReferencePage.css";

const endpoints = [
  { method: "GET", path: "/", description: "Identify the API version and environment." },
  { method: "GET", path: "/health", description: "Check API availability and environment." }
];

export default function DeveloperReferencePage() {
  return (
    <main className="developer-reference" data-testid="developer-reference">
      <header className="developer-reference-header">
        <a href="/">GetPrio Developers</a>
        <span>Read-only API reference</span>
      </header>
      <section className="developer-reference-content" aria-labelledby="developer-reference-title">
        <p className="developer-reference-eyebrow">GETPRIO QUEUE API · V1</p>
        <h1 id="developer-reference-title">API reference</h1>
        <p className="developer-reference-note">
          This read-only reference documents the public preview contract. Browser execution is disabled while queue operations and developer authentication are being prepared.
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
        <pre><code>curl https://api.getprio.online/v1/health</code></pre>
      </section>
    </main>
  );
}
