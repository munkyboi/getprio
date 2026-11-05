export default async function verifyTenantCapacity(page) {
  const origin = new URL(page.url()).origin;
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local test URL required");
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scenario of ["", "?unavailable=1", "?legacy=1"]) {
      const unavailable = scenario.includes("unavailable=1");
      const legacy = scenario.includes("legacy=1");
      await page.goto(`${origin}/tests/tenant-capacity-harness.html${scenario}`);
      await page.getByRole("heading", { name: "Allowance posture" }).waitFor();
      const text = await page.locator("main").innerText();
      if (legacy !== text.includes("Legacy server email quota")) throw new Error("Server-returned legacy quota visibility is incorrect");
      if (legacy && !text.includes("Quota enforcement: enabled")) throw new Error("Legacy enforcement is not visible");
      if (unavailable) {
        if (!text.includes("Unavailable base allowance used") || text.includes("0 base allowance used") || !text.includes("Usage period unavailable")) throw new Error("Missing period must not fabricate zero usage");
      } else if (!text.includes("7 base allowance used") || !text.includes("10 created") || !text.includes("3 base · 3 credit · 4 unaccounted") || !text.includes("Partial accounting") || !text.includes("end exclusive")) throw new Error("Reconciled/observed/ledger distinction missing");
      if (!text.includes("Quota enforcement: disabled")) throw new Error("Reporting must not imply enforcement activation");
      if (await page.locator("main").evaluate((el) => el.scrollWidth > el.clientWidth)) throw new Error("Capacity content overflows horizontally");
    }
  }
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`${origin}/tests/tenant-capacity-harness.html?sheet=1`);
    const trigger = page.getByRole("button", { name: "Inspect tenant", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Allowance posture" }).waitFor();
    await dialog.locator("[data-slot=scroll-area-viewport]").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await dialog.getByRole("button", { name: "Close", exact: true }).click({ timeout: 2000 });
    await dialog.waitFor({ state: "hidden" });
    if (!await trigger.evaluate((el) => el === document.activeElement)) throw new Error("Sheet close did not restore trigger focus");
  }
  console.log("Tenant capacity null, partial and responsive checks passed");
}
