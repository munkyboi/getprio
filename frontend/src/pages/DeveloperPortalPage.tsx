import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";
import "./DeveloperPortalPage.css";

const faqs = [
  [
    "Can I sign up and get API keys now?",
    "Self-service developer enrollment and login are not enabled on this public site yet. You can read the guides and reference or explore the fictional workspace. The preview does not create accounts, issue keys, or take payments.",
  ],
  [
    "Do I need to publish my business in the directory?",
    "No. The planned integration supports private queue operations. A public directory profile is optional, and joining a queue through GetPrio is a separate opt-in that requires an approved published profile.",
  ],
  [
    "What consumes a production credit?",
    "The accepted pricing model charges one credit for one successfully issued ticket. Idempotent retries and updates to an existing ticket do not consume another credit. Standard GetPrio mobile queue pushes are included; you provide your own customer email or SMS service.",
  ],
  [
    "Do credits expire?",
    "Purchased and complimentary production credits never expire and are shared across your projects. Sandbox test credits are separate: their daily allowance resets at 00:00 UTC without rollover.",
  ],
  [
    "What happens if my balance reaches zero?",
    "Under the accepted model, zero credits prevent new production tickets. Already-issued tickets remain serviceable, subject to other access restrictions.",
  ],
  [
    "How will customers connect a ticket?",
    "The planned mobile flow uses a private, single-use ticket link or an invitation addressed by email, followed by explicit customer acceptance. Private links expire after 15 minutes. A public queue QR is not proof of ticket ownership. Mobile linking and Sandbox app distribution are launch dependencies.",
  ],
  [
    "Is production access automatic?",
    "No. Developer enrollment, production approval, each human's MFA setup, and purchased ticket credits are separate requirements. Developer billing is independent of GetPrio vendor subscriptions.",
  ],
  [
    "Can I call the API directly from my frontend?",
    "Keep API keys on your backend. Public documentation is readable without login, but does not execute authenticated requests in the browser. Use a key scoped to the correct project, environment, and permissions.",
  ],
];
const examples = {
  cURL: "curl 'https://sandbox-api.getprio.online/v1/queues/example-tenant' \\\n  -H 'X-API-Key: REPLACE_WITH_SANDBOX_KEY'",
  "Node.js / TypeScript":
    "const key = process.env.GETPRIO_SANDBOX_KEY;\nif (!key) throw new Error('Set GETPRIO_SANDBOX_KEY on your server');\nconst response = await fetch(\n  'https://sandbox-api.getprio.online/v1/queues/example-tenant',\n  { headers: { 'X-API-Key': key } }\n);\nif (!response.ok) throw new Error(`GetPrio: ${response.status}`);\nconsole.log(await response.json());",
  PHP: "<?php\n$curl = curl_init('https://sandbox-api.getprio.online/v1/queues/example-tenant');\ncurl_setopt_array($curl, [\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_HTTPHEADER => ['X-API-Key: ' . getenv('GETPRIO_SANDBOX_KEY')],\n]);\n$body = curl_exec($curl);\n$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);\nif ($body === false || $status >= 400) {\n  throw new RuntimeException('GetPrio request failed');\n}\ncurl_close($curl);\necho $body;",
  Python:
    "import os\nimport urllib.request\n\nrequest = urllib.request.Request(\n    'https://sandbox-api.getprio.online/v1/queues/example-tenant',\n    headers={'X-API-Key': os.environ['GETPRIO_SANDBOX_KEY']}\n)\nwith urllib.request.urlopen(request, timeout=15) as response:\n    print(response.read().decode())",
  "C# / .NET":
    'using var client = new HttpClient();\nclient.DefaultRequestHeaders.Add(\n    "X-API-Key", Environment.GetEnvironmentVariable("GETPRIO_SANDBOX_KEY"));\nusing var response = await client.GetAsync(\n    "https://sandbox-api.getprio.online/v1/queues/example-tenant");\nresponse.EnsureSuccessStatusCode();\nConsole.WriteLine(await response.Content.ReadAsStringAsync());',
};

