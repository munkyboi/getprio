export default async function verifyTenantCapacity(page) {
  const origin = new URL(page.url()).origin;
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local test URL required");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const unavailable of [false, true]) {
      await page.goto(`${origin}/tests/tenant-capacity-harness.html${unavailable ? "?unavailable=1" : ""}`);
      await page.getByRole("heading", { name: "Allowance posture" }).waitFor();
      const text = await page.locator("main").innerText();
      if (text.includes("queue Email Journeys")) throw new Error("Retired email capacity exposed");
      if (unavailable) {
        if (!text.includes("Unavailable used") || text.includes("0 used") || !text.includes("Usage period unavailable")) throw new Error("Missing period must not fabricate zero usage");
      } else if (!text.includes("7 used") || !text.includes("10 created") || !text.includes("3 base · 3 credit · 4 unaccounted") || !text.includes("Partial accounting") || !text.includes("end exclusive")) throw new Error("Reconciled/observed/ledger distinction missing");
      if (!text.includes("Quota enforcement: disabled")) throw new Error("Reporting must not imply enforcement activation");
      if (await page.locator("main").evaluate((el) => el.scrollWidth > el.clientWidth)) throw new Error("Capacity content overflows horizontally");
    }
  }
  console.log("Tenant capacity null, partial and responsive checks passed");
}
