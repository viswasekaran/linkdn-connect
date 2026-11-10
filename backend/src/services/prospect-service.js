const REVIEW = ["NEW", "REVIEWED", "SKIPPED"];
const CONNECTION = ["UNKNOWN", "CONNECT_AVAILABLE", "PENDING", "CONNECTED", "NOT_AVAILABLE"];
const OPTION_TO_STATUS = {
  DIRECT_CONNECT: "CONNECT_AVAILABLE",
  CONNECT_VIA_MORE: "CONNECT_AVAILABLE",
  PENDING: "PENDING",
  NO_CONNECT_OPTION: "NOT_AVAILABLE",
  UNKNOWN: "UNKNOWN",
};

const hydrate = (r) => r && { ...r, matched_keywords: r.matched_keywords ? JSON.parse(r.matched_keywords) : [] };

/** Insert new prospects; existing ones only refresh listing data (never reset review/connection state). */
function upsertProspects(db, companyId, prospects) {
  const stmt = db.prepare(`
    INSERT INTO prospects (company_id, name, role, profile_url, action, listing_action, category, matched_keywords)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_url) DO UPDATE SET
      name = excluded.name, role = excluded.role, action = excluded.action,
      listing_action = excluded.listing_action, category = excluded.category,
      matched_keywords = excluded.matched_keywords, updated_at = CURRENT_TIMESTAMP`);
  const exists = db.prepare("SELECT 1 FROM prospects WHERE profile_url = ?");
  let inserted = 0, updated = 0;
  db.exec("BEGIN");
  try {
    for (const p of prospects) {
      if (exists.get(p.profileUrl)) updated++; else inserted++;
      stmt.run(companyId, p.name ?? null, p.role ?? null, p.profileUrl, p.action ?? null,
        p.listingAction ?? null, p.category ?? null, JSON.stringify(p.matchedKeywords || []));
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  return { inserted, updated };
}

function listProspects(db, companyId, { category, reviewStatus, search } = {}) {
  const where = ["company_id = ?"]; const args = [companyId];
  if (category) { where.push("category = ?"); args.push(category); }
  if (reviewStatus) { where.push("review_status = ?"); args.push(reviewStatus); }
  if (search) { where.push("(name LIKE ? OR role LIKE ?)"); args.push(`%${search}%`, `%${search}%`); }
  return db.prepare(`SELECT * FROM prospects WHERE ${where.join(" AND ")} ORDER BY id`).all(...args).map(hydrate);
}

/** Resume point: next NEW prospect by id (stable, not an array index). */
function getNextProspect(db, companyId) {
  return hydrate(db.prepare("SELECT * FROM prospects WHERE company_id = ? AND review_status = 'NEW' ORDER BY id LIMIT 1").get(companyId));
}

function getProspect(db, id) {
  return hydrate(db.prepare("SELECT * FROM prospects WHERE id = ?").get(id));
}

function setReview(db, id, status) {
  if (!REVIEW.includes(status)) throw new Error(`Invalid review status: ${status}`);
  db.prepare("UPDATE prospects SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
  return getProspect(db, id);
}
const markReviewed = (db, id) => setReview(db, id, "REVIEWED");

/** Manual / verified connection status only. Never set by merely clicking a button. */
function updateProspectStatus(db, id, status, option) {
  if (!CONNECTION.includes(status)) throw new Error(`Invalid connection status: ${status}`);
  db.prepare("UPDATE prospects SET connection_status = ?, connection_option = COALESCE(?, connection_option), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(status, option ?? null, id);
  return getProspect(db, id);
}

/** Record an inspection result. Never claims an invitation was sent. */
function recordInspection(db, id, option) {
  const cur = getProspect(db, id);
  // Don't downgrade a user-confirmed CONNECTED to an inspection result.
  if (cur?.connection_status === "CONNECTED") return cur;
  return updateProspectStatus(db, id, OPTION_TO_STATUS[option] ?? "UNKNOWN", option);
}

/** Invitations verified as sent today (UTC) - used for the daily cap. */
function invitesSentToday(db) {
  return db.prepare("SELECT COUNT(*) n FROM prospects WHERE date(invited_at) = date('now')").get().n;
}

/** Call only after the UI verified a Pending state. */
function markInvited(db, id) {
  db.prepare("UPDATE prospects SET connection_status='PENDING', invited_at=CURRENT_TIMESTAMP, review_status='REVIEWED', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
  return getProspect(db, id);
}

function stats(db) {
  const one = (sql) => db.prepare(sql).get().n;
  return {
    companies: one("SELECT COUNT(*) n FROM companies"),
    prospects: one("SELECT COUNT(*) n FROM prospects"),
    new: one("SELECT COUNT(*) n FROM prospects WHERE review_status='NEW'"),
    reviewed: one("SELECT COUNT(*) n FROM prospects WHERE review_status='REVIEWED'"),
    pending: one("SELECT COUNT(*) n FROM prospects WHERE connection_status='PENDING'"),
  };
}

module.exports = { upsertProspects, listProspects, getNextProspect, getProspect, markReviewed, setReview, updateProspectStatus, recordInspection, invitesSentToday, markInvited, stats };
