import { useEffect, useState, type ReactElement } from "react";
import { Button } from "@mantine/core";
import { IconBuildingStore, IconLink, IconTicket, IconWebhook } from "@tabler/icons-react";
import DeveloperShell from "./DeveloperShell";
import { codeLanguages, createProfileSamples, readTicketSamples, ticketIssueSamples, type CodeLanguage, type CodeSamples } from "./apiCodeSamples";
import "./DeveloperReferencePage.css";

const navigation = [
  { title: "Start here", links: [["Overview", "#overview"], ["Get started", "#get-started"], ["Authentication", "#authentication"], ["Environments", "#environments"], ["API service flow", "#request-flow"], ["Common workflows", "#workflows"]] },
  { title: "Using the API", links: [["Conventions", "#conventions"], ["Errors and retries", "#limits"], ["Webhook verification", "#webhook-verification"], ["Best practices", "#best-practices"]] },
  { title: "API reference", links: [["Payloads and responses", "#payloads"], ["Profiles", "#profiles"], ["Queues and tickets", "#queues"], ["Webhooks", "#webhooks"]] }
];

const tocLinks = [
  ["overview", "What you can build"],
  ["get-started", "Start here"],
  ["authentication", "Authentication"],
  ["environments", "Environments"],
  ["request-flow", "API service flow"],
  ["workflows", "Common workflow"],
  ["payloads", "Payloads and responses"],
  ["conventions", "Standards and conventions"],
  ["limits", "Errors and retries"],
  ["webhook-verification", "Webhook verification"],
  ["profiles", "Profiles"],
  ["queues", "Queues and tickets"],
  ["webhooks", "Webhooks"],
  ["changelog", "Changelog"]
] as const;

type ReferenceEndpointRow = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  scope: string;
  purpose: string;
};

const utilityEndpointRows: ReferenceEndpointRow[] = [
  { method: "GET", path: "/", scope: "—", purpose: "Read API metadata and the current contract version." },
  { method: "GET", path: "/health", scope: "—", purpose: "Check API availability." }
];

const profileEndpointRows: ReferenceEndpointRow[] = [
  { method: "GET", path: "/profiles", scope: "profiles:read", purpose: "List profiles visible to the key." },
  { method: "POST", path: "/profiles", scope: "profiles:write", purpose: "Create a profile with slug and display_name." },
  { method: "PATCH", path: "/profiles/:profileSlug", scope: "profiles:write", purpose: "Update profile metadata or save a directory draft." },
  { method: "GET", path: "/profiles/:profileSlug/queues", scope: "queues:read", purpose: "List queues for a profile." },
  { method: "POST", path: "/profiles/:profileSlug/queues", scope: "queues:write", purpose: "Create a queue; requires an idempotency key." },
  { method: "PATCH", path: "/profiles/:profileSlug/queues/:queueSlug", scope: "queues:write", purpose: "Update queue settings; send resource_version for optimistic concurrency." }
];

