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
    assert.ok((await page.locator('#action-guide').innerText()).includes('你现在可以'));
    await page.locator('#guide-btn').click();
    assert.ok(await page.locator('#guide-modal').isVisible());
    assert.ok(await page.locator('#glossary-grid .glossary-card').count() >= 25);
    await page.locator('#close-guide').click();
    await page.locator('#skill-bar .skill-card').first().click();
    assert.ok(await page.locator('#skill-info-modal').isVisible());
    assert.ok((await page.locator('#skill-info-content').innerText()).includes('新手解读'));
    assert.deepEqual(await page.locator('#skill-bar .skill-name').allInnerTexts(), [
      '充能', '伤害 / 充能 / 倒计时', '火', '火', '伤害 / 火', '火 / 充能'
    ]);
    await page.locator('#skill-info-content [data-term="攻击范围"]').click();
    assert.ok(await page.locator('#guide-modal').isVisible());
    assert.ok(await page.locator('#skill-info-modal').isHidden());
    assert.ok((await page.locator('#guide-focus').innerText()).includes('攻击范围'));
    await page.locator('#close-guide').click();
    await page.locator('#board .unit').first().click();
    assert.ok(await page.locator('#unit-info-modal').isVisible());
    assert.ok((await page.locator('#unit-info-content').innerText()).includes('你现在能做什么'));
    await page.locator('#close-unit-info').click();
    await page.locator('#config-btn').click();
    const skills = page.locator('select[data-kind="skill"][data-field="name"]').first();
    const names = await skills.locator('option').evaluateAll(es => es.map(e => e.value));
    const optionLabels = await skills.locator('option').evaluateAll(es => es.map(e => e.textContent.trim()));
    const allowedCategories = new Set(['伤害', '火', '毒', '护盾', '治疗', '充能', '弹药', '暴击', '亢奋', '衰弱', '麻痹', '封刃', '禁足', '位移', '倒计时', '成长', '机制']);
    assert.ok(optionLabels.every(label => label.includes('｜')));
    assert.ok(optionLabels.every(label => label.split('｜')[0].split(' / ').every(category => allowedCategories.has(category))));
    assert.ok(optionLabels.every((label, index) => !label.startsWith(names[index] + '｜')));
    for (const name of ['雷电牙', '飞抓钩', '上挑']) assert.ok(names.includes(name), name);
    await page.locator('.shop-item.clickable-item').first().click();
    assert.ok(await page.locator('#config-info-modal').isVisible());
    await page.locator('#close-config-info').click();
    // The battle selector must retain every skill from the merged workbook.
    const sourceNames = await page.evaluate(() => window.ATLAS_DATA.items.filter(i => i.kind === '技能').map(i => i.name));
    assert.ok(sourceNames.every(name => names.includes(name)));
    await page.locator('#cancel-setup').click();
    const before = await page.locator('#combat-log').innerText();
    await page.locator('#step-btn').click();
    assert.ok(!(await page.locator('#action-guide').innerText()).includes('部署阶段：先看'));
    for (let i = 1; i < 40; i++) await page.locator('#step-btn').click();
    const combatLog = await page.locator('#combat-log').innerText();
    assert.notEqual(combatLog, before);
    for (const hiddenName of ['蓄能', '引火', '天火咒', '火中取栗', '乱抓', '元气弹', '啃咬', '利爪', '毒钩', '火球', '轻击']) {
      assert.ok(!combatLog.includes(hiddenName), hiddenName + ' should be hidden from the public battle log');
    }
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
    const result = {status: 'PASS', checks: ['图谱跳转战斗页', '100 个物品共用数据及全部技能可选', '75 个正式技能均显示效果分类而非技能名', '战斗日志不回退显示默认技能名', '新手操作引导与25项术语速查', '技能卡和灵宠点击详情', '30 格棋盘', '40 次正式按钮结算并跨回合', '重置', '手机配置及无横向溢出'], pageErrors: errors, externalRequests, scope: '合并兼容性冒烟；不代表全部战斗规则验收'};
    fs.writeFileSync(path.join(root, 'verification/battle-results.json'), JSON.stringify(result, null, 2));
    console.log(result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
