(function () {
  'use strict';

  const data = window.LIFE_LINK_DATA;
  const Engine = window.LifeLinkEngine;
  if (!data || !Engine) throw new Error('命契3v3数据或引擎未加载');

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    left: $('#left-team'),
    right: $('#right-team'),
    state: $('#state-label'),
    round: $('#round-label'),
    roundMedallion: $('#round-medallion'),
    seed: $('#seed-label'),
    phaseRail: $('#phase-rail'),
    countdown: $('#countdown-overlay'),
    winner: $('#winner-overlay'),
    start: $('#start-button'),
    pause: $('#pause-button'),
    event: $('#event-button'),
    roundStep: $('#round-button'),
    speed: $('#speed-select'),
    swap: $('#swap-button'),
    reset: $('#reset-button'),
    current: $('#current-event'),
    eventCounter: $('#event-counter'),
    logBody: $('#log-body'),
    rulesButton: $('#rules-button'),
    rulesDialog: $('#rules-dialog'),
    rulesContent: $('#rules-content')
  };

  let leftTeam = 'poison';
  let engine = new Engine(data, { seed: 3303, leftTeam });
  let autoPlaying = false;
  let timer = null;
  let lastEvent = null;
  let activeFilter = 'all';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function hpPercent(unit) { return Math.max(0, Math.round((unit.hp / unit.maxHp) * 100)); }

  function poisonPills(sources) {
    return sources.map((source) => '<span class="status-pill poison" title="' + escapeHtml(source.sourceName) + '施加">毒 ' + source.base + '×龄' + source.age + '</span>').join('');
  }

  function teamMarkup(team, side) {
    const isEmber = team.theme === 'ember';
    const budget = team.pets.reduce((sum, pet) => sum + pet.maxHp, 0);
    const pets = team.pets.map((pet) => {
      const statuses = poisonPills(pet.poisonSources) + (pet.burn ? '<span class="status-pill burn">火 ' + pet.burn + '</span>' : '');
      return '<article class="pet-card' + (pet.dead ? ' dead' : '') + '" data-pet="' + escapeHtml(pet.id) + '">' +
        '<div class="pet-top"><span class="pet-icon" aria-hidden="true">' + escapeHtml(pet.icon) + '</span><span class="speed">速度<b>' + pet.speed + '</b></span></div>' +
        '<h3>' + escapeHtml(pet.name) + '</h3><span class="pet-role">' + escapeHtml(pet.role) + '</span>' +
        '<div class="pet-hp-row"><span>HP</span><b>' + pet.hp + ' / ' + pet.maxHp + '</b></div>' +
        '<div class="hp-track"><i style="--hp:' + hpPercent(pet) + '%"></i></div>' +
        '<div class="ability-chip"><b>' + escapeHtml(pet.ability) + '</b><p>' + escapeHtml(pet.text) + '</p></div>' +
        '<div class="pet-statuses">' + statuses + '</div></article>';
    }).join('');
    const heroStatuses = poisonPills(team.hero.poisonSources) || '<span class="status-pill">无持续状态</span>';
    return '<div class="team-header"><div class="team-title"><span class="team-index">' + (side === 'left' ? 'TEAM 01' : 'TEAM 02') + '</span><div><h2>' + escapeHtml(team.name) + '</h2><p>' + escapeHtml(team.description) + '</p></div></div><span class="budget-badge">生命预算 <b>' + budget + ' / ' + data.petHpBudget + '</b></span></div>' +
      '<article class="hero-card"><span class="hero-avatar">' + (isEmber ? '燃' : '蚀') + '</span><div class="hero-main"><div class="hero-name-row"><b>' + escapeHtml(team.hero.name) + '</b>' + (team.hero.exposed ? '<span class="exposed-chip">已暴露</span>' : '') + '</div><div class="hp-track"><i style="--hp:' + hpPercent(team.hero) + '%"></i></div><div class="hero-status">' + heroStatuses + '</div></div><div class="hero-hp"><strong>' + team.hero.hp + '</strong><span>/ ' + team.hero.maxHp + ' HP</span></div></article>' +
      '<div class="pet-grid">' + pets + '</div>';
  }

  function renderTeams(state) {
    elements.left.className = 'team-column ' + state.teams.left.theme;
    elements.right.className = 'team-column right ' + state.teams.right.theme;
    elements.left.innerHTML = teamMarkup(state.teams.left, 'left');
    elements.right.innerHTML = teamMarkup(state.teams.right, 'right');
  }

  function phaseLabel(phase, state) {
    const labels = {
      ready: '阵容待锁定', countdown: '开战倒计时', opening: '战斗开始效果', opening_complete: '开场结算完成',
      round_start: '回合开始', cooldown: '冷却减少', abilities: '技能自动释放', death: '阵亡反噬', burn: '灼烧结算',
      poison: '剧毒结算', status_age: '状态年龄增加', victory_check: '胜负检查', round_complete: '回合完成', ended: '战斗结束'
    };
    if (state.ended) return '战斗结束';
    return labels[phase] || phase;
  }

  function railPhase(phase) {
    if (phase === 'countdown' || phase === 'opening_complete') return 'opening';
    if (phase === 'cooldown' || phase === 'round_complete' || phase === 'status_age') return phase === 'status_age' ? 'victory_check' : 'round_start';
    return phase;
  }

  function renderMeta(state) {
    elements.state.textContent = phaseLabel(state.phase, state);
    elements.round.textContent = state.round;
    elements.roundMedallion.textContent = 'R' + state.round;
    elements.seed.textContent = '#' + state.seed;
    document.body.classList.toggle('running', state.started && !state.ended);
    const active = railPhase(state.phase);
    elements.phaseRail.querySelectorAll('[data-phase]').forEach((node) => node.classList.toggle('active', node.dataset.phase === active));
    elements.start.disabled = state.started;
    elements.start.querySelector('span').textContent = state.started ? '阵容与种子已锁定' : '锁定阵容';
    elements.start.querySelector('b').textContent = state.ended ? '本场已结束' : state.started ? '战斗进行中' : '开始战斗';
    elements.pause.disabled = !state.started || state.ended;
    elements.pause.textContent = autoPlaying ? '暂停' : '继续自动';
    elements.event.disabled = state.ended;
    elements.roundStep.disabled = state.ended;
    elements.swap.disabled = state.started;
  }

  function toneIcon(tone) {
    return { poison: '毒', burn: '火', death: '命', cleanse: '净', attack: '斩', victory: '胜', muted: '·', system: '契' }[tone] || '契';
  }

  function renderCurrent(event) {
    if (!event) return;
    elements.eventCounter.textContent = String(event.id).padStart(3, '0');
    elements.current.className = 'current-event ' + escapeHtml(event.tone || 'system');
    elements.current.innerHTML = '<span class="event-icon">' + toneIcon(event.tone) + '</span><div><b>' + escapeHtml(event.source) + '</b><p>' + escapeHtml(event.effect) + '</p><dl><dt>作用对象</dt><dd>' + escapeHtml(event.target) + '</dd><dt>结果</dt><dd>' + escapeHtml(event.result) + '</dd></dl></div>';
  }

  function renderOverlays(state, event) {
    const isCountdown = event && event.type === 'countdown';
    elements.countdown.hidden = !isCountdown;
    if (isCountdown) {
      const span = elements.countdown.querySelector('span');
      span.textContent = event.countdown;
      span.style.animation = 'none';
      void span.offsetWidth;
      span.style.animation = '';
    }
    elements.winner.hidden = !state.ended;
    if (state.ended) {
      const result = state.winner === 'draw' ? '平局' : state.teams[state.winner].name + '获胜';
      elements.winner.innerHTML = '<span>BATTLE RESOLVED · ROUND ' + state.round + '</span><h2>' + escapeHtml(result) + '</h2><span>随机种子 #' + state.seed + ' · 共 ' + state.log.length + ' 个可复现事件</span>';
    }
  }

  function visibleLogs(logs) {
    if (activeFilter === 'all') return logs;
    if (activeFilter === 'death') return logs.filter((item) => item.tone === 'death');
    return logs.filter((item) => item.tone === activeFilter || item.type.includes(activeFilter));
  }

  function renderLog(state) {
    const logs = visibleLogs(state.log);
    if (!logs.length) {
      elements.logBody.innerHTML = '<tr class="empty-row"><td colspan="4">' + (state.log.length ? '当前筛选下暂无事件。' : '事件队列尚未启动。') + '</td></tr>';
      return;
    }
    elements.logBody.innerHTML = logs.slice().reverse().map((event) => '<tr class="' + escapeHtml(event.tone || 'system') + '"><td>' + escapeHtml(event.time) + '</td><td>' + escapeHtml(event.source) + '</td><td>' + escapeHtml(event.target) + '</td><td>' + escapeHtml(event.effect) + '<span class="log-result">→ ' + escapeHtml(event.result) + '</span></td></tr>').join('');
  }

  function render(event) {
    const state = engine.snapshot();
    renderTeams(state);
    renderMeta(state);
    renderCurrent(event || lastEvent);
    renderOverlays(state, event || lastEvent);
    renderLog(state);
    if (state.ended) stopAuto();
  }

  function advanceOne() {
    if (engine.ended) return;
    lastEvent = engine.step();
    render(lastEvent);
  }

  function scheduleNext() {
    clearTimeout(timer);
    if (!autoPlaying || engine.ended) return;
    timer = window.setTimeout(() => {
      advanceOne();
      scheduleNext();
    }, Number(elements.speed.value));
  }

  function startAuto() {
    if (engine.ended) return;
    if (!engine.started) engine.start();
    autoPlaying = true;
    advanceOne();
    render(lastEvent);
    scheduleNext();
  }

  function stopAuto() {
    autoPlaying = false;
    clearTimeout(timer);
    timer = null;
    renderMeta(engine.snapshot());
  }

  function reset() {
    stopAuto();
    engine.reset({ seed: 3303, leftTeam });
    lastEvent = null;
    elements.current.className = 'current-event empty';
    elements.current.innerHTML = '<span class="event-icon">◇</span><div><b>等待开战</b><p>点击「开始战斗」自动播放，或用单事件逐条检查。</p></div>';
    elements.eventCounter.textContent = '000';
    elements.countdown.hidden = true;
    elements.winner.hidden = true;
    render();
  }

  function renderRules() {
    const names = { poison: '毒龄倍率', burn: '灼烧', backlash: '阵亡反噬', exposure: '英雄暴露', statusOrder: '回合末顺序' };
    const cards = Object.entries(data.rules).map(([key, text]) => '<article class="rule-card"><b>' + escapeHtml(names[key] || key) + '</b><p>' + escapeHtml(text) + '</p></article>').join('');
    const assumptions = data.assumptions.map((text) => '<li>' + escapeHtml(text) + '</li>').join('');
    elements.rulesContent.innerHTML = '<div class="rule-list">' + cards + '</div><section class="assumption-list"><h3>首版明示暂定项</h3><ol>' + assumptions + '</ol></section>';
  }

  elements.start.addEventListener('click', startAuto);
  elements.pause.addEventListener('click', () => autoPlaying ? stopAuto() : startAuto());
  elements.event.addEventListener('click', () => { stopAuto(); advanceOne(); });
  elements.roundStep.addEventListener('click', () => {
    stopAuto();
    const events = engine.stepRound();
    if (events.length) lastEvent = events[events.length - 1];
    render(lastEvent);
  });
  elements.speed.addEventListener('change', () => { if (autoPlaying) scheduleNext(); });
  elements.swap.addEventListener('click', () => { leftTeam = leftTeam === 'poison' ? 'fire' : 'poison'; reset(); });
  elements.reset.addEventListener('click', reset);
  elements.rulesButton.addEventListener('click', () => elements.rulesDialog.showModal());
  elements.rulesDialog.addEventListener('click', (event) => { if (event.target === elements.rulesDialog) elements.rulesDialog.close(); });
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((node) => node.classList.toggle('active', node === button));
    renderLog(engine.snapshot());
  }));

  renderRules();
  reset();
  window.lifeLinkSimulator = { get engine() { return engine; }, advanceOne, reset };
})();