const queueEndpointRows: ReferenceEndpointRow[] = [
  { method: "GET", path: "/queues/:profileSlug", scope: "queues:read", purpose: "Read the snapshot, current ticket, and next tickets." },
  { method: "GET", path: "/queues/:profileSlug/locations", scope: "queues:read", purpose: "List queues through the location-compatible route." },
  { method: "GET", path: "/queues/:profileSlug/locations/:locationSlug", scope: "queues:read", purpose: "Read a queue snapshot through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/tickets", scope: "queues:write", purpose: "Issue a ticket; requires an idempotency key." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/tickets", scope: "queues:write", purpose: "Issue a ticket through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/call-next", scope: "queues:write", purpose: "Call the next waiting ticket." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/call-next", scope: "queues:write", purpose: "Call the next waiting ticket through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/current/confirm", scope: "queues:write", purpose: "Confirm the customer for the current called ticket." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/current/confirm", scope: "queues:write", purpose: "Confirm the customer through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/current/serve", scope: "queues:write", purpose: "Mark the current called ticket served." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/current/serve", scope: "queues:write", purpose: "Serve the current ticket through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/current/skip", scope: "queues:write", purpose: "Skip the current called ticket." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/current/skip", scope: "queues:write", purpose: "Skip the current ticket through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/tickets/:ticketId/cancel", scope: "queues:write", purpose: "Cancel a waiting ticket." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/tickets/:ticketId/cancel", scope: "queues:write", purpose: "Cancel a waiting ticket through the location-compatible route." },
  { method: "POST", path: "/queues/:profileSlug/tickets/:ticketId/restore", scope: "queues:write", purpose: "Restore a skipped ticket." },
  { method: "POST", path: "/queues/:profileSlug/locations/:locationSlug/tickets/:ticketId/restore", scope: "queues:write", purpose: "Restore a skipped ticket through the location-compatible route." },
  { method: "GET", path: "/queues/:profileSlug/tickets/:ticketId", scope: "queues:read", purpose: "Read one ticket by opaque ID." },
  { method: "GET", path: "/queues/:profileSlug/locations/:locationSlug/tickets/:ticketId", scope: "queues:read", purpose: "Read a ticket through the location-compatible route." },
  { method: "GET", path: "/queues/:profileSlug/tickets/:ticketId/events", scope: "queues:read", purpose: "Read lifecycle events with a cursor." },
  { method: "GET", path: "/queues/:profileSlug/locations/:locationSlug/tickets/:ticketId/events", scope: "queues:read", purpose: "Read lifecycle events through the location-compatible route." },
  { method: "GET", path: "/queues/:profileSlug/stream", scope: "queues:read", purpose: "Open an SSE stream of queue snapshot updates." },
  { method: "GET", path: "/queues/:profileSlug/locations/:locationSlug/stream", scope: "queues:read", purpose: "Open an SSE stream through the location-compatible route." }
];

function EndpointRows({ rows }: { rows: ReferenceEndpointRow[] }) {
  return <>{rows.map((row) => <tr key={`${row.method}-${row.path}`}><th scope="row">{row.method}</th><td><code>{row.path}</code></td><td><code>{row.scope}</code></td><td>{row.purpose}</td></tr>)}</>;
}


const responseExample = [
  "{",
  "  \"data\": { \"ticket\": { \"id\": \"ticket_123\", \"status\": \"waiting\" } },",
  "  \"request_id\": \"req_01J...\"",
  "}"
].join("\n");

const ticketResponseExample = [
  "{",
  "  \"data\": {",
  "    \"ticket\": {",
  "      \"id\": \"ticket_123\",",
  "      \"ticket_number\": \"A-042\",",
  "      \"status\": \"waiting\",",
  "      \"queue_id\": \"queue_123\",",
  "      \"resource_version\": 1,",
  "      \"created_at\": \"2026-09-18T12:00:00.000Z\"",
  "    }",
  "  },",
  "  \"request_id\": \"req_01J...\"",
  "}"
].join("\n");

const errorResponseExample = [
  "{",
  "  \"message\": \"The idempotency key is already in use for a different request.\",",
  "  \"correlationId\": \"req_01J...\",",
  "  \"code\": \"IDEMPOTENCY_CONFLICT\"",
  "}"
].join("\n");

const webhookVerificationExample = [
  "const crypto = require(\"node:crypto\");",
  "",
  "function verifyGetPrioWebhook(rawBody, header, secret) {",
  "  const parts = header.split(\",\").map((part) => part.split(\"=\", 2));",
  "  const timestamp = Number(parts.find(([key]) => key === \"t\")?.[1]);",
  "  const period = parts.find(([key]) => key === \"p\")?.[1];",
  "  const signatures = parts.filter(([key]) => key === \"v1\").map(([, value]) => value);",
  "  if (!Number.isFinite(timestamp) || !period || !signatures.length || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;",
  "  const signed = timestamp + \".\" + period + \".\" + rawBody;",
  "  const expected = crypto.createHmac(\"sha256\", secret).update(signed).digest(\"hex\");",
  "  return signatures.some((value) => /^[a-f0-9]{64}$/i.test(value) && crypto.timingSafeEqual(Buffer.from(expected, \"hex\"), Buffer.from(value, \"hex\")));",
  "}"
].join("\n");

