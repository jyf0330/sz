'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));

  const ROWS = 5;
  const COLS = 6;
  const QUALITY = ['青铜', '白银', '黄金', '钻石'];
  const QUALITY_MULT = {青铜: 1, 白银: 2, 黄金: 4, 钻石: 8};
  const SIZE_LABEL = {short: '短篇', medium: '中篇', long: '长篇'};
  const SIZE_SLOTS = {short: 1, medium: 2, long: 3};
  const PET_ALIAS = {'鲛人抢手': '鲛人枪兵'};
  const SKILL_ALIAS = {'钩链': '钩镰', '快速换弹': '快速装弹', '蛇影寒': '寒蛇影'};

  const fallbackPets = [
    {name:'鲛人抢手', tier:'白银', hp:100, atk:5, def:2, effect:'技能暴击时，对随机敌人造成额外伤害。'},
  ];
  const fallbackSkills = [
    {name:'啃咬', tier:'青铜', ability:'攻击3+', range:'正前方第一个敌人', effect:'短篇，武技。'},
    {name:'拍打', tier:'青铜', ability:'攻击4+', range:'正前方第一个敌人', effect:'短篇，武技。'},
    {name:'甩尾', tier:'青铜', ability:'攻击5+', range:'正前方第二格', effect:'短篇，武技。'},
    {name:'撞击', tier:'青铜', ability:'攻击6+', range:'正前方第三格', effect:'短篇，武技。'},
    {name:'利爪', tier:'青铜', ability:'攻击4+', range:'正前方第一个敌人', effect:'短篇，武技。'},
    {name:'愈合', tier:'青铜', ability:'治疗6', range:'随机友方', effect:'恢复随机友方生命。'},
    {name:'疗愈术', tier:'白银', ability:'治疗10', range:'随机友方', effect:'恢复随机友方生命。'},
    {name:'回春丹', tier:'白银', ability:'治疗12', range:'生命最低友方', effect:'恢复生命最低的友方。'},
    {name:'披甲', tier:'青铜', ability:'获得护甲6', range:'自身', effect:'获得6点护甲。'},
    {name:'叠甲', tier:'青铜', ability:'获得护甲5', range:'随机友方', effect:'为随机友方提供5点护甲。'},
    {name:'装填弹药', tier:'青铜', ability:'装填2', range:'随机友方', effect:'为随机友方的一个弹药技能装填2枚弹药。'},
    {name:'飞针盒', tier:'白银', ability:'攻击8+', range:'正前方直线上第一个敌人', effect:'弹药3；使用时消耗1枚。'},
    {name:'百战', tier:'白银', ability:'攻击5+', range:'正前方第一个敌人', effect:'每次命中后本技能伤害+1。'},
    {name:'锋锐鳞片', tier:'白银', ability:'攻击7+', range:'正前方第一个敌人', effect:'暴击时额外造成伤害。'},
  ];

  // 共用当前机制图谱的表格数据；适配旧页面的 record 结构。
  const graphNodes = (window.ATLAS_DATA && Array.isArray(window.ATLAS_DATA.items))
    ? window.ATLAS_DATA.items.map(item => ({...item, record: {tier: item.tier, fields: item.fields}}))
    : [];
  if (!graphNodes.length) throw new Error('缺少当前数值数据，请先运行 scripts/build.py');
  const graphPets = graphNodes.filter(n => n.kind === '灵兽').map(n => {
    const f = n.record && n.record.fields ? n.record.fields : {};
    return {
      name: n.name,
      tier: n.record && n.record.tier ? n.record.tier : '青铜',
      hp: Number(f.hp) || 60,
      atk: Number(f.攻击) || 3,
      def: Number(f.防御) || 1,
      effect: f.一句话效果 || '暂无简述',
      tags: f.词条 || '',
      role: f.套路定位 || f.套路 || ''
    };
  });
  const graphSkills = graphNodes.filter(n => n.kind === '技能').map(n => {
    const f = n.record && n.record.fields ? n.record.fields : {};
    return {
      name: n.name,
      tier: n.record && n.record.tier ? n.record.tier : '青铜',
      ability: f.能力 || '',
      range: f['射程/目标'] || '正前方第一个敌人',
      effect: f.效果 || '暂无效果说明',
      tags: f.词条 || '',
      role: f.定位 || '',
      combo: f.套路 || ''
    };
  });
  const PET_CATALOG = graphPets.concat(fallbackPets.filter(item => !graphPets.some(p => p.name === item.name)));
  const SKILL_CATALOG = graphSkills.concat(fallbackSkills.filter(item => !graphSkills.some(s => s.name === item.name)));
  Object.keys(PET_ALIAS).forEach(alias => {
    const source = PET_CATALOG.find(item => item.name === PET_ALIAS[alias]);
    if (source && !PET_CATALOG.some(item => item.name === alias)) PET_CATALOG.push(Object.assign({}, source, {name: alias}));
  });
  Object.keys(SKILL_ALIAS).forEach(alias => {
    const source = SKILL_CATALOG.find(item => item.name === SKILL_ALIAS[alias]);
    if (source && !SKILL_CATALOG.some(item => item.name === alias)) SKILL_CATALOG.push(Object.assign({}, source, {name: alias}));
  });

  const petCatalog = name => PET_CATALOG.find(item => item.name === name || item.name === PET_ALIAS[name]) || PET_CATALOG[0];
  const skillCatalog = name => SKILL_CATALOG.find(item => item.name === name || item.name === SKILL_ALIAS[name]) || SKILL_CATALOG[0];
  const qualityRank = quality => Math.max(0, QUALITY.indexOf(quality || '青铜'));
  const sizeFrom = item => {
    const text = (item.tags || '') + (item.effect || '');
    if (text.includes('长篇')) return 'long';
    if (text.includes('中篇')) return 'medium';
    return 'short';
  };
  const iconOf = name => String(name || '?').slice(0, 1);
  const parseFirst = (text, patterns, fallback) => {
    for (const pattern of patterns) {
      const match = String(text || '').match(pattern);
      if (match) return Number(match[1]);
    }
    return fallback;
  };
  const numberFor = (text, fallback) => parseFirst(text, [/攻击(\d+)/, /伤害(\d+)/, /点燃(\d+)/, /淬毒(\d+)/, /治疗(\d+)/, /护甲(\d+)/], fallback);
  const sideLabel = side => side === 'player' ? '己方' : '敌方';
  const coord = pos => String.fromCharCode(65 + pos[1]) + (pos[0] + 1);
  const sameSide = (a, b) => a && b && a.side === b.side;

  const defaultConfig = {
    player: {
      level: 1, income: 20, history: 0, heroHp: 360,
      pets: [
        {name:'烁德童子', quality:'青铜'},
        {name:'花椒蟹', quality:'白银'},
        {name:'白蔷薇', quality:'白银'},
        {name:'', quality:'青铜'}
      ],
      skills: [
        {name:'蓄能', quality:'青铜', owner:0},
        {name:'引火', quality:'青铜', owner:1},
        {name:'天火咒', quality:'青铜', owner:0},
        {name:'火中取栗', quality:'青铜', owner:1},
        {name:'乱抓', quality:'白银', owner:2},
        {name:'元气弹', quality:'白银', owner:2}
      ]
    },
    enemy: {
      level: 2, income: 30, history: 0, heroHp: 360,
      pets: [
        {name:'饿狼', quality:'青铜'},
        {name:'岩豚', quality:'青铜'},
        {name:'沼泽鼠', quality:'白银'},
        {name:'赤精鱼', quality:'青铜'}
      ],
      skills: [
        {name:'啃咬', quality:'青铜', owner:0},
        {name:'利爪', quality:'青铜', owner:1},
        {name:'毒钩', quality:'青铜', owner:2},
        {name:'火球', quality:'青铜', owner:3},
        {name:'轻击', quality:'青铜', owner:0}
      ]
    }
  };

  const state = {
    round: 1,
    action: 0,
    side: 'player',
    phase: 'position',
    running: false,
    auto: false,
    selectedId: 'p1',
    selectedSkill: null,
    playerCursor: 0,
    enemyCursor: 0,
    dragSkill: null,
    autoTimer: null,
    bannerTimer: null,
    damage: 0,
    events: 0,
    roundEvents: 0,
    logs: [],
    trace: [],
    winner: null,
    config: clone(defaultConfig),
    shop: {seed: 0, skills: [], pets: []},
    inventory: {skills: [], pets: []},
    player: null,
    enemy: null,
    playerSkills: [],
    enemySkills: [],
    setupDraft: null
  };

  function createHero(config, side) {
    const level = Math.max(1, Number(config.level) || 1);
    const maxHp = Math.max(1, Number(config.heroHp) || 100 + (level - 1) * 10);
    return {side, level, gold: Math.max(0, Number(config.income) || 0), history: Math.max(0, Number(config.history) || 0), hp: maxHp, maxHp, skillDamage: 0, skillDamageGrowth: 0, points: 0};
  }

  function createPet(item, side, index) {
    const cat = petCatalog(item.name);
    const quality = item.quality || cat.tier || '青铜';
    const scale = Math.pow(2, qualityRank(quality) - qualityRank(cat.tier));
    const hp = Math.max(1, Math.round(cat.hp * scale));
    const atk = Math.max(0, Math.round(cat.atk * scale));
    const def = Math.max(0, Math.round(cat.def * scale));
    return {
      id: (side === 'player' ? 'p' : 'e') + (index + 1),
      side,
      slot: index,
      name: item.name,
      icon: iconOf(item.name),
      quality,
      hp, maxHp: hp,
      atk, baseAtk: atk,
      def, baseDef: def,
      energy: 0, maxEnergy: 12,
      shield: 0,
      burn: 0,
      poison: 0,
      excited: 0,
      weak: 0,
      paralyze: 0,
      silence: 0,
      rooted: 0,
      roundSkillDamage: 0,
      roundIgnite: 0,
      skillDamage: 0,
      permanentAtk: 0,
      permanentDef: 0,
      skillUses: 0,
      firstMartialReady: true,
      passiveCountdown: item.name === '铁丸子' ? 2 : 0,
      reviveAt: null,
      dead: false,
      pos: side === 'player' ? [1, Math.min(5, index + 0)] : [3, Math.min(5, index + 0)]
    };
  }

  function createSkill(item, side, index, pets) {
    const cat = skillCatalog(item.name);
    const quality = item.quality || cat.tier || '青铜';
    const size = sizeFrom(cat);
    const baseTier = cat.tier || '青铜';
    const scale = Math.pow(2, qualityRank(quality) - qualityRank(baseTier));
    const effectText = (cat.effect || '') + ' ' + (cat.tags || '');
    const ammoMax = parseFirst(effectText, [/弹药\s*(\d+)/], 0);
    const baseCountdown = parseFirst(effectText, [/倒计时\s*(\d+)/], 0);
    const explosionCost = parseFirst(effectText, [/爆能\s*(\d+)/], 0);
    const ownerIndex = Math.min(Math.max(0, Number(item.owner) || 0), Math.max(0, pets.length - 1));
    return {
      id: (side === 'player' ? 'ps' : 'es') + (index + 1),
      side,
      name: item.name,
      owner: pets[ownerIndex] ? pets[ownerIndex].id : null,
      ownerIndex,
      quality,
      size,
      slots: SIZE_SLOTS[size],
      type: ((cat.tags || '').split('，')[1] || (cat.tags || '').split(',')[1] || '技能'),
      ability: cat.ability || String(cat.effect || '效果技能').split('；')[0].split('。')[0] || '效果技能',
      range: cat.range || '正前方第一个敌人',
      effect: cat.effect || '暂无效果说明',
      tags: String(cat.tags || '').split(/[，,、\s]+/).filter(Boolean),
      role: cat.role || (/(攻击|伤害|点燃|淬毒)/.test(cat.ability + cat.effect) ? '输出技能' : '体系运转'),
      combo: cat.combo || '',
      ammoMax,
      ammo: ammoMax,
      baseCountdown,
      countdown: baseCountdown,
      explosionCost,
      scale,
      used: 0,
      lastTarget: null
    };
  }

  function buildFromConfig(config, silent) {
    stopAuto();
    clearTimeout(state.bannerTimer);
    $('#resolution-banner').hidden = true;
    state.config = clone(config);
    state.player = createHero(config.player, 'player');
    state.enemy = createHero(config.enemy, 'enemy');
    state.player.pets = config.player.pets.filter(item => item.name).map((item, i) => createPet(item, 'player', i));
    state.enemy.pets = config.enemy.pets.filter(item => item.name).map((item, i) => createPet(item, 'enemy', i));
    state.playerSkills = config.player.skills.filter(item => item.name).map((item, i) => createSkill(item, 'player', i, state.player.pets));
    state.enemySkills = config.enemy.skills.filter(item => item.name).map((item, i) => createSkill(item, 'enemy', i, state.enemy.pets));
    placeInitialUnits(state.player.pets, 'player');
    placeInitialUnits(state.enemy.pets, 'enemy');
    state.round = 1;
    state.action = 0;
    state.side = 'player';
    state.phase = 'position';
    state.running = false;
    state.auto = false;
    state.selectedId = state.player.pets[0] ? state.player.pets[0].id : null;
    state.selectedSkill = null;
    state.playerCursor = 0;
    state.enemyCursor = 0;
    state.damage = 0;
    state.events = 0;
    state.roundEvents = 0;
    state.logs = [];
    state.trace = [];
    state.winner = null;
    state.shop = makeShop(0);
    if (!silent) log('已应用新配置，战斗重置为第1回合的部署阶段。', 'trigger', 'CONFIG');
    renderAll();
  }

  function placeInitialUnits(pets, side) {
    const row = side === 'player' ? 0 : ROWS - 1;
    pets.forEach((pet, index) => {
      pet.pos = [row, Math.min(COLS - 1, index)];
      pet.dead = false;
    });
  }

  function allUnits() {
    return (state.player ? state.player.pets : []).concat(state.enemy ? state.enemy.pets : []);
  }
  function team(side) { return side === 'player' ? state.player : state.enemy; }
  function unitsOf(side, aliveOnly) {
    const list = team(side) ? team(side).pets : [];
    return aliveOnly ? list.filter(unit => !unit.dead && unit.hp > 0) : list;
  }
  function unitById(id) { return allUnits().find(unit => unit.id === id) || null; }
  function skillList(side) { return side === 'player' ? state.playerSkills : state.enemySkills; }
  function ownerOf(skill) { return skill && skill.owner ? unitById(skill.owner) : null; }
  function opponentSide(side) { return side === 'player' ? 'enemy' : 'player'; }

  function log(text, kind = 'info', meta = 'SYSTEM') {
    state.events += 1;
    state.roundEvents += 1;
    state.logs.push({round: state.round, action: state.action, text, kind, meta});
    if (state.logs.length > 150) state.logs.shift();
    renderLog();
  }

  function trace(text, kind = 'trigger') {
    state.trace.push({text, kind});
    if (state.trace.length > 8) state.trace.shift();
  }

  function showToast(text, warn) {
    const node = $('#toast');
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    node.classList.toggle('warn', !!warn);
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { node.hidden = true; }, 1800);
  }

  function stateTags(unit) {
    const tags = [];
    if (unit.dead) tags.push('待复活 ' + Math.max(0, (unit.reviveAt || state.round) - state.round) + '回合');
    if (unit.burn > 0) tags.push('灼烧 ' + unit.burn);
    if (unit.poison > 0) tags.push('剧毒 ' + unit.poison);
    if (unit.shield > 0) tags.push('护盾 ' + unit.shield);
    if (unit.excited > 0) tags.push('亢奋 ' + unit.excited);
    if (unit.weak > 0) tags.push('衰弱 ' + unit.weak);
    if (unit.paralyze > 0) tags.push('麻痹 ' + unit.paralyze);
    if (unit.silence > 0) tags.push('封刃');
    if (unit.rooted > 0) tags.push('禁足');
    return tags.length ? tags : ['无异常状态'];
  }

  function phaseText() {
    const map = {
      position: '部署与走位',
      start: '回合开始结算',
      resolving: '己方技能结算',
      'enemy-start': '敌方回合开始',
      'enemy-resolving': '敌方技能结算',
      end: '回合结束结算',
      finished: '战斗结束'
    };
    return map[state.phase] || state.phase;
  }

  function renderFlow() {
    const steps = [
      ['start', '回合开始'],
      ['position', '部署/走位'],
      ['resolving', '技能结算'],
      ['end', '回合结束'],
      ['enemy-resolving', '对手回合']
    ];
    const current = state.phase;
    const html = steps.map(item => {
      let cls = '';
      if (item[0] === current || (current === 'enemy-start' && item[0] === 'enemy-resolving')) cls = 'active';
      if ((state.side === 'enemy' && item[0] === 'enemy-resolving') || (current === 'finished' && item[0] === 'end')) cls = 'active';
      return '<span class="flow-step ' + cls + '">' + esc(item[1]) + '</span>';
    }).join('<span class="flow-arrow">→</span>');
    $('#turn-flow').innerHTML = html;
  }

  function renderTeamContext() {
    const p = state.player;
    const e = state.enemy;
    $('#team-context').innerHTML =
      '<div class="team-context-card ally-context"><span>己方英雄</span><strong>' + p.hp + ' / ' + p.maxHp + '</strong><small>等级 ' + p.level + ' · 金币 ' + p.gold + ' · 胜场 ' + p.history + '</small></div>' +
      '<div class="phase-context"><b>' + esc(phaseText()) + '</b><small>' + (state.phase === 'position' ? '可移动己方灵宠并调整技能顺序' : state.phase === 'finished' ? '可重置或重新配置战斗' : '所有效果按日志顺序记录') + '</small></div>' +
      '<div class="team-context-card enemy-context"><span>敌方英雄</span><strong>' + e.hp + ' / ' + e.maxHp + '</strong><small>等级 ' + e.level + ' · 金币 ' + e.gold + ' · 胜场 ' + e.history + '</small></div>';
  }

  function cellAt(row, col) {
    return document.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
  }

  function validTarget(skill, owner, target, includeAlly) {
    if (!skill || !owner || !target || target.dead || target.hp <= 0) return false;
    const enemy = !sameSide(owner, target);
    if (!includeAlly && !enemy) return false;
    const text = skill.range || '';
    if (text.includes('自身')) return target.id === owner.id;
    if (text.includes('全体')) return true;
    const dr = Math.abs(owner.pos[0] - target.pos[0]);
    const dc = Math.abs(owner.pos[1] - target.pos[1]);
    const distance = dr + dc;
    if (text.includes('范围')) return dr <= 2 && dc <= 2;
    if (text.includes('直线')) return (dr === 0 || dc === 0) && distance <= 5;
    if (text.includes('第三格')) return distance <= 3;
    if (text.includes('第二格')) return distance <= 2;
    return distance <= 1;
  }

  function skillIsSupport(skill) {
    const text = (skill.ability || '') + (skill.effect || '') + (skill.range || '');
    return /治疗|护甲|护盾|能量|装填|亢奋|攻击\+|防御\+|随机友方|我方/.test(text) && !/攻击\d|伤害\d|点燃|淬毒/.test(skill.ability || '');
  }

  function targetsFor(skill, owner, side) {
    if (!owner) return [];
    const allies = unitsOf(side, true);
    const enemies = unitsOf(opponentSide(side), true);
    if ((skill.range || '').includes('自身')) return [owner];
    if (skillIsSupport(skill)) {
      const validAllies = allies.filter(target => validTarget(skill, owner, target, true));
      return validAllies.length ? [validAllies.sort((a, b) => a.hp - b.hp)[0]] : [owner];
    }
    const validEnemies = enemies.filter(target => validTarget(skill, owner, target, false));
    return validEnemies.sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id)).slice(0, (skill.effect || '').match(/范围|全体/) ? 99 : 1);
  }

  function renderBoard() {
    const board = $('#board');
    board.innerHTML = '';
    const cells = new Map();
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.innerHTML = '<span class="cell-coordinate">' + String.fromCharCode(65 + col) + (row + 1) + '</span>';
        cell.addEventListener('click', () => handleCellClick(row, col));
        board.appendChild(cell);
        cells.set(row + ',' + col, cell);
      }
    }

    const selected = unitById(state.selectedId);
    const selectedSkill = state.selectedSkill;
    if (selectedSkill && ownerOf(selectedSkill)) {
      const owner = ownerOf(selectedSkill);
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          const fake = {id:'cell-' + row + '-' + col, side: opponentSide(owner.side), hp:1, dead:false, pos:[row, col]};
          if (validTarget(selectedSkill, owner, fake, false)) cells.get(row + ',' + col).classList.add('range');
        }
      }
    }

    allUnits().forEach(unit => {
      if (unit.dead) return;
      const cell = cells.get(unit.pos[0] + ',' + unit.pos[1]);
      if (!cell) return;
      const node = document.createElement('div');
      node.className = 'unit ' + (unit.side === 'enemy' ? 'enemy' : 'ally') + (unit.id === state.selectedId ? ' selected' : '');
      node.dataset.id = unit.id;
      const hpPct = Math.max(0, Math.min(100, Math.round(unit.hp / unit.maxHp * 100)));
      const energy = unit.energy > 0 ? '⚡' + unit.energy : '';
      const status = stateTags(unit).join(' · ');
      node.innerHTML =
        '<span class="unit-energy">' + energy + '</span>' +
        '<span class="unit-icon">' + esc(unit.icon) + '</span>' +
        '<span class="unit-name">' + esc(unit.name) + '</span>' +
        '<span class="unit-state">' + esc(status) + '</span>' +
        '<span class="unit-hp"><i style="width:' + hpPct + '%"></i></span>';
      node.addEventListener('click', event => {
        event.stopPropagation();
        state.selectedId = unit.id;
        state.selectedSkill = null;
        renderAll();
      });
      cell.appendChild(node);
    });

    if (selectedSkill && ownerOf(selectedSkill)) {
      const owner = ownerOf(selectedSkill);
      allUnits().filter(unit => validTarget(selectedSkill, owner, unit, false)).forEach(unit => {
        const cell = cells.get(unit.pos[0] + ',' + unit.pos[1]);
        if (cell && cell.querySelector('.unit')) cell.querySelector('.unit').classList.add('in-range');
      });
    }

    if (state.phase === 'position' && selected && selected.side === 'player' && !selected.dead) {
      if (selected.rooted > 0) {
        showToast(selected.name + ' 本回合处于禁足状态', true);
      } else {
        $$('.cell').forEach(cell => {
          if (!cell.querySelector('.unit')) cell.classList.add('move-target');
        });
      }
    }
  }

  function renderSkills() {
    const bar = $('#skill-bar');
    bar.innerHTML = '';
    state.playerSkills.forEach((skill, index) => {
      const owner = ownerOf(skill);
      const card = document.createElement('article');
      const locked = !owner || owner.dead || owner.hp <= 0 || state.phase !== 'position' && state.phase !== 'resolving';
      card.className = 'skill-card ' + skill.size + (state.selectedSkill && state.selectedSkill.id === skill.id ? ' active-skill' : '') + (locked ? ' skill-locked' : '');
      card.draggable = state.phase === 'position';
      card.dataset.id = skill.id;
      const ammo = skill.ammoMax ? skill.ammo + ' / ' + skill.ammoMax : '—';
      const cd = skill.baseCountdown ? skill.countdown + ' / ' + skill.baseCountdown : '—';
      const role = /攻击|伤害|点燃|淬毒/.test(skill.ability + skill.effect) ? '主要输出' : /能量|装填|治疗|护甲|亢奋|防御/.test(skill.ability + skill.effect) ? '启动/扳机' : '体系运转';
      card.innerHTML =
        '<div class="skill-card-top"><div><div class="skill-name">' + esc(skill.name) + '</div><div class="skill-owner">' + esc(owner ? owner.name : '未分配') + '</div></div><span class="skill-type">' + esc(skill.quality) + '</span></div>' +
        '<div class="skill-ability">' + esc(skill.ability || '效果技能') + '</div>' +
        '<div class="skill-meta"><div class="meta-item">能力<b>' + esc(skill.ability || '效果') + '</b></div><div class="meta-item">范围<b>' + esc(skill.range) + '</b></div><div class="meta-item">弹药<b class="ammo">' + esc(ammo) + '</b></div><div class="meta-item">倒计时<b class="countdown">' + esc(cd) + '</b></div></div>' +
        '<div class="skill-footer"><span>' + (index + 1) + ' · ' + SIZE_LABEL[skill.size] + ' · ' + skill.slots + '格</span><span>' + role + '</span></div>';
      card.addEventListener('click', () => {
        state.selectedSkill = skill;
        state.selectedId = skill.owner;
        renderAll();
      });
      card.addEventListener('dragstart', () => {
        state.dragSkill = skill.id;
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        state.dragSkill = null;
        card.classList.remove('dragging');
      });
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => {
        event.preventDefault();
        reorderSkills(state.dragSkill, skill.id);
      });
      bar.appendChild(card);
    });
  }

  function renderDetail() {
    const detail = $('#detail-content');
    const skill = state.selectedSkill;
    const unit = unitById(state.selectedId);
    if (skill) {
      const owner = ownerOf(skill);
      detail.innerHTML =
        '<div class="focus-card"><div class="focus-top"><div class="focus-icon skill">' + esc(skill.name.slice(0, 1)) + '</div><div><div class="focus-name">' + esc(skill.name) + '</div><div class="focus-sub">' + esc(skill.quality) + ' · ' + esc(SIZE_LABEL[skill.size]) + ' · 所属 ' + esc(owner ? owner.name : '未分配') + '</div></div></div><p class="focus-effect">' + esc(skill.effect) + '</p></div>' +
        '<div class="detail-label">基础信息</div><div class="stat-grid"><div class="stat-box"><span>能力</span><strong>' + esc(skill.ability || '效果') + '</strong></div><div class="stat-box"><span>攻击范围</span><strong>' + esc(skill.range) + '</strong></div><div class="stat-box"><span>技能格数</span><strong>' + skill.slots + ' 格</strong></div><div class="stat-box"><span>资源</span><strong>' + esc(skill.ammoMax ? '弹药 ' + skill.ammo + '/' + skill.ammoMax : skill.baseCountdown ? '倒计时 ' + skill.countdown + '/' + skill.baseCountdown : '无') + '</strong></div></div>' +
        '<div class="detail-label">标签</div><div class="tag-row">' + (skill.tags.length ? skill.tags : ['技能']).map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '</div>' +
        '<div class="detail-label">结算定位</div><p class="focus-effect">' + (/攻击|伤害|点燃|淬毒/.test(skill.ability + skill.effect) ? '主要输出：负责直接伤害或灼烧/剧毒命中。' : '启动/扳机或体系运转：负责提供资源、状态、增益或下一步触发条件。') + '</p>';
      return;
    }
    if (!unit) {
      detail.innerHTML = '<div class="detail-empty">选择棋盘上的灵宠或下方技能，查看实时战斗信息。</div>';
      return;
    }
    const hpPct = Math.max(0, Math.round(unit.hp / unit.maxHp * 100));
    const enPct = Math.max(0, Math.round(unit.energy / unit.maxEnergy * 100));
    const equipped = skillList(unit.side).filter(item => item.owner === unit.id);
    const cat = petCatalog(unit.name);
    detail.innerHTML =
      '<div class="focus-card"><div class="focus-top"><div class="focus-icon ' + (unit.side === 'enemy' ? 'enemy' : 'ally') + '">' + esc(unit.icon) + '</div><div><div class="focus-name">' + esc(unit.name) + '</div><div class="focus-sub">' + sideLabel(unit.side) + '灵宠 · ' + esc(unit.quality) + ' · 坐标 ' + coord(unit.pos) + '</div></div></div><p class="focus-effect">' + esc(cat.effect) + '</p></div>' +
      '<div class="stat-grid"><div class="stat-box"><span>生命</span><strong>' + unit.hp + ' / ' + unit.maxHp + '</strong></div><div class="stat-box"><span>攻击 / 防御</span><strong>' + unit.atk + ' / ' + unit.def + '</strong></div><div class="stat-box"><span>能量</span><strong>' + unit.energy + ' / ' + unit.maxEnergy + '</strong></div><div class="stat-box"><span>护盾</span><strong>' + unit.shield + '</strong></div></div>' +
      '<div class="meter"><div class="meter-line"><span>生命状态</span><b>' + hpPct + '%</b></div><div class="meter-track"><i class="meter-fill" style="width:' + hpPct + '%"></i></div></div>' +
      '<div class="meter"><div class="meter-line"><span>能量</span><b>' + unit.energy + ' / ' + unit.maxEnergy + '</b></div><div class="meter-track"><i class="meter-fill energy" style="width:' + enPct + '%"></i></div></div>' +
      '<div class="detail-label">状态与定位</div><div class="tag-row">' + stateTags(unit).map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '</div>' +
      '<div class="detail-label">装备技能</div><div class="tag-row">' + (equipped.length ? equipped.map(item => '<span class="tag">' + esc(item.name) + '</span>').join('') : '<span class="tag">未装备</span>') + '</div>';
  }

  function renderLog() {
    const logNode = $('#combat-log');
    logNode.innerHTML = state.logs.length ? state.logs.map(entry =>
      '<div class="log-entry ' + esc(entry.kind) + '"><div class="log-time"><span>R' + entry.round + ' · STEP ' + (entry.action || '—') + '</span><span>' + esc(entry.meta) + '</span></div><div class="log-text">' + entry.text + '</div></div>'
    ).join('') : '<div class="detail-empty">暂无战斗事件</div>';
    logNode.scrollTop = logNode.scrollHeight;
    $('#damage-total').textContent = state.damage;
    $('#event-total').textContent = state.events;
    $('#round-log-count').textContent = state.roundEvents;
  }

  function renderTrace() {
    $('#trace-label').textContent = state.trace.length ? 'Step ' + state.action + ' · 最近结算' : '等待技能结算';
    $('#trace-items').innerHTML = state.trace.length ? state.trace.map(item => '<span class="trace-item ' + item.kind + '">' + esc(item.text) + '</span>').join('') : '<span class="trace-empty">点击“开始战斗”或“结算一步”开始记录技能链</span>';
  }

  function renderTop() {
    const stateText = state.phase === 'finished' ? '战斗结束' : state.auto ? '自动结算中' : state.phase === 'position' ? '等待部署' : '已暂停';
    $('#battle-state-text').textContent = stateText;
    $('#turn-side-label').textContent = sideLabel(state.side) + '回合';
    $('#round-number').textContent = state.round;
    $('#action-number').textContent = state.action;
    const run = $('#run-btn');
    run.textContent = state.phase === 'position' ? '开始战斗' : state.auto ? '暂停战斗' : state.phase === 'finished' ? '重新开始' : '继续战斗';
    $('#auto-btn').textContent = state.auto ? '停止自动' : '自动播放';
    $('#step-btn').disabled = state.phase === 'finished';
  }

  function renderAll() {
    renderTop();
    renderFlow();
    renderTeamContext();
    renderBoard();
    renderSkills();
    renderDetail();
    renderTrace();
    renderLog();
  }

  function clearHighlights() {
    $$('.cell.range,.cell.move-target,.unit.in-range').forEach(node => node.classList.remove('range', 'move-target', 'in-range'));
  }

  function handleCellClick(row, col) {
    const occupied = allUnits().find(unit => !unit.dead && unit.pos[0] === row && unit.pos[1] === col);
    if (occupied) {
      state.selectedId = occupied.id;
      state.selectedSkill = null;
      renderAll();
      return;
    }
    if (state.phase !== 'position' || state.side !== 'player') {
      showToast('只有己方部署阶段可以移动灵宠', true);
      return;
    }
    const unit = unitById(state.selectedId);
    if (!unit || unit.side !== 'player' || unit.dead) return;
    if (unit.rooted > 0) {
      showToast(unit.name + ' 本回合处于禁足状态', true);
      return;
    }
    const old = unit.pos.slice();
    unit.pos = [row, col];
    state.selectedSkill = null;
    log('<strong>' + esc(unit.name) + '</strong> 从 ' + coord(old) + ' 移动到 ' + coord(unit.pos) + '。', 'trigger', 'MOVE');
    renderAll();
  }

  function reorderSkills(fromId, toId) {
    if (!fromId || fromId === toId || state.phase !== 'position') return;
    const from = state.playerSkills.findIndex(skill => skill.id === fromId);
    const to = state.playerSkills.findIndex(skill => skill.id === toId);
    if (from < 0 || to < 0) return;
    const item = state.playerSkills.splice(from, 1)[0];
    state.playerSkills.splice(to, 0, item);
    state.config.player.skills = state.playerSkills.map(skill => ({name: skill.name, quality: skill.quality, owner: skill.ownerIndex}));
    log('<strong>' + esc(item.name) + '</strong> 移动到第 ' + (to + 1) + ' 格；所属灵宠保持为 <strong>' + esc(ownerOf(item) ? ownerOf(item).name : '未分配') + '</strong>。', 'trigger', 'ORDER');
    showToast('技能顺序已更新');
    renderAll();
  }

  function setBanner(title, subtitle) {
    const node = $('#resolution-banner');
    node.innerHTML = '<strong>' + esc(title) + '</strong><span>' + esc(subtitle) + '</span>';
    node.hidden = false;
    clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(() => { node.hidden = true; }, 900);
  }

  function addEnergy(unit, amount, reason) {
    if (!unit || unit.dead || !amount) return;
    const before = unit.energy;
    unit.energy = Math.max(0, Math.min(unit.maxEnergy, unit.energy + amount));
    const actual = unit.energy - before;
    if (actual) log('<strong>' + esc(unit.name) + '</strong> ' + esc(reason || '获得能量') + ' <strong>+' + actual + '</strong>，当前 ' + unit.energy + '。', 'trigger', 'ENERGY');
  }

  function consumeEnergy(unit, amount, reason) {
    if (!unit || unit.energy < amount) return false;
    unit.energy -= amount;
    log('<strong>' + esc(unit.name) + '</strong> 消耗 <strong>' + amount + '</strong> 点能量' + (reason ? '，' + esc(reason) : '') + '。', 'trigger', 'ENERGY');
    return true;
  }

  function applyBuff(unit, field, amount, label) {
    if (!unit || unit.dead) return 0;
    let value = amount;
    if (unit.weak > 0) value = Math.floor(value / 2);
    if (unit.excited > 0) {
      value *= 2;
      unit.excited -= 1;
    }
    unit[field] = Math.max(0, unit[field] + value);
    log('<strong>' + esc(unit.name) + '</strong> 获得' + esc(label) + ' <strong>+' + value + '</strong>。', 'trigger', 'BUFF');
    return value;
  }

  function applyDebuff(unit, field, amount, label) {
    if (!unit || unit.dead) return 0;
    let value = amount;
    if (unit.excited > 0) value = Math.floor(value / 2);
    if (unit.weak > 0) {
      value *= 2;
      unit.weak -= 1;
    }
    unit[field] = Math.max(0, unit[field] + value);
    log('<strong>' + esc(unit.name) + '</strong> 获得' + esc(label) + ' <strong>+' + value + '</strong>。', 'warn', 'DEBUFF');
    return value;
  }

  function damageUnit(source, target, amount, options = {}) {
    if (!target || target.dead || target.hp <= 0) return 0;
    let raw = Math.max(0, Math.round(amount || 0));
    if (!raw) return 0;
    let absorbed = 0;
    if (target.shield > 0 && !options.ignoreShield) {
      absorbed = Math.min(target.shield, raw);
      target.shield -= absorbed;
      raw -= absorbed;
      log('<strong>' + esc(target.name) + '</strong> 的护盾吸收 <strong>' + absorbed + '</strong> 点伤害。', 'trigger', 'SHIELD');
    }
    const defense = options.ignoreDefense ? 0 : Math.max(0, target.def);
    const actual = Math.max(0, raw - defense);
    if (actual > 0) {
      target.hp = Math.max(0, target.hp - actual);
      state.damage += actual;
      log((source ? '<strong>' + esc(source.name) + '</strong> 对 ' : '') + '<strong>' + esc(target.name) + '</strong> 造成 <strong>' + actual + '</strong> 点' + (options.status ? esc(options.status) : '') + '伤害。', options.status ? 'trigger' : 'output', options.meta || 'DAMAGE');
      trace((options.status || '伤害') + ' ' + target.name + ' -' + actual, options.status ? 'trigger' : 'output');
    } else {
      log('<strong>' + esc(target.name) + '</strong> 的防御抵消了本次伤害。', 'trigger', options.meta || 'DEFENSE');
    }
    if (target.hp > 0 && !options.skipDefenseLoss && (actual > 0 || absorbed > 0)) target.def = Math.max(0, target.def - 1);
    if (target.hp <= 0) killUnit(target, source);
    return actual;
  }

  function killUnit(unit, source) {
    if (!unit || unit.dead) return;
    unit.dead = true;
    unit.hp = 0;
    unit.reviveAt = state.round + 2;
    const hero = team(unit.side);
    hero.hp = Math.max(0, hero.hp - unit.maxHp);
    log('<strong>' + esc(unit.name) + '</strong> 被击倒；' + sideLabel(unit.side) + '英雄失去 <strong>' + unit.maxHp + '</strong> 点生命，预计第 ' + unit.reviveAt + ' 回合复活。', 'warn', 'DEATH');
    trace(unit.name + ' 阵亡，英雄 -' + unit.maxHp, 'output');
    if (hero.hp <= 0) finishBattle(opponentSide(unit.side));
  }

  function reviveUnit(unit, forced) {
    if (!unit || !unit.dead) return;
    const occupied = new Set(allUnits().filter(item => !item.dead && item.id !== unit.id).map(item => item.pos.join(',')));
    const preferredRow = unit.side === 'player' ? 0 : ROWS - 1;
    let position = [preferredRow, unit.slot % COLS];
    if (occupied.has(position.join(','))) {
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          if (!occupied.has(row + ',' + col)) {
            position = [row, col];
            row = ROWS;
            break;
          }
        }
      }
    }
    unit.dead = false;
    unit.hp = unit.maxHp;
    unit.def = unit.baseDef + unit.permanentDef;
    unit.energy = 0;
    unit.burn = 0;
    unit.poison = 0;
    unit.shield = 0;
    unit.reviveAt = null;
    unit.pos = position;
    log('<strong>' + esc(unit.name) + '</strong> ' + (forced ? '被强制复活' : '复活') + '，回到 ' + coord(position) + '。', 'trigger', 'REVIVE');
  }

  function resetDefense(side) {
    unitsOf(side, true).forEach(unit => {
      unit.atk = unit.baseAtk + unit.permanentAtk;
      unit.def = unit.baseDef + unit.permanentDef;
      unit.skillDamage = 0;
      unit.roundSkillDamage = 0;
      unit.roundIgnite = 0;
      unit.firstMartialReady = true;
      unit.rooted = 0;
      unit.silence = 0;
    });
    log(sideLabel(side) + '灵宠基本防御与本回合临时数值已重置。', 'trigger', 'DEFENSE RESET');
  }

  function passivesStart(side) {
    const units = unitsOf(side, true);
    const teamState = team(side);
    teamState.skillDamage = teamState.skillDamage || 0;
    teamState.skillDamage = teamState.skillDamageGrowth || 0;
    if (units.some(unit => unit.name === '蚁王')) {
      teamState.skillDamage += 2;
      log(sideLabel(side) + '蚁王在场：本方技能伤害基础值 +2。', 'trigger', 'PET PASSIVE');
    }
    const elephant = units.find(unit => unit.name === '圣象甲虫');
    if (elephant) {
      units.filter(unit => unit.id !== elephant.id).forEach(unit => {
        unit.atk += 3;
        unit.def += 1;
      });
      elephant.skillDamage = 8;
      log('圣象甲虫存活：其它友方攻击 +3、防御 +1；自身技能伤害 +8。', 'trigger', 'PET PASSIVE');
    }
    units.filter(unit => unit.name === '烁德童子').forEach(unit => {
      addEnergy(unit, 1, '回合开始被动充能');
      const adjacent = units.filter(other => other.id !== unit.id && Math.abs(other.pos[0] - unit.pos[0]) + Math.abs(other.pos[1] - unit.pos[1]) <= 1);
      if (adjacent[0]) addEnergy(adjacent[0], 1, '烁德童子相邻充能');
    });
    units.filter(unit => unit.name === '赤精鱼').forEach(unit => {
      if (unit.energy >= 5 && consumeEnergy(unit, 5, '赤精鱼回合开始爆能')) {
        unit.roundSkillDamage += 4;
        unit.roundIgnite += 1;
        log('赤精鱼爆能成功：本回合自身技能伤害 +4，点燃 +1。', 'trigger', 'PET EXPLOSION');
      } else {
        log('赤精鱼能量不足5，本回合不触发爆能特性。', 'trigger', 'PET EXPLOSION');
      }
    });
    units.filter(unit => unit.name === '玄铁龟').forEach(unit => {
      if (unit.energy >= 6 && consumeEnergy(unit, 6, '玄铁龟回合开始爆能')) {
        units.forEach(other => addEnergy(other, 2, '玄铁龟群体充能'));
        skillList(side).forEach(skill => { if (skill.ammoMax) skill.ammo += 1; });
        log('玄铁龟爆能成功：全体灵宠能量 +2，所有技能装填1枚弹药。', 'trigger', 'PET EXPLOSION');
      }
    });
    units.filter(unit => unit.name === '吞金鼠').forEach(unit => {
      const lowest = units.slice().sort((a, b) => a.hp - b.hp)[0];
      if (lowest) healUnit(unit, lowest, 3 * QUALITY_MULT[unit.quality], '吞金鼠回合开始治疗');
    });
    units.filter(unit => unit.name === '铁丸子').forEach(unit => {
      if (unit.passiveCountdown > 0) {
        unit.passiveCountdown -= 1;
        log('铁丸子倒计时 -1，当前为 ' + unit.passiveCountdown + '。', 'trigger', 'COUNTDOWN');
      } else {
        const reload = skillList(side).find(skill => skill.ammoMax && skill.ammo < skill.ammoMax);
        if (reload) {
          reload.ammo += 2;
          unit.passiveCountdown = 2;
          log('铁丸子倒计时触发：' + reload.name + ' 装填2枚弹药，倒计时重置为2。', 'trigger', 'COUNTDOWN');
        }
      }
    });
    if (units.some(unit => unit.name === '通灵钟')) {
      skillList(side).forEach(skill => { if (skill.baseCountdown && skill.countdown > 0) skill.countdown -= 1; });
      log('通灵钟在场：己方倒计时额外减少1回合。', 'trigger', 'PET PASSIVE');
    }
  }

  function startEffects(side) {
    state.phase = side === 'player' ? 'start' : 'enemy-start';
    state.roundEvents = 0;
    log('—— ' + sideLabel(side) + '第 ' + state.round + ' 回合开始：复活检查 ——', 'trigger', 'TURN START');
    const units = unitsOf(side, false);
    units.filter(unit => unit.dead && unit.reviveAt != null && unit.reviveAt <= state.round).forEach(unit => reviveUnit(unit, false));
    if (!unitsOf(side, true).length) {
      const forced = units.find(unit => unit.dead);
      if (forced) reviveUnit(forced, true);
    }
    resetDefense(side);
    log('—— ' + sideLabel(side) + '回合开始：倒计时与灵宠被动 ——', 'trigger', 'TURN START');
    passivesStart(side);
    log('—— ' + sideLabel(side) + '回合开始效果结算完毕 ——', 'trigger', 'TURN START');
  }

  function healUnit(source, target, amount, reason) {
    if (!target || target.dead) return 0;
    const value = Math.max(0, Math.round(amount || 0));
    const actual = Math.min(value, target.maxHp - target.hp);
    if (actual > 0) {
      target.hp += actual;
      log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 恢复 <strong>' + actual + '</strong> 点生命。', 'trigger', 'HEAL');
      trace(target.name + ' 治疗 +' + actual, 'trigger');
    } else {
      log('<strong>' + esc(target.name) + '</strong> 已满生命，治疗没有溢出。', 'trigger', 'HEAL');
    }
    if (target.name === '沼泽鼠' && actual > 0) {
      const enemy = unitsOf(opponentSide(target.side), true).sort((a, b) => a.hp - b.hp)[0];
      if (enemy) applyPoison(target, enemy, 6, '沼泽鼠受到自身治疗后的被动');
    }
    return actual;
  }

  function healRandomAlly(source, amount, reason) {
    const target = unitsOf(source.side, true).sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0];
    if (target) healUnit(source, target, amount, reason);
  }

  function applyPoison(source, target, amount, reason) {
    if (!target || target.dead) return;
    let value = Math.max(1, Math.round(amount || 0));
    const old = target.poison;
    if (target.name === '蕈章' && target.shield > 0) value *= 2;
    target.poison += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得剧毒 +' + value + '，当前 ' + target.poison + '。', 'trigger', 'POISON');
    trace(target.name + ' 剧毒 +' + value, 'trigger');
    const blackRose = allUnits().find(unit => unit.name === '黑玫瑰' && !unit.dead && (source.name === '黑玫瑰' || target.name === '黑玫瑰'));
    if (blackRose) healRandomAlly(blackRose, value * 2, '黑玫瑰自身施加/受到剧毒触发');
    if (old > 0) {
      damageUnit(source, target, old, {status:'剧毒', ignoreShield:true, meta:'POISON PROC'});
      log('目标已有剧毒，淬毒立即触发一次当前剧毒伤害。', 'trigger', 'POISON PROC');
    }
  }

  function applyBurn(source, target, amount, reason, attackHit) {
    if (!target || target.dead) return;
    const value = Math.max(1, Math.round(amount || 0));
    const old = target.burn;
    target.burn += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得灼烧 +' + value + '，当前 ' + target.burn + '。', 'trigger', 'BURN');
    trace(target.name + ' 灼烧 +' + value, 'trigger');
    if (old > 0) {
      damageUnit(source, target, value * 2, {status:'点燃', ignoreShield:true, meta:'IGNITE PROC'});
      log('目标已有灼烧，点燃额外造成 ' + value * 2 + ' 点伤害。', 'output', 'IGNITE PROC');
    }
    const crab = unitsOf(source.side, true).find(unit => unit.name === '花椒蟹');
    if (crab && attackHit && target.hp > 0) {
      damageUnit(crab, target, 1, {status:'被动', ignoreDefense:false, meta:'FLOWER CRAB'});
      log('花椒蟹被动：技能赋予灼烧后，对同一目标造成1点额外伤害；该被动伤害不算白蔷薇的攻击触发。', 'trigger', 'PET PROC');
    }
  }

  function triggerBurnOnHit(attacker, target, skill, damageBase) {
    if (!target || target.dead || target.burn <= 0) return 0;
    const burnDamage = target.burn;
    damageUnit(attacker, target, burnDamage, {status:'灼烧', ignoreShield:true, meta:'BURN PROC'});
    target.burn = Math.max(1, Math.floor(target.burn * 0.9));
    log('<strong>' + esc(target.name) + '</strong> 被攻击技能命中，灼烧追加 ' + burnDamage + '，层数按10%衰减至 ' + target.burn + '。', 'trigger', 'BURN PROC');
    if (attacker && attacker.name === '白蔷薇') healRandomAlly(attacker, 7, '白蔷薇自身攻击触发灼烧伤害');
    return burnDamage;
  }

  function applyShield(source, target, amount, reason) {
    if (!target || target.dead) return;
    let value = Math.max(0, Math.round(amount || 0));
    if (target.weak > 0) value = Math.floor(value / 2);
    if (target.excited > 0) {
      value *= 2;
      target.excited -= 1;
    }
    target.shield += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得护盾 <strong>+' + value + '</strong>。', 'trigger', 'SHIELD');
    trace(target.name + ' 护盾 +' + value, 'trigger');
  }

  function grantAmmo(side, amount) {
    skillList(side).filter(skill => skill.ammoMax).forEach(skill => {
      skill.ammo = Math.min(skill.ammoMax, skill.ammo + amount);
    });
    log(sideLabel(side) + '弹药技能统一装填 ' + amount + ' 枚。', 'trigger', 'AMMO');
  }

  function explosionFor(skill, owner) {
    if (!skill.explosionCost) return false;
    if (owner.energy >= skill.explosionCost) {
      consumeEnergy(owner, skill.explosionCost, skill.name + ' 爆能');
      log('<strong>' + esc(skill.name) + '</strong> 爆能成功：执行冒号后的强化效果。', 'trigger', 'EXPLOSION');
      return true;
    }
    addEnergy(owner, SIZE_SLOTS[skill.size], skill.name + ' 爆能补偿');
    log('<strong>' + esc(skill.name) + '</strong> 能量不足，未触发爆能；按技能体积获得 ' + SIZE_SLOTS[skill.size] + ' 点补偿能量。', 'warn', 'EXPLOSION');
    return false;
  }

  function activeCountdown(skill) {
    if (!skill.baseCountdown) return true;
    if (skill.countdown > 0) {
      skill.countdown -= 1;
      log('<strong>' + esc(skill.name) + '</strong> 主动倒计时 -1，当前 ' + skill.countdown + '；从1变0时不会立即触发。', 'trigger', 'COUNTDOWN');
      return false;
    }
    skill.countdown = skill.baseCountdown;
    log('<strong>' + esc(skill.name) + '</strong> 主动倒计时归零，本次使用触发倒计时段效果并重置。', 'output', 'COUNTDOWN');
    return true;
  }

  function genericAttackValue(skill, owner) {
    const base = numberFor(skill.ability + ' ' + skill.effect, 3);
    const isAttack = /攻击\d/.test(skill.ability);
    const value = isAttack ? base + owner.atk : base;
    const sizeDot = skill.size === 'long' ? 3 : skill.size === 'medium' ? 2 : 1;
    const dot = /点燃|淬毒/.test(skill.ability + skill.effect) ? base + Math.floor(owner.atk * sizeDot / 4) : value;
    return Math.max(1, Math.round((/点燃|淬毒/.test(skill.ability + skill.effect) ? dot : value) * skill.scale));
  }

  function useSkill(skill, side) {
    state.action += 1;
    state.trace = [];
    state.selectedSkill = skill;
    state.selectedId = skill.owner;
    const owner = ownerOf(skill);
    const label = sideLabel(side) + '技能 ' + skill.name;
    setBanner(skill.name, (owner ? owner.name : '未分配') + ' · Step ' + state.action);
    if (!owner || owner.dead || owner.hp <= 0) {
      log('<strong>' + esc(skill.name) + '</strong> 所属灵宠已阵亡，跳过本次技能。', 'warn', 'SKIP');
      trace(skill.name + ' 跳过', 'trigger');
      renderAll();
      return;
    }
    const targets = targetsFor(skill, owner, side);
    const attackSkill = /攻击\d|伤害\d|点燃|淬毒|造成伤害/.test(skill.ability + skill.effect);
    if (owner.silence > 0 && attackSkill) {
      log('<strong>' + esc(owner.name) + '</strong> 处于封刃，无法使用攻击技能。', 'warn', 'SILENCE');
      renderAll();
      return;
    }
    if (owner.paralyze > 0) {
      const chance = Math.min(99, owner.paralyze * 7);
      owner.paralyze -= 1;
      if ((state.action * 17 + owner.slot * 11) % 100 < chance) {
        log('<strong>' + esc(owner.name) + '</strong> 受到麻痹影响，' + skill.name + ' 使用失败。', 'warn', 'PARALYZE');
        renderAll();
        return;
      }
    }
    if (!targets.length && !skillIsSupport(skill)) {
      log('<strong>' + esc(skill.name) + '</strong> 攻击范围内没有敌方灵宠，不消耗弹药且不产生攻击效果。', 'warn', 'TARGET');
      trace(skill.name + ' 无目标', 'trigger');
      renderAll();
      return;
    }
    if (skill.ammoMax && skill.ammo <= 0) {
      log('<strong>' + esc(skill.name) + '</strong> 弹药为0，无法使用。', 'warn', 'AMMO');
      renderAll();
      return;
    }
    if (skill.ammoMax && targets.length) {
      skill.ammo -= 1;
      log('<strong>' + esc(skill.name) + '</strong> 消耗1枚弹药，剩余 ' + skill.ammo + '。', 'trigger', 'AMMO');
    }
    if (skill.baseCountdown) activeCountdown(skill);
    const explosion = explosionFor(skill, owner);
    const multi = parseFirst(skill.effect, [/多重触发\s*(\d+)/], 1);
    log('<strong>' + esc(owner.name) + '</strong> 使用 <strong>' + esc(skill.name) + '</strong>，按技能栏顺序结算（' + label + '）。', 'trigger', 'SKILL');
    trace(owner.name + ' → ' + skill.name, 'trigger');

    if (skill.name === '蓄能') addEnergy(owner, Math.max(1, Math.round(2 * skill.scale)), '蓄能技能');
    if (skill.name === '吐纳术') addEnergy(owner, Math.max(1, Math.round(1 * skill.scale)), '吐纳术');
    if (skill.name === '轻击') addEnergy(owner, 1, '轻击命中/使用充能');
    if (/装填弹药|快速装弹|快速换弹/.test(skill.name)) grantAmmo(side, 2);
    if (skill.name === '凝血铠甲' || skill.name === '披甲' || skill.name === '叠甲' || skill.name === '双盾' || skill.name === '蜷缩' || skill.name === '灵气淬体' || skill.name === '气场') {
      applyShield(owner, targets[0] || owner, genericAttackValue(skill, owner), skill.name);
    }
    if (/愈合|疗愈|回春/.test(skill.name)) healUnit(owner, targets[0] || owner, genericAttackValue(skill, owner), skill.name);
    if (/巨力|专注|激昂|凌厉|百战|全力冲撞|钩爪|锋锐鳞片/.test(skill.name)) {
      applyBuff(targets[0] || owner, 'atk', Math.max(1, Math.round(2 * skill.scale)), skill.name + '攻击');
      (targets[0] || owner).excited += /巨力|激昂/.test(skill.name) ? 1 : 0;
    }

    const burnSkill = /引火|天火咒|火球|鞭炮|妒火|热流沙/.test(skill.name) || /点燃/.test(skill.ability);
    const poisonSkill = /毒钩|毒雾|蜈蚣锁|寒蛇影|蛇影寒|泰诺地龙|毒腺/.test(skill.name) || /淬毒/.test(skill.ability);
    const directTargets = targets.length ? targets : [owner];
    directTargets.forEach(target => {
      if (attackSkill && !target.dead && target.side !== owner.side) triggerBurnOnHit(owner, target, skill, genericAttackValue(skill, owner));
      if (burnSkill && target.side !== owner.side) {
        applyBurn(owner, target, genericAttackValue(skill, owner) + owner.roundIgnite, skill.name + '点燃', true);
      } else if (poisonSkill && target.side !== owner.side) {
        applyPoison(owner, target, genericAttackValue(skill, owner), skill.name + '淬毒');
      }
      if (attackSkill && target.side !== owner.side && target.hp > 0 && !burnSkill && !poisonSkill) {
        for (let i = 0; i < multi; i += 1) {
          let value = genericAttackValue(skill, owner) + (team(side).skillDamage || 0) + owner.roundSkillDamage + owner.skillDamage;
          if (owner.name === '饿狼' && owner.firstMartialReady && /武技|攻击/.test(skill.type + skill.tags)) {
            value *= 2;
            owner.firstMartialReady = false;
            log('饿狼本回合第一个武技技能伤害翻倍。', 'trigger', 'PET PROC');
          }
          damageUnit(owner, target, value, {attackHit:true, meta:'ATTACK'});
        }
      }
    });

    if (skill.name === '火中取栗' && explosion) {
      owner.excited += 2;
      log('火中取栗爆能成功：' + owner.name + ' 获得2层亢奋。', 'trigger', 'EXPLOSION');
    }
    if (skill.name === '元气弹' && explosion) {
      directTargets.forEach(target => {
        if (target.side !== owner.side && !target.dead) damageUnit(owner, target, genericAttackValue(skill, owner), {status:'爆能范围', ignoreDefense:false, meta:'EXPLOSION'});
      });
    }
    if (skill.name === '蜈蚣锁' && owner.hp > 0) applyPoison(owner, owner, genericAttackValue(skill, owner), '蜈蚣锁自毒');
    if (skill.name === '尾鞭' && directTargets[0] && directTargets[0].side !== owner.side) applyDebuff(directTargets[0], 'weak', 1, '尾鞭衰弱');
    if (owner.name === '黑犬' && skill.size === 'medium') {
      const strongest = unitsOf(side, true).slice().sort((a, b) => b.atk - a.atk)[0];
      if (strongest) { applyBuff(strongest, 'atk', 2, '黑犬中篇技能联动'); strongest.def += 1; }
    }
    if (owner.name === '白蔷薇' && burnSkill && directTargets[0] && directTargets[0].side !== owner.side) {
      log('白蔷薇只有在自身攻击触发灼烧伤害时才会治疗，不会被友方或花椒蟹被动额外伤害误触发。', 'trigger', 'RULE NOTE');
    }
    if (owner.name === '花椒蟹' && burnSkill) {
      log('花椒蟹自身施加灼烧也会按“技能赋予灼烧后”触发自身被动。', 'trigger', 'RULE NOTE');
    }
    skill.used += 1;
    owner.skillUses += 1;
    renderAll();
    checkVictory();
  }

  function endEffects(side) {
    state.phase = 'end';
    log('—— ' + sideLabel(side) + '第 ' + state.round + ' 回合结束：状态伤害 ——', 'trigger', 'TURN END');
    unitsOf(side, true).forEach(unit => {
      if (unit.poison > 0) {
        const value = unit.poison;
        damageUnit(null, unit, value, {status:'剧毒', ignoreShield:true, meta:'POISON TICK'});
        unit.poison = Math.max(0, unit.poison - 2);
        log('<strong>' + esc(unit.name) + '</strong> 回合结束剧毒 -2，剩余 ' + unit.poison + '。', 'trigger', 'POISON TICK');
      }
      if (unit.excited > 0) unit.excited = Math.max(0, unit.excited - 1);
      if (unit.weak > 0) unit.weak = Math.max(0, unit.weak - 1);
      if (unit.paralyze > 0) unit.paralyze = Math.max(0, unit.paralyze - 1);
    });
    unitsOf(side, true).filter(unit => unit.name === '玄铁龟').forEach(unit => addEnergy(unit, 1, '玄铁龟回合结束充能'));
    if (unitsOf(side, true).some(unit => unit.name === '角蛙')) {
      team(side).skillDamageGrowth = (team(side).skillDamageGrowth || 0) + 2;
      log('角蛙回合结束被动：本方后续技能伤害 +2。', 'trigger', 'PET PASSIVE');
    }
    log('—— ' + sideLabel(side) + '回合结束效果结算完毕 ——', 'trigger', 'TURN END');
  }

  function preparePlayerTurn() {
    if (state.winner) return;
    state.side = 'player';
    state.playerCursor = 0;
    state.trace = [];
    startEffects('player');
    state.phase = 'resolving';
    log('己方完成部署，开始按技能栏从左到右结算。', 'trigger', 'PLAYER ACTION');
    renderAll();
  }

  function moveEnemyAI() {
    const enemies = unitsOf('enemy', true);
    const targets = unitsOf('player', true);
    if (!enemies.length || !targets.length) return;
    enemies.forEach(enemy => {
      const nearest = targets.slice().sort((a, b) => {
        const da = Math.abs(enemy.pos[0] - a.pos[0]) + Math.abs(enemy.pos[1] - a.pos[1]);
        const db = Math.abs(enemy.pos[0] - b.pos[0]) + Math.abs(enemy.pos[1] - b.pos[1]);
        return da - db || a.id.localeCompare(b.id);
      })[0];
      const skill = state.enemySkills.find(item => item.owner === enemy.id && item.ammo !== 0);
      if (!skill || !targetsFor(skill, enemy, 'enemy').length) {
        const dr = Math.sign(nearest.pos[0] - enemy.pos[0]);
        const dc = Math.sign(nearest.pos[1] - enemy.pos[1]);
        const candidate = [Math.max(0, Math.min(ROWS - 1, enemy.pos[0] + dr)), Math.max(0, Math.min(COLS - 1, enemy.pos[1] + dc))];
        const occupied = allUnits().some(unit => !unit.dead && unit.id !== enemy.id && unit.pos[0] === candidate[0] && unit.pos[1] === candidate[1]);
        if (!occupied) {
          const old = enemy.pos.slice();
          enemy.pos = candidate;
          log('<strong>' + esc(enemy.name) + '</strong> AI 向最近目标移动：' + coord(old) + ' → ' + coord(candidate) + '。', 'trigger', 'AI MOVE');
        }
      } else {
        log('<strong>' + esc(enemy.name) + '</strong> 已在技能范围内，AI 保持位置。', 'trigger', 'AI MOVE');
      }
    });
  }

  function beginEnemyTurn() {
    if (state.winner) return;
    state.side = 'enemy';
    state.enemyCursor = 0;
    state.trace = [];
    startEffects('enemy');
    moveEnemyAI();
    state.phase = 'enemy-resolving';
    log('对手完成自动走位，开始按敌方技能栏顺序结算。', 'trigger', 'ENEMY ACTION');
    renderAll();
  }

  function finishPlayerTurn() {
    if (state.winner) return;
    endEffects('player');
    if (state.winner) return;
    beginEnemyTurn();
  }

  function finishEnemyTurn() {
    if (state.winner) return;
    endEffects('enemy');
    if (state.winner) return;
    state.round += 1;
    state.side = 'player';
    state.phase = 'position';
    state.playerCursor = 0;
    state.roundEvents = 0;
    log('对手回合结束，进入第 ' + state.round + ' 回合。己方可以重新走位并调整技能顺序。', 'trigger', 'ROUND');
    renderAll();
  }

  function stepOnce() {
    if (state.winner || state.phase === 'finished') return;
    state.auto = false;
    stopAuto();
    if (state.phase === 'position') {
      preparePlayerTurn();
      if (state.phase === 'resolving') resolveNext();
    } else if (state.phase === 'resolving') {
      resolveNext();
    } else if (state.phase === 'enemy-resolving') {
      resolveNext();
    }
    state.running = false;
    renderAll();
  }

  function resolveNext() {
    if (state.winner) return;
    if (state.phase === 'resolving') {
      const skill = state.playerSkills[state.playerCursor];
      if (skill) useSkill(skill, 'player');
      state.playerCursor += 1;
      if (state.playerCursor >= state.playerSkills.length) finishPlayerTurn();
    } else if (state.phase === 'enemy-resolving') {
      const skill = state.enemySkills[state.enemyCursor];
      if (skill) useSkill(skill, 'enemy');
      state.enemyCursor += 1;
      if (state.enemyCursor >= state.enemySkills.length) finishEnemyTurn();
    }
    renderAll();
  }

  function scheduleAuto() {
    stopAuto();
    if (!state.auto || state.winner || state.phase === 'position' || state.phase === 'finished') return;
    state.autoTimer = setTimeout(() => {
      if (!state.auto) return;
      resolveNext();
      scheduleAuto();
    }, 950);
  }

  function startOrPause() {
    if (state.phase === 'finished') {
      buildFromConfig(state.config);
      return;
    }
    if (state.phase === 'position') {
      state.auto = true;
      state.running = true;
      preparePlayerTurn();
      scheduleAuto();
      renderAll();
      return;
    }
    state.auto = !state.auto;
    state.running = state.auto;
    if (state.auto) scheduleAuto();
    else stopAuto();
    renderAll();
  }

  function toggleAuto() {
    if (state.phase === 'position') {
      state.auto = true;
      state.running = true;
      preparePlayerTurn();
    } else {
      state.auto = !state.auto;
      state.running = state.auto;
    }
    if (state.auto) scheduleAuto(); else stopAuto();
    renderAll();
  }

  function stopAuto() {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }

  function finishBattle(winnerSide) {
    if (state.winner) return;
    state.winner = winnerSide;
    state.phase = 'finished';
    state.auto = false;
    state.running = false;
    stopAuto();
    const winner = team(winnerSide);
    const loser = team(opponentSide(winnerSide));
    if (winner) {
      winner.points = (winner.points || 0) + 1;
      winner.history += 1;
    }
    if (loser) loser.history += 1;
    log(sideLabel(opponentSide(winnerSide)) + '英雄生命归零，' + sideLabel(winnerSide) + '获胜。本场结算结束。', winnerSide === 'player' ? 'output' : 'warn', 'RESULT');
    if (winner && winner.points >= 10) log(sideLabel(winnerSide) + '累计获得10点积分，完成游戏目标。', 'output', 'RESULT');
    setBanner(winnerSide === 'player' ? '己方胜利' : '敌方胜利', '英雄生命归零，战斗结束');
    renderAll();
  }

  function checkVictory() {
    if (state.player && state.player.hp <= 0) finishBattle('enemy');
    else if (state.enemy && state.enemy.hp <= 0) finishBattle('player');
  }

  function makeShop(seed) {
    const offset = Math.abs(seed * 7);
    const skills = [0, 1, 2].map(i => {
      const item = SKILL_CATALOG[(offset + i * 5) % SKILL_CATALOG.length];
      return {name:item.name, quality:item.tier || '青铜', type:'技能'};
    });
    const pets = [0, 1, 2].map(i => {
      const item = PET_CATALOG[(offset + i * 3 + 4) % PET_CATALOG.length];
      return {name:item.name, quality:item.tier || '青铜', type:'灵宠'};
    });
    return {seed, skills, pets};
  }

  function itemCost(item) {
    if (item.type === '灵宠') return 3 * QUALITY_MULT[item.quality || '青铜'];
    return SIZE_SLOTS[sizeFrom(skillCatalog(item.name))] * 2 * QUALITY_MULT[item.quality || '青铜'];
  }

  function totalSlots(skillItems) {
    return skillItems.reduce((sum, item) => sum + SIZE_SLOTS[sizeFrom(skillCatalog(item.name))], 0);
  }

  function petOptions(selected) {
    return '<option value="">空置</option>' + PET_CATALOG.map(item => '<option value="' + esc(item.name) + '"' + (item.name === selected ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('');
  }
  function skillOptions(selected) {
    return SKILL_CATALOG.map(item => '<option value="' + esc(item.name) + '"' + (item.name === selected ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('');
  }
  function qualityOptions(selected) {
    return QUALITY.map(item => '<option value="' + item + '"' + (item === selected ? ' selected' : '') + '>' + item + '</option>').join('');
  }
  function ownerOptions(pets, selected) {
    return pets.map((pet, index) => pet.name ? '<option value="' + index + '"' + (Number(selected) === index ? ' selected' : '') + '>' + esc(pet.name) + '</option>' : '').join('');
  }

  function renderSetup() {
    const draft = state.setupDraft;
    if (!draft) return;
    let html = '<div class="setup-grid">';
    ['player', 'enemy'].forEach(side => {
      const cfg = draft[side];
      html += '<section class="setup-team ' + side + '"><div class="setup-team-head"><div><span class="kicker">' + (side === 'player' ? 'PLAYER TEAM' : 'ENEMY TEAM') + '</span><h3>' + (side === 'player' ? '己方队伍' : '对手队伍') + '</h3></div><span class="setup-count">' + cfg.pets.filter(item => item.name).length + ' / 4 灵宠</span></div>';
      html += '<div class="setup-fields"><label>英雄等级<input type="number" min="1" max="99" data-team="' + side + '" data-field="level" value="' + cfg.level + '"></label><label>收入/金币<input type="number" min="0" data-team="' + side + '" data-field="income" value="' + cfg.income + '"></label><label>历史战斗场次<input type="number" min="0" data-team="' + side + '" data-field="history" value="' + cfg.history + '"></label><label>英雄生命上限<input type="number" min="1" data-team="' + side + '" data-field="heroHp" value="' + cfg.heroHp + '"></label></div>';
      html += '<div class="setup-section-label">上场灵宠</div><div class="setup-pets">';
      cfg.pets.forEach((pet, index) => {
        html += '<div class="setup-row"><span class="setup-index">' + (index + 1) + '</span><select data-team="' + side + '" data-kind="pet" data-index="' + index + '" data-field="name">' + petOptions(pet.name) + '</select><select data-team="' + side + '" data-kind="pet" data-index="' + index + '" data-field="quality">' + qualityOptions(pet.quality) + '</select></div>';
      });
      html += '</div><div class="setup-section-label">技能栏 <span class="setup-muted">总格数 ' + totalSlots(cfg.skills) + ' / 10</span></div><div class="setup-skills">';
      cfg.skills.forEach((skill, index) => {
        html += '<div class="setup-row setup-skill-row"><span class="setup-index">' + (index + 1) + '</span><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="name">' + skillOptions(skill.name) + '</select><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="quality">' + qualityOptions(skill.quality) + '</select><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="owner">' + ownerOptions(cfg.pets, skill.owner) + '</select><button type="button" class="icon-btn setup-remove" data-action="remove-skill" data-team="' + side + '" data-index="' + index + '">×</button></div>';
      });
      html += '</div><button type="button" class="ghost-btn setup-add" data-action="add-skill" data-team="' + side + '">＋ 添加技能</button></section>';
    });
    html += '</div>';
    html += '<section class="setup-economy"><div class="setup-team-head"><div><span class="kicker">PREP PHASE ECONOMY</span><h3>战前商店与背包</h3></div><button type="button" class="ghost-btn" data-action="refresh-shop">刷新商店（2金币）</button></div><div class="shop-grid"><div><div class="setup-section-label">技能商店</div>' + state.shop.skills.map((item, index) => item ? shopItem(item, 'skill', index) : '').join('') + '</div><div><div class="setup-section-label">灵宠商店</div>' + state.shop.pets.map((item, index) => item ? shopItem(item, 'pet', index) : '').join('') + '</div><div><div class="setup-section-label">己方背包</div>' + inventoryHtml() + '</div></div></section>';
    $('#setup-body').innerHTML = html;
    const slots = totalSlots(draft.player.skills);
    $('#setup-validation').textContent = '己方技能格数：' + slots + ' / 10 · 双方每只上场灵宠至少装备1个技能。';
  }

  function shopItem(item, kind, index) {
    const cost = itemCost(item);
    return '<div class="shop-item"><div><strong>' + esc(item.name) + '</strong><small>' + esc(item.quality) + ' · ' + cost + '金币</small></div><button type="button" class="tool-btn" data-action="buy" data-kind="' + kind + '" data-index="' + index + '">购买</button></div>';
  }

  function inventoryHtml() {
    const all = state.inventory.skills.map((item, index) => ({item, kind:'skill', index})).concat(state.inventory.pets.map((item, index) => ({item, kind:'pet', index})));
    if (!all.length) return '<p class="setup-muted">暂无购买物品</p>';
    return all.map(entry => '<div class="shop-item"><div><strong>' + esc(entry.item.name) + '</strong><small>' + esc(entry.item.quality) + ' · 可卖 ' + Math.floor(itemCost(entry.item) / 2) + '金币</small></div><div><button type="button" class="tool-btn" data-action="equip" data-kind="' + entry.kind + '" data-index="' + entry.index + '">装备</button><button type="button" class="tool-btn" data-action="sell" data-kind="' + entry.kind + '" data-index="' + entry.index + '">出售</button></div></div>').join('');
  }

  function validateDraft(draft) {
    const errors = [];
    ['player', 'enemy'].forEach(side => {
      const cfg = draft[side];
      const pets = cfg.pets.filter(item => item.name);
      if (!pets.length) errors.push((side === 'player' ? '己方' : '敌方') + '至少需要1只灵宠');
      if (totalSlots(cfg.skills) > 10) errors.push((side === 'player' ? '己方' : '敌方') + '技能总格数超过10格');
      pets.forEach((pet, index) => {
        const realIndex = cfg.pets.indexOf(pet);
        if (!cfg.skills.some(skill => Number(skill.owner) === realIndex)) errors.push(pet.name + '未装备技能');
      });
      cfg.skills.forEach(skill => {
        const ownerIndex = Number(skill.owner);
        if (!cfg.pets[ownerIndex] || !cfg.pets[ownerIndex].name) errors.push(skill.name + '所属灵宠为空');
      });
    });
    return errors;
  }

  function setupChange(target) {
    const draft = state.setupDraft;
    const side = target.dataset.team;
    const value = target.type === 'number' ? Number(target.value) : target.value;
    if (target.dataset.kind === 'pet') draft[side].pets[Number(target.dataset.index)][target.dataset.field] = value;
    else if (target.dataset.kind === 'skill') draft[side].skills[Number(target.dataset.index)][target.dataset.field] = target.dataset.field === 'owner' ? Number(value) : value;
    else if (target.dataset.field) draft[side][target.dataset.field] = value;
    if (target.dataset.kind === 'pet' && target.dataset.field === 'name') renderSetup();
    if (target.dataset.kind === 'pet' && target.dataset.field === 'quality') renderSetup();
  }

  function openSetup() {
    state.setupDraft = clone(state.config);
    $('#setup-modal').hidden = false;
    renderSetup();
  }

  function closeSetup() {
    $('#setup-modal').hidden = true;
    state.setupDraft = null;
  }

  function buyItem(kind, index) {
    const item = state.shop[kind === 'skill' ? 'skills' : 'pets'][index];
    if (!item) return;
    const cost = itemCost(item);
    if (state.setupDraft.player.income < cost) {
      showToast('金币不足，无法购买', true);
      return;
    }
    state.setupDraft.player.income -= cost;
    state.config.player.income = state.setupDraft.player.income;
    state.inventory[kind === 'skill' ? 'skills' : 'pets'].push(clone(item));
    state.shop[kind === 'skill' ? 'skills' : 'pets'][index] = null;
    log('战前购买 ' + item.name + '（' + cost + '金币），剩余金币 ' + state.config.player.income + '。', 'trigger', 'SHOP');
    renderSetup();
  }

  function sellItem(kind, index) {
    const list = state.inventory[kind === 'skill' ? 'skills' : 'pets'];
    const item = list[index];
    if (!item) return;
    const refund = Math.floor(itemCost(item) / 2);
    list.splice(index, 1);
    state.setupDraft.player.income += refund;
    state.config.player.income = state.setupDraft.player.income;
    log('出售 ' + item.name + '，获得 ' + refund + '金币。', 'trigger', 'SHOP');
    renderSetup();
  }

  function equipItem(kind, index) {
    const list = state.inventory[kind === 'skill' ? 'skills' : 'pets'];
    const item = list[index];
    if (!item) return;
    if (kind === 'pet') {
      const slot = state.setupDraft.player.pets.findIndex(pet => !pet.name);
      if (slot < 0) { showToast('己方灵宠槽位已满', true); return; }
      state.setupDraft.player.pets[slot] = {name:item.name, quality:item.quality};
    } else {
      const slots = totalSlots(state.setupDraft.player.skills) + SIZE_SLOTS[sizeFrom(skillCatalog(item.name))];
      if (slots > 10) { showToast('技能格数超过10格', true); return; }
      const owner = state.setupDraft.player.pets.findIndex(pet => pet.name);
      if (owner < 0) { showToast('请先配置一只己方灵宠', true); return; }
      state.setupDraft.player.skills.push({name:item.name, quality:item.quality, owner});
    }
    list.splice(index, 1);
    renderSetup();
  }

  function refreshShop() {
    if (state.setupDraft.player.income < 2) { showToast('金币不足，无法刷新商店', true); return; }
    state.setupDraft.player.income -= 2;
    state.config.player.income = state.setupDraft.player.income;
    state.shop = makeShop(state.shop.seed + 1);
    renderSetup();
    log('商店刷新，消耗2金币；新物品与上一组不同。', 'trigger', 'SHOP');
  }

  function setupClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const side = target.dataset.team;
    const index = Number(target.dataset.index);
    if (action === 'add-skill') {
      state.setupDraft[side].skills.push({name:SKILL_CATALOG[0].name, quality:SKILL_CATALOG[0].tier || '青铜', owner:0});
      renderSetup();
    } else if (action === 'remove-skill') {
      state.setupDraft[side].skills.splice(index, 1);
      renderSetup();
    } else if (action === 'buy') buyItem(target.dataset.kind, index);
    else if (action === 'sell') sellItem(target.dataset.kind, index);
    else if (action === 'equip') equipItem(target.dataset.kind, index);
    else if (action === 'refresh-shop') refreshShop();
  }

  function applySetup() {
    const errors = validateDraft(state.setupDraft);
    if (errors.length) {
      $('#setup-validation').textContent = errors.join('；');
      $('#setup-validation').classList.add('setup-error');
      return;
    }
    $('#setup-validation').classList.remove('setup-error');
    buildFromConfig(state.setupDraft);
    closeSetup();
    showToast('配置已应用，战斗已重置');
  }

  function resetAll() {
    buildFromConfig(clone(defaultConfig));
    state.inventory = {skills: [], pets: []};
    log('已恢复默认测试队伍。', 'trigger', 'RESET');
    renderAll();
  }

  $('#step-btn').addEventListener('click', stepOnce);
  $('#run-btn').addEventListener('click', startOrPause);
  $('#auto-btn').addEventListener('click', toggleAuto);
  $('#reset-btn').addEventListener('click', resetAll);
  $('#config-btn').addEventListener('click', openSetup);
  $('#close-setup').addEventListener('click', closeSetup);
  $('#cancel-setup').addEventListener('click', closeSetup);
  $('#apply-setup').addEventListener('click', applySetup);
  $('#setup-body').addEventListener('change', event => setupChange(event.target));
  $('#setup-body').addEventListener('input', event => {
    if (event.target.type === 'number') setupChange(event.target);
  });
  $('#setup-body').addEventListener('click', setupClick);
  $('#clear-log').addEventListener('click', () => {
    state.logs = [];
    state.events = 0;
    state.damage = 0;
    state.roundEvents = 0;
    renderLog();
  });
  $('#setup-modal').addEventListener('click', event => {
    if (event.target.id === 'setup-modal') closeSetup();
  });

  buildFromConfig(clone(defaultConfig), true);
  log('战斗模拟器已就绪：先调整部署与技能顺序，再点击开始战斗。', 'trigger', 'SYSTEM');
  renderAll();
})();
