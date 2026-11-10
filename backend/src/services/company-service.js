function hydrate(row) {
  return row && { ...row, custom_keywords: JSON.parse(row.custom_keywords), include_weak: !!row.include_weak };
}

function getCompany(db, id) {
  return hydrate(db.prepare("SELECT * FROM companies WHERE id = ?").get(id));
}

function createCompany(db, { name, linkedinUrl }) {
  if (!name?.trim()) throw new Error("Company name is required");
  const r = db.prepare("INSERT INTO companies (name, linkedin_url) VALUES (?, ?)").run(name.trim(), linkedinUrl || null);
  return getCompany(db, Number(r.lastInsertRowid));
}

function listCompanies(db) {
  return db.prepare(`
    SELECT c.*, COUNT(p.id) AS prospect_count,
           COALESCE(SUM(p.review_status = 'NEW'), 0) AS new_count
    FROM companies c LEFT JOIN prospects p ON p.company_id = c.id
    GROUP BY c.id ORDER BY c.id DESC`).all().map(hydrate);
}

function updateKeywords(db, id, { customKeywords, includeWeak }) {
  const c = getCompany(db, id);
  if (!c) throw new Error("Company not found");
  const kws = customKeywords ?? c.custom_keywords;
  const weak = includeWeak ?? c.include_weak;
  const clean = [...new Set(kws.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];
  db.prepare("UPDATE companies SET custom_keywords = ?, include_weak = ? WHERE id = ?")
    .run(JSON.stringify(clean), weak ? 1 : 0, id);
  return getCompany(db, id);
}

module.exports = { createCompany, getCompany, listCompanies, updateKeywords };