function ApiSequenceDiagram() {
  const participants = [
    [100, "Your app"],
    [300, "API edge"],
    [500, "Auth + scopes"],
    [700, "Domain + DB"],
    [900, "Webhook worker"]
  ] as const;
  return (
    <figure className="developer-reference-sequence">
      <svg viewBox="0 0 1000 570" role="img" aria-labelledby="api-sequence-title api-sequence-description">
        <title id="api-sequence-title">GetPrio API service request sequence</title>
        <desc id="api-sequence-description">An application sends an authenticated request to the API edge. Authentication and scopes are checked, the domain transaction is persisted with idempotency, a response is returned, and a signed webhook is delivered asynchronously.</desc>
        <defs>
          <marker id="developer-reference-sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="developer-reference-sequence-arrow" />
          </marker>
        </defs>
        {participants.map(([x, label]) => (
          <g key={label}>
            <rect x={x - 68} y="18" width="136" height="42" rx="10" className="developer-reference-sequence-participant" />
            <text x={x} y="44" textAnchor="middle" className="developer-reference-sequence-label">{label}</text>
            <line x1={x} y1="60" x2={x} y2="535" className="developer-reference-sequence-lifeline" />
          </g>
        ))}
        <line x1="100" y1="112" x2="300" y2="112" className="developer-reference-sequence-message" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="200" y="101" textAnchor="middle" className="developer-reference-sequence-message-label">POST /v1/... + API key</text>
        <line x1="300" y1="174" x2="500" y2="174" className="developer-reference-sequence-message" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="400" y="163" textAnchor="middle" className="developer-reference-sequence-message-label">Validate environment and credential</text>
        <line x1="500" y1="236" x2="700" y2="236" className="developer-reference-sequence-message" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="600" y="225" textAnchor="middle" className="developer-reference-sequence-message-label">Authorize scope and profile access</text>
        <path d="M 700 295 h 82 v 28 h -82" className="developer-reference-sequence-message" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="782" y="286" textAnchor="end" className="developer-reference-sequence-message-label">Idempotent transaction</text>
        <line x1="700" y1="370" x2="300" y2="370" className="developer-reference-sequence-message developer-reference-sequence-return" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="500" y="359" textAnchor="middle" className="developer-reference-sequence-message-label">201 / 200 + data + request_id</text>
        <line x1="300" y1="424" x2="100" y2="424" className="developer-reference-sequence-message developer-reference-sequence-return" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="200" y="413" textAnchor="middle" className="developer-reference-sequence-message-label">Return response to your app</text>
        <line x1="700" y1="486" x2="900" y2="486" className="developer-reference-sequence-message developer-reference-sequence-async" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="800" y="475" textAnchor="middle" className="developer-reference-sequence-message-label">Queue signed event delivery</text>
        <line x1="900" y1="530" x2="100" y2="530" className="developer-reference-sequence-message developer-reference-sequence-async developer-reference-sequence-return" markerEnd="url(#developer-reference-sequence-arrow)" />
        <text x="500" y="519" textAnchor="middle" className="developer-reference-sequence-message-label">Webhook delivery; retry until 2xx</text>
      </svg>
      <figcaption>Mutations are committed before the response is returned. Webhook delivery is asynchronous and independently retried, so consumers should deduplicate by event ID.</figcaption>
    </figure>
  );
}

