/** Classify by the button shown on the employee listing. Not the full picture. */
function classifyProfile(profile) {
  const action = (profile.action || "").trim().toLowerCase();
  if (action === "connect") return "CONNECT";
  if (action === "follow") return "FOLLOW";
  if (action === "message") return "MESSAGE";
  if (action === "pending") return "PENDING";
  return "UNKNOWN";
}

module.exports = { classifyProfile };
