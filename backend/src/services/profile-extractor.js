const sel = require("../selectors").listing;

function normalizeProfileUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url, "https://www.linkedin.com");
    const m = u.pathname.match(/\/in\/[^/]+/);
    return m ? `https://www.linkedin.com${m[0]}` : null;
  } catch { return null; }
}

/** Runs inside the page; selectors are passed in so they stay configurable. */
function readCards(cards, s) {
  return cards.map((card) => ({
    name: card.querySelector(s.name)?.innerText.trim() || null,
    role: card.querySelector(s.role)?.innerText.trim() || null,
    profileUrl: card.querySelector(s.profileLink)?.href || null,
    action: card.querySelector(s.actionButton)?.innerText.trim() || null,
  }));
}

/** Extract currently rendered cards, normalise URLs and de-duplicate. */
async function extractProfiles(page) {
  const raw = await page.locator(sel.card).evaluateAll(readCards, sel);
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    const profileUrl = normalizeProfileUrl(p.profileUrl);
    if (!profileUrl || seen.has(profileUrl)) continue;
    seen.add(profileUrl);
    out.push({ ...p, profileUrl });
  }
  return out;
}

module.exports = { extractProfiles, normalizeProfileUrl };
