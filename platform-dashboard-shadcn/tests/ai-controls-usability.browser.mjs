export default async function verify(page) {
  await page.goto('http://127.0.0.1:5194/tests/fixtures/ai-inference.html?savedpilot')
  await page.getByRole('group',{name:'Global requested mode'}).waitFor()
  await page.getByRole('button',{name:'Private shadow',exact:true}).first().click()
  await page.getByRole('button',{name:'Private shadow',exact:true}).nth(1).click()
  const savedReadiness=page.getByRole('region',{name:'Saved policy readiness'})
  await savedReadiness.getByText('Saved policy blockers — draft changes have not been applied.',{exact:true}).waitFor()
  await savedReadiness.getByText('This location is excluded',{exact:true}).waitFor()
  await page.goto("http://127.0.0.1:5194/tests/fixtures/ai-inference.html")
  await page.getByRole("group", { name: "Global requested mode" }).waitFor()
  await page.getByLabel("Audit reason").fill("Preserve unsaved policy work")
  if (
    !(await page
      .getByRole("button", { name: "Refresh policy", exact: true })
      .isDisabled())
  )
    throw new Error("Refresh must not replace an unsaved draft or audit reason")
  await page.getByRole("button", { name: "Discard draft", exact: true }).click()
  if (await page.getByLabel("Audit reason").inputValue())
    throw new Error("Explicit discard must clear the audit reason")
  if (
    await page
      .getByRole("button", { name: "Refresh policy", exact: true })
      .isDisabled()
  )
    throw new Error("Refresh must become available after discard")
  await page
    .getByText("Private evaluation is not connected", { exact: true })
    .waitFor()
  await page
    .getByText(
      "Ask engineering to connect the approved runtime caller. Saving this policy does not connect it.",
      { exact: true }
    )
    .waitFor()
  await page
    .getByText("Customer estimates are unchanged", { exact: true })
    .waitFor()
  const advanced = page.getByText("Advanced settings", { exact: true })
  await advanced.click()
  await page.getByLabel("Timeout (ms)").fill("0")
  await advanced.click()
  await page
    .getByLabel("Audit reason")
    .fill("Validate advanced fields without hidden failures")
  await page.getByRole("button", { name: "Review policy", exact: true }).click()
  if (!(await advanced.evaluate((el) => el.parentElement.open)))
    throw new Error("Invalid advanced input must reveal its disclosure")
  if (
    !(await page
      .getByLabel("Timeout (ms)")
      .evaluate((el) => el === document.activeElement))
  )
    throw new Error("Invalid advanced input must receive focus")
  await page.getByLabel("Timeout (ms)").fill("100")
  await page.getByRole("button", { name: "Discard draft", exact: true }).click()
  await page
    .getByRole("button", { name: "Private shadow", exact: true })
    .first()
    .click()
  await page.getByLabel("Find pilot locations").fill("Test")
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click()
  await page.getByRole("combobox", { name: "Add pilot location" }).click()
  await page
    .getByRole("option", { name: "Test vendor · Main location" })
    .click()
  await page
    .getByText("New draft location — not included in the saved policy yet.", {
      exact: true
    })
    .waitFor()
  await page
    .getByLabel("Audit reason")
    .fill("Review private evaluation with all gates preserved")
  await page.getByRole("button", { name: "Review policy", exact: true }).click()
  await page.getByText("Confirm policy change", { exact: true }).waitFor()
  if (
    !(await page
      .getByRole("button", { name: "Refresh policy", exact: true })
      .isDisabled())
  )
    throw new Error("Refresh must preserve a bound review")
  if (
    !(await page
      .getByRole("button", { name: "Disable globally", exact: true })
      .isDisabled())
  )
    throw new Error("A second preview must not replace the bound review")
  await page.getByRole("button", { name: "Save policy", exact: true }).click()
  await page
    .getByText("Fixture connection lost; retry safely", { exact: true })
    .waitFor()
  await page.getByRole("button", { name: "Save policy", exact: true }).click()
  await page
    .getByText("Save calls: 2; same retry key: true", { exact: true })
    .waitFor()
  await page
    .getByLabel("Audit reason")
    .fill("Disable only the saved private pilot policy")
  await page
    .getByRole("button", { name: "Disable globally", exact: true })
    .click()
  await page
    .getByText("Global: off · 1 pilot locations", { exact: true })
    .waitFor()
  await page.getByRole("button", { name: "Save policy", exact: true }).click()
  await page
    .getByText("Global Off overrides this location after saving.", {
      exact: true
    })
    .waitFor()
  await page.setViewportSize({ width: 390, height: 844 })
  if (await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth))
    throw new Error("AI controls overflow mobile")
  await page.screenshot({ path: "ai-controls-mobile.png", fullPage: true })
  await page.goto(
    "http://127.0.0.1:5194/tests/fixtures/ai-inference.html?readonly"
  )
  await page.getByRole("group", { name: "Global requested mode" }).waitFor()
  if (
    await page
      .getByRole("button", { name: "Review policy", exact: true })
      .isEnabled()
  )
    throw new Error("Read-only viewers must not save")
  if (
    await page
      .getByRole("button", { name: "Search locations", exact: true })
      .isDisabled()
  )
    throw new Error("Read-only viewers must be able to inspect pilot search")
  await page.getByLabel("Find pilot locations").fill("none")
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click()
  await page
    .getByText("No locations match this search.", { exact: true })
    .waitFor()
  await page.getByLabel("Find pilot locations").fill("Test")
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click()
  await page
    .getByRole("list", { name: "Matching pilot locations" })
    .getByText("Test vendor · Main location", { exact: true })
    .waitFor()
  if (
    await page.getByRole("combobox", { name: "Add pilot location" }).isEnabled()
  )
    throw new Error(
      "Read-only search results must not enable adding a location"
    )
  await page.getByText("Advanced settings", { exact: true }).click()
  if (!(await page.getByLabel("Timeout (ms)").isDisabled()))
    throw new Error("Read-only viewers must not edit advanced settings")
  await page.getByText("Advanced diagnostics", { exact: true }).focus()
  await page.keyboard.press("Enter")
  await page
    .getByText("resource-service-start-shadow-v1", { exact: true })
    .waitFor()
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: "ai-controls-desktop.png", fullPage: true })
  await page.goto(
    "http://127.0.0.1:5194/tests/fixtures/ai-inference.html?stale&unknown&limited"
  )
  await page.getByRole("group", { name: "Global requested mode" }).waitFor()
  await page
    .getByText("An additional prerequisite needs review", { exact: true })
    .waitFor()
  if (
    await page
      .getByText("unrecognized_future_gate", { exact: true })
      .isVisible()
  )
    throw new Error(
      "Unknown codes must not be presented as understood readiness"
    )
  await page.getByLabel("Find pilot locations").fill("Test")
  await page
    .getByRole("button", { name: "Search locations", exact: true })
    .click()
  await page
    .getByText("Showing 1 results. Refine the search to find another location.")
    .waitFor()
  await page
    .getByRole("button", { name: "Private shadow", exact: true })
    .first()
    .click()
  await page
    .getByLabel("Audit reason")
    .fill("Preserve the intended edits on a revision conflict")
  await page.getByRole("button", { name: "Review policy", exact: true }).click()
  await page
    .getByText(
      "The saved policy changed. Your draft is preserved. Discard it and refresh the saved policy before reviewing again.",
      { exact: true }
    )
    .waitFor()
  if (
    (await page.getByLabel("Audit reason").inputValue()) !==
    "Preserve the intended edits on a revision conflict"
  )
    throw new Error("Revision conflict must preserve audit reason")
  if (
    (await page
      .getByRole("button", { name: "Private shadow", exact: true })
      .first()
      .getAttribute("aria-pressed")) !== "true"
  )
    throw new Error("Revision conflict must preserve requested mode")
  for (const operation of ["read", "search", "preview", "save"]) {
    await page.goto(
      `http://127.0.0.1:5194/tests/fixtures/ai-inference.html?expire=${operation}`
    )
    if (operation !== "read") {
      await page.getByRole("group", { name: "Global requested mode" }).waitFor()
      if (operation === "search")
        await page
          .getByRole("button", { name: "Search locations", exact: true })
          .click()
      else {
        await page
          .getByLabel("Audit reason")
          .fill("Verify safe session expiry handling")
        await page
          .getByRole("button", { name: "Review policy", exact: true })
          .click()
        if (operation === "save")
          await page
            .getByRole("button", { name: "Save policy", exact: true })
            .click()
      }
    }
    await page
      .getByText("Session expiry callback invoked", { exact: true })
      .waitFor()
    if (
      await page
        .getByRole("button", { name: "Review policy", exact: true })
        .count()
    )
      throw new Error("Expired sessions must clear sensitive policy controls")
  }
}