const codeTokenPattern = /https?:\/\/[^\s'"`]+|\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|--?[A-Za-z][\w-]*|\b(?:const|let|var|function|import|from|using|new|return|await|async|class|def|if|else|for|true|false|null|nil|None|GET|POST|PUT|PATCH|DELETE)\b/g;

function codeTokenClass(token: string) {
  if (token.startsWith("//") || token.startsWith("#")) return "developer-reference-code-comment";
  if (token.startsWith("http")) return "developer-reference-code-url";
  if (token.startsWith("'") || token.startsWith("\"") || token.startsWith("`")) return "developer-reference-code-string";
  if (token.startsWith("-")) return "developer-reference-code-option";
  if (["POST", "GET", "PUT", "PATCH", "DELETE"].includes(token)) return "developer-reference-code-method";
  if (/^\d/.test(token)) return "developer-reference-code-number";
  return "developer-reference-code-keyword";
}

function HighlightedCode({ code }: { code: string }) {
  const nodes: Array<string | ReactElement> = [];
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

function CodeSample({ label, value, samples, onCopy }: { label: string; value?: string; samples?: CodeSamples; onCopy: (value: string) => void }) {
  const [language, setLanguage] = useState<CodeLanguage>(codeLanguages[0]);
  const selectedValue = samples?.[language] || value || "";
  return <div className="developer-reference-code-sample">
    <div className="developer-reference-code-toolbar"><span>{label}</span><div className="developer-reference-code-actions">{samples && <label><span className="developer-reference-sr-only">Language</span><select className="developer-reference-language-select" value={language} onChange={(event) => setLanguage(event.currentTarget.value as CodeLanguage)}>{codeLanguages.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}<Button type="button" variant="light" onClick={() => onCopy(selectedValue)}>Copy</Button></div></div>
    <pre><HighlightedCode code={selectedValue} /></pre>
  </div>;
}

function BookmarkableHeading({
  id,
  children,
  level = "h2",
}: {
  id: string;
  children: string;
  level?: "h1" | "h2";
}) {
  const Heading = level;
  return (
    <Heading id={id} className="developer-reference-bookmark-heading">
      {children}
      <a className="developer-reference-heading-link" href={`#${id}`} aria-label={`Link to ${children}`} title={`Link to ${children}`}>
        <IconLink size={level === "h1" ? 23 : 18} aria-hidden="true" />
      </a>
    </Heading>
  );
}

export default function DeveloperReferencePage() {
  const [light, setLight] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (tocLinks.some(([id]) => id === hash)) setActiveSection(hash);
    };
    updateFromHash();
    window.addEventListener("hashchange", updateFromHash);

    const headings = tocLinks
      .map(([id]) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => Boolean(heading));
    if (!headings.length || !("IntersectionObserver" in window)) return () => window.removeEventListener("hashchange", updateFromHash);

    const observer = new IntersectionObserver(() => {
      const threshold = window.innerHeight * 0.3;
      const current = headings
        .filter((heading) => heading.getBoundingClientRect().top <= threshold)
        .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || headings[0];
      if (current) setActiveSection(current.id);
    }, { rootMargin: "-14% 0px -68% 0px", threshold: [0, 0.1, 1] });

    headings.forEach((heading) => observer.observe(heading));
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", updateFromHash);
    };
  }, []);

  async function copyValue(value: string, id = "sample") {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    void id;
  }
  return (
    <div className={`developer-reference${light ? " developer-reference-light" : ""}`} data-testid="developer-reference">
      <DeveloperShell light={light} onToggleTheme={() => setLight(!light)} path="/reference">
        <main id="main-content" className="developer-reference-layout">
        <aside className="developer-reference-sidebar" aria-label="Documentation menu">
          <a className="developer-reference-api" href="#overview">GETPRIO API <span>v1</span></a>
          {navigation.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.links.map(([label, href]) => {
                const id = href.slice(1);
                const active = activeSection === id;
                return <a key={label} href={href} onClick={() => setActiveSection(id)} className={active ? "is-active" : undefined} aria-current={active ? "location" : undefined}>{label}</a>;
              })}
            </section>
          ))}
        </aside>

        <article className="developer-reference-content" aria-labelledby="api-overview">
          <p className="developer-reference-eyebrow">START HERE</p>
          <BookmarkableHeading id="api-overview" level="h1">GetPrio API Overview</BookmarkableHeading>
          <p className="developer-reference-lead">
            Build a queue experience in four pieces: create project-owned profiles and queues, issue tickets from your server, read lifecycle state, and react to signed events. The API is versioned, environment-specific, and designed for safe retries.
          </p>

          <section>
            <BookmarkableHeading id="overview">What you can build</BookmarkableHeading>
            <p>Keep your customer experience in your product while GetPrio owns queue ordering and ticket state. The API gives you opaque resource IDs, explicit transitions, and a delivery history for recovery after downtime.</p>
            <div className="developer-reference-capabilities">
              <article>
                <div className="developer-reference-card-heading">
                  <IconBuildingStore size={18} aria-hidden="true" />
                  <h3>Profiles and queues</h3>
                </div>
                <p>Profiles group queues inside your project. A profile slug is the stable URL identifier; queue slugs identify a queue within that profile.</p>
              </article>
              <article>
                <div className="developer-reference-card-heading">
                  <IconTicket size={18} aria-hidden="true" />
                  <h3>Ticket lifecycle</h3>
                </div>
                <p>Issue tickets with an idempotency key, then read or transition them with their opaque ticket ID. Every write returns the resulting resource.</p>
              </article>
              <article>
                <div className="developer-reference-card-heading">
                  <IconWebhook size={18} aria-hidden="true" />
                  <h3>Events and recovery</h3>
                </div>
                <p>Each transition can produce one signed webhook event. Verify the raw request body and <code>GetPrio-Signature</code> before accepting it, then deduplicate by event ID. Mobile push signals and polling are app-specific recovery hints; the API remains authoritative.</p>
              </article>
            </div>
          </section>

          <section>
            <BookmarkableHeading id="get-started">Start here</BookmarkableHeading>
            <ol className="developer-reference-steps">
              <li><strong>Create a Sandbox key.</strong><span>Start with the smallest scopes you need. A key can only access its own project, environment, and selected profiles.</span></li>
              <li><strong>Create a profile and queue.</strong><span>Use <code>profiles:write</code> and <code>queues:write</code>. Keep the slugs in your configuration because they are the route identifiers.</span></li>
              <li><strong>Issue an idempotent ticket.</strong><span>Send a unique <code>Idempotency-Key</code> on every mutation. Repeating a key replays the original result instead of creating a second ticket.</span></li>
              <li><strong>Subscribe and reconcile.</strong><span>Use webhooks for low-latency updates, and use ticket events or a fresh queue snapshot to recover after missed deliveries.</span></li>
            </ol>
          </section>

          <section>
            <BookmarkableHeading id="authentication">Authentication</BookmarkableHeading>
            <p>Send exactly one API credential per request. You may use <code>X-API-Key</code> or <code>Authorization: Bearer</code>; mixing both returns <code>400 API_AUTH_AMBIGUOUS</code>. Never expose a key in browser code, mobile bundles, logs, or support screenshots.</p>
            <div className="developer-reference-callout"><strong>Scopes are enforced at the endpoint.</strong><span>A read key cannot create or transition resources. A key limited to selected profiles cannot create new profiles, and inaccessible profiles return <code>404</code> to avoid leaking their existence.</span></div>
          </section>

          <section>
            <BookmarkableHeading id="environments">Choose an environment</BookmarkableHeading>
            <p>Sandbox and Production are separate API surfaces with separate keys and data. Build and verify against Sandbox first; Production access requires the Developer Portal approval path.</p>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>Environment endpoints</caption><thead><tr><th>Environment</th><th>Base URL</th><th>Use it for</th></tr></thead><tbody><tr><th scope="row">Sandbox</th><td><code>https://sandbox-api.getprio.online/v1</code></td><td>Integration tests and test accounts</td></tr><tr><th scope="row">Production</th><td><code>https://api.getprio.online/v1</code></td><td>Approved live applications</td></tr></tbody></table></div>
            <p className="developer-reference-note">A Sandbox key sent to the Production host, or a Production key sent to Sandbox, is rejected as an invalid environment credential.</p>
          </section>

          <section>
            <BookmarkableHeading id="request-flow">API service flow</BookmarkableHeading>
            <p>Every request passes through the same control path: the API identifies the environment, authenticates the key, checks endpoint and profile scopes, commits the domain change safely, and returns a traceable response. Events are delivered separately after the transaction commits.</p>
            <ApiSequenceDiagram />
          </section>

          <section>
            <BookmarkableHeading id="workflows">Common workflow: issue a ticket</BookmarkableHeading>
            <p>Tickets may have a display label, an opaque external reference, and a recipient email when you have a lawful delivery purpose. Do not send customer names, phones, notes, or arbitrary metadata.</p>
            <CodeSample label="Issue a ticket" samples={ticketIssueSamples} onCopy={(value) => void copyValue(value, "ticket")} />
          </section>

          <section>
            <BookmarkableHeading id="payloads">Payloads and responses</BookmarkableHeading>
            <p>Use the examples below as the starting contract for your client. Successful responses put the resource under <code>data</code> and include <code>request_id</code>. Error responses are not wrapped in <code>data</code>; branch on the HTTP status and keep the returned error code.</p>
            <div className="developer-reference-payload-grid">
              <CodeSample label="Ticket response" value={ticketResponseExample} onCopy={(value) => void copyValue(value, "ticket-response")} />
              <CodeSample label="Error response" value={errorResponseExample} onCopy={(value) => void copyValue(value, "error-response")} />
            </div>
          </section>

          <section>
            <BookmarkableHeading id="conventions">Standards and conventions</BookmarkableHeading>
            <p>Successful responses use a stable envelope. Keep the <code>request_id</code> with your application logs; support can use it to trace a request.</p>
            <pre><code>{responseExample}</code></pre>
            <p>Resource IDs are opaque and should be stored as strings. Timestamps are ISO 8601 values. Event history is cursor-paginated with <code>limit</code> from 1–100 and a returned <code>next_cursor</code>.</p>
          </section>

          <section>
            <BookmarkableHeading id="limits">Rate limits and troubleshooting</BookmarkableHeading>
            <p>Responses include <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, and <code>RateLimit-Reset</code>. When the limit is exhausted, wait for the reset time or the <code>Retry-After</code> value before retrying.</p>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>Common responses</caption><thead><tr><th>Status</th><th>Meaning</th><th>What to do</th></tr></thead><tbody><tr><th scope="row"><code>400</code></th><td>Malformed request or unsupported field</td><td>Fix the request; do not retry unchanged.</td></tr><tr><th scope="row"><code>401</code></th><td>Missing, invalid, or wrong-environment key</td><td>Check the credential and host.</td></tr><tr><th scope="row"><code>403</code></th><td>Scope or profile access is insufficient</td><td>Use a key with the required scope.</td></tr><tr><th scope="row"><code>404</code></th><td>Resource is absent or outside key access</td><td>Check the slug and project environment.</td></tr><tr><th scope="row"><code>409</code></th><td>State, resource, or idempotency conflict</td><td>Read the current resource before deciding whether to retry.</td></tr><tr><th scope="row"><code>429</code></th><td>Rate or stream limit reached</td><td>Honor <code>Retry-After</code> with backoff.</td></tr><tr><th scope="row"><code>5xx</code></th><td>Temporary service failure</td><td>Retry with exponential backoff and the same idempotency key.</td></tr></tbody></table></div>
            <p className="developer-reference-note">Sandbox also has a daily ticket allowance shown in the Developer Portal. A rejected ticket does not become a valid ticket; always inspect the response before updating your local state.</p>
          </section>

          <section>
            <BookmarkableHeading id="webhook-verification">Verify webhook deliveries</BookmarkableHeading>
            <p>GetPrio sends the raw JSON body with <code>GetPrio-Event-Id</code> and <code>GetPrio-Signature</code>. Verify before parsing or acting on the event. The signature covers <code>timestamp.period.rawBody</code>, and timestamps older than five minutes should be rejected.</p>
            <CodeSample label="Node.js" value={webhookVerificationExample} onCopy={(value) => void copyValue(value, "webhook")} />
            <p>Use the event ID as your idempotency key. A receiver should return any HTTP 2xx after it has durably accepted the event. Non-2xx responses are retried; inspect delivery history when diagnosing a receiver.</p>
          </section>

          <section>
            <BookmarkableHeading id="best-practices">Best practices</BookmarkableHeading>
            <ul className="developer-reference-checklist"><li>Keep API keys in server-side secret storage and rotate them when a person, service, or environment changes.</li><li>Use a unique idempotency key per logical mutation and persist it with your own request record.</li><li>Store your external reference so you can reconcile a ticket without relying on a display label.</li><li>Make webhook handling duplicate-safe and acknowledge only after durable acceptance.</li><li>Do not put sensitive customer data in display labels, external references, webhook URLs, or logs.</li></ul>
          </section>

          <section>
            <BookmarkableHeading id="profiles">Profiles</BookmarkableHeading>
            <p>Profiles are the top-level private namespace for your queues. The slug is immutable and appears in queue routes. A key with selected-profile access can read only the profiles it was granted.</p>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>API utility endpoints</caption><thead><tr><th>Method</th><th>Path</th><th>Scope</th><th>Purpose</th></tr></thead><tbody><EndpointRows rows={utilityEndpointRows} /></tbody></table></div>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>Profile and profile-queue endpoints</caption><thead><tr><th>Method</th><th>Path</th><th>Scope</th><th>Purpose</th></tr></thead><tbody><EndpointRows rows={profileEndpointRows} /></tbody></table></div>
            <CodeSample label="Create a profile" samples={createProfileSamples} onCopy={(value) => void copyValue(value, "profile")} />
          </section>
          <section>
            <BookmarkableHeading id="queues">Queues and tickets</BookmarkableHeading>
            <p>Read a queue snapshot before rendering a customer-facing position. If a profile has multiple queues, use the location-compatible route with the queue slug. In these API routes, <code>profileSlug</code> is the developer profile slug. The OpenAPI document calls this same parameter <code>tenantSlug</code> for compatibility, and calls the queue slug <code>locationSlug</code> on the location-style routes.</p>
            <p>Queue state and intake are separate: a queue is open only when its session state is <code>open</code> and intake is enabled. The stream endpoints use server-sent events and emit queue snapshots plus heartbeats; reconnect and reconcile from a fresh snapshot after a disconnect.</p>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>Queue and ticket endpoints</caption><thead><tr><th>Method</th><th>Path</th><th>Scope</th><th>Purpose</th></tr></thead><tbody><EndpointRows rows={queueEndpointRows} /></tbody></table></div>
            <CodeSample label="Read a ticket" samples={readTicketSamples} onCopy={(value) => void copyValue(value, "ticket-read")} />
            <p className="developer-reference-note">Write transitions are deliberately explicit. A ticket cannot be served or skipped unless it is currently called; resolve a <code>409</code> by reading the current snapshot rather than forcing a transition.</p>
          </section>
          <section>
            <BookmarkableHeading id="webhooks">Webhooks</BookmarkableHeading>
            <p>Register receivers in the Developer Portal and choose the event types you need. GetPrio stores a delivery when the ticket transition is committed, then retries delivery independently. The signing secret is shown once when the receiver is created or rotated.</p>
            <div className="developer-reference-table-wrap"><table className="developer-reference-table"><caption>Webhook headers</caption><thead><tr><th>Header</th><th>Meaning</th></tr></thead><tbody><tr><th scope="row"><code>GetPrio-Event-Id</code></th><td>Stable event identifier for deduplication.</td></tr><tr><th scope="row"><code>GetPrio-Signature</code></th><td>HMAC-SHA256 signature in <code>t=...,p=...,v1=...</code> form.</td></tr><tr><th scope="row"><code>Content-Type</code></th><td><code>application/json</code>; verify the exact raw body bytes.</td></tr></tbody></table></div>
            <p>Return a 2xx only after durable acceptance. During normal rotation, the previous secret remains valid for 24 hours; an emergency compromised-secret rotation revokes it immediately.</p>
            <div className="developer-reference-callout"><strong>Mobile synchronization boundary.</strong><span>The mobile app may receive a private <code>developer_queue_moved</code> push signal to trigger an authoritative refresh. It is not a public Developer API webhook or a durable event subscription. If push delivery is unavailable, the mobile client uses fallback active-ticket polling: 30 seconds in Production and 5 minutes in Sandbox. Treat the queue snapshot and ticket event endpoints as the source of truth.</span></div>
          </section>
          <section>
            <BookmarkableHeading id="changelog">Changelog</BookmarkableHeading>
            <p>Track API updates, new endpoints, and version history. Breaking changes are announced before a production release.</p>
          </section>
        </article>

        <aside className="developer-reference-outline" aria-label="On this page">
          <p>ON THIS PAGE</p>
          {tocLinks.map(([id, label]) => {
            const active = activeSection === id;
            return <a key={id} href={`#${id}`} onClick={() => setActiveSection(id)} className={active ? "is-active" : undefined} aria-current={active ? "location" : undefined}>{label}</a>;
          })}
          <a className="developer-reference-openapi" href="https://api.getprio.online/v1/openapi.json">Download OpenAPI 3.1</a>
        </aside>
        </main>
      </DeveloperShell>
    </div>
  );
}