function FAQ({ compact = false }: { compact?: boolean }) {
  return (
    <div className="developer-portal-faq">
      {(compact ? faqs.slice(0, 4) : faqs).map(([question, answer]) => (
        <details key={question}>
          <summary>{question}</summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}

function Guides() {
  const [language, setLanguage] = useState<keyof typeof examples>("cURL");
  return (
    <>
      <p className="developer-portal-eyebrow">GUIDES / V1 PREVIEW</p>
      <h1>Start on your backend.</h1>
      <p className="developer-portal-lede">
        Read the API contract, plan your queue flow, and keep credentials on
        your server. These guides are public; self-service keys and Sandbox app
        access are not enabled here.
      </p>
      <ol className="developer-portal-guide-steps">
        <li>
          <h2>Choose the environment</h2>
          <p>
            Use <code>https://sandbox-api.getprio.online/v1</code> for isolated
            testing. Production uses <code>https://api.getprio.online/v1</code>.
            Start with a public health check from your terminal:
          </p>
          <pre>
            <code>curl https://sandbox-api.getprio.online/v1/health</code>
          </pre>
          <p>
            A successful health check confirms API availability, not your
            account permissions or production readiness.
          </p>
        </li>
        <li>
          <h2>Read a queue with a scoped key</h2>
          <p>
            Once provisioned, use a Sandbox key with <code>queues:read</code>{" "}
            and an authorized tenant slug. The fictional{" "}
            <code>example-tenant</code> and placeholder key below must be
            replaced on your server. Never paste real keys into this site.
          </p>
          <label className="developer-portal-language">
            Example language
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as keyof typeof examples)
              }
            >
              {Object.keys(examples).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <pre aria-label={`${language} backend example`}>
            <code>{examples[language]}</code>
          </pre>
          <p>
            Examples use standard HTTP clients. JavaScript runs in Node.js; PHP
            requires its cURL extension. No custom SDK is required.
          </p>
        </li>
        <li>
          <h2>Issue, update, and observe</h2>
          <p>
            Review ticket request fields, permissions, errors, and retry
            behavior before adding writes. Keep the same idempotency key when
            retrying an operation where the reference supports it. Use queue
            snapshots, server-side event streams, or webhooks as appropriate to
            your integration.
          </p>
          <a href="/reference">Read endpoint details →</a>
        </li>
        <li>
          <h2>Plan the customer handoff</h2>
          <p>
            Mobile tracking, private ticket linking, and push delivery need the
            corresponding mobile integration. Test only with synthetic users in
            Sandbox when app access is provided. Do not use real customer data
            in the workspace preview.
          </p>
        </li>
      </ol>
      <div className="developer-portal-note">
        <h2>Before production</h2>
        <p>
          Confirm account approval, personal MFA, environment-matched keys, and
          production credits separately. Check the reference for supported
          operations; the public landing page is not a guarantee that the full
          planned platform has launched.
        </p>
      </div>
    </>
  );
}

function Landing() {
  return (
    <>
      <section
        className="developer-portal-hero"
        aria-labelledby="developer-portal-title"
      >
        <div>
          <p className="developer-portal-eyebrow">THE GETPRIO QUEUE API</p>
          <h1 id="developer-portal-title">
            Your software.
            <br />
            Their place in line.
            <br />
            <em>Connected.</em>
          </h1>
          <p className="developer-portal-lede">
            Keep queue operations in your software. Connect customers to ticket
            tracking and notifications through GetPrio, wherever they wait.
          </p>
          <div className="developer-portal-actions">
            <a className="developer-portal-primary" href="/register">
              Get started →
            </a>
            <a className="developer-portal-secondary" href="/docs">
              Explore the docs
            </a>
          </div>
          <p className="developer-portal-meta">
            Free sandbox · prepaid production · non-expiring production credits
          </p>
          <p className="developer-portal-preview-note">
            Pre-launch developer access. Explore the public API reference now;
            enrollment, the authenticated workspace, and mobile Sandbox
            distribution are not enabled on this site.
          </p>
        </div>
        <aside
          className="developer-portal-ticket"
          aria-label="Fictional mobile tracking preview"
        >
          <p className="developer-portal-flow">
            YOUR BACKEND → GETPRIO → CUSTOMER APP
          </p>
          <div className="developer-portal-phone">
            <p>HARBOR SERVICES · SAMPLE TICKET</p>
            <strong>A-024</strong>
            <span>Waiting</span>
            <p>3 people ahead of you</p>
            <hr />
            <b>
              Your place stays visible,
              <br />
              wherever you wait.
            </b>
            <p>Ticket tracking + queue notifications</p>
            <small>Illustrative experience · no live customer data</small>
          </div>
        </aside>
      </section>
      <section className="developer-portal-section" id="quickstart">
        <p className="developer-portal-eyebrow">
          ONE INTEGRATION. A BETTER WAIT.
        </p>
        <h2>Keep the experience familiar.</h2>
        <div className="developer-portal-grid">
          {[
            [
              "01",
              "Issue through your software",
              "Your backend issues tickets and controls their lifecycle. GetPrio maintains the queue order.",
            ],
            [
              "02",
              "Connect the customer",
              "The planned mobile flow links an existing ticket through a private link or email-addressed invitation, with explicit acceptance.",
            ],
            [
              "03",
              "Keep them informed",
              "Customers will track linked tickets and receive permitted mobile pushes. Your backend can react to queue events.",
            ],
          ].map(([number, title, body]) => (
            <article key={number}>
              <strong>{number}</strong>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <p>
          Customer linking and mobile distribution remain launch dependencies.{" "}
          <a href="/docs">Read the integration guide →</a>
        </p>
      </section>
      <section className="developer-portal-section" id="use-cases">
        <p className="developer-portal-eyebrow">BUILT AROUND YOUR WORKFLOW</p>
        <h2>Wherever people wait.</h2>
        <div className="developer-portal-grid">
          {[
            [
              "Repair shops",
              "Connect a service-desk queue to your existing work-order software.",
            ],
            [
              "Salons & walk-ins",
              "Manage arrivals and counters while customers keep track of their turn.",
            ],
            [
              "Public services",
              "Coordinate queue order across counters without collecting unnecessary customer details.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="developer-portal-section" id="capabilities">
        <p className="developer-portal-eyebrow">THE PLATFORM</p>
        <h2>Your workflow. Connected capabilities.</h2>
        <div className="developer-portal-grid">
          {[
            [
              "Queue operations",
              "Issue and manage tickets, read queue snapshots, and stream updates. See the versioned reference for supported endpoints.",
            ],
            [
              "Backend events",
              "Use webhook events to connect your own systems. Customer email and SMS stay with your chosen providers.",
            ],
            [
              "Mobile tracking",
              "Planned ticket linking and GetPrio mobile pushes give customers a place to follow their turn.",
            ],
            [
              "Optional discovery",
              "Keep your integration private or choose an approved public directory profile. In-app joining is separately opt-in.",
            ],
            [
              "Separate environments",
              "Sandbox and Production use separate API origins and matching keys. Test allowance never spends production credits.",
            ],
            [
              "Scoped access",
              "Keep keys on your backend, limited to the intended project and permissions. Human production access requires personal MFA.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="developer-portal-section" id="pricing">
        <p className="developer-portal-eyebrow">ACCEPTED PRE-LAUNCH PRICING</p>
        <h2>Start free. Pay for tickets when ready.</h2>
        <p>
          Published planning rates below. Purchases are not available on this
          site; confirm the offered package and terms when checkout opens.
        </p>
        <div className="developer-portal-prices">
          <article>
            <p className="developer-portal-eyebrow">BUILD & TEST</p>
            <h3>Free sandbox</h3>
            <p className="developer-portal-price">₱0</p>
            <ul>
              <li>100 test credits daily</li>
              <li>2 test accounts · 2 devices per account</li>
              <li>Allowance resets at 00:00 UTC, without rollover</li>
              <li>Isolated synthetic test data</li>
            </ul>
            <a href="/register">View Sandbox access status →</a>
          </article>
          <article>
            <p className="developer-portal-eyebrow">PRODUCTION TICKETS</p>
            <h3>Prepaid, at your pace</h3>
            <p className="developer-portal-price">
              ₱500 <span>/ 5,000 credits</span>
            </p>
            <ul>
              <li>One successful ticket = one credit</li>
              <li>Production credits never expire</li>
              <li>Shared credit wallet across projects</li>
              <li>Existing-ticket updates incur no extra credit debit</li>
            </ul>
            <p>
              Production approval and personal MFA are separate from credit
              purchases. No automatic top-ups.
            </p>
          </article>
        </div>
        <h3>One project included. More when you need them.</h3>
        <p>
          Additional-project maintenance is billed monthly in pesos, separately
          from ticket credits. These are monthly totals, not per-project rates.
        </p>
        <dl className="developer-portal-fees">
          {[
            ["1 total project", "Included"],
            ["2 total projects", "₱199 / month"],
            ["3 total projects", "₱389 / month"],
            ["4 total projects", "₱579 / month"],
            ["5 total projects", "₱769 / month"],
          ].map(([label, price]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{price}</dd>
            </div>
          ))}
        </dl>
        <p>
          More than five projects requires review and an accepted quote.
          Developer billing is independent of vendor plans.
        </p>
      </section>
      <section className="developer-portal-section" id="documentation">
        <div className="developer-portal-callout">
          <p className="developer-portal-eyebrow">READ. PLAN. THEN CONNECT.</p>
          <h2>Make your first step a clear one.</h2>
          <p>
            Learn the backend flow, explore the endpoint reference, and
            understand Sandbox limits before requesting production access.
          </p>
          <div className="developer-portal-actions">
            <a className="developer-portal-primary" href="/docs">
              Read the quickstart
            </a>
            <a className="developer-portal-secondary" href="/reference">
              Open the API reference
            </a>
          </div>
          <a href="/prototype">Explore the fictional workspace preview →</a>
          <p className="developer-portal-meta">
            The preview creates no real accounts, keys, tickets, or payments.
          </p>
        </div>
      </section>
      <section className="developer-portal-section" id="faq">
        <p className="developer-portal-eyebrow">GOOD TO KNOW</p>
        <h2>Questions before you build?</h2>
        <FAQ compact />
        <div className="developer-portal-actions">
          <a href="/faq">All frequently asked questions →</a>
          <a href="/help">Get help →</a>
          <a href="/changelog">Changelog →</a>
        </div>
      </section>
    </>
  );
}

const pageTitles: Record<string, string> = {
  "/": "Queue API",
  "/docs": "Guides",
  "/faq": "FAQ",
  "/help": "Help",
  "/changelog": "Changelog",
  "/register": "Developer enrollment",
  "/login": "Developer login",
};

export default function DeveloperPortalPage() {
  const [light, setLight] = useState(false);
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const title = pageTitles[path] || "Page not found";
  useEffect(() => {
    document.title = `${title} · GetPrio Developers`;
  }, [title]);
  return (
    <div
      className={`developer-portal${light ? " developer-portal-light" : ""}`}
      data-testid="developer-portal"
    >
      <a className="developer-portal-skip" href="#main-content">
        Skip to content
      </a>
      <header className="developer-portal-header">
        <a
          className="developer-portal-brand"
          href="/"
          aria-label="GetPrio Developers home"
        >
          <img
            src={light ? "/logo.svg" : "/logo-dark.svg"}
            alt="GetPrio"
          />
          <span>developers</span>
        </a>
        <nav aria-label="Developer portal">
          {[
            ["/docs", "Docs"],
            ["/#pricing", "Pricing"],
            ["/faq", "FAQ"],
            ["/changelog", "Changelog"],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </a>
          ))}
          <a
            className="developer-portal-secondary"
            href="/login"
            aria-current={path === "/login" ? "page" : undefined}
          >
            Developer login
          </a>
          <button
            type="button"
            onClick={() => setLight(!light)}
            aria-label={`Switch to ${light ? "dark" : "light"} theme`}
          >
            {light ? <IconMoon size={20} /> : <IconSun size={20} />}
          </button>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {path === "/" ? (
          <Landing />
        ) : (
          <section className="developer-portal-content">
            {path === "/docs" ? (
              <Guides />
            ) : path === "/faq" ? (
              <>
                <p className="developer-portal-eyebrow">GETPRIO DEVELOPERS</p>
                <h1>Frequently asked questions.</h1>
                <FAQ />
              </>
            ) : path === "/help" ? (
              <>
                <p className="developer-portal-eyebrow">DEVELOPER HELP</p>
                <h1>Find your next step.</h1>
                <p>
                  Start with the <a href="/docs">integration guide</a> for
                  environment setup and backend examples, or the{" "}
                  <a href="/faq">FAQ</a> for pricing and access.
                </p>
                <h2>Need help with an integration?</h2>
                <p>
                  Use GetPrio’s contact page. Include the environment, endpoint,
                  error status, and request ID if available. Remove API keys,
                  private ticket links, and customer data.
                </p>
                <a
                  className="developer-portal-primary"
                  href="https://getprio.online/contact"
                >
                  Contact GetPrio →
                </a>
              </>
            ) : path === "/changelog" ? (
              <>
                <p className="developer-portal-eyebrow">RELEASE INFORMATION</p>
                <h1>Changelog.</h1>
                <article className="developer-portal-note">
                  <h2>September 26 · Developer API preview</h2>
                  <p>
                    The public portal provides integration guides, FAQ, pricing
                    information, and a read-only API reference. The standalone
                    Developer Portal provides the authenticated workspace for
                    project and Sandbox management.
                  </p>
                  <p>
                    The{" "}
                    <a href="https://api.getprio.online/v1/openapi.json">
                      published OpenAPI document
                    </a>{" "}
                    describes the current API contract. This public landing
                    page remains read-only; use the standalone portal for
                    authenticated workflows.
                  </p>
                </article>
                <article className="developer-portal-note">
                  <h2>Current Developer API capabilities</h2>
                  <ul>
                    <li>Environment-bound projects, API keys, scopes, and profile access boundaries.</li>
                    <li>Queue discovery, snapshots, Server-Sent Events, ticket issuance, reads, and lifecycle actions.</li>
                    <li>Lifecycle event history, signed webhooks, replay, rotation, retry, and suspension controls.</li>
                    <li>Sandbox test accounts, mobile ticket linking, email-matched invitations, push refreshes, and QR claims.</li>
                    <li>Verification codes for customer confirmation, usage history, daily usage pagination, and live ticket details.</li>
                  </ul>
                </article>
                <article className="developer-portal-note">
                  <h2>Security baseline</h2>
                  <p>
                    Authenticated API access is protected by environment-matched,
                    hashed API keys, explicit scopes, project/profile access
                    boundaries, and active account, project, and key checks.
                  </p>
                  <ul>
                    <li>Read and write requests are rate limited per project and environment.</li>
                    <li>Mutating requests require idempotency keys to prevent duplicate operations.</li>
                    <li>Request fields, sizes, pagination, and live-stream counts are bounded.</li>
                    <li>Production access requires project approval and personal MFA.</li>
                    <li>Webhook secrets are protected with signing, rotation, retry, and suspension controls.</li>
                    <li>Customer fields on terminal Developer API tickets are removed after the retention period.</li>
                  </ul>
                  <p>
                    Per-key anomaly detection, automatic abuse quarantine,
                    production wallet or credit enforcement, and project
                    subscriptions are not connected in this preview.
                    Production access and billing remain gated. This is not a
                    general-availability announcement.
                  </p>
                </article>
              </>
            ) : path === "/login" || path === "/register" ? (
              <>
                <p className="developer-portal-eyebrow">
                  {title.toUpperCase()} · PRE-LAUNCH
                </p>
                <h1>
                  {path === "/login"
                    ? "Developer login is not open yet."
                    : "Get ready for Sandbox."}
                </h1>
                <p className="developer-portal-lede">
                  Self-service enrollment and the authenticated developer
                  workspace are not enabled on this public site. No credentials
                  are collected here.
                </p>
                <p>
                  When enrollment opens, the planned flow is to verify your
                  identity, create a project, and start with the free Sandbox.
                  Production approval, personal MFA, and production credits are
                  separate steps.
                </p>
                <div className="developer-portal-actions">
                  <a className="developer-portal-primary" href="/docs">
                    Prepare your integration
                  </a>
                  <a className="developer-portal-secondary" href="/prototype">
                    Explore the fictional workspace
                  </a>
                </div>
                <p>
                  The preview cannot sign you in or create a real account.{" "}
                  <a href="/help">Contact and help →</a>
                </p>
              </>
            ) : (
              <>
                <h1>Page not found.</h1>
                <p>This address does not have a public developer page.</p>
                <a href="/">Return to GetPrio Developers →</a>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="developer-portal-footer">
        <p>
          GetPrio Developers <span>· V1 pre-launch preview</span>
        </p>
        <nav aria-label="Developer resources">
          <a href="/docs">Guides</a>
          <a href="/reference">API reference</a>
          <a href="/faq">FAQ</a>
          <a href="/help">Help</a>
          <a href="/changelog">Changelog</a>
          <a href="https://getprio.online/privacy-policy">Privacy</a>
        </nav>
      </footer>
    </div>
  );
}
