import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Paper, PasswordInput, Select, Tabs, TextInput } from "@mantine/core";
import {
  IconBell,
  IconBuildingCommunity,
  IconBuildingStore,
  IconCheck,
  IconCopy,
  IconDeviceMobile,
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
import { developerApi, type Session } from "./developerApi";
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

const codeTokenPattern = /(https?:\/\/[^\s'"`]+|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|--?[A-Za-z][\w-]*|\b(?:curl|const|let|if|throw|new|return|fetch|POST|GET|PUT|PATCH|DELETE|true|false|null)\b)/g;

function codeTokenClass(token: string) {
  if (token.startsWith("http")) return "developer-portal-code-url";
  if (token.startsWith("'") || token.startsWith('"')) return "developer-portal-code-string";
  if (token.startsWith("-")) return "developer-portal-code-option";
  if (["POST", "GET", "PUT", "PATCH", "DELETE"].includes(token)) return "developer-portal-code-method";
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

function CodeSample({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await copyText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="developer-portal-code-sample">
      <div className="developer-portal-code-toolbar">
        <span>{language}</span>
        <Button type="button" variant="light" onClick={copyCode} aria-live="polite" aria-label={copied ? "Example copied" : "Copy example"}>
          {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre aria-label={`${language} backend example`}><ThemedCode code={code} /></pre>
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

function Guides() {
  const [language, setLanguage] = useState<keyof typeof examples>("cURL");
  return (
    <>
      <p className="developer-portal-eyebrow">GUIDES / V1 PREVIEW</p>
      <h1>Start on your backend.</h1>
      <p className="developer-portal-lede">
        Read the API contract, plan your queue flow, and keep credentials on
        your server. Create free Sandbox credentials from the developer
        workspace when you are ready to test.
      </p>
      <ol className="developer-portal-guide-steps">
        <li>
          <h2>Choose the environment</h2>
          <p>
            Use <code>https://sandbox-api.getprio.online/v1</code> for isolated
            testing. Production uses <code>https://api.getprio.online/v1</code>.
            Start with a public health check from your terminal:
          </p>
          <CodeSample language="cURL" code="curl https://sandbox-api.getprio.online/v1/health" />
          <p>
            A successful health check confirms API availability, not your
            account permissions or production readiness.
          </p>
        </li>
        <li>
          <h2>Read a queue with a scoped key</h2>
          <p>
            Once provisioned, use a Sandbox key with <code>queues:read</code>{" "}
            and an authorized project profile slug. The fictional{" "}
            <code>example-profile</code> and placeholder key below must be
            replaced on your server. Never paste real keys into this site.
          </p>
          <Select className="developer-portal-language" label="Example language" value={language} onChange={(value) => { if (value) setLanguage(value as keyof typeof examples); }} data={Object.keys(examples)} comboboxProps={{ withinPortal: false }} />
          <CodeSample language={language} code={examples[language]} />
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
            in the developer workspace.
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
  "/dashboard": "Developer workspace",
};
function AuthScreen({ mode, onAuthenticated }: { mode: "login" | "register"; onAuthenticated: (session: Session) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<{ challengeId: string; deliveryTarget: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
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
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (enrolling && challenge) {
      await verifyCode(verificationCode);
      return;
    }
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      if (enrolling) {
        if (!challenge) {
          const nextChallenge = await developerApi.startRegistration(
            String(form.get("name") || ""),
            String(form.get("email") || ""),
            String(form.get("password") || "")
          );
          setVerificationCode("");
          if (nextChallenge.challengeId) setChallenge({ challengeId: nextChallenge.challengeId, deliveryTarget: nextChallenge.deliveryTarget });
          else setError("If this email can be registered, a verification code will be sent.");
        }
      } else {
        const session = await developerApi.login(String(form.get("email") || ""), String(form.get("password") || ""));
        onAuthenticated(session);
        window.location.assign("/dashboard");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete sign-in.");
    } finally { setBusy(false); }
  }
  return <>
    <p className="developer-portal-eyebrow">{enrolling ? "SANDBOX REGISTRATION" : "DEVELOPER LOGIN"}</p>
    <h1>{enrolling ? (challenge ? "Verify your email." : "Create your Developer Portal account.") : "Welcome back."}</h1>
    <p className="developer-portal-lede">{enrolling ? (challenge ? `Enter the code sent to ${challenge.deliveryTarget}.` : "Use an independent Developer Portal account. It starts with free Sandbox access.") : "Sign in to manage your Sandbox project, API keys, profiles, queues, and webhooks."}</p>
    <form className="developer-portal-auth-form" onSubmit={(event) => void submit(event)}>
      {enrolling && !challenge && <TextInput label="Name" name="name" autoComplete="name" minLength={2} maxLength={120} required />}
      {!challenge && <TextInput label="Email" name="email" type="email" autoComplete="email" required />}
      {enrolling && challenge ? <div className="developer-portal-otp-field"><div className="developer-portal-otp-label-row"><label htmlFor="developer-registration-code">Verification code</label><Button type="button" variant="light" className="developer-portal-otp-resend" disabled={busy} onClick={() => void resendCode()} leftSection={<IconRefresh size={16} aria-hidden="true" />}>{busy ? "Resending…" : "Resend code"}</Button></div><DeveloperInputOtp id="developer-registration-code" value={verificationCode} onChange={setVerificationCode} onComplete={(code) => void verifyCode(code)} disabled={busy} invalid={Boolean(error)} /></div> : <TextInput label="Password" key="developer-registration-password" name="password" type="password" autoComplete={enrolling ? "new-password" : "current-password"} required />}
      {error && <p className="developer-portal-auth-error" role="alert">{error}</p>}
      <Button type="submit" className="developer-portal-primary" loading={busy}>{busy ? "Please wait…" : enrolling ? (challenge ? "Verify and create account" : "Send verification code") : "Log in"}</Button>
    </form>
    <p>{enrolling ? <>This creates a Developer Portal account only. You do not need a GetPrio marketplace account.<br /><span className="developer-portal-auth-switch">Already registered? <a href="/login">Developer login →</a></span></> : <>Need a Developer Portal account? <a href="/register">Get started for Free →</a></>}</p>
    <p className="developer-portal-preview-note">Production access is separate. It requires Developer Portal approval and personal MFA; Sandbox credentials do not work in production.</p>
  </>;
}

function DeveloperAccountProfile({ session, embedded = false }: { session: Session; embedded?: boolean }) {
  return <section className={`developer-portal-content developer-account-profile${embedded ? " developer-account-profile-embedded" : ""}`}>
    <p className="developer-portal-eyebrow">ACCOUNT PROFILE</p>
    <h1>Account profile.</h1>
    <p className="developer-portal-lede">Manage your Developer Portal identity, password, and security requirements.</p>
    <Tabs defaultValue="personal" className="developer-account-tabs">
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
          <p>Use a unique password for your Developer Portal account. Password changes will invalidate active sessions when the account endpoint is connected.</p>
          <div className="developer-account-profile-fields">
            <PasswordInput label="Current password" placeholder="Enter current password" disabled />
            <PasswordInput label="New password" placeholder="Enter new password" disabled />
            <PasswordInput label="Confirm new password" placeholder="Repeat new password" disabled />
          </div>
          <Button disabled className="developer-portal-primary">Update password</Button>
          <p className="developer-account-profile-note">Password updates are not connected in this local Developer Portal yet.</p>
        </Paper>
      </Tabs.Panel>
      <Tabs.Panel value="security" pt="xl">
        <Paper withBorder p="xl" className="developer-account-profile-card">
          <p className="developer-portal-eyebrow">SECURITY</p>
          <h2>Protect your account</h2>
          <p>Production access requires your personal MFA. Email verification protects account recovery and enrollment.</p>
          <div className="developer-account-security-options">
            <article>
              <div><h3>Authenticator app</h3><p>{session.user.mfaEnabled ? "An authenticator is enabled for this account." : "Set up an authenticator before using privileged production tools."}</p></div>
              <Badge color={session.user.mfaEnabled ? "teal" : "yellow"} variant="light" radius="xl">{session.user.mfaEnabled ? "Enabled" : "Action needed"}</Badge>
              <Button variant="light" disabled>{session.user.mfaEnabled ? "Manage authenticator" : "Set up authenticator app"}</Button>
            </article>
            <article>
              <div><h3>Email MFA / verification</h3><p>{session.user.emailVerified ? "Your email address is verified." : "Verify your email address to protect account recovery."}</p></div>
              <Badge color={session.user.emailVerified ? "teal" : "yellow"} variant="light" radius="xl">{session.user.emailVerified ? "Verified" : "Action needed"}</Badge>
              <Button variant="light" disabled>{session.user.emailVerified ? "Email verified" : "Send verification email"}</Button>
            </article>
          </div>
          <p className="developer-account-profile-note">Authenticator enrollment, recovery codes, and email MFA/verification actions will be enabled when the Developer Portal security endpoints are connected.</p>
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
    if (session) await developerApi.logout(session.csrfToken);
    setSession(null);
    window.location.assign("/");
  }
  return (
    <div
      className={`developer-portal${light ? " developer-portal-light" : ""}`}
      data-testid="developer-portal"
    >
      <DeveloperShell light={light} onToggleTheme={() => setLight(!light)} path={path} authenticated={Boolean(session)} session={session} onLogout={logout}>
        <main id="main-content" tabIndex={-1}>
        {isDashboardPath && session ? (
          <DeveloperWorkspace session={session} light={light} />
        ) : path === "/account/profile" && session ? (
          <DeveloperWorkspace session={session} light={light} accountContent={<DeveloperAccountProfile session={session} embedded />} />
        ) : path === "/" ? (
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
            ) : path === "/account/profile" && sessionChecked ? (
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
