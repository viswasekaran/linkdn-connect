const path = require("path");
const { chromium } = require("playwright");

let context = null;
let launching = null;

function dataDir() {
  return path.resolve(__dirname, "..", "..", process.env.BROWSER_DATA_DIR || "../browser-data");
}

/** Launch (or reuse) the visible persistent Chromium. User logs in manually. */
async function launchBrowser() {
  if (context && !isClosed()) return getPage();
  if (launching) return launching;
  launching = (async () => {
    context = await chromium.launchPersistentContext(dataDir(), {
      headless: false,
      // Optional: use an installed browser (e.g. Brave) instead of bundled Chromium.
      ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
      viewport: { width: 1440, height: 900 },
    });
    context.on("close", () => { context = null; });
    return getPage();
  })();
  try { return await launching; } finally { launching = null; }
}

function isClosed() {
  if (!context) return true;
  try { context.pages(); return false; } catch { return true; }
}

async function getPage() {
  if (isClosed()) throw new Error("Browser is not running. Launch it first.");
  const pages = context.pages();
  return pages[pages.length - 1] || context.newPage();
}

function status() {
  return { running: !isClosed() };
}

async function closeBrowser() {
  if (context) { const c = context; context = null; await c.close().catch(() => {}); }
}

module.exports = { launchBrowser, getPage, closeBrowser, status };
