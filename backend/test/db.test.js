const test = require("node:test");
const assert = require("node:assert");
const { openDb } = require("../src/database/db");
const companies = require("../src/services/company-service");
const svc = require("../src/services/prospect-service");

const mk = (url, extra = {}) => ({ name: "A", role: "Recruiter", profileUrl: url, action: "Connect", category: "Recruitment", matchedKeywords: ["recruiter"], ...extra });

function setup() {
  const db = openDb(":memory:");
  const c = companies.createCompany(db, { name: "Acme" });
  return { db, c };
}

test("duplicates are not inserted and state survives re-import", () => {
  const { db, c } = setup();
  assert.deepEqual(svc.upsertProspects(db, c.id, [mk("https://www.linkedin.com/in/a"), mk("https://www.linkedin.com/in/b")]), { inserted: 2, updated: 0 });
  const first = svc.getNextProspect(db, c.id);
  svc.markReviewed(db, first.id);
  const r = svc.upsertProspects(db, c.id, [mk("https://www.linkedin.com/in/a", { role: "Sr Recruiter" })]);
  assert.deepEqual(r, { inserted: 0, updated: 1 });
  const all = svc.listProspects(db, c.id);
  assert.equal(all.length, 2);
  assert.equal(all[0].review_status, "REVIEWED"); // not reset
  assert.equal(all[0].role, "Sr Recruiter");
});

test("resume returns next NEW prospect by id", () => {
  const { db, c } = setup();
  svc.upsertProspects(db, c.id, [mk("https://www.linkedin.com/in/a"), mk("https://www.linkedin.com/in/b")]);
  const a = svc.getNextProspect(db, c.id);
  svc.markReviewed(db, a.id);
  assert.equal(svc.getNextProspect(db, c.id).profile_url, "https://www.linkedin.com/in/b");
});

test("inspection never overwrites CONNECTED and statuses are validated", () => {
  const { db, c } = setup();
  svc.upsertProspects(db, c.id, [mk("https://www.linkedin.com/in/a")]);
  const p = svc.getNextProspect(db, c.id);
  assert.equal(svc.recordInspection(db, p.id, "CONNECT_VIA_MORE").connection_status, "CONNECT_AVAILABLE");
  svc.updateProspectStatus(db, p.id, "CONNECTED");
  assert.equal(svc.recordInspection(db, p.id, "NO_CONNECT_OPTION").connection_status, "CONNECTED");
  assert.throws(() => svc.updateProspectStatus(db, p.id, "SENT"));
  assert.throws(() => svc.setReview(db, p.id, "DONE"));
});

test("filters and stats", () => {
  const { db, c } = setup();
  svc.upsertProspects(db, c.id, [mk("https://www.linkedin.com/in/a"), mk("https://www.linkedin.com/in/b", { name: "Zed", category: "HR" })]);
  assert.equal(svc.listProspects(db, c.id, { category: "HR" }).length, 1);
  assert.equal(svc.listProspects(db, c.id, { search: "zed" }).length, 1);
  assert.equal(svc.stats(db).new, 2);
});
