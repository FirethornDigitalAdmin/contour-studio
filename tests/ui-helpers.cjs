// Open collapsed settings through their actual summaries, as a user would.
async function reveal(page, control) {
  const details = control.locator('xpath=ancestor::details');
  // A summary is already reachable when its parents are open. Its caller toggles it.
  const isSummary = await control.locator('xpath=ancestor-or-self::summary').count() > 0;
  const count = await details.count() - (isSummary ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const detail = details.nth(i);
    if (!await detail.evaluate(element => element.open)) await detail.locator(':scope > summary').click();
  }
}
module.exports = { reveal };
