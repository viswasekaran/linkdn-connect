const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

function openDb(file) {
  const target = file || path.resolve(__dirname, "..", "..", process.env.DB_PATH || "../data/prospects.db");
  if (target !== ":memory:") fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
  return db;
}

module.exports = { openDb };
