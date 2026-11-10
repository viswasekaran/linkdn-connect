const test = require("node:test");
const assert = require("node:assert");
const { matchRole, filterProfiles, customRules, DEFAULT_RULES } = require("../src/services/keyword-filter");
const { classifyProfile } = require("../src/services/profile-classifier");

test("matches HR / recruitment / management titles with categories", () => {
  assert.equal(matchRole("Technical Recruiter at Acme").category, "Recruitment");
  assert.equal(matchRole("HR Business Partner").category, "HR");
  assert.equal(matchRole("Engineering Manager").category, "Management");
  assert.equal(matchRole("Head of Engineering").category, "Management");
  assert.deepEqual(matchRole("Senior Talent Acquisition Partner").matchedKeywords.includes("talent acquisition"), true);
});

test("'hr' only matches as a whole word", () => {
  assert.equal(matchRole("Shruti Software Engineer"), null);
  assert.equal(matchRole("Throughput Engineer"), null);
  assert.ok(matchRole("HR Manager"));
  assert.ok(matchRole("Sr. HR, India"));
});

test("weak keywords are opt-in", () => {
  assert.equal(matchRole("Sales Manager"), null);
  assert.equal(matchRole("Head of Sales"), null);
  assert.ok(matchRole("Sales Manager", DEFAULT_RULES, { includeWeak: true }));
});

test("custom keywords are case-insensitive and regex-safe", () => {
  const rules = [...DEFAULT_RULES, ...customRules(["C++ Lead"])];
  assert.ok(matchRole("c++ lead @ X", rules).matchedKeywords.includes("c++ lead"));
  assert.equal(matchRole(null), null);
});

test("filterProfiles keeps only matches and annotates them", () => {
  const out = filterProfiles([{ role: "Recruiter" }, { role: "Plumber" }, { role: null }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].category, "Recruitment");
});

test("classifyProfile maps listing buttons", () => {
  assert.equal(classifyProfile({ action: " Connect " }), "CONNECT");
  assert.equal(classifyProfile({ action: "Follow" }), "FOLLOW");
  assert.equal(classifyProfile({ action: "Message" }), "MESSAGE");
  assert.equal(classifyProfile({ action: "Pending" }), "PENDING");
  assert.equal(classifyProfile({}), "UNKNOWN");
});

test("lead and senior roles are priority; plain engineers are not", () => {
  assert.equal(matchRole("Senior Software Engineer").category, "Senior/Lead");
  assert.equal(matchRole("Tech Lead").category, "Senior/Lead");
  assert.equal(matchRole("Sr. QA Analyst").category, "Senior/Lead");
  assert.equal(matchRole("Software Engineer"), null);
  assert.equal(matchRole("Misleading Title"), null);
});
