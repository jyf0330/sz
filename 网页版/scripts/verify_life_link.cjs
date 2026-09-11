const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const data = require(path.join(root, 'life-link-data.js'));
const { LifeLinkEngine } = require(path.join(root, 'life-link-engine.js'));

function engineChecks() {
  for (const key of ['poison', 'fire']) {
    assert.equal(data.teams[key].pets.length, 3, key + ' must have 3 pets');
    assert.equal(data.teams[key].pets.reduce((sum, pet) => sum + pet.maxHp, 0), 30, key + ' must use exactly 30 HP');
  }

  const firstRound = new LifeLinkEngine(data, { seed: 3303 });
  const roundEvents = firstRound.stepRound();
  const fire = firstRound.teams.right;
  assert.equal(firstRound.round, 1);
  assert.equal(firstRound.phase, 'round_complete');
  assert.equal(fire.pets.find((pet) => pet.id === 'lighter').dead, true);
  assert.equal(fire.hero.hp, 36, '50 -> 44 from backlash -> 36 from hero poison');
  assert.ok(roundEvents.some((event) => event.source.includes('打火机·阵亡反噬') && event.result.includes('50 → 44')));
  assert.ok(roundEvents.some((event) => event.type === 'poison_tick' && event.target === '火队英雄' && event.result.includes('44 → 36')));
  assert.ok(roundEvents.every((event) => event.time && event.source && event.target && event.effect !== undefined && event.result !== undefined));

  const runA = new LifeLinkEngine(data, { seed: 3303 });
  runA.runToEnd();
  assert.equal(runA.ended, true);
  assert.equal(runA.winner, 'left');
  assert.equal(runA.teams.left.key, 'poison');
  assert.equal(runA.round, 4);
  assert.ok(runA.log.some((event) => event.source.includes('锦鲤·逆鳞净火') && event.effect.includes('基础毒')));
  assert.ok(runA.log.some((event) => event.source.includes('水母·毒龄回声')));

  const runB = new LifeLinkEngine(data, { seed: 3303 });
  runB.runToEnd();
  assert.deepEqual(runB.snapshot(), runA.snapshot(), 'same seed must produce identical battle');

  const swapped = new LifeLinkEngine(data, { seed: 3303, leftTeam: 'fire' });
  swapped.runToEnd();
  assert.equal(swapped.teams.right.key, 'poison');
  assert.equal(swapped.winner, 'right');

  return {
    checks: [
      '双方固定3宠与30点生命预算',
      '首回合打火机毒死、反噬与英雄毒伤',
      '日志时间/物品/对象/效果/结果完整',
      '锦鲤净毒转火与水母复制毒龄',
      '同种子全战斗可复现',
      '交换视角不改变胜负真相'
    ],
    winner: runA.teams[runA.winner].name,
    rounds: runA.round,
    events: runA.log.length,
    finalHp: { poisonHero: runA.teams.left.hero.hp, fireHero: runA.teams.right.hero.hp }
  };
}

async function browserChecks() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const results = {};
    for (const viewport of [{ name: 'desktop', width: 1480, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, offline: true });
      const page = await context.newPage();
      const errors = [];
      const externalRequests = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
      await page.goto(pathToFileURL(path.join(root, 'battle-life-link.html')).href);
      await page.waitForFunction(() => window.lifeLinkSimulator && document.querySelectorAll('.pet-card').length === 6);
      assert.ok((await page.locator('.prototype-warning').innerText()).includes('不构成正式模式'));
      assert.equal(await page.locator('.pet-card').count(), 6);
      assert.equal(await page.locator('.hero-card').count(), 2);
      assert.ok((await page.locator('.rule-metric-row').innerText()).includes('30'));
      assert.ok((await page.locator('#log-body').innerText()).includes('事件队列尚未启动'));

      if (viewport.name === 'desktop') {
        await page.locator('#rules-button').click();
        assert.ok(await page.locator('#rules-dialog').evaluate((node) => node.open));
        assert.ok((await page.locator('#rules-content').innerText()).includes('灼烧的递减规则原需求未给出'));
        await page.locator('#rules-dialog .dialog-close').click();
        await page.locator('#speed-select').selectOption('120');
        await page.locator('#start-button').click();
        await page.waitForFunction(() => window.lifeLinkSimulator.engine.log.length >= 2);
        await page.locator('#pause-button').click();
        const pausedAt = await page.evaluate(() => window.lifeLinkSimulator.engine.log.length);
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => window.lifeLinkSimulator.engine.log.length), pausedAt, '暂停后事件队列不应继续消费');
        await page.locator('#reset-button').click();
        await page.locator('#round-button').click();
        await page.waitForFunction(() => window.lifeLinkSimulator.engine.round === 1);
        assert.equal(await page.locator('#round-label').innerText(), '1');
        assert.ok((await page.locator('#log-body').innerText()).includes('打火机·阵亡反噬'));
        assert.ok((await page.locator('#right-team .hero-hp').innerText()).includes('36'));
        await page.locator('[data-filter="poison"]').click();
        assert.ok((await page.locator('#log-body').innerText()).includes('剧毒'));
        await page.locator('#reset-button').click();
        assert.equal(await page.locator('#round-label').innerText(), '0');
        await page.locator('#swap-button').click();
        assert.ok((await page.locator('#left-team').innerText()).includes('爆燃体系'));
      } else {
        await page.locator('#event-button').click();
        assert.ok((await page.locator('#current-event').innerText()).includes('开战倒计时'));
        await page.locator('#round-button').click();
        await page.waitForFunction(() => window.lifeLinkSimulator.engine.round === 1);
        assert.ok((await page.locator('#right-team .hero-hp').innerText()).includes('36'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }

      await page.screenshot({ path: path.join(root, 'verification/life-link-' + viewport.name + '.png'), fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(externalRequests, []);
      results[viewport.name] = { viewport, pageErrors: errors, externalRequests, noHorizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth) };
      await context.close();
    }
    const mainContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, offline: true });
    const mainPage = await mainContext.newPage();
    await mainPage.goto(pathToFileURL(path.join(root, 'battle.html')).href);
    assert.equal(await mainPage.locator('a[href="battle-life-link.html"], [data-battle-compare-link]').count(), 0);
    await mainPage.goto(pathToFileURL(path.join(root, 'index.html')).href);
    assert.equal(await mainPage.locator('a[href="battle-life-link.html"], [data-battle-compare-link]').count(), 0);
    await mainContext.close();
    for (const viewport of [{ name: 'desktop', width: 1480, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
      const compareContext = await browser.newContext({ viewport, offline: true });
      const comparePage = await compareContext.newPage();
      await comparePage.goto(pathToFileURL(path.join(root, 'battle-compare.html')).href);
      assert.equal(await comparePage.locator('.mode-card').count(), 2);
      assert.ok((await comparePage.locator('.prototype-warning').innerText()).includes('未完成示例'));
      assert.ok(await comparePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await comparePage.screenshot({ path: path.join(root, 'verification/battle-compare-' + viewport.name + '.png'), fullPage: true });
      await compareContext.close();
    }
    return results;
  } finally {
    await browser.close();
  }
}

(async () => {
  const engine = engineChecks();
  const browser = await browserChecks();
  const result = { status: 'PASS', scope: '命契3v3未完成构筑示例的隔离、标识、语义与离线界面；不代表正式模式验收', engine, browser };
  fs.writeFileSync(path.join(root, 'verification/life-link-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
