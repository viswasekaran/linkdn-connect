# LinkedIn Prospecting Script

A local Node.js + Playwright script. You open a company's LinkedIn **People** page, press Enter, and it:

1. extracts the employees,
2. splits them into **priority** roles (HR, recruiters, managers, leads, seniors) and **regular** employees,
3. saves everyone to a local SQLite database,
4. sends connection requests (no note) within strict caps, verifying each one on the profile before recording it.

Nothing leaves your machine except your own LinkedIn browsing. You log in yourself; no credentials are stored.

## Read this first

- **Automating LinkedIn is against LinkedIn's User Agreement.** Accounts that send many invitations or use automation can be warned, restricted or banned. You use this at your own risk.
- It stops when LinkedIn shows a limit, login or verification page. It does **not** bypass CAPTCHAs, rotate proxies, randomise behaviour to hide, or try to evade restrictions, and contributions that add such features will not be accepted.
- Keep the caps low (see `.env.example`). Prefer personalised outreach for people you actually want to reach.
- LinkedIn changes its markup often. Selectors live in one file (`backend/src/selectors.js`).

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite`)
- Windows, macOS or Linux

## Setup

```bash
npm run install:all      # installs dependencies and Playwright's Chromium
cp .env.example .env     # optional: adjust limits or use your own browser
```

## Use

```bash
npm run prospect
```

1. A browser opens. Log in to LinkedIn the first time (the session is kept in `browser-data/`).
   - "Sign in with Google" is refused in automated browsers. Use LinkedIn email + password.
2. Go to `linkedin.com/company/<name>/people/`, then press **Enter** in the terminal.
3. The script loads the page, extracts employees, and sends requests. Each line shows `SENT` or `skipped` with the reason.

People already contacted are never contacted again, so re-running is safe.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `MAX_INVITES_PER_RUN` | 20 | Max requests per run |
| `MAX_INVITES_PER_DAY` | 20 | Max per UTC day, across all companies |
| `PRIORITY_SHARE` | 0.5 | Share of each run for priority roles; the other side fills any shortfall |
| `INCLUDE_MANAGERS` | true | Treat bare "manager"/"director" as priority (can match e.g. "Sales Manager") |
| `BROWSER_EXECUTABLE` | bundled Chromium | Path to Brave/Chrome/Edge |
| `DB_PATH`, `BROWSER_DATA_DIR` | `../data/...`, `../browser-data` | Storage locations |

Role keywords are in `backend/src/services/keyword-filter.js`.

## How it stays honest

- A prospect is marked `PENDING` only after the profile page shows a Pending state, never just because a button was clicked.
- Re-importing never resets a prospect's review or connection status.
- Click targets are scoped to the profile being visited, so sidebar "More profiles for you" buttons are never clicked.

## Project layout

```
backend/src/
  run.js                 entry point (npm run prospect)
  selectors.js           all LinkedIn selectors
  browser/               Playwright launch + page interactions
  services/              extraction, keyword filter, classifier, database logic
  database/              SQLite schema
backend/test/            unit tests (npm test)
```

## Tests

```bash
npm test
```

Covers filtering, classification, the database and extraction against fixture HTML. The LinkedIn interaction itself is not covered by automated tests, because it needs a live logged-in session.

## Privacy

`.env`, `data/` (your prospects database and screenshots) and `browser-data/` (your LinkedIn session) are git-ignored. Never commit them.

## License

MIT, see [LICENSE](LICENSE).
