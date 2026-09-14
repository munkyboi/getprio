import "./DeveloperPortalPage.css";

const endpointRows = [
  ["Production", "https://api.getprio.online/v1", "Paid production credits after approval"],
  ["Sandbox", "https://sandbox-api.getprio.online/v1", "Isolated test credits and test users"]
];

export default function DeveloperPortalPage() {
  return (
    <main className="developer-portal" data-testid="developer-portal">
      <header className="developer-portal-header">
        <a className="developer-portal-brand" href="/" aria-label="GetPrio Developers home">
          <img src="/logo-dark.svg" alt="GetPrio" />
          <span>developers</span>
        </a>
        <nav aria-label="Developer portal">
          <a href="#quickstart">Quickstart</a>
          <a href="#documentation">Docs</a>
          <a href="#endpoints">Endpoints</a>
          <a href="#pricing">Pricing</a>
          <a className="developer-portal-login" href="#login">Developer login</a>
        </nav>
      </header>

      <section className="developer-portal-hero" aria-labelledby="developer-portal-title">
        <div>
          <p className="developer-portal-eyebrow">THE GETPRIO QUEUE API</p>
          <h1 id="developer-portal-title">Give customers a clear place in line.</h1>
          <p className="developer-portal-lede">
            Plan an integration that issues tickets from your software, keeps queue order in GetPrio, and lets customers track updates in the app.
          </p>
          <p className="developer-portal-preview-note">Developer API preview · queue operations and project tools are coming next. Metadata and health checks are the first live endpoints.</p>
          <div className="developer-portal-actions">
            <a className="developer-portal-primary" href="#quickstart">Explore the sandbox plan</a>
            <a className="developer-portal-secondary" href="#endpoints">Read the API overview</a>
          </div>
        </div>
        <aside className="developer-portal-ticket" aria-label="Sample ticket">
          <p>HARBOR SERVICES · SAMPLE TICKET</p>
          <strong>A-024</strong>
          <span>Waiting · 3 people ahead</span>
          <small>Your place stays visible wherever you wait.</small>
        </aside>
      </section>

      <section className="developer-portal-section" id="quickstart" aria-labelledby="quickstart-title">
        <p className="developer-portal-eyebrow">QUICKSTART</p>
        <h2 id="quickstart-title">Start with a safe sandbox.</h2>
        <div className="developer-portal-grid">
          <article><strong>01</strong><h3>Create a project</h3><p>Verify your developer account and open the included sandbox project when portal access is enabled.</p></article>
          <article><strong>02</strong><h3>Issue a test ticket</h3><p>Keep your sandbox key on your backend and call the queue API over HTTPS once queue operations are enabled.</p></article>
          <article><strong>03</strong><h3>Connect the customer</h3><p>Return the private mobile-ticket link or use an accepted in-app invitation as the mobile flow becomes available.</p></article>
        </div>
      </section>

      <section className="developer-portal-section" id="use-cases" aria-labelledby="use-cases-title">
        <p className="developer-portal-eyebrow">EXAMPLES</p>
        <h2 id="use-cases-title">Works wherever customers wait.</h2>
        <div className="developer-portal-grid">
          <article><strong>Salon</strong><p>Open a daily queue, issue tickets without contact details, and serve customers across two counters.</p></article>
          <article><strong>Repair shop</strong><p>Use a work-order reference so a retry can safely return the same ticket without another debit.</p></article>
          <article><strong>Service desk</strong><p>Keep a fair queue-wide priority ratio while counters call the next eligible ticket.</p></article>
        </div>
      </section>

      <section className="developer-portal-section" id="endpoints" aria-labelledby="endpoints-title">
        <p className="developer-portal-eyebrow">API OVERVIEW</p>
        <h2 id="endpoints-title">One contract, two planned environments.</h2>
        <div className="developer-portal-endpoints">
          {endpointRows.map(([label, url, description]) => (
            <article key={label}>
              <span>{label}</span>
              <code>{url}</code>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <p className="developer-portal-note">Only metadata and health checks are live in this preview. Browser-based API execution is disabled; keep future API keys in your server-side integration.</p>
      </section>

      <section className="developer-portal-section" id="documentation" aria-labelledby="documentation-title">
        <p className="developer-portal-eyebrow">DOCUMENTATION</p>
        <h2 id="documentation-title">Learn the contract before you connect.</h2>
        <div className="developer-portal-grid">
          <article><strong>Guides</strong><p>Copyable backend examples for Node.js, PHP, Python, C# and cURL are being prepared.</p></article>
          <article><strong>API reference</strong><p>A self-hosted Scalar reference will document the versioned queue contract with browser execution disabled.</p></article>
          <article><strong>FAQ + changelog</strong><p>Answers, release notes and migration notices will be published alongside the first queue operations.</p></article>
        </div>
      </section>

      <section className="developer-portal-section" id="pricing" aria-labelledby="pricing-title">
        <p className="developer-portal-eyebrow">PRICING</p>
        <h2 id="pricing-title">Build free. Pay when you go live.</h2>
        <p>Sandbox testing uses a daily allowance. Production uses prepaid ticket credits; one successfully issued ticket consumes one credit. Production credits do not expire, and additional projects have their own monthly fee.</p>
      </section>

      <section className="developer-portal-login-panel" id="login" aria-labelledby="login-title">
        <div><p className="developer-portal-eyebrow">DEVELOPER ACCESS</p><h2 id="login-title">Your project workspace is coming next.</h2></div>
        <p>The public API surface is available first. Portal authentication, project tools and production approval will be enabled behind the separate developer session.</p>
      </section>

      <footer className="developer-portal-footer">GetPrio Developers · Fictional preview data until portal services are enabled.</footer>
    </main>
  );
}
