import { useState } from "react";
import { Button } from "@mantine/core";
import { IconBuildingStore, IconCheck, IconCopy, IconLink, IconTicket, IconWebhook } from "@tabler/icons-react";
import DeveloperShell from "./DeveloperShell";
import "./DeveloperReferencePage.css";

const navigation = [
  { title: "Start here", links: [["Overview", "#api-overview"], ["Get started with an API key", "#get-started"], ["Authentication", "#authentication"], ["Common workflows", "#workflows"]] },
  { title: "Using the API", links: [["Standards and conventions", "#conventions"], ["Rate limits and troubleshooting", "#limits"], ["Best practices", "#best-practices"]] },
  { title: "API reference", links: [["Profiles", "#profiles"], ["Queues and tickets", "#queues"], ["Webhooks", "#webhooks"]] }
];

const requestExample = `curl https://sandbox-api.getprio.online/v1/queues/example-profile/tickets \\
  -X POST \\
  -H 'X-API-Key: gpk_sbx_...' \\
  -H 'Idempotency-Key: ticket-issue-001' \\
  -H 'Content-Type: application/json' \\
  -d '{"display_label":"Walk-in","external_reference":"order-123"}'`;

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

function RequestExampleCode() {
  return (
    <code>
      <span className="developer-reference-code-command">curl</span>{" "}
      <span className="developer-reference-code-url">https://sandbox-api.getprio.online/v1/queues/example-profile/tickets</span>{" \\\n"}
      {"  "}<span className="developer-reference-code-option">-X</span>{" "}<span className="developer-reference-code-keyword">POST</span>{" \\\n"}
      {"  "}<span className="developer-reference-code-option">-H</span>{" "}<span className="developer-reference-code-string">'X-API-Key: gpk_sbx_...'</span>{" \\\n"}
      {"  "}<span className="developer-reference-code-option">-H</span>{" "}<span className="developer-reference-code-string">'Idempotency-Key: ticket-issue-001'</span>{" \\\n"}
      {"  "}<span className="developer-reference-code-option">-H</span>{" "}<span className="developer-reference-code-string">'Content-Type: application/json'</span>{" \\\n"}
      {"  "}<span className="developer-reference-code-option">-d</span>{" "}<span className="developer-reference-code-string">'{"{\"display_label\":\"Walk-in\",\"external_reference\":\"order-123\"}"}'</span>
    </code>
  );
}

