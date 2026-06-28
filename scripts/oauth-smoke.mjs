#!/usr/bin/env node

const API_BASE_URL = process.env.OAUTH_SMOKE_API_URL || process.env.VITE_API_URL || "http://localhost:5001/api";
const FRONTEND_BASE_URL = process.env.OAUTH_SMOKE_APP_URL || process.env.APP_BASE_URL || "http://localhost:5173";

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function main() {
  const providersResponse = await fetch(`${API_BASE_URL}/auth/oauth/providers`);
  if (!providersResponse.ok) {
    throw new Error(`Provider availability request failed with ${providersResponse.status}`);
  }

  const providersData = await providersResponse.json();
  log(`providers: ${JSON.stringify(providersData.providers || {})}`);

  const enabledProviders = Object.entries(providersData.providers || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([provider]) => provider);

  if (!enabledProviders.length) {
    log("No OAuth providers are enabled. Set GOOGLE_CLIENT_ID/SECRET or FACEBOOK_APP_ID/SECRET and rerun.");
    return;
  }

  for (const provider of enabledProviders) {
    const startResponse = await fetch(`${API_BASE_URL}/auth/oauth/${provider}/start?intent=login`, {
      redirect: "manual"
    });

    if (!startResponse.status || startResponse.status < 300 || startResponse.status >= 400) {
      throw new Error(`Start flow for ${provider} did not return a redirect.`);
    }

    const location = startResponse.headers.get("location");
    if (!location) {
      throw new Error(`Start flow for ${provider} returned no Location header.`);
    }

    const startUrl = new URL(location);
    log(`${provider} start redirect: ${startUrl.origin}${startUrl.pathname}`);

    const redirectUri = startUrl.searchParams.get("redirect_uri");
    if (!redirectUri) {
      throw new Error(`Start flow for ${provider} did not include redirect_uri.`);
    }

    log(`${provider} backend callback: ${redirectUri}`);
  }

  const callbackUrl = new URL("/oauth/callback", FRONTEND_BASE_URL);
  log(`frontend callback path: ${callbackUrl.toString()}`);
  log("OAuth smoke preflight completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
