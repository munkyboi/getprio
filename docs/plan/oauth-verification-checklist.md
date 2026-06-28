# OAuth Verification Checklist

Use this checklist after configuring Google and/or Facebook OAuth for GetPrio.

## 1. Preconditions

- `SERVER_URL` points to the API origin.
- `APP_BASE_URL` points to the frontend origin.
- `OAUTH_CALLBACK_PATH=/oauth/callback`.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set if Google is enabled.
- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are set if Facebook is enabled.
- The provider console redirect URI matches the backend callback exactly.

Expected redirect URIs:

- `https://<api-host>/api/auth/oauth/google/callback`
- `https://<api-host>/api/auth/oauth/facebook/callback`

## 2. Provider Availability

Open:

- `GET /api/auth/oauth/providers`

Expected:

- `google: true` when Google credentials are present.
- `facebook: true` when Facebook credentials are present.
- Disabled providers remain `false` and their buttons stay disabled on the login page.

## 3. Start Flow

From the login page, click a configured provider button.

Expected:

- The browser leaves the app and redirects to the provider consent screen.
- The provider URL includes the `redirect_uri` for the backend callback.
- The provider URL includes a valid `state` value.

## 4. Callback Success

After approving consent in the provider console:

- The provider returns to `/api/auth/oauth/:provider/callback`.
- The backend exchanges the code for a profile.
- The backend issues an access token and refresh token.
- The frontend callback page at `/oauth/callback` accepts the token payload.
- The browser ends up on either `/dashboard`, `/register/vendor?oauth=...`, or `/` depending on the OAuth intent and account state.

## 5. Account Linking Rules

Verify these cases separately:

- New OAuth account creates a new user with a generated username.
- Existing email/password account can continue through the OAuth provider if the provider match is valid.
- Linking the same provider email to a different provider account is rejected.
- OAuth provider mismatch in the callback is rejected.

## 6. Negative Checks

Verify these failures return a safe error state:

- Missing provider credentials disable the button.
- Invalid or expired `state` returns a retryable failure.
- User cancels consent and returns an OAuth error.
- Callback with a provider mismatch is rejected.

## 7. Browser Checks

Open the login page and confirm:

- Social buttons appear for configured providers only.
- Social buttons are disabled while provider availability is loading.
- The OAuth callback screen shows a loader during normal completion.
- The OAuth callback screen shows an error message when the callback hash is missing tokens.

## 8. Evidence To Capture

For a capstone demo, capture:

- Screenshot of `GET /api/auth/oauth/providers`
- Screenshot of the login page with social buttons enabled
- Screenshot of the provider consent screen
- Screenshot of the OAuth callback success state
- Screenshot of the final authenticated landing page

## 9. Local Smoke Script

Run the repo-supported preflight check:

```bash
npm run oauth:smoke
```

Optional overrides:

```bash
OAUTH_SMOKE_API_URL=https://api.getprio.online/api \
OAUTH_SMOKE_APP_URL=https://getprio.online \
npm run oauth:smoke
```

What it checks:

- `GET /api/auth/oauth/providers`
- `GET /api/auth/oauth/:provider/start?intent=login`
- backend callback redirect URI emitted by the start flow
- app callback path configured from `APP_BASE_URL`

What it does not do:

- it does not complete a real Google/Facebook consent flow
- it does not log into an external provider account
