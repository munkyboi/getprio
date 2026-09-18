import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Paper, PasswordInput, Select, Tabs, TextInput } from "@mantine/core";
import QRCodeStyling from "qr-code-styling";
import {
  IconBell,
  IconBuildingCommunity,
  IconBuildingStore,
  IconCheck,
  IconCopy,
  IconDeviceMobile,
  IconEye,
  IconEyeOff,
  IconKey,
  IconRefresh,
  IconScissors,
  IconTicket,
  IconTool,
  IconWebhook,
} from "@tabler/icons-react";
import DeveloperShell from "./DeveloperShell";
import DeveloperWorkspace from "./DeveloperWorkspace";
import DeveloperInputOtp from "./components/DeveloperInputOtp";
import { developerApi, type MfaLoginChallenge, type MfaLoginMethod, type Session } from "./developerApi";
import { codeLanguages, createWebhookSamples, requestSamples, ticketIssueSamples, type CodeLanguage, type CodeSamples } from "./apiCodeSamples";
import "./DeveloperPortalPage.css";

const faqs = [
  [
    "Can I sign up and get API keys now?",
    "Create a Developer Portal account, verify its email, then create a free Sandbox project from the developer workspace. The portal never takes production payments, and production access requires separate approval and MFA.",
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
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
}

function MfaQrCode({ value }: { value: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.replaceChildren();
    const qrCode = new QRCodeStyling({
      type: "svg",
      width: 220,
      height: 220,
      data: value,
      margin: 8,
      dotsOptions: { color: "#101827", type: "rounded" },
      cornersSquareOptions: { color: "#101827", type: "extra-rounded" },
      cornersDotOptions: { color: "#101827", type: "dot" },
      backgroundOptions: { color: "#ffffff" },
    });
    qrCode.append(containerRef.current);
    return () => containerRef.current?.replaceChildren();
  }, [value]);
  return <div className="developer-account-mfa-qr" ref={containerRef} aria-label="Authenticator setup QR code" />;
}

