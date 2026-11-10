const test = require("node:test");
const assert = require("node:assert");
const { chromium } = require("playwright");
const { extractProfiles, normalizeProfileUrl } = require("../src/services/profile-extractor");

const card = (name, role, href, btn) => `
  <li class="org-people-profile-card__profile-card-spacing">
    <a href="${href}"><div class="artdeco-entity-lockup__title">${name}</div></a>
    <div class="artdeco-entity-lockup__subtitle">${role}</div>
    ${btn ? `<button>${btn}</button>` : ""}
  </li>`;

test("normalizeProfileUrl strips query/trailing parts", () => {
  assert.equal(normalizeProfileUrl("https://www.linkedin.com/in/jane-doe/?miniProfile=1"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(normalizeProfileUrl("https://www.linkedin.com/company/x"), null);
  assert.equal(normalizeProfileUrl(null), null);
});

test("extracts cards from a fixture DOM, dedupes and skips cards without profile links", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<ul>
      ${card("Jane Doe", "Technical Recruiter", "/in/jane-doe/?x=1", "Connect")}
      ${card("Jane Doe", "Technical Recruiter", "/in/jane-doe", "Connect")}
      ${card("Sam Roe", "HR Manager", "/in/sam-roe", "Follow")}
      ${card("Nobody", "No link", "/company/acme", "Message")}
      ${card("No Button", "Director", "/in/no-button", "")}
    </ul>`);
    const out = await extractProfiles(page);
    assert.deepEqual(out.map((p) => [p.name, p.action]), [["Jane Doe", "Connect"], ["Sam Roe", "Follow"], ["No Button", null]]);
    assert.match(out[0].profileUrl, /^https:\/\/www\.linkedin\.com\/in\/jane-doe$/);
  } finally {
    await browser.close();
  }
});

test("falls back to structural card detection when the card class is renamed", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<ul><li class="renamed-class">
      <a href="/in/zed-q"><div class="artdeco-entity-lockup__title">Zed Q</div></a>
      <div class="artdeco-entity-lockup__subtitle">Tech Lead</div><button>Connect</button></li></ul>`);
    const out = await extractProfiles(page);
    assert.deepEqual(out.map((p) => [p.name, p.role, p.action]), [["Zed Q", "Tech Lead", "Connect"]]);
  } finally { await browser.close(); }
});
