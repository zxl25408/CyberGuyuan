import {chromium} from 'playwright';
import fs from 'node:fs/promises';
// Windows: use the preinstalled Edge channel (no browser download needed).
const browser = await chromium.launch({headless: true, channel: 'msedge',
  args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, deviceScaleFactor: 1});
const errors = [], console_ = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console_.push(m.type() + ': ' + m.text().slice(0, 300)); });
page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ': ' + r.url()); });
await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5199/', {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(15000);
await fs.mkdir('artifacts/guyuan', {recursive: true});
await page.screenshot({path: 'artifacts/guyuan/boot-15s.png'});
const loadingText = await page.evaluate(() => document.querySelector('#loading,.loading,[class*=load]')?.textContent?.slice(0, 200) ?? 'no-loading-el').catch(() => '?');
// try clicking through intro buttons if present
for (const name of ['走进这座城市', '开始漫游', '去城里转转']) {
  try { await page.getByRole('button', {name, exact: false}).first().click({timeout: 2000}); } catch {}
}
await page.waitForTimeout(10000);
await page.screenshot({path: 'artifacts/guyuan/after-25s.png'});
let diag = null;
try { diag = await page.evaluate(() => {
  const w = window.__SHENCHENGJI_CITY__;
  if (!w) return 'no-global';
  return {ready: w.ready, state: w.state, counts: w.world?.data?.meta?.counts,
    sceneMeshes: w.world?.scene?.meshes?.length,
    enabledMeshes: w.world?.scene?.meshes?.filter(m => m.isEnabled() && m.getTotalVertices() > 0).length};
}); } catch (e) { diag = 'eval-fail: ' + e.message.slice(0, 120); }
console.log(JSON.stringify({loadingText, errors: errors.slice(0, 15), console: console_.slice(0, 15), diag}, null, 2));
await browser.close();
