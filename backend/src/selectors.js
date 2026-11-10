// Central place for every LinkedIn selector. LinkedIn changes its DOM often:
// update here only. Selectors were taken from manual DOM inspection.
module.exports = {
  listing: {
    // Known class first; the :has() form is a structural fallback for layouts where LinkedIn renames it.
    card: 'li.org-people-profile-card__profile-card-spacing, li:has(.artdeco-entity-lockup__title):has(a[href*="/in/"])',
    name: ".artdeco-entity-lockup__title",
    role: ".artdeco-entity-lockup__subtitle",
    profileLink: 'a[href*="/in/"]',
    actionButton: "button",
    showMore: 'button:has-text("Show more results")',
  },
  profile: {
    directConnect: 'a[aria-label*="to connect"][href*="/preload/custom-invite"]',
    moreButton: 'button[aria-label="More"]',
    moreMenuConnect: 'a[role="menuitem"][href*="/preload/custom-invite"]',
    // Scoped to the profile being viewed so sidebar "More profiles for you" buttons never match.
    directConnectFor: (slug) => `a[aria-label*="to connect"][href*="/preload/custom-invite"][href*="vanityName=${slug}"]`,
    moreMenuConnectFor: (slug) => `a[role="menuitem"][href*="/preload/custom-invite"][href*="vanityName=${slug}"]`,
    // Open shadow DOM host; Playwright locators pierce open shadow roots.
    modalHost: "#interop-outlet",
  },
  blocked: {
    urlPatterns: [/\/checkpoint\//, /\/authwall/, /\/uas\/login/, /captcha/i],
  },
};