export default function DeveloperReferencePage() {
  const [light, setLight] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyRequestExample() {
    try {
      await navigator.clipboard.writeText(requestExample);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = requestExample;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className={`developer-reference${light ? " developer-reference-light" : ""}`} data-testid="developer-reference">
      <DeveloperShell light={light} onToggleTheme={() => setLight(!light)} path="/reference">
        <main id="main-content" className="developer-reference-layout">
        <aside className="developer-reference-sidebar" aria-label="Documentation menu">
          <a className="developer-reference-api" href="#api-overview">GETPRIO API <span>v1</span></a>
          {navigation.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              {section.links.map(([label, href]) => <a key={label} href={href}>{label}</a>)}
            </section>
          ))}
        </aside>

        <article className="developer-reference-content" aria-labelledby="api-overview">
          <p className="developer-reference-eyebrow">START HERE</p>
          <BookmarkableHeading id="api-overview" level="h1">GetPrio API Overview</BookmarkableHeading>
          <p className="developer-reference-lead">
            Build queue experiences with project-owned profiles, queues, tickets, and signed webhook events. Each API key is restricted to one project and one environment.
          </p>

          <section>
            <BookmarkableHeading id="overview">What you can build</BookmarkableHeading>
            <p>Use GetPrio to issue anonymous tickets, show queue progress, call or resolve tickets, and reconcile lifecycle events in your own application.</p>
            <div className="developer-reference-capabilities">
              <article>
                <div className="developer-reference-card-heading">
                  <IconBuildingStore size={18} aria-hidden="true" />
                  <h3>Profiles and queues</h3>
                </div>
                <p>Create private profiles and queues that belong to your developer project. They do not reuse marketplace vendor records.</p>
              </article>
              <article>
                <div className="developer-reference-card-heading">
                  <IconTicket size={18} aria-hidden="true" />
                  <h3>Ticket lifecycle</h3>
                </div>
                <p>Issue, call, serve, skip, cancel, restore, and read tickets through versioned machine endpoints.</p>
              </article>
              <article>
                <div className="developer-reference-card-heading">
                  <IconWebhook size={18} aria-hidden="true" />
                  <h3>Events and recovery</h3>
                </div>
                <p>Use ticket event history and signed webhooks to keep your system in sync after retries or downtime.</p>
              </article>
            </div>
          </section>

          <section>
            <BookmarkableHeading id="get-started">Start here</BookmarkableHeading>
            <ol className="developer-reference-steps">
              <li><strong>Create a Sandbox key.</strong><span>Use Sandbox while you build and test. The key is limited to its own project and environment.</span></li>
              <li><strong>Create a profile and queue.</strong><span>Use <code>profiles:write</code> and <code>queues:write</code> before issuing tickets.</span></li>
              <li><strong>Issue an idempotent ticket.</strong><span>Send an <code>Idempotency-Key</code> for every write. Repeating the same request returns its original response for seven days.</span></li>
            </ol>
          </section>

          <section>
            <BookmarkableHeading id="authentication">Authentication</BookmarkableHeading>
            <p>Send the API key in <code>X-API-Key</code>. Sandbox keys work only with <code>sandbox-api.getprio.online</code>; production keys work only with <code>api.getprio.online</code>.</p>
          </section>

          <section>
            <BookmarkableHeading id="workflows">Common workflow: issue a ticket</BookmarkableHeading>
            <p>Tickets may have a display label, an opaque external reference, and a recipient email when you have a lawful delivery purpose. Do not send customer names, phones, notes, or arbitrary metadata.</p>
            <div className="developer-reference-code-sample">
              <div className="developer-reference-code-toolbar">
                <span>cURL</span>
                <Button type="button" variant="light" onClick={copyRequestExample} aria-live="polite" aria-label={copied ? "Request copied" : "Copy request"}>
                  {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre><RequestExampleCode /></pre>
            </div>
          </section>

          <section>
            <BookmarkableHeading id="conventions">Standards and conventions</BookmarkableHeading>
            <p>Responses use a <code>data</code> envelope and a request ID. Resource IDs are opaque. Use the lifecycle event cursor to resume a history read.</p>
          </section>

          <section>
            <BookmarkableHeading id="limits">Rate limits and troubleshooting</BookmarkableHeading>
            <p>Sandbox allows 100 ticket issuances per project per UTC day. A <code>409</code> response means a ticket state, duplicate resource, or idempotency conflict must be resolved before retrying.</p>
          </section>

          <section>
            <BookmarkableHeading id="best-practices">Best practices</BookmarkableHeading>
            <p>Keep API keys on your server, use the smallest scope required, retain your own external references, and verify webhook signatures before processing an event.</p>
          </section>

          <section>
            <BookmarkableHeading id="profiles">Profiles</BookmarkableHeading>
            <p><code>GET /profiles</code> lists profiles for the calling project and environment. <code>POST /profiles</code> creates one with an idempotency key.</p>
          </section>
          <section>
            <BookmarkableHeading id="queues">Queues and tickets</BookmarkableHeading>
            <p>Read a queue at <code>GET /queues/:profileSlug</code>; issue tickets at <code>POST /queues/:profileSlug/tickets</code>. Use the queue slug route for a non-default queue.</p>
          </section>
          <section>
            <BookmarkableHeading id="webhooks">Webhooks</BookmarkableHeading>
            <p>Register webhook endpoints in the developer portal. GetPrio signs each delivery and stores it with the ticket transition in the same transaction.</p>
          </section>
          <section>
            <BookmarkableHeading id="changelog">Changelog</BookmarkableHeading>
            <p>Track API updates, new endpoints, and version history. Breaking changes are announced before a production release.</p>
          </section>
        </article>

        <aside className="developer-reference-outline" aria-label="On this page">
          <p>ON THIS PAGE</p>
          <a href="#overview">What you can build</a>
          <a href="#get-started">Start here</a>
          <a href="#authentication">Authentication</a>
          <a href="#workflows">Common workflow</a>
          <a href="#conventions">Standards and conventions</a>
          <a href="#limits">Rate limits</a>
          <a href="#profiles">Profiles</a>
          <a href="#queues">Queues and tickets</a>
          <a href="#webhooks">Webhooks</a>
          <a href="#changelog">Changelog</a>
          <a className="developer-reference-openapi" href="https://api.getprio.online/v1/openapi.json">Download OpenAPI 3.1</a>
        </aside>
        </main>
      </DeveloperShell>
    </div>
  );
}
