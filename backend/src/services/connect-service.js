const { sendInvitation } = require("../browser/linkedin-page");
const svc = require("./prospect-service");

/**
 * Send one invitation and persist the outcome.
 * Status becomes PENDING only when the UI verified it. Throws BlockedError on limits/challenges.
 */
async function connectOne(db, page, prospect) {
  if (["PENDING", "CONNECTED"].includes(prospect.connection_status)) {
    return { sent: false, reason: "ALREADY_" + prospect.connection_status, prospect };
  }
  const result = await sendInvitation(page, prospect.profile_url);
  if (result.sent) return { ...result, prospect: svc.markInvited(db, prospect.id) };
  // Remember definitive outcomes so they aren't retried every run.
  if (result.reason === "ALREADY_PENDING") svc.updateProspectStatus(db, prospect.id, "PENDING");
  else if (result.reason === "NO_CONNECT_OPTION") svc.updateProspectStatus(db, prospect.id, "NOT_AVAILABLE", result.reason);
  return { ...result, prospect: svc.getProspect(db, prospect.id) };
}

module.exports = { connectOne };
