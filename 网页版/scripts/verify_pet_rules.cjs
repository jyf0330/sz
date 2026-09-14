const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
    await page.goto('file:///D:/功能/工作/数值/战旗项目/网页版/battle.html');
    await page.locator('#config-btn').click();
    const select = (team, kind, index, field) => page.locator(`select[data-team="${team}"][data-kind="${kind}"][data-index="${index}"][data-field="${field}"]`);

    await select('player', 'pet', 0, 'name').selectOption('玄铁龟');
    await select('player', 'pet', 0, 'quality').selectOption('白银');
    for (let index = 1; index < 4; index += 1) await select('player', 'pet', index, 'name').selectOption('');
    while (await page.locator('[data-action="remove-skill"][data-team="player"]').count() > 1) await page.locator('[data-action="remove-skill"][data-team="player"]').last().click();
    await select('player', 'skill', 0, 'name').selectOption('蜕壳投掷');
    await select('player', 'skill', 0, 'quality').selectOption('白银');
    await select('player', 'skill', 0, 'owner').selectOption('0');

    await select('enemy', 'pet', 0, 'name').selectOption('岩豚');
    for (let index = 1; index < 4; index += 1) await select('enemy', 'pet', index, 'name').selectOption('');
    while (await page.locator('[data-action="remove-skill"][data-team="enemy"]').count() > 1) await page.locator('[data-action="remove-skill"][data-team="enemy"]').last().click();
    await select('enemy', 'skill', 0, 'name').selectOption('重劈');
    await select('enemy', 'skill', 0, 'quality').selectOption('青铜');
    await select('enemy', 'skill', 0, 'owner').selectOption('0');
    await page.locator('#apply-setup').click();
    await page.waitForTimeout(100);

    const placeBehindEnemy = async () => {
      const units = await page.locator('#board .unit').evaluateAll(nodes => nodes.map(node => ({
        text: node.innerText,
        row: Number(node.parentElement.dataset.row),
        col: Number(node.parentElement.dataset.col)
      })));
      const player = units.find(unit => unit.text.includes('玄铁龟'));
      const enemy = units.find(unit => unit.text.includes('岩豚'));
      assert.ok(player && enemy);
      const row = Math.min(4, enemy.row + 2);
      const col = enemy.col;
      if (player.row !== row || player.col !== col) {
        await page.locator(`.cell[data-row="${player.row}"][data-col="${player.col}"] .unit`).click();
        await page.locator(`.cell[data-row="${row}"][data-col="${col}"]`).click();
      }
    };
    await placeBehindEnemy();
    for (let round = 0; round < 4; round += 1) {
      await placeBehindEnemy();
      await page.locator('#step-btn').click();
      await page.waitForTimeout(20);
      if (round < 3) {
        await page.locator('#step-btn').click();
        await page.waitForTimeout(20);
      }
    }
    const log = await page.locator('#combat-log').innerText();
    assert.match(log, /蜕壳投掷 破壳：移除 \d+ 点当前护盾/);
    assert.match(log, /选择技能 重劈/);
    console.log({status: 'PASS', breakShell: log.match(/破壳：移除[^\n]*/g) || []});
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
