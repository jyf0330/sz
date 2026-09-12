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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('file://' + path.join(root, 'index.html'));
    await page.waitForFunction(() => window.ATLAS_DATA && document.querySelectorAll('.team-preset-card').length === 3);
    assert.equal(await page.locator('.team-preset-card').count(), 3);
    assert.equal(await page.locator('.team-preset-member').count(), 12);
    assert.equal(await page.locator('.team-preset-card [data-preset-battle-link]').count(), 3);
    assert.match(await page.locator('.team-preset-card').nth(2).innerText(), /蓄力\s*图鉴名 蓄能/);
    assert.match(await page.locator('.team-preset-card').nth(2).innerText(), /飞爪钩\s*图鉴名 飞抓钩/);
    await page.screenshot({path: path.join(root, 'verification/presets-atlas-desktop.png'), fullPage: true});

    await page.goto('file://' + path.join(root, 'battle.html'));
    await page.locator('#config-btn').click();
    assert.equal(await page.locator('.setup-preset-card').count(), 3);
    await page.locator('[data-action="apply-preset"][data-preset="critical-growth-team"][data-team="player"]').click();
    const player = page.locator('.setup-team.player');
    assert.deepEqual(await player.locator('select[data-kind="pet"][data-field="name"]').evaluateAll(nodes => nodes.map(node => node.value)), ['角蛙', '巨鳄蚁', '饿狼', '巨伞蕈']);
    assert.deepEqual(await player.locator('select[data-kind="pet"][data-field="quality"]').evaluateAll(nodes => nodes.map(node => node.value)), ['白银', '白银', '白银', '白银']);
    assert.equal(await player.locator('input[data-field="heroHp"]').inputValue(), '660');
    assert.equal(await player.locator('select[data-kind="skill"][data-field="name"]').count(), 8);
    assert.match(await page.locator('#setup-validation').innerText(), /10 \/ 10/);

    await page.locator('[data-action="apply-preset"][data-preset="fire-energy-team"][data-team="player"]').click();
    assert.deepEqual(await player.locator('select[data-kind="skill"][data-field="name"]').evaluateAll(nodes => nodes.map(node => node.value)), ['火中取栗', '引火', '激昂', '飞抓钩', '妒火', '天火咒', '连抓', '蓄能', '轻击']);
    const qualities = await player.locator('select[data-kind="skill"][data-field="quality"]').evaluateAll(nodes => nodes.map(node => node.value));
    assert.equal(qualities[6], '黄金');
    assert(qualities.every((quality, index) => index === 6 ? quality === '黄金' : quality === '白银'));
    await page.screenshot({path: path.join(root, 'verification/presets-battle-desktop.png'), fullPage: true});

    await page.goto('file://' + path.join(root, 'battle.html') + '?preset=rapid-output-team');
    assert.ok(await page.locator('#setup-modal').isVisible());
    assert.deepEqual(await page.locator('.setup-team.player select[data-kind="pet"][data-field="name"]').evaluateAll(nodes => nodes.map(node => node.value)), ['圣象甲虫', '鬼蜂', '蚁王', '泥沼妖']);

    await page.setViewportSize({width: 390, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path: path.join(root, 'verification/presets-battle-mobile.png'), fullPage: true});

    await page.setViewportSize({width: 1500, height: 1050});
    await page.goto('file://' + path.join(root, 'editor.html'));
    const editableId = await page.evaluate(() => window.ATLAS_DATA.items.find(item => item.kind === '技能' && item.variants.length > 1).id);
    await page.locator('[data-id="' + editableId + '"]').click();
    const baseTier = await page.locator('#item-form select[name="tier"]').inputValue();
    const baseTags = await page.locator('#item-form input[name="词条"]').inputValue();
    assert.ok(baseTags.length > 0);
    assert.ok(await page.locator('#item-form input[name="词条"]').isEnabled());
    const otherTier = await page.locator('#quality-tabs button').evaluateAll((buttons, tier) => buttons.map(button => button.dataset.quality).find(value => value !== tier), baseTier);
    await page.locator('#quality-tabs button[data-quality="' + otherTier + '"]').click();
    assert.ok(await page.locator('#item-form input[name="词条"]').isDisabled());
    assert.equal(await page.locator('#item-form input[name="词条"]').inputValue(), baseTags);
    assert.match(await page.locator('#tag-sync-note').innerText(), /沿用.*起步品质标签/);
    await page.locator('#quality-tabs button[data-quality="' + baseTier + '"]').click();
    await page.locator('#item-form input[name="词条"]').fill('联动标签，验证');
    await page.locator('#quality-tabs button[data-quality="' + otherTier + '"]').click();
    assert.equal(await page.locator('#item-form input[name="词条"]').inputValue(), '联动标签，验证');
    await page.locator('#quality-tabs button[data-quality="' + baseTier + '"]').click();
    await page.locator('#item-form button[type="submit"]').click();
    assert.ok(await page.evaluate(id => window.ATLAS_EDITOR.getItems().find(item => item.id === id).variants.every(variant => variant.fields['词条'] === '联动标签，验证'), editableId));
    await page.screenshot({path: path.join(root, 'verification/presets-editor-tags.png'), fullPage: true});
    assert.deepEqual(errors, []);

    const result = {status: 'PASS', presets: 3, heroHp: 660, checks: ['图谱展示完整配队', '图谱跳转预载', '编队界面载入己方', '四灵宠与技能归属', '10格上限', '别名映射', '黄金连抓', '起步品质标签联动', '非起步品质标签只读', '手机无横向溢出'], pageErrors: errors};
    fs.writeFileSync(path.join(root, 'verification/presets-results.json'), JSON.stringify(result, null, 2));
    console.log(result);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
