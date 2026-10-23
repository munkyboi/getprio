require("tsx/cjs");
require.extensions[".css"] = () => {};
const test = require("node:test"),
  assert = require("node:assert/strict"),
  React = require("react"),
  { renderToStaticMarkup } = require("react-dom/server"),
  { MemoryRouter } = require("react-router-dom"),
  { MantineProvider } = require("@mantine/core"),
  Module = require("node:module");
let auth = {
  loading: false,
  oauthLoading: false,
  oauthProviders: {},
  user: null,
  token: null,
};
const load = Module._load;
Module._load = function (request, parent, ...rest) {
  if (/context\/AuthContext$/.test(request)) return { useAuth: () => auth };
  return load.call(this, request, parent, ...rest);
};
const P = require("../src/vendor/LoginPresentation.tsx"),
  Register = require("../src/pages/RegisterVendorPage.tsx").default,
  Social = require("../src/components/SocialAuthButtons.tsx").default;
Module._load = load;
global.window = {
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
  localStorage: { getItem: () => null, setItem() {} },
};
const render = (element) =>
  renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ["/register/vendor"] },
      React.createElement(MantineProvider, { env: "test" }, element),
    ),
  );
function login(vendor, busy = false) {
  return render(
    React.createElement(
      P.LoginPresentation,
      { vendor, busy },
      React.createElement(
        P.Paper,
        null,
        React.createElement(P.Title, null, "Verify your sign-in"),
        React.createElement(
          "form",
          null,
          React.createElement(P.TextInput, {
            label: "Email or username",
            name: "identifier",
            required: true,
            autoComplete: "username",
          }),
          React.createElement(P.PasswordInput, {
            label: "Password",
            name: "password",
            required: true,
            autoComplete: "current-password",
          }),
          React.createElement(
            P.Button,
            { type: "submit", className: "auth-primary-action" },
            "Sign in",
          ),
          React.createElement(
            P.Anchor,
            { to: "/register/vendor" },
            "Create workspace",
          ),
        ),
      ),
    ),
  );
}
test("Vendor login reuses brand/theme shell and preserves semantic credentials without marketing aside", () => {
  const html = login(true);
  assert.match(html, /vendor-auth-surface/);
  assert.match(html, /GetPrio Vendor sign in/);
  assert.match(html, /autocomplete="username"/i);
  assert.match(html, /autocomplete="current-password"/i);
  assert.match(html, /type="password"/);
  assert.match(html, /auth-primary-action/);
  assert.doesNotMatch(html, /vendor-onboarding\.png|<aside/);
});
test("busy Vendor login disables inputs and removes registration link from tab order", () => {
  const html = login(true, true);
  assert.match(
    html,
    /name="identifier"[^>]*disabled|disabled[^>]*name="identifier"/,
  );
  assert.match(html, /aria-disabled="true"[^>]*tabindex="-1"/);
});
test("public login remains Mantine presentation outside Vendor shell", () => {
  const html = login(false);
  assert.doesNotMatch(html, /vendor-auth-surface|GetPrio Vendor sign in/);
  assert.match(html, /mantine-PasswordInput/);
});
test("Vendor provider section omits unavailable actions and retains configured providers", () => {
  assert.doesNotMatch(
    render(React.createElement(Social, { vendor: true, intent: "login" })),
    /connected account/,
  );
  auth = { ...auth, oauthProviders: { google: true } };
  const html = render(
    React.createElement(Social, { vendor: true, intent: "login" }),
  );
  assert.match(html, /Continue with Google/);
  assert.doesNotMatch(html, /Continue with Facebook|unavailable/);
  auth = { ...auth, oauthProviders: {} };
});
test("guest registration retains all fields in one form with account/business legends and return sign-in", () => {
  const html = render(React.createElement(Register));
  assert.equal((html.match(/<form\b/g) || []).length, 1);
  assert.match(html, /vendor-auth-main-wide/);
  assert.match(html, /<legend[^>]*>Your business<\/legend>/);
  assert.match(html, /<legend[^>]*>Your account<\/legend>/);
  for (const name of [
    "tenantName",
    "tenantSlug",
    "name",
    "username",
    "email",
    "password",
  ])
    assert.match(html, new RegExp('name="' + name + '"'));
  assert.match(html, /autocomplete="new-password"/i);
  assert.match(html, /Already have a workspace\?/);
  assert.match(html, /href="\/login"/);
  assert.doesNotMatch(html, /vendor-onboarding\.png|Continue with Google/);
});
test("authenticated onboarding preserves setup without asking for a new password", () => {
  auth = {
    ...auth,
    token: "test-session",
    user: {
      id: "test",
      name: "Owner",
      email: "owner@example.test",
      username: "owner",
      tenants: [],
    },
  };
  const html = render(React.createElement(Register));
  assert.match(html, /Finish workspace setup/);
  assert.doesNotMatch(html, /name="password"/);
  auth = { ...auth, token: null, user: null };
});
