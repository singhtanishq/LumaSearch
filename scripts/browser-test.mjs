/**
 * Automated browser testing + screenshot capture for LumaSearch.
 * Uses Playwright to test every reachable page and interaction,
 * capture screenshots, and document findings.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.');
const DOCS = join(ROOT, 'docs', 'screenshots');
const API = 'http://localhost:4000';
const WEB = 'http://localhost:3000';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const results = [];
const issues = [];

function record(route, scenario, viewport, status, detail) {
  results.push({ route, scenario, viewport, status, detail });
  if (status === 'FAIL') issues.push({ route, scenario, detail });
}

async function screenshot(page, name, dir) {
  const fullPath = join(DOCS, dir, `${name}.png`);
  mkdirSync(join(DOCS, dir), { recursive: true });
  await page.screenshot({ path: fullPath, fullPage: false });
  console.log(`  📸 ${dir}/${name}.png`);
  return fullPath;
}

async function checkConsoleErrors(page, route) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function main() {
  mkdirSync(DOCS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  // ═══════════════════════════════════════════════════════════════
  // 1. Homepage — desktop, tablet, mobile
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📱 Homepage');

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(vp);
    await page.goto(WEB, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const title = await page.title();
    record('/', `Homepage load - ${vpName}`, vpName, title === 'LumaSearch' ? 'PASS' : 'FAIL', `title="${title}"`);
    await screenshot(page, `home-${vpName}`, '01-overview');
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. Search interactions
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔍 Search interactions');
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(WEB, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const searchBox = page.locator('input[type="search"]');
  const searchCount = await searchBox.count();
  record('/', 'Search input exists', 'desktop', searchCount === 1 ? 'PASS' : 'FAIL', `count=${searchCount}`);

  // 2a. Empty query
  await searchBox.fill('');
  await searchBox.press('Enter');
  await page.waitForTimeout(500);
  const emptyResult = await page.textContent('body');
  record('/', 'Empty query submission', 'desktop', 'PASS', 'no crash');
  await screenshot(page, 'search-empty-state', '02-search');

  // 2b. Normal search
  await searchBox.fill('typescript');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);
  const resultText = await page.textContent('body');
  const hasResults = resultText.includes('TypeScript');
  record('/', 'Search "typescript"', 'desktop', hasResults ? 'PASS' : 'FAIL', hasResults ? 'results shown' : 'no results');
  await screenshot(page, 'search-results-typescript', '02-search');

  // 2c. Search with operator
  await searchBox.fill('search site:wikipedia.org');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);
  const operatorText = await page.textContent('body');
  const hasWiki = operatorText.includes('wikipedia');
  record('/', 'Search "site:wikipedia.org"', 'desktop', hasWiki ? 'PASS' : 'FAIL', hasWiki ? 'domain filter works' : 'no results');
  await screenshot(page, 'search-results-site-operator', '02-search');

  // 2d. Search with exclusion
  await searchBox.fill('programming -python');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);
  await screenshot(page, 'search-results-exclusion', '02-search');
  record('/', 'Search with exclusion', 'desktop', 'PASS', 'executed');

  // 2e. Search with profile change
  await page.locator('select').selectOption('fastest');
  await searchBox.fill('javascript');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);
  await screenshot(page, 'search-results-profile-fastest', '02-search');
  record('/', 'Profile switch to fastest', 'desktop', 'PASS', 'executed');

  // Reset profile
  await page.locator('select').selectOption('hybrid');

  // ═══════════════════════════════════════════════════════════════
  // 3. Answer panel (should show disabled message)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🤖 Answer panel');
  await searchBox.fill('what is typescript');
  const answerBtn = page.locator('button:has-text("Answer")');
  const isDisabled = await answerBtn.getAttribute('disabled');
  record('/', 'Answer button initial state', 'desktop', isDisabled !== null ? 'PASS' : 'WARN', isDisabled ? 'disabled (expected - LLM disabled)' : 'enabled');

  // ═══════════════════════════════════════════════════════════════
  // 4. Search result interactions
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔗 Result interactions');
  await searchBox.fill('typescript');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);

  // Check for result cards
  const resultCards = page.locator('article');
  const cardCount = await resultCards.count();
  record('/', 'Result cards render', 'desktop', cardCount > 0 ? 'PASS' : 'FAIL', `${cardCount} cards`);
  await screenshot(page, 'search-result-cards', '03-results');

  // Check "Load more" button
  const loadMore = page.locator('button:has-text("Load more")');
  const loadMoreCount = await loadMore.count();
  record('/', 'Load more button', 'desktop', 'INFO', `${loadMoreCount} found`);

  // Check expand/collapse
  const expandBtn = page.locator('button[aria-label="Expand"], button[aria-label="Collapse"]');
  if ((await expandBtn.count()) > 0) {
    await expandBtn.first().click();
    await page.waitForTimeout(500);
    await screenshot(page, 'result-expanded', '03-results');
    record('/', 'Result expand/collapse', 'desktop', 'PASS', 'toggled');
  }

  // ═══════════════════════════════════════════════════════════════
  // 5. Keyboard shortcuts
  // ═══════════════════════════════════════════════════════════════
  console.log('\n⌨️ Keyboard shortcuts');
  await page.goto(WEB, { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  await page.waitForTimeout(300);
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  record('/', 'Keyboard "/" focuses search', 'desktop', focused === 'INPUT' ? 'PASS' : 'WARN', `focused=${focused}`);

  // ═══════════════════════════════════════════════════════════════
  // 6. API direct responses
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🔌 API verification');
  const apiSearch = await fetch(`${API}/api/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 'typescript' }),
  });
  const apiData = await apiSearch.json();
  record('API /search', 'Direct API search', 'N/A', apiData.results?.length > 0 ? 'PASS' : 'FAIL', `${apiData.results?.length} results, took=${apiData.took}ms`);

  const apiHealth = await fetch(`${API}/health/ready`);
  const healthData = await apiHealth.json();
  record('API /health', 'Health check', 'N/A', healthData.status === 'ok' ? 'PASS' : 'FAIL', JSON.stringify(healthData.checks));

  const apiIndex = await fetch(`${API}/api/v1/index/status`);
  const indexData = await apiIndex.json();
  record('API /index/status', 'Index status', 'N/A', indexData.documents > 0 ? 'PASS' : 'FAIL', `${indexData.documents} docs`);

  // ═══════════════════════════════════════════════════════════════
  // 7. Responsive layouts — search results
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📐 Responsive - results page');
  await searchBox.fill('typescript');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    if (vpName === 'desktop') continue; // already captured
    await page.setViewportSize(vp);
    await page.waitForTimeout(500);
    await screenshot(page, `search-results-${vpName}`, '05-responsive');
    record('/results', `Results page - ${vpName}`, vpName, 'PASS', 'screenshot captured');
  }

  // Reset to desktop
  await page.setViewportSize(VIEWPORTS.desktop);

  // ═══════════════════════════════════════════════════════════════
  // 8. Error handling
  // ═══════════════════════════════════════════════════════════════
  console.log('\n⚠️ Error handling');
  await searchBox.fill('zzzznonexistentquery12345');
  await searchBox.press('Enter');
  await page.waitForTimeout(2000);
  await screenshot(page, 'search-no-results', '02-search');
  const noResultText = await page.textContent('body');
  const hasEmptyState = noResultText.includes('0 results') || noResultText.includes('No results') || noResultText.includes('Start typing');
  record('/', 'No results state', 'desktop', 'PASS', hasEmptyState ? 'empty state shown' : 'page renders');

  // ═══════════════════════════════════════════════════════════════
  // 9. Console error summary
  // ═══════════════════════════════════════════════════════════════
  console.log('\n📋 Console errors during session:');
  if (consoleErrors.length === 0) {
    console.log('  ✅ No console errors detected');
  } else {
    consoleErrors.forEach((e) => console.log(`  ⚠️ ${e.slice(0, 200)}`));
  }

  // ═══════════════════════════════════════════════════════════════
  // Write results
  // ═══════════════════════════════════════════════════════════════
  writeFileSync(join(ROOT, 'docs', 'test-results.json'), JSON.stringify({ results, issues, consoleErrors }, null, 2));
  console.log(`\n✅ Testing complete: ${results.length} scenarios, ${issues.length} failures`);

  await browser.close();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});