const developerPasswordPolicy = [
  { id: "length", label: "6–32 characters", test: (value: string) => value.length >= 6 && value.length <= 32 },
  { id: "uppercase", label: "1 uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { id: "numbers", label: "2 numbers", test: (value: string) => (value.match(/[0-9]/g) || []).length >= 2 },
  { id: "special", label: "1 special character", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function getDeveloperPasswordChecks(value: string) {
  return developerPasswordPolicy.map((rule) => ({ ...rule, passed: rule.test(value) }));
}

function DeveloperPasswordPolicy({ value, id }: { value: string; id: string }) {
  const [evaluatedValue, setEvaluatedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setEvaluatedValue(value), 250);
    return () => window.clearTimeout(timer);
  }, [value]);

  const checks = getDeveloperPasswordChecks(evaluatedValue);
  const passedCount = checks.filter((rule) => rule.passed).length;
  const strength = Math.round((passedCount / developerPasswordPolicy.length) * 100);
  const strengthLabel = evaluatedValue.length === 0
    ? "Not started"
    : passedCount === developerPasswordPolicy.length
      ? "Strong"
      : passedCount >= 3
        ? "Almost there"
        : passedCount >= 1
          ? "Needs work"
          : "Too weak";

  return (
    <div className="developer-password-policy" id={id} aria-live="polite">
      <div className="developer-password-policy-header">
        <span>Password strength</span>
        <strong>{strengthLabel}</strong>
      </div>
      <div className="developer-password-policy-meter" role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength}>
        <span style={{ width: `${strength}%` }} />
      </div>
      <ul>
        {checks.map((rule) => (
          <li key={rule.id} data-complete={rule.passed || undefined}>
            <span aria-hidden="true">{rule.passed ? "✓" : "○"}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const codeTokenPattern = /https?:\/\/[^\s'"`]+|\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|--?[A-Za-z][\w-]*|\b(?:const|let|var|function|import|from|using|new|return|await|async|class|def|if|else|for|true|false|null|nil|None|GET|POST|PUT|PATCH|DELETE)\b/g;

function codeTokenClass(token: string) {
  if (token.startsWith("//") || token.startsWith("#")) return "developer-portal-code-comment";
  if (token.startsWith("http")) return "developer-portal-code-url";
  if (token.startsWith("'") || token.startsWith('"') || token.startsWith("`")) return "developer-portal-code-string";
  if (token.startsWith("-")) return "developer-portal-code-option";
  if (["POST", "GET", "PUT", "PATCH", "DELETE"].includes(token)) return "developer-portal-code-method";
  if (/^\d/.test(token)) return "developer-portal-code-number";
  return "developer-portal-code-keyword";
}

function ThemedCode({ code }: { code: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of code.matchAll(codeTokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(code.slice(lastIndex, index));
    nodes.push(<span className={codeTokenClass(match[0])} key={`${index}-${match[0]}`}>{match[0]}</span>);
    lastIndex = index + match[0].length;
  }
  if (lastIndex < code.length) nodes.push(code.slice(lastIndex));

  return <code>{nodes}</code>;
}

function CodeSample({ code, language = "cURL", samples, label = "Example request" }: { code?: string; language?: CodeLanguage; samples?: CodeSamples; label?: string }) {
  const [selectedLanguage, setSelectedLanguage] = useState<CodeLanguage>(language);
  const [copied, setCopied] = useState(false);
  const selectedCode = samples?.[selectedLanguage] || code || "";

  async function copyCode() {
    await copyText(selectedCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="developer-portal-code-sample">
      <div className="developer-portal-code-toolbar">
        <span>{label}</span>
        <div className="developer-portal-code-actions">
          {samples && <label className="developer-portal-code-language"><span className="developer-portal-sr-only">Language</span><select value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.currentTarget.value as CodeLanguage)}>{codeLanguages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        <Button type="button" variant="light" onClick={copyCode} aria-live="polite" aria-label={copied ? "Example copied" : "Copy example"}>
          {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        </div>
      </div>
      <pre aria-label={`${selectedLanguage} backend example`}><ThemedCode code={selectedCode} /></pre>
    </div>
  );
}

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

type DocsLink = readonly [string, string];
const docsNavigation: ReadonlyArray<{ title: string; links: readonly DocsLink[] }> = [
  { title: "Start here", links: [["Overview", "overview"], ["Get started", "get-started"], ["Authentication", "authentication"], ["Environments", "environments"]] },
  { title: "Build the flow", links: [["Request flow", "request-flow"], ["Payloads and responses", "payloads"], ["Errors and retries", "errors"], ["Webhooks", "webhooks"]] },
  { title: "Next steps", links: [["Production checklist", "production"], ["API reference", "reference"]] },
] as const;

const docsToc: DocsLink[] = docsNavigation.flatMap((group) => group.links);
const healthSamples = requestSamples({ method: "GET", path: "/health" });
const queueSnapshotSamples = requestSamples({ method: "GET", path: "/queues/example-profile" });

function DocsHeading({ id, children, level = "h2" }: { id: string; children: string; level?: "h1" | "h2" }) {
  const Heading = level;
  return <Heading id={id} className="developer-docs-heading">{children}<a href={`#${id}`} aria-label={`Link to ${children}`} title={`Link to ${children}`}>#</a></Heading>;
}

function DocsFlow() {
  const steps = [
    ["01", "Your backend", "Keep the API key server-side and choose the matching host."],
    ["02", "API edge", "GetPrio validates the environment, credential, and request shape."],
    ["03", "Queue service", "Scopes and profile access are checked before the transaction runs."],
    ["04", "Your response", "Receive a versioned response with a request ID for support."],
    ["05", "Webhook worker", "Signed events are delivered asynchronously and retried until accepted."],
  ] as const;
  return <ol className="developer-docs-flow" aria-label="Request flow from your backend through the API edge and queue service to the response and webhook worker.">{steps.map(([number, title, body], index) => <li key={title}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div>{index < steps.length - 1 && <b aria-hidden="true">→</b>}</li>)}</ol>;
}

function Guides() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (docsToc.some(([, id]) => id === hash)) setActiveSection(hash);
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);
    const headings = docsToc.map(([, id]) => document.getElementById(id)).filter((heading): heading is HTMLElement => Boolean(heading));
    if (!headings.length || !("IntersectionObserver" in window)) return () => window.removeEventListener("hashchange", updateFromHash);
    const observer = new IntersectionObserver(() => {
      const threshold = window.innerHeight * 0.3;
      const current = headings.filter((heading) => heading.getBoundingClientRect().top <= threshold).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || headings[0];
      if (current) setActiveSection(current.id);
    }, { rootMargin: "-14% 0px -68% 0px", threshold: [0, 0.1, 1] });
    headings.forEach((heading) => observer.observe(heading));
    return () => { observer.disconnect(); window.removeEventListener("hashchange", updateFromHash); };
  }, []);

  return <div className="developer-docs" data-testid="developer-docs">
    <div className="developer-docs-layout">
      <aside className="developer-docs-sidebar" aria-label="Guide navigation">
        <a className="developer-docs-brand" href="#overview">GETPRIO <span>GUIDES</span></a>
        {docsNavigation.map((group) => <section key={group.title}><h2>{group.title}</h2>{group.links.map(([label, id]) => <a key={id} className={activeSection === id ? "is-active" : ""} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>{label}</a>)}</section>)}
        <a className="developer-docs-reference-link" href="/reference">Open API reference →</a>
      </aside>
      <details className="developer-docs-mobile-nav"><summary>On this guide <span>{docsToc.find((link) => link[1] === activeSection)?.[0]}</span></summary><nav aria-label="Mobile guide navigation">{docsToc.map(([label, id]) => <a key={id} className={activeSection === id ? "is-active" : ""} href={`#${id}`}>{label}</a>)}</nav></details>
      <article className="developer-docs-content" aria-labelledby="docs-title">
        <header className="developer-docs-hero">
          <p className="developer-portal-eyebrow">GUIDES / V1 PREVIEW</p>
          <h1 id="docs-title">Build your first queue integration.</h1>
          <p className="developer-portal-lede">A practical path from your first Sandbox request to a production-ready backend. Keep secrets on your server, make state changes idempotent, and use the API reference when you need exact fields.</p>
          <div className="developer-docs-hero-actions"><a className="developer-portal-primary" href="/register">Create Sandbox access</a><a className="developer-portal-secondary" href="/reference">Browse API reference</a></div>
          <div className="developer-docs-meta"><span>Sandbox first</span><span>Server-side credentials</span><span>Webhook-ready</span></div>
        </header>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">START HERE</p>
          <DocsHeading id="overview">What you can build</DocsHeading>
          <p>GetPrio gives your backend the queue primitives to create profiles, operate queues, issue tickets, and receive lifecycle events. Your product remains the source of customer context and notification preferences.</p>
          <div className="developer-docs-card-grid"><article><strong>Operate</strong><p>Issue and transition tickets with explicit, auditable state changes.</p></article><article><strong>Connect</strong><p>Give customers a private place to follow their ticket without exposing your API key.</p></article><article><strong>Observe</strong><p>Reconcile responses and signed webhook events by their stable IDs.</p></article></div>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">01 / GET STARTED</p>
          <DocsHeading id="get-started">Make a public health check</DocsHeading>
          <p>Start with a public health check to confirm that your network can reach Sandbox. The endpoint does not require a key; the sample keeps the header so you can reuse it as the first protected request. It checks availability only, not project permission.</p>
          <CodeSample label="Health check" samples={healthSamples} />
          <ol className="developer-docs-checklist"><li><strong>Create a Developer Portal account.</strong><span>Verify your email and open the included Sandbox project.</span></li><li><strong>Create a Sandbox API key.</strong><span>Choose only the scopes your integration needs and keep the secret in server-side storage.</span></li><li><strong>Read a profile or queue.</strong><span>Use the profile slug from your project and the Sandbox host.</span></li></ol>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">02 / AUTHENTICATION</p>
          <DocsHeading id="authentication">Authenticate from your backend</DocsHeading>
          <p>Send the API key in <code>X-API-Key</code> on every protected request. Never place it in browser JavaScript, mobile bundles, screenshots, or customer-facing URLs. Keys are tied to one project and environment; inaccessible profiles return <code>404</code> instead of revealing their existence.</p>
          <div className="developer-docs-callout"><strong>Use the smallest useful scope.</strong><span>Read keys can inspect resources. Write scopes are required for mutations, and selected-profile keys cannot create new profiles.</span></div>
          <CodeSample label="Read a queue snapshot" samples={queueSnapshotSamples} />
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">03 / ENVIRONMENTS</p>
          <DocsHeading id="environments">Keep Sandbox and Production separate</DocsHeading>
          <p>Use matching credentials and origins. A Sandbox key sent to the Production host, or a Production key sent to Sandbox, is rejected as an invalid environment credential.</p>
          <div className="developer-docs-table-wrap"><table><caption>Environment endpoints</caption><thead><tr><th>Environment</th><th>Base URL</th><th>Use it for</th></tr></thead><tbody><tr><th scope="row">Sandbox</th><td><code>https://sandbox-api.getprio.online/v1</code></td><td>Integration tests and synthetic tickets</td></tr><tr><th scope="row">Production</th><td><code>https://api.getprio.online/v1</code></td><td>Approved live applications</td></tr></tbody></table></div>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">04 / REQUEST FLOW</p>
          <DocsHeading id="request-flow">Understand one request end to end</DocsHeading>
          <p>Every protected request follows the same shape. Design your integration around the response first, then add webhook reconciliation for asynchronous updates.</p>
          <DocsFlow />
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">05 / PAYLOADS</p>
          <DocsHeading id="payloads">Issue a ticket with a durable request record</DocsHeading>
          <p>Mutations should include a unique <code>Idempotency-Key</code>. If your network retries, send the same key for the same logical operation and inspect the replayed response.</p>
          <CodeSample label="Issue a ticket" samples={ticketIssueSamples} />
          <div className="developer-docs-payload-grid"><div><h3>Request body</h3><CodeSample label="Request body" code={`{\n  "display_label": "Walk-in",\n  "external_reference": "order-123"\n}`} /></div><div><h3>Successful response</h3><CodeSample label="Successful response" code={`{\n  "data": {\n    "ticket": {\n      "id": "ticket_123",\n      "status": "waiting"\n    }\n  },\n  "request_id": "req_01J..."\n}`} /></div></div>
          <p><a href="/reference#payloads">See the full response envelope and field rules in the reference →</a></p>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">06 / ERRORS</p>
          <DocsHeading id="errors">Handle errors without guessing</DocsHeading>
          <p>Use the HTTP status, machine-readable <code>code</code>, and <code>request_id</code> together. Retry only transient failures or an idempotent operation that your integration has recorded.</p>
          <div className="developer-docs-table-wrap"><table><caption>Common responses</caption><thead><tr><th>Status</th><th>Meaning</th><th>Action</th></tr></thead><tbody><tr><th scope="row">400</th><td>Malformed request or unsupported field</td><td>Fix the request; do not retry unchanged.</td></tr><tr><th scope="row">401</th><td>Missing, invalid, or wrong-environment key</td><td>Check the secret and API origin.</td></tr><tr><th scope="row">403</th><td>Scope or profile access is insufficient</td><td>Use a key with the required scope.</td></tr><tr><th scope="row">409</th><td>State or idempotency conflict</td><td>Read the current resource before deciding.</td></tr><tr><th scope="row">429</th><td>Rate or stream limit reached</td><td>Honor <code>Retry-After</code> with backoff.</td></tr><tr><th scope="row">5xx</th><td>Temporary service failure</td><td>Retry with exponential backoff.</td></tr></tbody></table></div>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">07 / WEBHOOKS</p>
          <DocsHeading id="webhooks">Reconcile signed events</DocsHeading>
          <p>Register a receiver in the Developer Portal, verify the exact raw request body with your signing secret, and return a 2xx only after durable acceptance. Delivery is at-least-once, so deduplicate by <code>GetPrio-Event-Id</code>.</p>
          <div className="developer-docs-webhook-grid"><article><strong>Verify</strong><span>Check timestamp freshness and HMAC-SHA256 before parsing JSON.</span></article><article><strong>Persist</strong><span>Store the event ID and payload before acknowledging the request.</span></article><article><strong>Retry safely</strong><span>Make handlers duplicate-safe and return non-2xx only when a retry is useful.</span></article></div>
          <CodeSample label="Register a webhook" samples={createWebhookSamples} />
          <p><a href="/reference#webhooks">Open webhook headers and delivery details →</a></p>
        </section>

        <section className="developer-docs-section">
          <p className="developer-portal-eyebrow">08 / PRODUCTION</p>
          <DocsHeading id="production">Before you request live access</DocsHeading>
          <ul className="developer-docs-checklist"><li><strong>Your integration passes Sandbox tests.</strong><span>Use synthetic profiles, queues, tickets, and customer references.</span></li><li><strong>Every production user has MFA.</strong><span>Authenticator app or email OTP satisfies the personal requirement.</span></li><li><strong>Your project is approved and funded.</strong><span>Production approval and prepaid credits are separate from Sandbox access.</span></li><li><strong>Your operational controls are ready.</strong><span>Rotate keys, verify webhook signatures, capture request IDs, and limit customer data.</span></li></ul>
        </section>

        <section className="developer-docs-section developer-docs-next-step">
          <p className="developer-portal-eyebrow">KEEP BUILDING</p>
          <DocsHeading id="reference">Use the API reference for exact contracts</DocsHeading>
          <p>The reference lists every endpoint, scope, payload, response, error, and code sample in the same 11 languages. Use it when you are ready to implement a specific queue, profile, ticket, or webhook operation.</p>
          <a className="developer-portal-primary" href="/reference">Open the API reference →</a>
        </section>
      </article>
      <aside className="developer-docs-outline" aria-label="On this page"><p>On this page</p>{docsToc.map(([label, id]) => <a key={id} className={activeSection === id ? "is-active" : ""} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}>{label}</a>)}</aside>
    </div>
  </div>;
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
              Get started for Free
            </a>
            <a className="developer-portal-secondary" href="/docs">
              Read the quickstart
            </a>
            <a className="developer-portal-secondary" href="/reference">
              Explore the API Docs
            </a>
          </div>
          <p className="developer-portal-meta">
            Free sandbox · prepaid production · non-expiring production credits
          </p>
          <p className="developer-portal-preview-note">
            Developer preview. Create an independent Developer Portal account,
            create isolated Sandbox resources, and keep customer data out of tests.
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
          {([
            [
              IconTicket,
              "Issue through your software",
              "Your backend issues tickets and controls their lifecycle. GetPrio maintains the queue order.",
            ],
            [
              IconKey,
              "Connect the customer",
              "The planned mobile flow links an existing ticket through a private link or email-addressed invitation, with explicit acceptance.",
            ],
            [
              IconBell,
              "Keep them informed",
              "Customers will track linked tickets and receive permitted mobile pushes. Your backend can react to queue events.",
            ],
          ] as const).map(([Icon, title, body]) => (
            <article key={title}>
              <div className="developer-portal-card-heading"><Icon size={18} aria-hidden="true" /><h3>{title}</h3></div>
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
          {([
            [
              IconTool,
              "Repair shops",
              "Connect a service-desk queue to your existing work-order software.",
            ],
            [
              IconScissors,
              "Salons & walk-ins",
              "Manage arrivals and counters while customers keep track of their turn.",
            ],
            [
              IconBuildingCommunity,
              "Public services",
              "Coordinate queue order across counters without collecting unnecessary customer details.",
            ],
          ] as const).map(([Icon, title, body]) => (
            <article key={title}>
              <div className="developer-portal-card-heading"><Icon size={18} aria-hidden="true" /><h3>{title}</h3></div>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="developer-portal-section" id="capabilities">
        <p className="developer-portal-eyebrow">THE PLATFORM</p>
        <h2>Your workflow. Connected capabilities.</h2>
        <div className="developer-portal-grid">
          {([
            [
              IconTicket,
              "Queue operations",
              "Issue and manage tickets, read queue snapshots, and stream updates. See the versioned reference for supported endpoints.",
            ],
            [
              IconWebhook,
              "Backend events",
              "Use webhook events to connect your own systems. Customer email and SMS stay with your chosen providers.",
            ],
            [
              IconDeviceMobile,
              "Mobile tracking",
              "Planned ticket linking and GetPrio mobile pushes give customers a place to follow their turn.",
            ],
            [
              IconBuildingStore,
              "Optional discovery",
              "Keep your integration private or choose an approved public directory profile. In-app joining is separately opt-in.",
            ],
            [
              IconKey,
              "Separate environments",
              "Sandbox and Production use separate API origins and matching keys. Test allowance never spends production credits.",
            ],
            [
              IconKey,
              "Scoped access",
              "Keep keys on your backend, limited to the intended project and permissions. Human production access requires personal MFA.",
            ],
          ] as const).map(([Icon, title, body]) => (
            <article key={title}>
              <div className="developer-portal-card-heading"><Icon size={18} aria-hidden="true" /><h3>{title}</h3></div>
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
          <a href="/dashboard">Open your developer workspace →</a>
          <p className="developer-portal-meta">
          Sandbox resources are isolated from production. Keep API keys and
          customer data out of the browser while you test.
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
  "/account/profile": "Account profile",
  "/dashboard/account/profile": "Account profile",
  "/dashboard/account/billing": "Billing & wallet",
  "/dashboard/account/subscriptions": "Project subscriptions",
  "/dashboard/account/team-security": "Team & security",
  "/dashboard/account/security": "Account security",
  "/dashboard": "Developer workspace",
};
function AuthScreen({ mode, onAuthenticated }: { mode: "login" | "register"; onAuthenticated: (session: Session) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationPassword, setRegistrationPassword] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; deliveryTarget: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [loginMfa, setLoginMfa] = useState<MfaLoginChallenge | null>(null);
  const [loginMfaMethod, setLoginMfaMethod] = useState<MfaLoginMethod>("totp");
  const [loginMfaCode, setLoginMfaCode] = useState("");
  const [loginRecoveryCode, setLoginRecoveryCode] = useState("");
  const [loginMfaDelivery, setLoginMfaDelivery] = useState("");
  const enrolling = mode === "register";

  async function verifyCode(code: string) {
    if (!challenge || busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    try {
      const session = await developerApi.verifyRegistration(challenge.challengeId, code);
      onAuthenticated(session);
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not verify that code.");
    } finally { setBusy(false); }
  }

  async function resendCode() {
    if (!challenge) return;
    setBusy(true); setError("");
    try {
      const nextChallenge = await developerApi.resendRegistration(challenge.challengeId);
      setVerificationCode("");
      if (nextChallenge.challengeId) setChallenge({ challengeId: nextChallenge.challengeId, deliveryTarget: nextChallenge.deliveryTarget });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not resend the code.");
    } finally { setBusy(false); }
  }

  async function verifyLoginMfa() {
    if (!loginMfa || busy) return;
    if (loginMfaMethod === "recovery" ? !loginRecoveryCode.trim() : !/^\d{6}$/.test(loginMfaCode)) return;
    setBusy(true); setError("");
    try {
      const session = await developerApi.verifyMfaLogin(loginMfa.challengeToken, loginMfaMethod, loginMfaCode, loginRecoveryCode);
      onAuthenticated(session);
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not verify that sign-in code.");
    } finally { setBusy(false); }
  }

  async function sendLoginEmailOtp() {
    if (!loginMfa || busy) return;
    setBusy(true); setError("");
    try {
      const result = await developerApi.sendLoginEmailOtp(loginMfa.challengeToken);
      setLoginMfa({ ...loginMfa, challengeToken: result.token, expiresAt: result.expiresAt });
      setLoginMfaDelivery(result.deliveryTarget);
      setLoginMfaCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not send an email code.");
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enrolling && challenge) { await verifyCode(verificationCode); return; }
    if (!enrolling && loginMfa) {
      if (loginMfaMethod === "email" && !loginMfaDelivery) { await sendLoginEmailOtp(); return; }
      await verifyLoginMfa();
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (enrolling) {
        const nextChallenge = await developerApi.startRegistration(String(form.get("name") || ""), String(form.get("email") || ""), String(form.get("password") || ""));
        setVerificationCode("");
        if (nextChallenge.challengeId) setChallenge({ challengeId: nextChallenge.challengeId, deliveryTarget: nextChallenge.deliveryTarget });
        else setError("If this email can be registered, a verification code will be sent.");
      } else {
        const result = await developerApi.login(String(form.get("email") || ""), String(form.get("password") || ""));
        if ("mfaRequired" in result) {
          setLoginMfa(result);
          setLoginMfaMethod(result.methods.includes("totp") ? "totp" : result.methods.includes("email") ? "email" : "recovery");
          setLoginMfaCode(""); setLoginRecoveryCode(""); setLoginMfaDelivery("");
        } else {
          onAuthenticated(result);
          window.location.assign("/dashboard");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete sign-in.");
    } finally { setBusy(false); }
  }

  const loginMfaOptions = loginMfa?.methods.filter((method, index, methods) => methods.indexOf(method) === index) || [];
  return <>
    <p className="developer-portal-eyebrow">{enrolling ? "SANDBOX REGISTRATION" : "DEVELOPER LOGIN"}</p>
    <h1>{enrolling ? (challenge ? "Verify your email." : "Create your Developer Portal account.") : loginMfa ? "Verify your sign-in." : "Welcome back."}</h1>
    <p className="developer-portal-lede">{enrolling ? (challenge ? `Enter the code sent to ${challenge.deliveryTarget}.` : "Use an independent Developer Portal account. It starts with free Sandbox access.") : loginMfa ? (loginMfaDelivery ? `Enter the code sent to ${loginMfaDelivery}.` : "Choose an available verification method to finish signing in.") : "Sign in to manage your Sandbox project, API keys, profiles, queues, and webhooks."}</p>
    <form className="developer-portal-auth-form" onSubmit={(event) => void submit(event)}>
      {enrolling && !challenge && <TextInput label="Name" name="name" autoComplete="name" minLength={2} maxLength={120} required />}
      {!challenge && !loginMfa && <TextInput label="Email" name="email" type="email" autoComplete="email" required />}
      {enrolling && challenge ? <div className="developer-portal-otp-field"><div className="developer-portal-otp-label-row"><label htmlFor="developer-registration-code">Verification code</label><Button type="button" variant="light" className="developer-portal-otp-resend" disabled={busy} onClick={() => void resendCode()} leftSection={<IconRefresh size={16} aria-hidden="true" />}>{busy ? "Resending…" : "Resend code"}</Button></div><DeveloperInputOtp id="developer-registration-code" value={verificationCode} onChange={setVerificationCode} onComplete={(code) => void verifyCode(code)} disabled={busy} invalid={Boolean(error)} /></div> : enrolling ? <div className="developer-password-field"><TextInput label="Password" key="developer-registration-password" name="password" type="password" autoComplete="new-password" minLength={6} maxLength={32} value={registrationPassword} onChange={(event) => setRegistrationPassword(event.currentTarget.value)} aria-describedby="developer-registration-password-policy" required /><DeveloperPasswordPolicy id="developer-registration-password-policy" value={registrationPassword} /></div> : loginMfa ? <>
        <Select label="Verification method" value={loginMfaMethod} onChange={(value) => { const next = (value || "totp") as MfaLoginMethod; setLoginMfaMethod(next); setLoginMfaCode(""); setLoginRecoveryCode(""); setLoginMfaDelivery(""); }} data={loginMfaOptions.map((method) => ({ value: method, label: method === "totp" ? "Authenticator app" : method === "email" ? "Email OTP" : "Recovery code" }))} />
        {loginMfaMethod === "email" && !loginMfaDelivery ? <Button type="submit" className="developer-portal-secondary" disabled={busy} loading={busy}>Send code to my email</Button> : loginMfaMethod === "recovery" ? <TextInput label="Recovery code" value={loginRecoveryCode} onChange={(event) => setLoginRecoveryCode(event.currentTarget.value)} autoComplete="one-time-code" placeholder="ABCDE-12345" /> : <TextInput label={loginMfaMethod === "email" ? "Email OTP" : "Authenticator code"} value={loginMfaCode} onChange={(event) => setLoginMfaCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="123456" />}
      </> : <TextInput label="Password" key="developer-login-password" name="password" type="password" autoComplete="current-password" required />}
      {error && <p className="developer-portal-auth-error" role="alert">{error}</p>}
      {(!loginMfa || (loginMfaMethod !== "email" || Boolean(loginMfaDelivery))) && <Button type="submit" className="developer-portal-primary" loading={busy}>{busy ? "Please wait…" : enrolling ? (challenge ? "Verify and create account" : "Send verification code") : loginMfa ? "Verify sign-in" : "Log in"}</Button>}
    </form>
    {!loginMfa && <p>{enrolling ? <>This creates a Developer Portal account only. You do not need a GetPrio marketplace account.<br /><span className="developer-portal-auth-switch">Already registered? <a href="/login">Developer login →</a></span></> : <>Need a Developer Portal account? <a href="/register">Get started for Free →</a></>}</p>}
    {!loginMfa && <p className="developer-portal-preview-note">Production access is separate. It requires Developer Portal approval and personal MFA; Sandbox credentials do not work in production.</p>}
  </>;
}

function DeveloperAccountProfile({ session, embedded = false, onPasswordChanged, onSessionChange }: { session: Session; embedded?: boolean; onPasswordChanged?: () => void; onSessionChange?: (next: Session) => void }) {
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaNotice, setMfaNotice] = useState("");
  const [mfaEnrollment, setMfaEnrollment] = useState<{ secret: string; otpAuthUri: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaCurrentCode, setMfaCurrentCode] = useState("");
  const [mfaRecoveryCode, setMfaRecoveryCode] = useState("");
  const [mfaPassword, setMfaPassword] = useState("");
  const [emailMfaPassword, setEmailMfaPassword] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  async function startMfaEnrollment() {
    setMfaBusy(true); setMfaError(""); setMfaNotice("");
    try {
      const enrollment = await developerApi.startMfaEnrollment(mfaCurrentCode, session.csrfToken);
      setMfaEnrollment(enrollment); setMfaCode(""); setRecoveryCodes([]);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not start authenticator setup.");
    } finally { setMfaBusy(false); }
  }

  async function confirmMfaEnrollment() {
    if (!mfaEnrollment || !/^\d{6}$/.test(mfaCode)) return;
    setMfaBusy(true); setMfaError(""); setMfaNotice("");
    try {
      const result = await developerApi.confirmMfaEnrollment(mfaCode, session.csrfToken);
      setRecoveryCodes(result.recoveryCodes); setMfaEnrollment(null); setMfaCode(""); setMfaCurrentCode("");
      onSessionChange?.({ ...session, user: result.user });
      setMfaNotice(result.message);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not verify that authenticator code.");
    } finally { setMfaBusy(false); }
  }

  async function cancelMfaEnrollment() {
    setMfaBusy(true); setMfaError("");
    try {
      await developerApi.cancelMfaEnrollment(session.csrfToken);
      setMfaEnrollment(null); setMfaCode(""); setMfaCurrentCode("");
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not cancel authenticator setup.");
    } finally { setMfaBusy(false); }
  }

  async function disableMfa() {
    if (!mfaPassword || (!mfaCode && !mfaRecoveryCode)) return;
    setMfaBusy(true); setMfaError(""); setMfaNotice("");
    try {
      const result = await developerApi.disableMfa(mfaPassword, mfaCode, mfaRecoveryCode, session.csrfToken);
      onSessionChange?.({ ...session, user: result.user });
      setMfaPassword(""); setMfaCode(""); setMfaRecoveryCode(""); setMfaNotice(result.message);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not remove MFA from this account.");
    } finally { setMfaBusy(false); }
  }

  async function enableEmailMfa() {
    setMfaBusy(true); setMfaError(""); setMfaNotice("");
    try {
      const result = await developerApi.enableEmailMfa(session.csrfToken);
      onSessionChange?.({ ...session, user: result.user });
      setMfaNotice(result.message);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not enable email OTP.");
    } finally { setMfaBusy(false); }
  }

  async function disableEmailMfa() {
    if (!emailMfaPassword) return;
    setMfaBusy(true); setMfaError(""); setMfaNotice("");
    try {
      const result = await developerApi.disableEmailMfa(emailMfaPassword, session.csrfToken);
      onSessionChange?.({ ...session, user: result.user });
      setEmailMfaPassword(""); setMfaNotice(result.message);
    } catch (caught) {
      setMfaError(caught instanceof Error ? caught.message : "We could not disable email OTP.");
    } finally { setMfaBusy(false); }
  }

  async function storeRecoveryCodes() {
    if (!recoveryCodes.length) return;
    await copyText(recoveryCodes.join("\n"));
    setRecoveryCodes([]);
    setMfaNotice("Recovery codes copied. Store them somewhere secure; they will not be shown again.");
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || newPasswordValue);
    const confirmPassword = String(form.get("confirmPassword") || "");
    setPasswordBusy(true);
    setPasswordError("");
    setPasswordSuccess("");
    try {
      if (!getDeveloperPasswordChecks(newPassword).every((rule) => rule.passed)) {
        throw new Error("Use a password with 1 special character, 2 numbers, 1 uppercase letter, and 6–32 characters.");
      }
      const result = await developerApi.changePassword(currentPassword, newPassword, confirmPassword, session.csrfToken);
      setPasswordSuccess(result.message);
      event.currentTarget.reset();
      setNewPasswordValue("");
      window.setTimeout(() => onPasswordChanged?.(), 900);
    } catch (caught) {
      setPasswordError(caught instanceof Error ? caught.message : "We could not change your password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  return <section className={`developer-portal-content developer-account-profile${embedded ? " developer-account-profile-embedded" : ""}`}>
    <p className="developer-portal-eyebrow">ACCOUNT PROFILE</p>
    <h1>Account profile.</h1>
    <p className="developer-portal-lede">Manage your Developer Portal identity, password, and security requirements.</p>
    <Tabs defaultValue={new URLSearchParams(window.location.search).get("tab") === "security" ? "security" : "personal"} className="developer-account-tabs">
      <Tabs.List grow aria-label="Account profile sections">
        <Tabs.Tab value="personal">Personal Details</Tabs.Tab>
        <Tabs.Tab value="password">Password</Tabs.Tab>
        <Tabs.Tab value="security">Security</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="personal" pt="xl">
        <Paper withBorder p="xl" className="developer-account-profile-card">
          <p className="developer-portal-eyebrow">PERSONAL DETAILS</p>
          <h2>Your developer identity</h2>
          <div className="developer-account-profile-fields">
            <TextInput label="Name" value={session.user.displayName || session.user.name} readOnly />
            <TextInput label="Email" value={session.user.email} readOnly />
          </div>
          <p className="developer-account-profile-note">Personal details are read-only in this Developer Portal until the account profile update endpoint is connected.</p>
        </Paper>
      </Tabs.Panel>
      <Tabs.Panel value="password" pt="xl">
        <Paper withBorder p="xl" className="developer-account-profile-card">
          <p className="developer-portal-eyebrow">PASSWORD</p>
          <h2>Change your password</h2>
          <p>Use a unique password for your Developer Portal account. Password changes invalidate active sessions on every device.</p>
          <form className="developer-account-profile-form" onSubmit={(event) => void submitPassword(event)}>
            <div className="developer-account-profile-fields">
              <PasswordInput label="Current password" name="currentPassword" placeholder="Enter current password" autoComplete="current-password" required visibilityToggleIcon={({ reveal }) => reveal ? <IconEyeOff size={18} stroke={1.8} /> : <IconEye size={18} stroke={1.8} />} visibilityToggleButtonProps={{ "aria-label": "Toggle current password visibility" }} />
              <div className="developer-password-field">
                <PasswordInput label="New password" name="newPassword" placeholder="Enter new password" autoComplete="new-password" minLength={6} maxLength={32} value={newPasswordValue} onChange={(event) => setNewPasswordValue(event.currentTarget.value)} aria-describedby="developer-account-password-policy" required visibilityToggleIcon={({ reveal }) => reveal ? <IconEyeOff size={18} stroke={1.8} /> : <IconEye size={18} stroke={1.8} />} visibilityToggleButtonProps={{ "aria-label": "Toggle new password visibility" }} />
                <DeveloperPasswordPolicy id="developer-account-password-policy" value={newPasswordValue} />
              </div>
              <PasswordInput label="Confirm new password" name="confirmPassword" placeholder="Repeat new password" autoComplete="new-password" minLength={6} maxLength={32} required visibilityToggleIcon={({ reveal }) => reveal ? <IconEyeOff size={18} stroke={1.8} /> : <IconEye size={18} stroke={1.8} />} visibilityToggleButtonProps={{ "aria-label": "Toggle confirmation password visibility" }} />
            </div>
            {passwordError && <p className="developer-workspace-error" role="alert">{passwordError}</p>}
            {passwordSuccess && <p className="developer-account-profile-success" role="status">{passwordSuccess}</p>}
            <Button type="submit" loading={passwordBusy} className="developer-portal-primary">Update password</Button>
          </form>
          <p className="developer-account-profile-note">You will be signed out on every device after the password changes.</p>
        </Paper>
      </Tabs.Panel>
      <Tabs.Panel value="security" pt="xl">
        <Paper withBorder p="xl" className="developer-account-profile-card">
          <p className="developer-portal-eyebrow">SECURITY</p>
          <h2>Protect your account</h2>
          <p>Production access requires your personal MFA. Email verification protects account recovery and enrollment.</p>
          {mfaError && <p className="developer-workspace-error" role="alert">{mfaError}</p>}
          {mfaNotice && <p className="developer-account-profile-success" role="status">{mfaNotice}</p>}
          <div className="developer-account-security-options">
            <article>
              <div><h3>Authenticator app</h3><p>{session.user.mfaEnabled && !session.user.emailMfaEnabled ? "An authenticator is enabled for this account." : "Add an authenticator app as a secure sign-in method."}</p></div>
              <Badge color={session.user.mfaEnabled && !session.user.emailMfaEnabled ? "teal" : "blue"} variant="light" radius="xl">{session.user.mfaEnabled && !session.user.emailMfaEnabled ? "Enabled" : "Optional"}</Badge>
              {session.user.mfaEnabled && !session.user.emailMfaEnabled && !mfaEnrollment && <TextInput label="Current authenticator code" value={mfaCurrentCode} onChange={(event) => setMfaCurrentCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="123456" />}
              {!mfaEnrollment && <Button type="button" variant="light" onClick={() => void startMfaEnrollment()} disabled={mfaBusy || (session.user.mfaEnabled && !session.user.emailMfaEnabled && !/^\d{6}$/.test(mfaCurrentCode))} loading={mfaBusy}>{session.user.mfaEnabled && !session.user.emailMfaEnabled ? "Replace authenticator" : "Set up authenticator app"}</Button>}
              {mfaEnrollment && <div className="developer-account-mfa-enrollment"><p>Scan this QR code with your authenticator app, then enter the six-digit code. You can also copy the setup secret if your app does not support scanning.</p><MfaQrCode value={mfaEnrollment.otpAuthUri} /><TextInput label="Secret" value={mfaEnrollment.secret} readOnly /><TextInput label="Authenticator URI" value={mfaEnrollment.otpAuthUri} readOnly /><TextInput label="Verification code" value={mfaCode} onChange={(event) => setMfaCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="123456" /><div className="developer-account-profile-actions"><Button type="button" onClick={() => void confirmMfaEnrollment()} disabled={!/^\d{6}$/.test(mfaCode) || mfaBusy} loading={mfaBusy}>Confirm authenticator</Button><Button type="button" variant="outline" onClick={() => void cancelMfaEnrollment()} disabled={mfaBusy}>Cancel</Button></div></div>}
              {recoveryCodes.length > 0 && <div className="developer-account-mfa-recovery" role="status"><strong>Copy these recovery codes now.</strong><p>They are shown once and cannot be recovered later. Store them somewhere secure before leaving this page.</p><code>{recoveryCodes.join("\n")}</code><div className="developer-account-profile-actions"><Button type="button" onClick={() => void storeRecoveryCodes()} leftSection={<IconCopy size={16} aria-hidden="true" />}>Copy recovery codes</Button><Button type="button" variant="outline" onClick={() => { setRecoveryCodes([]); setMfaNotice("Recovery codes hidden. They will not be shown again."); }}>I stored them securely</Button></div></div>}
              {session.user.mfaEnabled && !session.user.emailMfaEnabled && !mfaEnrollment && <div className="developer-account-mfa-disable"><PasswordInput label="Password to remove MFA" value={mfaPassword} onChange={(event) => setMfaPassword(event.currentTarget.value)} autoComplete="current-password" /><TextInput label="Authenticator code or recovery code" value={mfaRecoveryCode ? "" : mfaCode} onChange={(event) => { setMfaCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)); setMfaRecoveryCode(""); }} placeholder="123456" /><TextInput label="Recovery code (alternative)" value={mfaRecoveryCode} onChange={(event) => { setMfaRecoveryCode(event.currentTarget.value); setMfaCode(""); }} placeholder="ABCDE-12345" /><Button type="button" color="red" variant="light" onClick={() => void disableMfa()} disabled={mfaBusy || !mfaPassword || (!mfaCode && !mfaRecoveryCode)} loading={mfaBusy}>Remove MFA</Button></div>}
            </article>
            <article>
              <div><h3>Email OTP</h3><p>{session.user.emailMfaEnabled ? "Email OTP is enabled as an alternate sign-in method." : session.user.emailVerified ? "Optional: enable a one-time code sent to your verified email during sign-in." : "Verify your email address before enabling email OTP."}</p></div>
              <Badge color={session.user.emailMfaEnabled ? "teal" : session.user.emailVerified ? "blue" : "yellow"} variant="light" radius="xl">{session.user.emailMfaEnabled ? "Enabled" : session.user.emailVerified ? "Optional" : "Verification needed"}</Badge>
              {session.user.emailMfaEnabled ? <div className="developer-account-mfa-disable"><PasswordInput label="Password to disable email OTP" value={emailMfaPassword} onChange={(event) => setEmailMfaPassword(event.currentTarget.value)} autoComplete="current-password" /><Button type="button" color="red" variant="light" onClick={() => void disableEmailMfa()} disabled={mfaBusy || !emailMfaPassword} loading={mfaBusy}>Disable email OTP</Button></div> : <Button variant="light" onClick={() => void enableEmailMfa()} disabled={mfaBusy || !session.user.emailVerified} loading={mfaBusy}>Enable email OTP</Button>}
            </article>
          </div>
          <p className="developer-account-profile-note">MFA requires at least one method for privileged accounts. Email OTP is optional, and can be used instead of an authenticator app during sign-in when enabled.</p>
        </Paper>
      </Tabs.Panel>
    </Tabs>
  </section>;
}

export default function DeveloperPortalPage() {
  const [light, setLight] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname.replace(/\/+$/, "") || "/");
  const isDashboardPath = path === "/dashboard" || path.startsWith("/dashboard/");
  const isAccountProfilePath = path === "/dashboard/account/profile" || path === "/account/profile";
  const title = isDashboardPath ? pageTitles["/dashboard"] : pageTitles[path] || "Page not found";
  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname.replace(/\/+$/, "") || "/");
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);
  useEffect(() => {
    document.title = `${title} · GetPrio Developers`;
  }, [title]);
  useEffect(() => {
    void developerApi.me().then(setSession).catch(() => setSession(null)).finally(() => setSessionChecked(true));
  }, []);
  async function logout() {
    try {
      if (session) await developerApi.logout(session.csrfToken);
    } catch {
      // A stale session or CSRF token must not leave the portal looking signed in.
      // The server request is best-effort; the local session is still cleared below.
    } finally {
      setSession(null);
      window.location.assign("/");
    }
  }
  function handlePasswordChanged() {
    setSession(null);
    window.location.assign("/login");
  }
  return (
    <div
      className={`developer-portal${light ? " developer-portal-light" : ""}`}
      data-testid="developer-portal"
    >
      <DeveloperShell light={light} onToggleTheme={() => setLight(!light)} path={path} authenticated={Boolean(session)} session={session} onLogout={logout}>
        <main id="main-content" tabIndex={-1}>
        {isDashboardPath && session ? (
          <DeveloperWorkspace session={session} light={light} accountContent={<DeveloperAccountProfile key={path} session={session} embedded onPasswordChanged={handlePasswordChanged} onSessionChange={setSession} />} />
        ) : isAccountProfilePath && session ? (
          <DeveloperWorkspace session={session} light={light} accountContent={<DeveloperAccountProfile key={path} session={session} embedded onPasswordChanged={handlePasswordChanged} onSessionChange={setSession} />} />
        ) : path === "/" ? (
          <Landing />
        ) : path === "/docs" ? (
          <Guides />
        ) : (
          <section className="developer-portal-content">
            {path === "/faq" ? (
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
                  <h2>V1 developer preview</h2>
                  <p>
                    The public portal provides integration guides, FAQ, pricing
                    information, and a read-only API reference. Independent
                    Developer Portal accounts can create isolated Sandbox
                    resources in the developer workspace.
                  </p>
                  <p>
                    The{" "}
                    <a href="https://api.getprio.online/v1/openapi.json">
                      published OpenAPI document
                    </a>{" "}
                    describes the current API contract. Production access,
                    billing, and mobile Sandbox distribution are not enabled in
                    this preview. This is not a general-availability
                    announcement.
                  </p>
                </article>
              </>
            ) : path === "/login" || path === "/register" ? (
              <AuthScreen mode={path === "/login" ? "login" : "register"} onAuthenticated={setSession} />
            ) : isDashboardPath && sessionChecked ? (
              <>
                <p className="developer-portal-eyebrow">DEVELOPER WORKSPACE</p>
                <h1>Sign in to your workspace.</h1>
                <p className="developer-portal-lede">Your session is not active. Log in to manage Sandbox projects and credentials.</p>
                <a className="developer-portal-primary" href="/login">Developer login</a>
              </>
            ) : isAccountProfilePath && sessionChecked ? (
              <>
                <p className="developer-portal-eyebrow">ACCOUNT PROFILE</p>
                <h1>Sign in to view your profile.</h1>
                <p className="developer-portal-lede">Your personal details, password, and security settings require an active Developer Portal session.</p>
                <a className="developer-portal-primary" href="/login">Developer login</a>
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
      </DeveloperShell>
    </div>
  );
}
