export default async function verifyPlanMatrixSave(page) {
  const origin = new URL(page.url()).origin;
  const expect = (condition, message) => { if (!condition) throw new Error(message); };
  for (const fail of [false, true]) {
    await page.setViewportSize(fail ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto(`${origin}/tests/plan-matrix-harness.html${fail ? "?fail=1" : ""}`);
    expect(await page.title() === "Plan Matrix save regression", "Test page must have a descriptive title");
    expect(await page.locator("html").getAttribute("lang") === "en", "Test page must declare its language");
    await page.getByLabel("Plan name", { exact: true }).fill("Free revised");
    await page.getByRole("tab", { name: "Pro", exact: true }).click();
    await page.getByLabel("Plan name", { exact: true }).fill("Pro revised");
    if (!fail) await page.getByRole("tab", { name: "Enterprise", exact: true }).click();
    await page.locator("#plan-audit-reason").fill("Update matrix across plans");
    await page.getByRole("button", { name: "Review and publish", exact: true }).click();
    await page.getByRole("dialog").getByText(/Free revised, Pro revised/).waitFor();
    expect(await page.getByLabel("Plan name", { exact: true }).isDisabled(), "Reviewed payload cannot be edited before confirmation");
    await page.getByRole("button", { name: "Confirm publication", exact: true }).click();
    if (fail) {
      await page.getByText(/Simulated Pro failure/).waitFor();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.getByRole("button", { name: "Review and publish", exact: true }).click();
      await page.getByRole("button", { name: "Confirm publication", exact: true }).click();
    }
    await page.getByText(/policy published|policies published/).waitFor();
    const saved = JSON.parse(await page.getByLabel("Test server saved plans").textContent());
    expect(saved.plans.find((plan) => plan.slug === "free").name === "Free revised", "Save must publish edits from the non-selected Free tab");
    expect(saved.plans.find((plan) => plan.slug === "pro").name === "Pro revised", "Save must publish selected Pro edits");
    expect(saved.calls.published.join(",") === "free,pro", "Publish only changed plans, without republishing successful changes on retry");
    expect(saved.calls.previews.join(",") === (fail ? "free,pro,pro" : "free,pro"), "Every changed plan needs its own fresh secure preview");
  }
  console.log("Plan Matrix cross-tab save and mobile failed-save retry passed");
}
