const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const context = await browser.newContext({offline: true, viewport: {width: 1500, height: 1050}});
    const page = await context.newPage();
    const errors = [], externalRequests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url())) externalRequests.push(r.url()); });
    await page.goto('file://' + path.join(root, 'index.html'));
    await page.locator('[data-battle-link]').click();
    assert.ok(page.url().endsWith('/battle.html'));
    await page.waitForFunction(() => window.ATLAS_DATA && document.querySelectorAll('#board .cell-coordinate').length === 30);
    assert.equal(await page.evaluate(() => window.ATLAS_DATA.items.length), 100);
    assert.equal(await page.locator('#board .cell-coordinate').count(), 30);
    await page.locator('#config-btn').click();
    const skills = page.locator('select[data-kind="skill"][data-field="name"]').first();
    const names = await skills.locator('option').evaluateAll(es => es.map(e => e.value));
    for (const name of ['雷电牙', '飞抓钩', '上挑']) assert.ok(names.includes(name), name);
    // The battle selector must retain every skill from the merged workbook.
    const sourceNames = await page.evaluate(() => window.ATLAS_DATA.items.filter(i => i.kind === '技能').map(i => i.name));
    assert.ok(sourceNames.every(name => names.includes(name)));
    await page.locator('#cancel-setup').click();
    const before = await page.locator('#combat-log').innerText();
    for (let i = 0; i < 40; i++) await page.locator('#step-btn').click();
    assert.notEqual(await page.locator('#combat-log').innerText(), before);
    assert.ok(Number(await page.locator('#event-total').innerText()) > 0);
    assert.ok(Number(await page.locator('#round-number').innerText()) > 1);
    await page.screenshot({path: path.join(root, 'verification/battle-desktop.png'), fullPage: true});
    await page.locator('#reset-btn').click();
    assert.equal(await page.locator('#round-number').innerText(), '1');
    assert.ok(await page.locator('#resolution-banner').isHidden());
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#config-btn').click();
    assert.ok(await page.locator('#setup-modal').isVisible());
    await page.locator('#cancel-setup').click();
    await page.screenshot({path: path.join(root, 'verification/battle-mobile.png'), fullPage: true});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    const result = {status: 'PASS', checks: ['图谱跳转战斗页', '100 个物品共用数据及全部技能可选', '30 格棋盘', '40 次正式按钮结算并跨回合', '重置', '手机配置及无横向溢出'], pageErrors: errors, externalRequests, scope: '合并兼容性冒烟；不代表全部战斗规则验收'};
    fs.writeFileSync(path.join(root, 'verification/battle-results.json'), JSON.stringify(result, null, 2));
    console.log(result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
