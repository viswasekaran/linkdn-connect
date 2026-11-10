CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  linkedin_url TEXT,
  custom_keywords TEXT NOT NULL DEFAULT '[]',
  include_weak INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  name TEXT,
  role TEXT,
  profile_url TEXT NOT NULL UNIQUE,
  action TEXT,
  listing_action TEXT,
  category TEXT,
  matched_keywords TEXT,
  review_status TEXT NOT NULL DEFAULT 'NEW',
  connection_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  connection_option TEXT,
  invited_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE INDEX IF NOT EXISTS idx_prospects_company ON prospects(company_id, review_status);
