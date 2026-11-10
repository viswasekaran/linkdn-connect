const sel = require("../selectors");
const { extractProfiles } = require("../services/profile-extractor");

class BlockedError extends Error {}

/** First match that is rendered and not inside an [inert] subtree (LinkedIn keeps hidden duplicates). */
async function firstActionable(locator) {
  const n = await locator.count();
  for (let i = 0; i < n; i++) {
    const el = locator.nth(i);
    const ok = await el.evaluate((e) => !e.closest("[inert]") && e.getClientRects().length > 0).catch(() => false);
    if (ok) return el;
  }
  return null;
}

/** Poll until an actionable match exists (page hydration renders it late), or return null. */
async function waitActionable(locator, timeout = 10000) {
  const end = Date.now() + timeout;
  do {
    const el = await firstActionable(locator);
    if (el) return el;
    await locator.page().waitForTimeout(250);
  } while (Date.now() < end);
  return null;
}

/** "/in/<slug>" -> slug (as used in the invite link's vanityName). */
function slugOf(url) {
  const m = String(url).match(/\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

function assertNotBlocked(page) {
  const url = page.url();
  if (sel.blocked.urlPatterns.some((re) => re.test(url))) {
    throw new BlockedError(`LinkedIn is showing a login/verification page (${url}). Resolve it manually, then retry.`);
  }
}

/**
 * Collect employees from the listing the user already opened. Scrolls and
 * clicks "Show more results" until no new cards appear or maxRounds is hit.
 */
async function collectListing(page, { maxRounds = 10 } = {}) {
  assertNotBlocked(page);
  const cards = page.locator(sel.listing.card);
  // Cards render lazily and pages reached via in-app navigation can be left half-rendered.
  // Wait with scroll nudges; if still empty, do one fresh reload and wait again.
  for (let attempt = 0; attempt < 2 && (await cards.count()) === 0; attempt++) {
    if (attempt === 1) await page.reload({ waitUntil: "domcontentloaded" });
    for (let i = 0; i < 6 && (await cards.count()) === 0; i++) {
      await page.mouse.wheel(0, i % 2 ? -400 : 800);
      await cards.first().waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    }
  }
  if ((await cards.count()) === 0) {
    const links = await page.locator('a[href*="/in/"]').count();
    const shot = require("path").resolve(__dirname, "..", "..", "..", "data", "last-error.png");
    await page.screenshot({ path: shot }).catch(() => {});
    throw new Error(`Page URL: ${page.url()} | profile links on page: ${links}. ` +`No employee cards found (selector: ${sel.listing.card}). Open the company's People page first, or update selectors.js.`);
  }
  for (let i = 0; i < maxRounds; i++) {
    const before = await cards.count();
    await page.mouse.wheel(0, 4000);
    const more = page.locator(sel.listing.showMore).first();
    if (await more.isVisible().catch(() => false)) await more.click();
    try {
      await page.waitForFunction(
        ([s, n]) => document.querySelectorAll(s).length > n,
        [sel.listing.card, before],
        { timeout: 6000 }
      );
    } catch { break; } // nothing new loaded
    assertNotBlocked(page);
  }
  return extractProfiles(page);
}

/**
 * Inspect (never submit) the connection options on a profile page.
 * Returns one of: DIRECT_CONNECT, CONNECT_VIA_MORE, PENDING, NO_CONNECT_OPTION, UNKNOWN.
 */
async function inspectProfile(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  assertNotBlocked(page);
  const p = sel.profile;
  const slug = slugOf(url);
  if (!slug) return "UNKNOWN";
  const directSel = p.directConnectFor(slug);
  const menuSel = p.moreMenuConnectFor(slug);

  // Wait for the top-card actions to hydrate (the "More" button is part of them).
  const more = await waitActionable(page.locator(p.moreButton), 12000);
  if (!more) return "UNKNOWN"; // page not recognised / not hydrated

  if (await firstActionable(page.locator(directSel))) return "DIRECT_CONNECT";
  if (await page.getByText("Pending", { exact: true }).count()) return "PENDING";

  await more.click();
  try {
    const item = page.locator(menuSel).first();
    const found = await item.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
    return found ? "CONNECT_VIA_MORE" : "NO_CONNECT_OPTION";
  } finally {
    await page.keyboard.press("Escape").catch(() => {}); // close menu, never click Connect
  }
}

/**
 * Send ONE invitation without a note. Throws BlockedError on limit/verification dialogs.
 * Returns { sent: true } only when the profile afterwards shows a Pending button.
 */
async function sendInvitation(page, url) {
  const option = await inspectProfile(page, url); // leaves the page on the profile
  if (option === "PENDING") return { sent: false, reason: "ALREADY_PENDING" };
  if (option !== "DIRECT_CONNECT" && option !== "CONNECT_VIA_MORE") return { sent: false, reason: option };

  const p = sel.profile;
  const slug = slugOf(url);
  const clickOpts = { timeout: 10000 };
  try {
    if (option === "DIRECT_CONNECT") {
      const btn = await waitActionable(page.locator(p.directConnectFor(slug)));
      if (!btn) return { sent: false, reason: "CONNECT_NOT_ACTIONABLE" };
      await btn.click(clickOpts);
    } else {
      const more = await waitActionable(page.locator(p.moreButton));
      if (!more) return { sent: false, reason: "CONNECT_NOT_ACTIONABLE" };
      await more.click(clickOpts);
      const item = page.locator(p.moreMenuConnectFor(slug)).first();
      await item.waitFor({ state: "visible", timeout: 5000 });
      await item.click(clickOpts);
    }
  } catch (e) {
    await page.keyboard.press("Escape").catch(() => {});
    return { sent: false, reason: "CLICK_FAILED" };
  }

  const dialog = page.getByRole("dialog");
  await dialog.first().waitFor({ state: "visible", timeout: 8000 });
  const text = (await dialog.first().innerText()).toLowerCase();
  if (/weekly|invitation limit|too many/.test(text)) throw new BlockedError("LinkedIn invitation limit reached. Stop and retry later.");
  if (/email address|verify|security check/.test(text)) {
    await page.keyboard.press("Escape").catch(() => {});
    return { sent: false, reason: "NEEDS_EMAIL_OR_VERIFICATION" };
  }

  await dialog.getByRole("button", { name: "Send without a note" }).click({ timeout: 5000 });
  await dialog.first().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});

  // Verify from the UI itself rather than trusting the click.
  await page.reload({ waitUntil: "domcontentloaded" });
  assertNotBlocked(page);
  const shownPending = await page.getByText("Pending", { exact: true }).first()
    .waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
  // Pending text may belong to a sidebar card, so also require this person's Connect link to be gone.
  const stillConnect = await firstActionable(page.locator(sel.profile.directConnectFor(slug)));
  if (shownPending && !stillConnect) return { sent: true };

  // Profiles whose Connect lives under "More": Pending then appears inside that menu.
  const more = await firstActionable(page.locator(sel.profile.moreButton));
  if (more) {
    await more.click(clickOpts).catch(() => {});
    const menuPending = await page.locator('[role="menuitem"]:has-text("Pending")').first()
      .waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
    const menuConnect = await page.locator(sel.profile.moreMenuConnectFor(slug)).first()
      .isVisible().catch(() => false);
    await page.keyboard.press("Escape").catch(() => {});
    if (menuPending && !menuConnect) return { sent: true };
  }
  return { sent: false, reason: "UNVERIFIED" };
}

/** Is an invitation dialog currently open? (Playwright pierces open shadow roots.) */
async function invitationDialogOpen(page) {
  return (await page.getByRole("dialog").count()) > 0;
}

module.exports = { collectListing, inspectProfile, sendInvitation, invitationDialogOpen, BlockedError };
