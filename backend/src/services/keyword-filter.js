// Role matching with word boundaries. `weak` rules are broad and can produce
// false positives (e.g. "Sales Manager"), so they're opt-in via includeWeak.
const DEFAULT_RULES = [
  { category: "HR", label: "hr", pattern: "\\bhr\\b" },
  { category: "HR", label: "human resources", pattern: "\\bhuman resources?\\b" },
  { category: "HR", label: "hr business partner", pattern: "\\bhrbp\\b" },
  { category: "HR", label: "people operations", pattern: "\\bpeople (operations|ops|partner|team|culture)\\b" },
  { category: "Recruitment", label: "recruiter", pattern: "\\brecruit(er|ers|ing)\\b" },
  { category: "Recruitment", label: "recruitment", pattern: "\\brecruitment\\b" },
  { category: "Recruitment", label: "talent acquisition", pattern: "\\btalent (acquisition|partner|sourcer|sourcing)\\b" },
  { category: "Recruitment", label: "talent", pattern: "\\btalent\\b" },
  { category: "Recruitment", label: "hiring", pattern: "\\bhiring\\b" },
  { category: "Management", label: "engineering manager", pattern: "\\bengineering manager\\b" },
  { category: "Management", label: "technical manager", pattern: "\\btechnical (program )?manager\\b" },
  { category: "Management", label: "people manager", pattern: "\\bpeople manager\\b" },
  { category: "Management", label: "head of", pattern: "\\bhead of (engineering|technology|tech|talent|people|hr|human|recruit\\w*|hiring|product development)\\b" },
  { category: "Senior/Lead", label: "lead", pattern: "\\b(tech |team |technical |engineering )?lead\\b" },
  { category: "Senior/Lead", label: "senior", pattern: "\\b(senior|sr\\.?|principal|staff)\\b" },
  { category: "Management", label: "director", pattern: "\\bdirector\\b", weak: true },
  { category: "Management", label: "manager", pattern: "\\bmanager\\b", weak: true },
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turn user-supplied keyword strings into rules. */
function customRules(keywords = [], category = "Custom") {
  return keywords
    .map((k) => String(k).trim())
    .filter(Boolean)
    .map((k) => ({ category, label: k.toLowerCase(), pattern: `(?<![\\w])${escapeRe(k)}(?![\\w])` }));
}

/** Returns {category, matchedKeywords} or null. Category = that of the first match. */
function matchRole(role, rules = DEFAULT_RULES, { includeWeak = false } = {}) {
  const text = (role || "").toLowerCase();
  if (!text) return null;
  const hits = rules.filter((r) => (includeWeak || !r.weak) && new RegExp(r.pattern, "i").test(text));
  if (!hits.length) return null;
  return {
    category: hits[0].category,
    matchedKeywords: [...new Set(hits.map((h) => h.label))],
  };
}

function filterProfiles(profiles, rules = DEFAULT_RULES, opts = {}) {
  const out = [];
  for (const p of profiles) {
    const m = matchRole(p.role, rules, opts);
    if (m) out.push({ ...p, ...m });
  }
  return out;
}

module.exports = { DEFAULT_RULES, customRules, matchRole, filterProfiles };
