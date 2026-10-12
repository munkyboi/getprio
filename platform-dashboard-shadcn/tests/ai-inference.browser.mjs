// Invoke with the supported CUA Playwright surface against tests/fixtures only.
// No live policy or account state may be used for these mutation scenarios.
export async function verifyAiPolicyFlow(page) {
  await page.getByText('Local test fixture — no production requests', { exact: true }).waitFor({ state: 'visible' });
  const expect = (value, message) => { if (!value) throw new Error(message); };
  await page.getByRole('group', { name: 'Global requested mode' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Private shadow', exact: true }).first().click();
  await page.domSnapshot();
  await page.getByRole('textbox', { name: 'Find pilot locations' }).fill('Test');
  await page.getByRole('button', { name: 'Search locations', exact: true }).click();
  await page.domSnapshot();
  await page.getByRole('combobox', { name: 'Add pilot location' }).click();
  await page.domSnapshot();
  await page.getByRole('option', { name: 'Test vendor · Main location' }).click();
  await page.domSnapshot();
  expect(await page.getByRole('heading', { name: 'Pilot locations (1/100)' }).isVisible(), 'Pilot must be added');
  await page.getByRole('textbox', { name: 'Audit reason' }).fill('Review local test pilot policy');
  await page.getByRole('button', { name: 'Review policy', exact: true }).click();
  await page.domSnapshot();
  expect(await page.getByText('Confirm policy change', { exact: true }).isVisible(), 'Review must precede save');
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await page.domSnapshot();
  expect(await page.getByText('Fixture connection lost; retry safely', { exact: true }).isVisible(), 'Failure must be announced');
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await page.domSnapshot();
  expect(await page.getByText('Policy updated', { exact: true }).isVisible(), 'Retry must save');
  expect(await page.getByText('Save calls: 2; same retry key: true', { exact: true }).isVisible(), 'Retry must reuse the operation key');
  await page.getByRole('textbox', { name: 'Audit reason' }).fill('Emergency disable local test pilot');
  await page.getByRole('button', { name: 'Disable globally', exact: true }).click();
  await page.domSnapshot();
  expect(await page.getByText('Global: off · 1 pilot locations', { exact: true }).isVisible(), 'Disable must override global mode without deleting pilots');
  await page.getByRole('button', { name: 'Save policy', exact: true }).click();
  await page.domSnapshot();
  expect(await page.getByText('Effective: off', { exact: true }).isVisible(), 'Pilot must remain effectively disabled');
  return 'Pilot selection, explicit review, announced error, same-key retry and global disable passed';
}
export async function verifyAiReadOnly(page) {
  await page.getByRole('group', { name: 'Global requested mode' }).waitFor({ state: 'visible' });
  if (await page.getByRole('button', { name: 'Review policy', exact: true }).isEnabled()) throw Error('Read-only viewer can edit');
  if (await page.getByRole('button', { name: 'Disable globally', exact: true }).isEnabled()) throw Error('Read-only viewer can disable');
  return 'Read-only controls are disabled';
}
