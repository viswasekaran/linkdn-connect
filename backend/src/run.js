// One-command workflow:  npm run prospect
// 1) opens Brave, 2) you go to a company's People page and press Enter,
// 3) script extracts + filters employees, saves them, and sends connection requests.
require("dotenv").config({ path: require("path").resolve(__dirname, "..", "..", ".env") });
const readline = require("readline");
const { openDb } = require("./database/db");
const browser = require("./browser/browser");
const { collectListing, BlockedError } = require("./browser/linkedin-page");
const companies = require("./services/company-service");
const prospects = require("./services/prospect-service");
const { connectOne } = require("./services/connect-service");
const { DEFAULT_RULES, customRules, matchRole } = require("./services/keyword-filter");
const { classifyProfile } = require("./services/profile-classifier");

const MAX_PER_RUN = +(process.env.MAX_INVITES_PER_RUN || 20);
const MAX_PER_DAY = +(process.env.MAX_INVITES_PER_DAY || 20);
const PRIORITY_SHARE = +(process.env.PRIORITY_SHARE || 0.5); // half priority, half regular
const INCLUDE_MANAGERS = (process.env.INCLUDE_MANAGERS ?? "true") !== "false";

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, () => { rl.close(); res(); });
});
const log = (...a) => console.log(...a);

async function main() {
  const db = openDb();
  let page = await browser.launchBrowser();
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });

  log("\nBrave is open. Log in to LinkedIn if needed, go to the company's PEOPLE page, scroll once so employees load.");
  await ask("Press Enter here when you're on the People page... ");

  page = await browser.getPage();
  const m = page.url().match(/linkedin\.com\/company\/([^/?#]+)/);
  if (!m) throw new Error(`Not a company page: ${page.url()}`);
  const slug = m[1];

  // Load the People page fresh instead of trusting the state of the tab you navigated to.
  await page.goto(`https://www.linkedin.com/company/${slug}/people/`, { waitUntil: "domcontentloaded" });

  const url = `https://www.linkedin.com/company/${slug}/`;
  let company = companies.listCompanies(db).find((c) => c.linkedin_url === url);
  if (!company) {
    company = companies.createCompany(db, { name: slug, linkedinUrl: url });
    companies.updateKeywords(db, company.id, { includeWeak: INCLUDE_MANAGERS });
    company = companies.getCompany(db, company.id);
  }

  log(`\nCompany: ${company.name}. Loading employees...`);
  const all = await collectListing(page, { maxRounds: 30 });
  const rules = [...DEFAULT_RULES, ...customRules(company.custom_keywords)];
  // Everyone is saved: priority roles keep their category, the rest become "Regular".
  const everyone = all.map((p) => {
    const m = matchRole(p.role, rules, { includeWeak: company.include_weak });
    return { ...p, listingAction: classifyProfile(p), category: m?.category ?? "Regular", matchedKeywords: m?.matchedKeywords ?? [] };
  });
  const saved = prospects.upsertProspects(db, company.id, everyone);
  const priorityCount = everyone.filter((p) => p.category !== "Regular").length;
  log(`Extracted ${all.length}: ${priorityCount} priority (HR/manager/lead/senior), ${all.length - priorityCount} regular (new ${saved.inserted}, already saved ${saved.updated}).`);

  const open = prospects.listProspects(db, company.id)
    .filter((p) => !p.invited_at && !["PENDING", "CONNECTED", "NOT_AVAILABLE"].includes(p.connection_status));
  const priorityQ = open.filter((p) => p.category !== "Regular");
  const regularQ = open.filter((p) => p.category === "Regular");

  const budget = Math.max(0, Math.min(MAX_PER_RUN, MAX_PER_DAY - prospects.invitesSentToday(db)));
  const priorityBudget = Math.ceil(budget * PRIORITY_SHARE);
  log(`Allowed this run: ${budget} (run cap ${MAX_PER_RUN}, daily cap ${MAX_PER_DAY}). Target: ${priorityBudget} priority + ${budget - priorityBudget} regular.\n`);

  let sent = 0, sentPriority = 0;
  const stats = { stop: false };
  async function work(list, limit, label) {
    let n = 0;
    for (const p of list) {
      if (n >= limit || sent >= budget || stats.stop) break;
      try {
        const r = await connectOne(db, page, p);
        if (r.sent) { n++; sent++; if (label === "priority") sentPriority++; log(`  SENT [${p.category}] ${p.name}  (${(p.role || "").slice(0, 50)})`); }
        else log(`  skipped   ${p.name}: ${r.reason}`);
      } catch (e) {
        log(`  STOPPED at ${p.name}: ${e.message}`);
        if (e instanceof BlockedError) { stats.stop = true; break; } // limit / verification: never push through
      }
    }
    return n;
  }
  // Priority first, then regular. If one side runs short, the other fills the remaining budget.
  const sentP = await work(priorityQ, priorityBudget, "priority");
  const sentR = await work(regularQ, budget - sentP, "regular");
  if (sentP + sentR < budget) await work(priorityQ, budget - sentP - sentR, "priority");
  log(`\nPriority sent: ${sentPriority}, regular sent: ${sent - sentPriority}.`);
  const s = prospects.stats(db);
  log(`\nDone. Sent ${sent} this run. Total pending: ${s.pending}.`);
  await browser.closeBrowser();
  db.close();
}

main().catch(async (e) => {
  console.error("\nError:", e.message);
  await browser.closeBrowser().catch(() => {});
  process.exit(1);
});
