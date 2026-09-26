const sandboxAndroidPackageName = "com.getprio.getprioMobile.android.sandbox";

function resolveSandboxTestFlightPublicUrl(source = process.env) {
  const configured = String(source.SANDBOX_TESTFLIGHT_PUBLIC_URL || "").trim();
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "testflight.apple.com" ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/join\/[^/]+$/.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      throw new TypeError("invalid TestFlight public URL");
    }
    return url.toString();
  } catch {
    throw new TypeError("SANDBOX_TESTFLIGHT_PUBLIC_URL must be an HTTPS testflight.apple.com /join/ URL.");
  }
}

function resolveSandboxAndroidGooglePlayPublicUrl(source = process.env) {
  const configured = String(source.SANDBOX_ANDROID_GOOGLE_PLAY_PUBLIC_URL || "").trim();
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "play.google.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname !== `/apps/testing/${sandboxAndroidPackageName}` ||
      url.search ||
      url.hash
    ) {
      throw new TypeError("invalid Google Play tester URL");
    }
    return url.toString();
  } catch {
    throw new TypeError(
      "SANDBOX_ANDROID_GOOGLE_PLAY_PUBLIC_URL must be the HTTPS Google Play tester URL for the Sandbox package."
    );
  }
}

module.exports = {
  sandboxAndroidPackageName,
  resolveSandboxTestFlightPublicUrl,
  resolveSandboxAndroidGooglePlayPublicUrl
};
