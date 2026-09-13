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
  const TARGET_SIDES = ['敌方', '友方', '自身', '自身与友方', '自身与敌方'];
  const RANGE_CONDITIONS = ['生命最低', '生命最高', '攻击最高', '防御最低', '防御最高', '最前方', '最后方', '带有点燃', '带有剧毒', '带有霜冻', '带有护盾', '随机1个目标', '随机2个目标', '随机3个目标'];

  function normalizeAttackRange(raw) {
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (error) { return null; }
    }
    if (!raw || typeof raw !== 'object' || Number(raw.size) !== 9 || !raw.cells) return null;
    const cleanCells = list => {
      const seen = new Set();
      return (Array.isArray(list) ? list : []).filter(cell => {
        if (!Array.isArray(cell) || cell.length !== 2) return false;
        const row = Number(cell[0]);
        const col = Number(cell[1]);
        const key = row + ',' + col;
        if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8 || key === '4,4' || seen.has(key)) return false;
        cell[0] = row;
        cell[1] = col;
        seen.add(key);
        return true;
      });
    };
    return {
      version: 1,
      size: 9,
      caster: [4, 4],
      facing: '上',
      targetSide: TARGET_SIDES.includes(raw.targetSide) ? raw.targetSide : '敌方',
      targetMode: ['单目标', '多目标', '范围内全体'].includes(raw.targetMode) ? raw.targetMode : '单目标',
      condition: RANGE_CONDITIONS.includes(raw.condition) ? raw.condition : '',
      cells: {range: cleanCells(clone(raw.cells.range || [])), hits: cleanCells(clone(raw.cells.hits || []))}
    };
  }

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
      role: f.套路定位 || f.套路 || '',
      fields: f,
      variants: n.variants || []
    };
  });
  const graphSkills = graphNodes.filter(n => n.kind === '技能').map(n => {
    const f = n.record && n.record.fields ? n.record.fields : {};
    return {
      name: n.name,
      tier: n.record && n.record.tier ? n.record.tier : '青铜',
      ability: f.能力 || '',
      range: f['射程/目标'] || '正前方第一个敌人',
      rangeConfig: normalizeAttackRange(f['攻击范围配置']),
      effect: f.效果 || '暂无效果说明',
      tags: f.词条 || '',
      role: f.定位 || '',
      combo: f.套路 || '',
      fields: f,
      variants: n.variants || []
    };
  });
  const PET_CATALOG = graphPets.concat(fallbackPets.filter(item => !graphPets.some(p => p.name === item.name)));
  const SKILL_CATALOG = graphSkills.concat(fallbackSkills.filter(item => !graphSkills.some(s => s.name === item.name)));
  const TEAM_PRESETS = window.ATLAS_DATA && Array.isArray(window.ATLAS_DATA.teamPresets) ? window.ATLAS_DATA.teamPresets : [];
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
  const qualityVariant = (catalog, quality) => Array.isArray(catalog && catalog.variants)
    ? catalog.variants.find(item => item.tier === quality) || null
    : null;
  const qualityField = (catalog, quality, key, fallback) => {
    const variant = qualityVariant(catalog, quality);
    const variantValue = variant && variant.fields ? variant.fields[key] : null;
    if (variantValue !== null && variantValue !== undefined && variantValue !== '') return variantValue;
    const baseValue = catalog && catalog.fields ? catalog.fields[key] : null;
    if (baseValue !== null && baseValue !== undefined && baseValue !== '') return baseValue;
    return fallback;
  };
  const qualityScale = (catalog, quality) => qualityVariant(catalog, quality) ? 1 : Math.pow(2, qualityRank(quality) - qualityRank(catalog && catalog.tier));
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
  const numberFor = (text, fallback) => parseFirst(text, [/攻击(\d+)/, /伤害(\d+)/, /点燃(\d+)/, /淬毒(\d+)/, /覆雪(\d+)/, /结霜(\d+)/, /治疗(\d+)/, /护甲(\d+)/], fallback);
  const VALUE_LABELS = {damage: '伤害', burn: '点燃', poison: '淬毒', frost: '覆雪', shield: '护盾', heal: '治疗', regen: '再生'};
  const VALUE_PATTERN = /(攻击|点燃|淬毒|覆雪|结霜|护盾|治疗|再生)\s*(\d+)(\+?)|(\d+)\s*伤害/g;
  function parseValueEntries(text) {
    const entries = [];
    const source = String(text || '');
    let match;
    while ((match = VALUE_PATTERN.exec(source))) {
      const label = match[1] || '伤害';
      const kind = label === '攻击' || label === '伤害' ? 'damage' : ({点燃:'burn', 淬毒:'poison', 覆雪:'frost', 结霜:'frost', 护盾:'shield', 治疗:'heal', 再生:'regen'}[label]);
      entries.push({kind, label: VALUE_LABELS[kind], base: Number(match[2] || match[4] || 0), plus: !!match[3]});
    }
    VALUE_PATTERN.lastIndex = 0;
    return entries;
  }
  function parseSimpleEffectRules(text) {
    const rules = [];
    const pattern = /【(战斗开始时|回合开始|回合结束|被攻击时|使用时)】(对目标和自身|对自身|对目标|对我方全体|对敌方全体)：([^。\n]+)/g;
    let match;
    while ((match = pattern.exec(String(text || '')))) {
      const actions = match[3].split('、').map(part => part.trim()).map(part => {
        const action = part.match(/^(?:施加)?(充能|弹药|拖拽|击退|爆能|倒计时|多重触发|伤害|治疗|护盾|再生|点燃|剧毒|霜冻|亢奋|衰弱)\s*(\d+)?$/);
        return action ? {type: action[1], value: Math.max(1, Number(action[2]) || 1)} : null;
      }).filter(Boolean);
      if (actions.length) rules.push({id: rules.length, timing: match[1], scope: match[2], actions});
    }
    return rules;
  }
  function stripSimpleEffectRules(text) {
    return String(text || '').replace(/【(?:战斗开始时|回合开始|回合结束|被攻击时|使用时)】(?:对目标和自身|对自身|对目标|对我方全体|对敌方全体)：[^。\n]+。?/g, ' ');
  }
  const isAttackSkill = skill => {
    const legacy = (skill && skill.ability || '') + ' ' + (skill && (skill.legacyEffect || stripSimpleEffectRules(skill.effect)) || '');
    const simpleAttack = (skill && skill.simpleRules || []).some(rule => rule.timing === '使用时' && rule.actions.some(action => /伤害|点燃|剧毒|霜冻|拖拽|击退|衰弱/.test(action.type)));
    return simpleAttack || /攻击\d|伤害\d|点燃|淬毒|覆雪|结霜|霜冻|造成伤害/.test(legacy);
  };
  const PASSIVE_SKILL_NAMES = new Set(['连抓', '锋锐鳞片', '饮血倒刺']);
  const isPassiveSkill = skill => !!skill && (PASSIVE_SKILL_NAMES.has(skill.name) || /被动/.test((skill.legacyEffect || stripSimpleEffectRules(skill.effect)) + (skill.type || '')) || ((skill.simpleRules || []).length > 0 && !(skill.simpleRules || []).some(rule => rule.timing === '使用时') && !isAttackSkill(skill)));
  const isMartialSkill = skill => !!skill && !isPassiveSkill(skill) && /武技/.test((skill.type || '') + ' ' + (skill.tags || ''));
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

  function configFromPreset(preset) {
    return {
      level: 1,
      income: 20,
      history: 0,
      heroHp: Number(preset.heroHp) || 660,
      pets: clone(preset.pets).slice(0, 4),
      skills: clone(preset.skills).map(skill => ({name:skill.name, quality:skill.quality, owner:Number(skill.owner)}))
    };
  }

  const state = {
    round: 1,
    action: 0,
    side: 'player',
    phase: 'position',
    running: false,
    auto: false,
    selectedId: 'p1',
    selectedSkill: null,
    skillInfoId: null,
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
    setupDraft: null,
    configInfo: null,
    setupSkillFilters: {player: '全部', enemy: '全部'}
  };

  function createHero(config, side) {
    const level = Math.max(1, Number(config.level) || 1);
    const maxHp = Math.max(1, Number(config.heroHp) || 100 + (level - 1) * 10);
    return {side, level, gold: Math.max(0, Number(config.income) || 0), history: Math.max(0, Number(config.history) || 0), hp: maxHp, maxHp, skillDamage: 0, skillDamageGrowth: 0, points: 0};
  }

  function createPet(item, side, index) {
    const cat = petCatalog(item.name);
    const quality = item.quality || cat.tier || '青铜';
    const scale = qualityScale(cat, quality);
    const hp = Math.max(1, Math.round((Number(qualityField(cat, quality, 'hp', cat.hp)) || 0) * scale));
    const atk = Math.max(0, Math.round((Number(qualityField(cat, quality, '攻击', cat.atk)) || 0) * scale));
    const def = Math.max(0, Math.round((Number(qualityField(cat, quality, '防御', cat.def)) || 0) * scale));
    const effect = String(qualityField(cat, quality, '一句话效果', cat.effect) || '暂无简述');
    const tags = String(qualityField(cat, quality, '词条', cat.tags) || '');
    const abilityEnergyCost = parseFirst(effect, [/消耗\s*(\d+)\s*点能量/], 0);
    const abilityCountdownMax = parseFirst(effect, [/倒计时\s*(\d+)/], 0);
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
      effect,
      tags,
      abilityEnergyCost,
      abilityCountdownMax,
      energy: 0, maxEnergy: 12,
      shield: 0,
      burn: 0,
      poison: 0,
      frost: 0,
      excited: 0,
      weak: 0,
      paralyze: 0,
      silence: 0,
      rooted: 0,
      roundSkillDamage: 0,
      roundIgnite: 0,
      skillDamage: 0,
      regen: 0,
      critBonus: 0,
      permanentAtk: 0,
      permanentDef: 0,
      skillUses: 0,
      firstMartialReady: true,
      passiveCountdown: abilityCountdownMax,
      abilityCountdown: abilityCountdownMax,
      reviveAt: null,
      dead: false,
      pos: side === 'player' ? [ROWS - 1, Math.min(COLS - 1, index)] : [0, Math.min(COLS - 1, index)]
    };
  }

  function createSkill(item, side, index, pets) {
    const cat = skillCatalog(item.name);
    const quality = item.quality || cat.tier || '青铜';
    const scale = qualityScale(cat, quality);
    const ability = String(qualityField(cat, quality, '能力', cat.ability) || '');
    const range = String(qualityField(cat, quality, '射程/目标', cat.range) || '正前方第一个敌人');
    const rangeConfig = normalizeAttackRange(qualityField(cat, quality, '攻击范围配置', cat.rangeConfig));
    const effect = String(qualityField(cat, quality, '效果', cat.effect) || '暂无效果说明');
    const tagsText = String(qualityField(cat, quality, '词条', cat.tags) || '');
    const role = String(qualityField(cat, quality, '定位', cat.role) || cat.role || '');
    const combo = String(qualityField(cat, quality, '套路', cat.combo) || cat.combo || '');
    const size = sizeFrom({tags: tagsText, effect});
    const baseTier = cat.tier || '青铜';
    const simpleRules = parseSimpleEffectRules(effect);
    const legacyEffect = stripSimpleEffectRules(effect);
    const effectText = legacyEffect + ' ' + tagsText;
    const ammoMax = parseFirst(effectText, [/弹药\s*(\d+)/], 0);
    const baseCountdown = parseFirst(effectText, [/倒计时\s*(\d+)/], 0);
    const startCountdown = parseFirst(effectText, [/战斗开始时进入倒计时\s*(\d+)/], baseCountdown);
    const explosionCost = parseFirst(effectText, [/爆能\s*(\d+)/], 0);
    const countdownIndex = effectText.indexOf('倒计时');
    const explosionIndex = effectText.indexOf('爆能');
    const beforeCountdown = countdownIndex >= 0 ? effectText.slice(0, countdownIndex) : effectText;
    const hasIndependentEffect = /造成伤害|点燃|淬毒|覆雪|结霜|霜冻|护盾|护甲|治疗|再生|获得|赋予|施加|充能|装填|提升|攻击/.test(beforeCountdown);
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
      type: (tagsText.split('，')[1] || tagsText.split(',')[1] || '技能'),
      ability: ability || String(effect || '效果技能').split('；')[0].split('。')[0] || '效果技能',
      range,
      rangeConfig,
      effect,
      legacyEffect,
      simpleRules,
      simpleRuleState: {},
      valueEntries: parseValueEntries(ability),
      tags: tagsText.split(/[，,、\s]+/).filter(Boolean),
      role: role || (/(攻击|伤害|点燃|淬毒|覆雪|结霜|霜冻)/.test(ability + effect) ? '输出技能' : '体系运转'),
      combo,
      ammoMax,
      ammo: ammoMax,
      baseCountdown,
      countdownStart: startCountdown || baseCountdown,
      countdown: explosionIndex >= 0 && countdownIndex >= 0 && explosionIndex < countdownIndex ? 0 : (startCountdown || baseCountdown),
      explosionCost,
      explosionBeforeCountdown: explosionIndex >= 0 && countdownIndex >= 0 && explosionIndex < countdownIndex,
      countdownBeforeExplosion: explosionIndex >= 0 && countdownIndex >= 0 && countdownIndex < explosionIndex,
      countdownTailOnly: !!baseCountdown && !hasIndependentEffect,
      explosionTailOnly: !!explosionCost && !/造成伤害|点燃|淬毒|覆雪|结霜|霜冻|护盾|护甲|治疗|再生|获得|赋予|施加|充能|装填|提升|攻击/.test(explosionIndex >= 0 ? effectText.slice(0, explosionIndex) : ''),
      explosionAvailable: true,
      scale,
      damageBonus: 0,
      burnBonus: 0,
      poisonBonus: 0,
      frostBonus: 0,
      shieldBonus: 0,
      healBonus: 0,
      regenBonus: 0,
      critBonus: 0,
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
    state.skillInfoId = null;
    state.configInfo = null;
    state.playerCursor = 0;
    state.enemyCursor = 0;
    state.damage = 0;
    state.events = 0;
    state.roundEvents = 0;
    state.logs = [];
    state.trace = [];
    state.winner = null;
    state.shop = makeShop(0);
    battleStartEffects();
    if (!silent) log('已应用新配置，战斗重置为第1回合的部署阶段。', 'trigger', 'CONFIG');
    renderAll();
  }

  function placeInitialUnits(pets, side) {
    const row = side === 'player' ? ROWS - 1 : 0;
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
    if (unit.frost > 0) tags.push('霜冻 ' + unit.frost);
    if (unit.shield > 0) tags.push('护盾 ' + unit.shield);
    if (unit.excited > 0) tags.push('亢奋 ' + unit.excited);
    if (unit.weak > 0) tags.push('衰弱 ' + unit.weak);
    if (unit.regen > 0) tags.push('再生 ' + unit.regen);
    if (unit.paralyze > 0) tags.push('麻痹 ' + unit.paralyze);
    if (unit.silence > 0) tags.push('封刃');
    if (unit.rooted > 0) tags.push('禁足');
    return tags.length ? tags : ['无异常状态'];
  }

  function phaseText() {
    const map = {
      position: '部署与走位',
      'start-resolving': '回合开始结算',
      resolving: '己方技能结算',
      'enemy-position': '敌方自动走位',
      'enemy-resolving': '敌方技能结算',
      'end-resolving': '回合结束结算',
      finished: '战斗结束'
    };
    return map[state.phase] || state.phase;
  }

  function renderFlow() {
    const steps = [
      ['start-resolving', '回合开始'],
      ['position', '部署/走位'],
      ['resolving', '技能结算'],
      ['end-resolving', '回合结束'],
      ['enemy-position', '对手走位'],
      ['enemy-resolving', '对手技能']
    ];
    const current = state.phase;
    const html = steps.map(item => {
      let cls = '';
      if (item[0] === current) cls = 'active';
      if ((state.side === 'enemy' && ['enemy-position', 'enemy-resolving'].includes(item[0])) || (current === 'finished' && item[0] === 'end-resolving')) cls = 'active';
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

  function editorCellForTarget(owner, target) {
    const rowDelta = target.pos[0] - owner.pos[0];
    const colDelta = target.pos[1] - owner.pos[1];
    return owner.side === 'player' ? [4 + rowDelta, 4 + colDelta] : [4 - rowDelta, 4 - colDelta];
  }

  function stableTargetOrder(list) {
    return list.slice().sort((a, b) => a.pos[0] - b.pos[0] || a.pos[1] - b.pos[1] || a.id.localeCompare(b.id));
  }

  function pseudoRandomTargets(list, skill, count) {
    const seed = `${state.round}:${state.action}:${skill.id}`;
    const score = unit => {
      const text = seed + ':' + unit.id;
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
      return hash >>> 0;
    };
    return list.slice().sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id)).slice(0, count);
  }

  function targetsForEffectScope(skill, owner, selectedTargets, keywords) {
    const source = String(skill && (skill.legacyEffect || stripSimpleEffectRules(skill.effect)) || '');
    const relevant = source.split(/[，,；;。]|然后/).map(part => part.trim()).filter(part => part && keywords.some(keyword => part.includes(keyword)));
    const chosen = (selectedTargets || []).filter(Boolean);
    const nonSelf = chosen.filter(target => target.id !== owner.id);
    const fallback = skill && skill.rangeConfig && skill.rangeConfig.targetSide === '自身'
      ? [owner]
      : (nonSelf.length ? nonSelf : chosen);
    if (!relevant.length) return fallback;
    let explicit = false;
    let includeSelf = false;
    let includeSelected = false;
    let includeAllAllies = false;
    let includeAllEnemies = false;
    relevant.forEach(clause => {
      const selfAndTarget = /目标(?:和|与|及)自身|自身(?:和|与|及)目标/.test(clause);
      if (selfAndTarget) {
        explicit = true;
        includeSelf = true;
        includeSelected = true;
      }
      if (/获得/.test(clause) && !/目标|伤害来源|友方|我方|敌方|敌人/.test(clause)) {
        explicit = true;
        includeSelf = true;
      }
      if (/我方全体|所有我方|所有友方/.test(clause)) {
        explicit = true;
        includeAllAllies = true;
      } else if (/敌方全体|所有敌方|所有敌人/.test(clause)) {
        explicit = true;
        includeAllEnemies = true;
      } else {
        if (/自身/.test(clause)) {
          explicit = true;
          includeSelf = true;
        }
        if (/目标|伤害来源|友方|我方|敌方|敌人/.test(clause)) {
          explicit = true;
          includeSelected = true;
        }
      }
    });
    if (!explicit) return fallback;
    const scoped = [];
    if (includeSelf) scoped.push(owner);
    if (includeSelected) scoped.push(...chosen.filter(target => target.id !== owner.id));
    if (includeAllAllies) scoped.push(...unitsOf(owner.side, true));
    if (includeAllEnemies) scoped.push(...unitsOf(opponentSide(owner.side), true));
    return Array.from(new Map(scoped.filter(target => target && !target.dead && target.hp > 0).map(target => [target.id, target])).values());
  }

  function structuredTargetsFor(skill, owner) {
    const config = skill.rangeConfig;
    const includesSelf = config.targetSide === '自身' || config.targetSide.startsWith('自身与');
    if (config.targetSide === '自身') return owner.dead || owner.hp <= 0 ? [] : [owner];
    let candidates = allUnits().filter(target => target.id !== owner.id && validTarget(skill, owner, target, true));
    candidates = stableTargetOrder(candidates);
    const condition = config.condition;
    const keepExtreme = (getter, highest) => {
      if (!candidates.length) return;
      const values = candidates.map(getter);
      const extreme = highest ? Math.max(...values) : Math.min(...values);
      candidates = candidates.filter(target => getter(target) === extreme);
    };
    if (condition === '生命最低') keepExtreme(target => target.hp, false);
    else if (condition === '生命最高') keepExtreme(target => target.hp, true);
    else if (condition === '攻击最高') keepExtreme(target => target.atk, true);
    else if (condition === '防御最低') keepExtreme(target => target.def, false);
    else if (condition === '防御最高') keepExtreme(target => target.def, true);
    else if (condition === '最前方') keepExtreme(target => target.side === 'player' ? target.pos[0] : -target.pos[0], false);
    else if (condition === '最后方') keepExtreme(target => target.side === 'player' ? target.pos[0] : -target.pos[0], true);
    else if (condition === '带有点燃') candidates = candidates.filter(target => target.burn > 0);
    else if (condition === '带有剧毒') candidates = candidates.filter(target => target.poison > 0);
    else if (condition === '带有霜冻') candidates = candidates.filter(target => target.frost > 0);
    else if (condition === '带有护盾') candidates = candidates.filter(target => target.shield > 0);
    const randomMatch = condition.match(/^随机([123])个目标$/);
    if (randomMatch) candidates = pseudoRandomTargets(candidates, skill, Number(randomMatch[1]));
    else if (config.targetMode === '单目标') candidates = candidates.slice(0, 1);
    return includesSelf ? [owner, ...candidates] : candidates;
  }

  function validTarget(skill, owner, target, includeAlly) {
    if (!skill || !owner || !target || target.dead || target.hp <= 0) return false;
    if (skill.rangeConfig) {
      const targetSide = skill.rangeConfig.targetSide;
      const includesSelf = targetSide === '自身' || targetSide.startsWith('自身与');
      if (target.id === owner.id) return includesSelf;
      if (targetSide === '自身') return false;
      const wantsAlly = targetSide === '友方' || targetSide === '自身与友方';
      if (wantsAlly ? !sameSide(owner, target) : sameSide(owner, target)) return false;
      const point = editorCellForTarget(owner, target);
      if (point[0] < 0 || point[0] > 8 || point[1] < 0 || point[1] > 8) return false;
      const bucket = skill.rangeConfig.condition ? skill.rangeConfig.cells.range : skill.rangeConfig.cells.hits;
      return bucket.some(cell => cell[0] === point[0] && cell[1] === point[1]);
    }
    const enemy = !sameSide(owner, target);
    if (!includeAlly && !enemy) return false;
    const text = skill.range || '';
    if (text.includes('自身') && target.id === owner.id) return true;
    if (text.includes('自身') && target.id !== owner.id && !enemy) return false;
    if (text.includes('全体')) return true;
    if (includeAlly && /随机友方|生命最低的友方|我方|友方|所有友方/.test(text)) {
      if (text.includes('两步')) {
        const dr = Math.abs(owner.pos[0] - target.pos[0]);
        const dc = Math.abs(owner.pos[1] - target.pos[1]);
        return dr + dc <= 2;
      }
      return true;
    }
    if (text === '技能' || text.includes('技能')) return false;
    if (text.includes('距离最近')) return true;
    const dr = Math.abs(owner.pos[0] - target.pos[0]);
    const dc = Math.abs(owner.pos[1] - target.pos[1]);
    const distance = dr + dc;
    const forward = owner.side === 'player' ? owner.pos[0] - target.pos[0] : target.pos[0] - owner.pos[0];
    const lateral = dc;
    const area = text.match(/(\d+|一|二|两|三|四|五|六|七|八|九|十)步范围/);
    if (area) {
      const distanceMap = {一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10};
      const maxDistance = /^\d+$/.test(area[1]) ? Number(area[1]) : distanceMap[area[1]];
      return distance <= maxDistance;
    }
    if (text.includes('第一二格及其左右相邻格')) return forward >= 1 && forward <= 2 && lateral <= 1;
    if (text.includes('第一格及其左右两格')) return forward === 1 && lateral <= 1;
    if (text.includes('第二格及其左右两格')) return forward === 2 && lateral <= 1;
    if (text.includes('第二格或第三格') || text.includes('第二格和第三格')) return (forward === 2 || forward === 3) && lateral === 0;
    if (text.includes('直线')) return lateral === 0 && forward > 0 && (!text.includes('范围') || forward <= 5);
    if (text.includes('三格中最远')) return lateral === 0 && forward >= 1 && forward <= 3;
    if (text.includes('第三格')) return forward === 3 && lateral === 0;
    if (text.includes('第二格')) return forward === 2 && lateral === 0;
    if (text.includes('第一格') || text.includes('一格')) return forward === 1 && lateral === 0;
    return forward === 1 && lateral === 0;
  }

  function skillIsSupport(skill) {
    const text = (skill.ability || '') + (skill.legacyEffect || stripSimpleEffectRules(skill.effect)) + (skill.range || '');
    const simpleSupport = (skill.simpleRules || []).some(rule => rule.timing === '使用时' && rule.actions.some(action => /充能|弹药|治疗|护盾|再生|亢奋/.test(action.type)));
    return (simpleSupport || /治疗|护甲|护盾|能量|装填|亢奋|攻击\+|防御\+|随机友方|我方/.test(text)) && !isAttackSkill(skill);
  }

  function targetsFor(skill, owner, side) {
    if (!owner) return [];
    if (isPassiveSkill(skill)) return [];
    if (skill.rangeConfig) return structuredTargetsFor(skill, owner);
    const allies = unitsOf(side, true);
    const enemies = unitsOf(opponentSide(side), true);
    if ((skill.range || '').includes('自身') && !isAttackSkill(skill)) return [owner];
    if (skill.range === '技能' || skill.range.includes('技能')) return [];
    if (skillIsSupport(skill)) {
      const validAllies = allies.filter(target => validTarget(skill, owner, target, true));
      if (!validAllies.length) return [];
      if (skill.name === '双盾') {
        const strongest = validAllies.slice().sort((a, b) => b.atk - a.atk || a.id.localeCompare(b.id))[0];
        const lowest = validAllies.slice().sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0];
        return [strongest, lowest].filter((item, index, list) => item && list.findIndex(other => other.id === item.id) === index);
      }
      return /所有友方|全体/.test(skill.range + skill.effect) ? validAllies : [validAllies.sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0]];
    }
    const validEnemies = enemies.filter(target => validTarget(skill, owner, target, false));
    const ordered = validEnemies.sort((a, b) => {
      if (skill.range.includes('最远')) {
        const da = Math.abs(owner.pos[0] - a.pos[0]) + Math.abs(owner.pos[1] - a.pos[1]);
        const db = Math.abs(owner.pos[0] - b.pos[0]) + Math.abs(owner.pos[1] - b.pos[1]);
        return db - da || a.hp - b.hp || a.id.localeCompare(b.id);
      }
      if (skill.range.includes('距离最近') || skill.range.includes('或')) {
        const da = Math.abs(owner.pos[0] - a.pos[0]) + Math.abs(owner.pos[1] - a.pos[1]);
        const db = Math.abs(owner.pos[0] - b.pos[0]) + Math.abs(owner.pos[1] - b.pos[1]);
        return da - db || a.hp - b.hp || a.id.localeCompare(b.id);
      }
      if (skill.name === '钝化' && skill.range.includes('攻击最高')) return b.atk - a.atk || a.hp - b.hp || a.id.localeCompare(b.id);
      return a.hp - b.hp || a.id.localeCompare(b.id);
    });
    if (skill.name === '钝化' && skill.range.includes('攻击最高')) return ordered.slice(0, 1);
    const isMultiTarget = /(范围|全体|所有敌人|第一二格|第二和第三格|左右两格)/.test(skill.range + skill.effect);
    return ordered.slice(0, isMultiTarget ? 99 : 1);
  }

  function skillAvailability(skill) {
    const owner = ownerOf(skill);
    if (!owner) return '未分配';
    if (owner.dead || owner.hp <= 0) return '所属灵宠阵亡';
    if (isPassiveSkill(skill)) return '被动触发';
    if (skill.ammoMax && skill.ammo <= 0) return '弹药耗尽';
    if ((skill.rangeConfig || isAttackSkill(skill)) && !targetsFor(skill, owner, skill.side).length) return '范围内无目标';
    if (owner.silence > 0 && isAttackSkill(skill)) return '封刃中';
    return '可用';
  }

  function explosionLabel(skill) {
    if (!skill || !skill.explosionCost) return '';
    const owner = ownerOf(skill);
    return '爆能（' + (owner ? owner.energy : 0) + ' / ' + skill.explosionCost + '）';
  }

  function skillById(id) {
    return state.playerSkills.concat(state.enemySkills).find(skill => skill.id === id) || null;
  }

  function valueEntriesOf(skill) {
    return skill && Array.isArray(skill.valueEntries) ? skill.valueEntries : parseValueEntries(skill && skill.ability);
  }

  function valueBonusParts(skill, owner, kind) {
    const parts = [];
    const add = (label, value) => {
      const amount = Math.round(Number(value) || 0);
      if (amount) parts.push({label, value: amount});
    };
    const currentTeam = skill && !skill.preview ? team(skill.side) : null;
    if (kind === 'damage') {
      add('本方技能伤害提升', currentTeam && currentTeam.skillDamage);
      add('灵宠本回合伤害提升', skill && !skill.preview && owner && owner.roundSkillDamage);
      add('灵宠技能伤害提升', skill && !skill.preview && owner && owner.skillDamage);
      add('技能自身伤害提升', skill && !skill.preview && skill.damageBonus);
    }
    if (kind === 'burn') {
      add('本回合点燃提升', skill && !skill.preview && owner && owner.roundIgnite);
      add('技能自身点燃提升', skill && !skill.preview && skill.burnBonus);
    }
    if (kind === 'poison') add('技能自身淬毒提升', skill && skill.poisonBonus);
    if (kind === 'frost') add('技能自身覆雪提升', skill && skill.frostBonus);
    if (kind === 'shield') add('技能自身护盾提升', skill && skill.shieldBonus);
    if (kind === 'heal') add('技能自身治疗提升', skill && skill.healBonus);
    if (kind === 'regen') add('技能自身再生提升', skill && skill.regenBonus);
    return parts;
  }

  function valueBreakdown(skill, owner, entry) {
    const scale = skill && skill.scale ? skill.scale : 1;
    const base = Math.round(entry.base * scale);
    let attack = 0;
    if (entry.plus && owner) {
      if (entry.kind === 'damage') attack = Math.max(0, Math.round(owner.atk));
      else if (entry.kind === 'burn' || entry.kind === 'poison' || entry.kind === 'frost') {
        const ratio = entry.kind === 'burn' || entry.kind === 'poison' || entry.kind === 'frost'
          ? (skill.size === 'long' ? 3 : skill.size === 'medium' ? 2 : 1)
          : 0;
        attack = owner.atk > 0 ? Math.ceil(owner.atk * ratio / 4) : 0;
      } else attack = Math.max(0, Math.round(owner.atk));
    }
    const bonuses = valueBonusParts(skill, owner, entry.kind);
    const value = Math.max((entry.kind === 'burn' || entry.kind === 'poison' || entry.kind === 'frost') ? 1 : 0, base + attack + bonuses.reduce((sum, part) => sum + part.value, 0));
    return {kind: entry.kind, label: entry.label, base, attack, bonuses, value, plus: entry.plus};
  }

  function skillValueBreakdowns(skill, owner) {
    return valueEntriesOf(skill).map(entry => valueBreakdown(skill, owner, entry));
  }

  function primaryValueBreakdown(skill, owner, kind) {
    const values = skillValueBreakdowns(skill, owner);
    return values.find(item => item.kind === kind) || values[0] || {kind, label: VALUE_LABELS[kind] || '数值', base: 0, attack: 0, bonuses: [], value: 0, plus: false};
  }

  function valueSummary(skill, owner) {
    return skillValueBreakdowns(skill, owner).map(item => item.label + ' ' + item.value).join(' · ') || '无直接数值';
  }

  function valueFormula(item) {
    const parts = ['技能基础 ' + item.base];
    if (item.attack) parts.push('灵宠攻击 ' + item.attack + (item.kind === 'burn' || item.kind === 'poison' || item.kind === 'frost' ? '（按篇幅比例）' : ''));
    item.bonuses.forEach(part => parts.push(part.label + ' ' + (part.value > 0 ? '+' : '') + part.value));
    return parts.join(' + ') + ' = ' + item.value;
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
          const targetSide = selectedSkill.rangeConfig && selectedSkill.rangeConfig.targetSide;
          const fakeSide = targetSide === '友方' || targetSide === '自身与友方' ? owner.side : opponentSide(owner.side);
          const fake = {id:'cell-' + row + '-' + col, side: fakeSide, hp:1, dead:false, pos:[row, col]};
          if (validTarget(selectedSkill, owner, fake, !!selectedSkill.rangeConfig)) cells.get(row + ',' + col).classList.add('range');
        }
      }
    }

    allUnits().forEach(unit => {
      if (unit.dead) return;
      const cell = cells.get(unit.pos[0] + ',' + unit.pos[1]);
      if (!cell) return;
      const node = document.createElement('div');
      node.className = 'unit ' + (unit.side === 'enemy' ? 'enemy facing-down' : 'ally facing-up') + (unit.id === state.selectedId ? ' selected' : '');
      node.dataset.id = unit.id;
      const hpPct = Math.max(0, Math.min(100, Math.round(unit.hp / unit.maxHp * 100)));
      const energy = unit.energy > 0 ? '⚡' + unit.energy : '';
      const status = stateTags(unit).join(' · ');
      node.innerHTML =
        '<span class="unit-direction" aria-hidden="true">' + (unit.side === 'enemy' ? '↓' : '↑') + '</span>' +
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
      const highlightedTargets = selectedSkill.rangeConfig
        ? structuredTargetsFor(selectedSkill, owner)
        : allUnits().filter(unit => validTarget(selectedSkill, owner, unit, false));
      highlightedTargets.forEach(unit => {
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
      const availability = skillAvailability(skill);
      const locked = availability !== '可用' || !owner || state.phase !== 'position' && state.phase !== 'resolving';
      card.className = 'skill-card ' + skill.size + (state.selectedSkill && state.selectedSkill.id === skill.id ? ' active-skill' : '') + (locked ? ' skill-locked' : '');
      card.draggable = state.phase === 'position';
      card.dataset.id = skill.id;
      const ammo = skill.ammoMax ? skill.ammo + ' / ' + skill.ammoMax : '—';
      const cd = skill.baseCountdown ? skill.countdown + ' / ' + skill.baseCountdown : '—';
      const explosion = explosionLabel(skill);
      const role = /攻击|伤害|点燃|淬毒|覆雪|结霜|霜冻/.test(skill.ability + skill.effect) ? '主要输出' : /能量|装填|治疗|护甲|亢奋|防御/.test(skill.ability + skill.effect) ? '启动/扳机' : '体系运转';
      const actualValues = valueSummary(skill, owner);
      card.innerHTML =
        '<div class="skill-card-top"><div><div class="skill-name">' + esc(skill.name) + '</div><div class="skill-owner">' + esc(owner ? owner.name : '未分配') + '</div></div><span class="skill-type">' + esc(skill.quality) + '</span></div>' +
        '<div class="skill-actual-values"><span>当前实际数值</span><strong>' + esc(actualValues) + '</strong></div>' +
        '<div class="skill-ability"><span>原始能力</span> ' + esc(skill.ability || '效果技能') + '</div>' +
        '<div class="skill-meta"><div class="meta-item">能力<b>' + esc(skill.ability || '效果') + '</b></div><div class="meta-item">范围<b>' + esc(skill.range) + '</b></div><div class="meta-item">弹药<b class="ammo">' + esc(ammo) + '</b></div><div class="meta-item">倒计时<b class="countdown">' + esc(cd) + '</b></div></div>' +
        (explosion ? '<div class="skill-explosion">' + esc(explosion) + '</div>' : '') +
        '<div class="skill-footer"><span>' + (index + 1) + ' · ' + SIZE_LABEL[skill.size] + ' · ' + skill.slots + '格</span><span class="skill-availability">' + esc(role + ' · ' + availability) + '</span></div>';
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
      const valueDetails = skillValueBreakdowns(skill, owner);
      const valueHtml = valueDetails.length
        ? '<div class="detail-label">当前实际数值与构成</div><div class="value-breakdown-list">' + valueDetails.map(item => '<div class="value-breakdown"><div><span>' + esc(item.label) + '</span><strong>' + item.value + '</strong></div><p>' + esc(valueFormula(item)) + '</p></div>').join('') + '</div>'
        : '';
      detail.innerHTML =
        '<div class="focus-card"><div class="focus-top"><div class="focus-icon skill">' + esc(skill.name.slice(0, 1)) + '</div><div><div class="focus-name">' + esc(skill.name) + '</div><div class="focus-sub">' + esc(skill.quality) + ' · ' + esc(SIZE_LABEL[skill.size]) + ' · 所属 ' + esc(owner ? owner.name : '未分配') + '</div></div></div><p class="focus-effect">' + esc(skill.effect) + '</p></div>' +
        valueHtml +
        '<div class="detail-label">基础信息</div><div class="stat-grid"><div class="stat-box"><span>能力</span><strong>' + esc(skill.ability || '效果') + '</strong></div><div class="stat-box"><span>攻击范围</span><strong>' + esc(skill.range) + '</strong></div><div class="stat-box"><span>技能格数</span><strong>' + skill.slots + ' 格</strong></div><div class="stat-box"><span>资源</span><strong>' + esc(skill.ammoMax ? '弹药 ' + skill.ammo + '/' + skill.ammoMax : skill.baseCountdown ? '倒计时 ' + skill.countdown + '/' + skill.baseCountdown : '无') + '</strong></div></div>' +
        '<div class="detail-label">标签</div><div class="tag-row">' + (skill.tags.length ? skill.tags : ['技能']).map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '</div>' +
        '<div class="detail-label">结算定位</div><p class="focus-effect">' + (/攻击|伤害|点燃|淬毒|覆雪|结霜|霜冻/.test(skill.ability + skill.effect) ? '主要输出：负责直接伤害或点燃/淬毒/覆雪命中。' : '启动/扳机或体系运转：负责提供资源、状态、增益或下一步触发条件。') + '</p>';
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
    const explosionSkills = equipped.filter(item => item.explosionCost);
    const abilityTags = [];
    if (unit.abilityEnergyCost) abilityTags.push('能力爆能（' + unit.energy + ' / ' + unit.abilityEnergyCost + '）');
    if (unit.abilityCountdownMax) abilityTags.push('能力倒计时（' + (unit.abilityCountdown == null ? unit.abilityCountdownMax : unit.abilityCountdown) + ' / ' + unit.abilityCountdownMax + '）');
    const abilityHtml = '<div class="detail-label">灵宠能力</div><p class="focus-effect">' + esc(unit.effect || '暂无简述') + '</p>' + (abilityTags.length ? '<div class="tag-row">' + abilityTags.map(tag => '<span class="tag explosion-tag">' + esc(tag) + '</span>').join('') + '</div>' : '');
    const equippedHtml = equipped.length
      ? equipped.map(item => '<button type="button" class="detail-skill-link" data-skill-info="' + esc(item.id) + '"><span>' + esc(item.name) + '<small>' + esc(valueSummary(item, unit)) + '</small></span><small>' + esc(explosionLabel(item) || '查看技能详情') + '</small></button>').join('')
      : '<span class="tag">未装备</span>';
    const explosionHtml = explosionSkills.length
      ? '<div class="detail-label">能力爆能消耗</div><div class="tag-row">' + explosionSkills.map(item => '<span class="tag explosion-tag">' + esc(item.name) + ' ' + esc(explosionLabel(item)) + '</span>').join('') + '</div>'
      : '';
    detail.innerHTML =
      '<div class="focus-card"><div class="focus-top"><div class="focus-icon ' + (unit.side === 'enemy' ? 'enemy' : 'ally') + '">' + esc(unit.icon) + '</div><div><div class="focus-name">' + esc(unit.name) + '</div><div class="focus-sub">' + sideLabel(unit.side) + '灵宠 · ' + esc(unit.quality) + ' · 坐标 ' + coord(unit.pos) + '</div></div></div><p class="focus-effect">' + esc(unit.effect || cat.effect) + '</p></div>' +
      '<div class="stat-grid"><div class="stat-box"><span>生命</span><strong>' + unit.hp + ' / ' + unit.maxHp + '</strong></div><div class="stat-box"><span>攻击 / 防御</span><strong>' + unit.atk + ' / ' + unit.def + '</strong></div><div class="stat-box"><span>能量</span><strong>' + unit.energy + ' / ' + unit.maxEnergy + '</strong></div><div class="stat-box"><span>护盾</span><strong>' + unit.shield + '</strong></div></div>' +
      '<div class="meter"><div class="meter-line"><span>生命状态</span><b>' + hpPct + '%</b></div><div class="meter-track"><i class="meter-fill" style="width:' + hpPct + '%"></i></div></div>' +
      '<div class="meter"><div class="meter-line"><span>能量</span><b>' + unit.energy + ' / ' + unit.maxEnergy + '</b></div><div class="meter-track"><i class="meter-fill energy" style="width:' + enPct + '%"></i></div></div>' +
      '<div class="detail-label">状态与定位</div><div class="tag-row">' + stateTags(unit).map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '</div>' +
      abilityHtml +
      '<div class="detail-label">装备技能</div><div class="detail-skill-list">' + equippedHtml + '</div>' + explosionHtml;
  }

  function renderSkillInfoModal() {
    const modal = $('#skill-info-modal');
    const skill = skillById(state.skillInfoId);
    if (!modal || !skill) {
      if (modal) modal.hidden = true;
      return;
    }
    const owner = ownerOf(skill);
    const explosion = explosionLabel(skill);
    const valueDetails = skillValueBreakdowns(skill, owner);
    $('#skill-info-title').textContent = skill.name + ' · 技能详情';
    $('#skill-info-content').innerHTML =
      '<div class="skill-info-summary"><div class="focus-icon skill">' + esc(skill.name.slice(0, 1)) + '</div><div><strong>' + esc(skill.name) + '</strong><small>' + esc(skill.quality) + ' · ' + esc(SIZE_LABEL[skill.size]) + ' · 所属灵宠：' + esc(owner ? owner.name : '未分配') + '</small></div></div>' +
      '<p class="skill-info-effect">' + esc(skill.effect) + '</p>' +
      (valueDetails.length ? '<div class="detail-label">当前实际数值与构成</div><div class="value-breakdown-list">' + valueDetails.map(item => '<div class="value-breakdown"><div><span>' + esc(item.label) + '</span><strong>' + item.value + '</strong></div><p>' + esc(valueFormula(item)) + '</p></div>').join('') + '</div>' : '') +
      '<div class="skill-info-grid"><div><span>能力</span><b>' + esc(skill.ability || '效果技能') + '</b></div><div><span>攻击范围</span><b>' + esc(skill.range) + '</b></div><div><span>占用格数</span><b>' + skill.slots + ' 格</b></div><div><span>弹药</span><b>' + esc(skill.ammoMax ? skill.ammo + ' / ' + skill.ammoMax : '—') + '</b></div><div><span>倒计时</span><b>' + esc(skill.baseCountdown ? skill.countdown + ' / ' + skill.baseCountdown : '—') + '</b></div><div><span>爆能消耗</span><b>' + esc(explosion || '—') + '</b></div></div>' +
      '<div class="detail-label">技能标签</div><div class="tag-row">' + (skill.tags.length ? skill.tags : ['技能']).map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '</div>';
    modal.hidden = false;
  }

  function openSkillInfo(skill) {
    if (!skill) return;
    state.skillInfoId = skill.id;
    renderSkillInfoModal();
  }

  function closeSkillInfo() {
    state.skillInfoId = null;
    const modal = $('#skill-info-modal');
    if (modal) modal.hidden = true;
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
    renderSkillInfoModal();
    renderTrace();
    renderLog();
  }

  function clearHighlights() {
    $$('.cell.range,.cell.move-target,.unit.in-range').forEach(node => node.classList.remove('range', 'move-target', 'in-range'));
  }

  function triggerFrostOnMove(unit, reason) {
    if (!unit || unit.dead || unit.hp <= 0 || unit.frost <= 0) return;
    const before = unit.frost;
    const damage = before * 2;
    log('<strong>' + esc(unit.name) + '</strong> 因' + esc(reason || '位置改变') + '触发霜冻：层数 ' + before + '，造成 ' + damage + ' 点霜冻伤害。', 'trigger', 'FROST MOVE');
    damageUnit(null, unit, damage, {status:'霜冻', meta:'FROST MOVE'});
    unit.frost = Math.ceil(before / 2);
    log('<strong>' + esc(unit.name) + '</strong> 霜冻触发后层数减半：' + before + ' → ' + unit.frost + '（向上取整）。', 'trigger', 'FROST MOVE');
    trace(unit.name + ' 霜冻 ' + before + '→' + unit.frost, 'trigger');
  }

  function moveUnit(unit, position, options = {}) {
    if (!unit || unit.dead || !Array.isArray(position) || (unit.pos[0] === position[0] && unit.pos[1] === position[1])) return false;
    const old = unit.pos.slice();
    unit.pos = position.slice();
    if (typeof options.message === 'function') log(options.message(old, unit.pos), 'trigger', options.meta || 'MOVE');
    if (!options.skipFrost) triggerFrostOnMove(unit, options.reason || '位置改变');
    return true;
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
    const equipped = state.playerSkills.filter(skill => skill.owner === unit.id);
    state.selectedSkill = equipped.find(skill => isAttackSkill(skill) && skillAvailability(skill) === '可用')
      || equipped.find(skill => skillAvailability(skill) === '可用')
      || equipped[0]
      || null;
    moveUnit(unit, [row, col], {
      reason: '玩家移动',
      meta: 'MOVE',
      message: (old, next) => '<strong>' + esc(unit.name) + '</strong> 从 ' + coord(old) + ' 移动到 ' + coord(next) + '。'
    });
    renderAll();
  }

  function resolveDisplacement(skill, owner, target, mode, damageAmount) {
    if (!skill || !owner || !target || target.dead || target.hp <= 0) return;
    const rowDelta = owner.pos[0] - target.pos[0];
    const colDelta = owner.pos[1] - target.pos[1];
    if (!rowDelta && !colDelta) return;
    const toward = Math.abs(rowDelta) >= Math.abs(colDelta)
      ? [Math.sign(rowDelta), 0]
      : [0, Math.sign(colDelta)];
    const step = mode === 'pull' ? toward : [-toward[0], -toward[1]];
    const candidate = [target.pos[0] + step[0], target.pos[1] + step[1]];
    const blocked = candidate[0] < 0 || candidate[0] >= ROWS || candidate[1] < 0 || candidate[1] >= COLS
      || allUnits().some(unit => !unit.dead && unit.id !== target.id && unit.pos[0] === candidate[0] && unit.pos[1] === candidate[1]);
    const actionText = mode === 'pull' ? '拖拽' : '击退';
    if (!blocked) {
      moveUnit(target, candidate, {
        reason: skill.name + actionText,
        meta: 'DISPLACEMENT',
        message: (old, next) => '<strong>' + esc(skill.name) + '</strong> ' + actionText + ' <strong>' + esc(target.name) + '</strong>：' + coord(old) + ' → ' + coord(next) + '。'
      });
      trace(target.name + ' ' + actionText + '至 ' + coord(candidate), 'trigger');
      return;
    }
    const value = Math.max(0, Math.round(damageAmount || 0));
    log('<strong>' + esc(skill.name) + '</strong> 无空格可将 <strong>' + esc(target.name) + '</strong> ' + actionText + '一格，追加造成等量伤害 <strong>' + value + '</strong>。', 'warn', 'DISPLACEMENT');
    if (value > 0 && target.hp > 0 && !target.dead) damageUnit(owner, target, value, {attackHit:true, meta:'DISPLACEMENT DAMAGE'});
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

  function valueFromEffect(text, patterns, fallback = 0) {
    return parseFirst(String(text || ''), patterns, fallback);
  }

  function growthValue(skill, pattern, fallback = 0) {
    return valueFromEffect(skill && skill.effect, [pattern], fallback);
  }

  function addSkillGrowth(skill, field, amount, reason) {
    if (!skill || !amount) return;
    skill[field] = (skill[field] || 0) + amount;
    log('<strong>' + esc(skill.name) + '</strong> ' + esc(reason || '获得成长') + ' <strong>+' + amount + '</strong>，当前 +' + skill[field] + '。', 'trigger', 'GROWTH');
    trace(skill.name + ' ' + field + ' +' + amount, 'trigger');
  }

  function triggerStatusGrowth(kind, source, target) {
    const sourceSide = source && source.side ? source.side : target && target.side;
    const receiverSide = target && target.side;
    ['player', 'enemy'].forEach(side => {
      skillList(side).forEach(skill => {
        if (skill.name === '妒火' && kind === 'excited') {
          addSkillGrowth(skill, 'burnBonus', growthValue(skill, /此技能点燃提升\s*(\d+)/, 0), '获得亢奋触发点燃成长');
        }
        if (side === sourceSide && (kind === 'excited' || kind === 'weak')) {
          if (skill.name === '风刃') addSkillGrowth(skill, 'damageBonus', growthValue(skill, /此技能获得伤害\+\s*(\d+)/, 0), '友方施加' + (kind === 'excited' ? '亢奋' : '衰弱') + '触发成长');
          if (skill.name === '膨胀力场') addSkillGrowth(skill, 'shieldBonus', growthValue(skill, /此技能获得护盾量\+\s*(\d+)/, 0), '友方施加' + (kind === 'excited' ? '亢奋' : '衰弱') + '触发成长');
          if (kind === 'weak' && skill.name === '钩链') {
            const amount = growthValue(skill, /此技能和下一个技能获得\+\s*(\d+)伤害/, 0);
            addSkillGrowth(skill, 'damageBonus', amount, '友方施加衰弱触发成长');
            skill.critBonus = (skill.critBonus || 0) + 10;
            const index = skillList(side).indexOf(skill);
            const next = skillList(side).slice(index + 1).find(item => item && item.owner === skill.owner);
            if (next) {
              addSkillGrowth(next, 'damageBonus', amount, '钩链触发的下一个技能成长');
              next.critBonus = (next.critBonus || 0) + 10;
              log('<strong>' + esc(next.name) + '</strong> 同步获得钩链提供的10%暴击率提升。', 'trigger', 'GROWTH');
            }
            log('<strong>' + esc(skill.name) + '</strong> 同步获得10%暴击率提升。', 'trigger', 'GROWTH');
          }
        }
        if (kind === 'excited' && side === receiverSide && skill.name === '气场' && skill.owner === target.id) {
          const owner = ownerOf(skill);
          if (owner) {
            owner.critBonus = (owner.critBonus || 0) + valueFromEffect(skill.effect, [/暴击率提升\s*(\d+)%/], 5);
            log('<strong>' + esc(owner.name) + '</strong> 因气场获得暴击率提升，当前额外暴击 +' + owner.critBonus + '%。', 'trigger', 'GROWTH');
          }
        }
      });
    });
  }

  function applyExcited(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.excited += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得亢奋 +' + value + '，当前 ' + target.excited + '。', 'trigger', 'STATUS');
    trace(target.name + ' 亢奋 +' + value, 'trigger');
    triggerStatusGrowth('excited', source, target);
    return value;
  }

  function applyWeak(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.weak += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得衰弱 +' + value + '，当前 ' + target.weak + '。', 'warn', 'STATUS');
    trace(target.name + ' 衰弱 +' + value, 'trigger');
    triggerStatusGrowth('weak', source, target);
    if (source && source.side) {
      skillList(source.side).filter(skill => skill.name === '尾鞭' && skill.owner === source.id).forEach(skill => {
        const growth = valueFromEffect(skill.effect, [/此技能获得伤害\+(\d+)/], 5);
        addSkillGrowth(skill, 'damageBonus', growth, '装备灵兽赋予衰弱后的尾鞭成长');
      });
    }
    return value;
  }

  function simpleRuleTargets(skill, owner, scope, contextTargets) {
    const context = (contextTargets || []).filter(target => target && !target.dead && target.hp > 0);
    const selected = context.length ? context : targetsFor(skill, owner, owner.side);
    let targets = [];
    if (scope === '对自身') targets = [owner];
    else if (scope === '对目标和自身') targets = [owner, ...selected];
    else if (scope === '对我方全体') targets = unitsOf(owner.side, true);
    else if (scope === '对敌方全体') targets = unitsOf(opponentSide(owner.side), true);
    else targets = skill.rangeConfig && skill.rangeConfig.targetSide === '自身' ? [owner] : selected.filter(target => target.id !== owner.id);
    return Array.from(new Map(targets.filter(target => target && !target.dead && target.hp > 0).map(target => [target.id, target])).values());
  }

  function addSimpleAmmo(target, amount, skillName) {
    const reloadable = skillList(target.side).filter(candidate => candidate.owner === target.id && candidate.ammoMax && candidate.ammo < candidate.ammoMax);
    let changed = 0;
    reloadable.forEach(candidate => {
      const before = candidate.ammo;
      candidate.ammo = Math.min(candidate.ammoMax, candidate.ammo + amount);
      changed += candidate.ammo - before;
    });
    log('<strong>' + esc(skillName) + '</strong> 为 <strong>' + esc(target.name) + '</strong> 的弹药技能补充 ' + changed + ' 枚弹药。', 'trigger', 'SIMPLE EFFECT');
  }

  function executeSimpleRule(skill, owner, rule, contextTargets) {
    const countdown = rule.actions.find(action => action.type === '倒计时');
    const explosion = rule.actions.find(action => action.type === '爆能');
    const multi = rule.actions.find(action => action.type === '多重触发');
    const stateKey = rule.timing + ':' + rule.id;
    if (countdown) {
      const current = skill.simpleRuleState[stateKey] == null ? countdown.value : skill.simpleRuleState[stateKey];
      const next = Math.max(0, current - 1);
      skill.simpleRuleState[stateKey] = next;
      if (next > 0) {
        log('<strong>' + esc(skill.name) + '</strong> 的' + esc(rule.timing) + '简化效果倒计时：' + next + '。', 'trigger', 'SIMPLE COUNTDOWN');
        return;
      }
      skill.simpleRuleState[stateKey] = countdown.value;
    }
    if (explosion && !consumeEnergy(owner, explosion.value, skill.name + '简化效果爆能')) {
      log('<strong>' + esc(skill.name) + '</strong> 的' + esc(rule.timing) + '简化效果需要爆能' + explosion.value + '，能量不足，本次不执行。', 'warn', 'SIMPLE EXPLOSION');
      return;
    }
    const actions = rule.actions.filter(action => !['爆能', '倒计时', '多重触发'].includes(action.type));
    const targets = simpleRuleTargets(skill, owner, rule.scope, contextTargets);
    if (!targets.length) {
      log('<strong>' + esc(skill.name) + '</strong> 的' + esc(rule.timing) + '简化效果没有符合条件的对象。', 'warn', 'SIMPLE TARGET');
      return;
    }
    const repeats = Math.max(1, Math.min(99, multi ? multi.value : 1));
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      actions.forEach(action => targets.slice().forEach(target => {
        if (!target || target.dead || target.hp <= 0) return;
        const reason = skill.name + '·' + rule.timing;
        if (action.type === '充能') addEnergy(target, action.value, reason + '充能');
        else if (action.type === '弹药') addSimpleAmmo(target, action.value, skill.name);
        else if (action.type === '伤害') damageUnit(owner, target, action.value, {attackHit: rule.timing === '使用时', skipRetaliation: rule.timing === '被攻击时', meta:'SIMPLE EFFECT'});
        else if (action.type === '治疗') healUnit(owner, target, action.value, reason);
        else if (action.type === '护盾') applyShield(skill, target, action.value, reason);
        else if (action.type === '再生') applyRegen(owner, target, action.value, reason);
        else if (action.type === '点燃') applyBurn(owner, target, action.value, reason, owner.name === '花椒蟹');
        else if (action.type === '剧毒') applyPoison(owner, target, action.value, reason);
        else if (action.type === '霜冻') applyFrost(owner, target, action.value, reason);
        else if (action.type === '亢奋') applyExcited(owner, target, action.value, reason);
        else if (action.type === '衰弱') applyWeak(owner, target, action.value, reason);
        else if (action.type === '拖拽') resolveDisplacement(skill, owner, target, 'pull', 0);
        else if (action.type === '击退') resolveDisplacement(skill, owner, target, 'push', 0);
      }));
    }
    log('<strong>' + esc(skill.name) + '</strong> 完成' + esc(rule.timing) + '简化效果' + (repeats > 1 ? '，共触发 ' + repeats + ' 次' : '') + '。', 'trigger', 'SIMPLE EFFECT');
  }

  function runSimpleRules(skill, timing, contextTargets) {
    const owner = ownerOf(skill);
    if (!owner || owner.dead || owner.hp <= 0) return;
    (skill.simpleRules || []).filter(rule => rule.timing === timing).forEach(rule => executeSimpleRule(skill, owner, rule, contextTargets));
  }

  function runSimpleRulesForSide(timing, side) {
    skillList(side).forEach(skill => runSimpleRules(skill, timing, []));
  }

  function applyParalyze(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.paralyze += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得麻痹 +' + value + '，当前 ' + target.paralyze + '（每层使用时7%失效）。', 'warn', 'STATUS');
    trace(target.name + ' 麻痹 +' + value, 'trigger');
    return value;
  }

  function applySilence(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.silence = Math.max(target.silence, value);
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得封刃 ' + value + ' 回合。', 'warn', 'STATUS');
    trace(target.name + ' 封刃', 'trigger');
    return value;
  }

  function applyRoot(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.rooted = Math.max(target.rooted, value);
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得禁足 ' + value + ' 回合，无法移动。', 'warn', 'STATUS');
    trace(target.name + ' 禁足', 'trigger');
    return value;
  }

  function nearestMartialSkill(skillItems, fromIndex, direction, ownerId) {
    for (let index = fromIndex + direction; index >= 0 && index < skillItems.length; index += direction) {
      const candidate = skillItems[index];
      if (candidate && candidate.owner === ownerId && isMartialSkill(candidate)) return candidate;
    }
    return null;
  }

  function sharpScaleTriggers(passive, triggeringSkill, skillItems) {
    if (!passive || !triggeringSkill || passive.name !== '锋锐鳞片' || !isMartialSkill(triggeringSkill)) return false;
    const passiveIndex = skillItems.indexOf(passive);
    const triggerIndex = skillItems.indexOf(triggeringSkill);
    if (passiveIndex < 0 || triggerIndex < 0 || passiveIndex === triggerIndex) return false;
    const direction = triggerIndex < passiveIndex ? -1 : 1;
    return nearestMartialSkill(skillItems, passiveIndex, direction, passive.owner) === triggeringSkill;
  }

  function triggerPassiveAttacks(owner, triggeringSkill, triggeringTargets) {
    if (!owner || !isMartialSkill(triggeringSkill) || !triggeringTargets || !triggeringTargets.length) return;
    const skillItems = skillList(owner.side);
    const inheritedTargets = triggeringTargets.filter(target => target && !target.dead && target.hp > 0 && target.side !== owner.side);
    if (!inheritedTargets.length) return;
    skillItems.filter(skill => skill.owner === owner.id && isPassiveSkill(skill)).forEach(passive => {
      if (passive.name === '锋锐鳞片' && !sharpScaleTriggers(passive, triggeringSkill, skillItems)) return;
      if (passive.name !== '连抓' && passive.name !== '锋锐鳞片') return;
      const passiveTargets = targetsForEffectScope(passive, owner, inheritedTargets, ['造成伤害', '发起攻击', '攻击']);
      log('<strong>' + esc(passive.name) + '</strong> 被动触发，按效果描述对 ' + passiveTargets.length + ' 个目标结算。', 'trigger', 'PASSIVE');
      passiveTargets.slice().forEach(target => {
        if (target.dead || target.hp <= 0) return;
        const value = genericAttackValue(passive, owner, 'damage');
        if (passive.name === '连抓') triggerBurnOnHit(owner, target, passive, value);
        damageUnit(owner, target, value, {attackHit: passive.name === '连抓', meta:'PASSIVE'});
      });
    });
  }

  function damageUnit(source, target, amount, options = {}) {
    if (!target || target.dead || target.hp <= 0) return 0;
    const incoming = Math.max(0, Math.round(amount || 0));
    let raw = incoming;
    if (!incoming) return 0;
    const defenseBefore = Math.max(0, target.def);
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
    if (!options.skipDefenseLoss && incoming > 0) {
      target.def = Math.max(0, target.def - 1);
      if (target.def !== defenseBefore) {
        log('<strong>' + esc(target.name) + '</strong> 受到攻击后防御 -1：<strong>' + defenseBefore + '</strong> → <strong>' + target.def + '</strong>。', 'trigger', 'DEFENSE LOSS');
        trace(target.name + ' 防御 ' + defenseBefore + '→' + target.def, 'trigger');
      }
    }
    if (options.attackHit && source && !source.dead && source.side !== target.side && !options.skipRetaliation) {
      const attackedRules = skillList(target.side).filter(skill => skill.owner === target.id && (skill.simpleRules || []).some(rule => rule.timing === '被攻击时'));
      attackedRules.forEach(skill => runSimpleRules(skill, '被攻击时', [source]));
      const retaliation = skillList(target.side).find(skill => skill.owner === target.id && skill.name === '饮血倒刺');
      if (retaliation && !(retaliation.simpleRules || []).some(rule => rule.timing === '被攻击时')) {
        const value = genericAttackValue(retaliation, target, 'damage');
        const retaliationTargets = targetsForEffectScope(retaliation, target, [source], ['造成伤害', '攻击']);
        log('<strong>' + esc(target.name) + '</strong> 的饮血倒刺被动触发，按效果描述对 ' + retaliationTargets.length + ' 个目标结算。', 'trigger', 'BLOOD THORN');
        retaliationTargets.forEach(retaliationTarget => damageUnit(target, retaliationTarget, value, {attackHit:false, skipRetaliation:true, meta:'BLOOD THORN'}));
      }
    }
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
    if (source && source.name === '赤精鱼') addEnergy(source, 4, '赤精鱼击杀奖励');
    if (source && source.name === '幼熊') {
      const growth = valueFromEffect(source.effect, [/提升(\d+)点攻击/], 3);
      source.permanentAtk += growth;
      source.atk += growth;
      log('<strong>幼熊</strong> 击杀成长：永久攻击 +' + growth + '，当前攻击 ' + source.atk + '。', 'trigger', 'GROWTH');
    }
    if (hero.hp <= 0) finishBattle(opponentSide(unit.side));
  }

  function reviveUnit(unit, forced) {
    if (!unit || !unit.dead) return;
    const occupied = new Set(allUnits().filter(item => !item.dead && item.id !== unit.id).map(item => item.pos.join(',')));
    const preferredRow = unit.side === 'player' ? ROWS - 1 : 0;
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
    unit.frost = 0;
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
    const ant = units.find(unit => unit.name === '蚁王');
    if (ant) {
      const amount = valueFromEffect(ant.effect, [/技能伤害\+(\d+)/], 2);
      teamState.skillDamage += amount;
      log(sideLabel(side) + '蚁王在场：本方技能伤害基础值 +' + amount + '。', 'trigger', 'PET PASSIVE');
    }
    const elephant = units.find(unit => unit.name === '圣象甲虫');
    if (elephant) {
      const atk = valueFromEffect(elephant.effect, [/其他友方\+(\d+)攻击/, /友方\+(\d+)攻击/], 3);
      const def = valueFromEffect(elephant.effect, [/防御\+(\d+)/], 1);
      const skillDamage = valueFromEffect(elephant.effect, [/技能获得伤害\+(\d+)/], 8);
      units.filter(unit => unit.id !== elephant.id).forEach(unit => {
        unit.atk += atk;
        unit.def += def;
      });
      elephant.skillDamage = skillDamage;
      log('圣象甲虫存活：其它友方攻击 +' + atk + '、防御 +' + def + '；自身技能伤害 +' + skillDamage + '。', 'trigger', 'PET PASSIVE');
    }
    units.filter(unit => unit.name === '鬼蜂').forEach(unit => {
      const amount = valueFromEffect(unit.effect, [/攻击\+(\d+)/], 2);
      const count = units.length;
      unit.atk += amount * count;
      log('<strong>鬼蜂</strong> 存活友方数量为 ' + count + '：本回合攻击 +' + (amount * count) + '，当前 ' + unit.atk + '。', 'trigger', 'PET PASSIVE');
    });
    units.filter(unit => unit.name === '巨鳄蚁').forEach(unit => {
      const chance = valueFromEffect(unit.effect, [/暴击\+(\d+)%/], 35);
      unit.critBonus = chance;
      log('<strong>巨鳄蚁</strong> 在场：装备技能暴击率 +' + chance + '%。', 'trigger', 'PET PASSIVE');
    });
    units.filter(unit => unit.name === '铁丸子').forEach(unit => {
      const countdown = unit.abilityCountdown == null ? unit.passiveCountdown : unit.abilityCountdown;
      if (countdown > 0) {
        unit.abilityCountdown = countdown - 1;
        unit.passiveCountdown = unit.abilityCountdown;
        log('铁丸子倒计时 -1，当前为 ' + unit.abilityCountdown + '。', 'trigger', 'COUNTDOWN');
      } else {
        const reload = skillList(side).find(skill => skill.ammoMax && skill.ammo < skill.ammoMax);
        if (reload) {
          const amount = valueFromEffect(unit.effect, [/装填(\d+)枚弹药/], 2);
          reload.ammo = Math.min(reload.ammoMax, reload.ammo + amount);
          unit.abilityCountdown = valueFromEffect(unit.effect, [/倒计时(\d+)/], 2);
          unit.passiveCountdown = unit.abilityCountdown;
          log('铁丸子倒计时触发：' + reload.name + ' 装填' + amount + '枚弹药，倒计时重置为' + unit.abilityCountdown + '。', 'trigger', 'COUNTDOWN');
        }
      }
    });
    if (units.some(unit => unit.name === '通灵钟')) {
      let changed = 0;
      skillList(side).forEach(skill => {
        if (skill.baseCountdown && skill.countdown > 0) {
          skill.countdown -= 1;
          changed += 1;
          log('<strong>' + esc(skill.name) + '</strong> 受通灵钟影响，倒计时 -1，当前 ' + skill.countdown + '。', 'trigger', 'PET PASSIVE');
        }
      });
      log('通灵钟在场：己方倒计时需求减少1回合（本次影响 ' + changed + ' 个技能）。', 'trigger', 'PET PASSIVE');
    }
  }

  function startEnergy(side) {
    const units = unitsOf(side, true);
    units.filter(unit => unit.name === '烁德童子').forEach(unit => {
      addEnergy(unit, 1, '回合开始被动充能');
      const adjacent = units.filter(other => other.id !== unit.id && Math.abs(other.pos[0] - unit.pos[0]) + Math.abs(other.pos[1] - unit.pos[1]) <= 1);
      if (adjacent[0]) addEnergy(adjacent[0], 1, '烁德童子相邻充能');
    });
    units.filter(unit => unit.name === '赤精鱼').forEach(unit => {
      const cost = valueFromEffect(unit.effect, [/消耗(\d+)点能量/], 5);
      const damage = valueFromEffect(unit.effect, [/技能伤害提升(\d+)/], 4);
      const ignite = valueFromEffect(unit.effect, [/点燃提升(\d+)/], 1);
      if (unit.energy >= cost && consumeEnergy(unit, cost, '赤精鱼回合开始爆能')) {
        unit.roundSkillDamage += damage;
        unit.roundIgnite += ignite;
        log('赤精鱼爆能成功：本回合自身技能伤害 +' + damage + '，点燃 +' + ignite + '。', 'trigger', 'PET EXPLOSION');
      } else {
        log('赤精鱼能量不足' + cost + '，本回合不触发爆能特性。', 'trigger', 'PET EXPLOSION');
      }
    });
    units.filter(unit => unit.name === '玄铁龟').forEach(unit => {
      const cost = valueFromEffect(unit.effect, [/消耗(\d+)点能量/], 6);
      const energy = valueFromEffect(unit.effect, [/获得(\d+)点能量/], 2);
      const ammo = valueFromEffect(unit.effect, [/填充(\d+)枚弹药/], 1);
      if (unit.energy >= cost && consumeEnergy(unit, cost, '玄铁龟回合开始爆能')) {
        units.forEach(other => addEnergy(other, energy, '玄铁龟群体充能'));
        skillList(side).forEach(skill => { if (skill.ammoMax) skill.ammo = Math.min(skill.ammoMax, skill.ammo + ammo); });
        log('玄铁龟爆能成功：全体灵宠能量 +' + energy + '，所有技能装填' + ammo + '枚弹药。', 'trigger', 'PET EXPLOSION');
      } else if (units.some(item => item.name === '玄铁龟')) {
        log('玄铁龟能量不足' + cost + '，本次回合开始爆能未触发。', 'trigger', 'PET EXPLOSION');
      }
    });
  }

  function startStatus(side) {
    const units = unitsOf(side, true);
    units.filter(unit => unit.name === '吞金鼠').forEach(unit => {
      const lowest = units.slice().sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0];
      const multiplier = valueFromEffect(unit.effect, [/价值\*(\d+)/], QUALITY_MULT[unit.quality] || 1);
      if (lowest) healUnit(unit, lowest, 3 * multiplier, '吞金鼠回合开始治疗');
    });
  }

  function battleStartEffects() {
    allUnits().filter(unit => unit.name === '岩豚').forEach(unit => {
      const shield = valueFromEffect(unit.effect, [/获得(\d+)护盾/], 20);
      applyShield(null, unit, shield, '岩豚战斗开始');
    });
    ['player', 'enemy'].forEach(side => runSimpleRulesForSide('战斗开始时', side));
  }

  function startEffects(side) {
    state.phase = 'start-resolving';
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
    log('—— ' + sideLabel(side) + '回合开始：能量变化 ——', 'trigger', 'TURN START');
    startEnergy(side);
    log('—— ' + sideLabel(side) + '回合开始：状态伤害与增益 ——', 'trigger', 'TURN START');
    startStatus(side);
    runSimpleRulesForSide('回合开始', side);
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
      const poison = valueFromEffect(target.effect, [/施加\s*(\d+)点剧毒/, /施加(\d+)点剧毒/], 6);
      if (enemy) applyPoison(target, enemy, poison, '沼泽鼠自身受到治疗后的被动');
    }
    return actual;
  }

  function applyRegen(source, target, amount, reason) {
    if (!target || target.dead || !amount) return 0;
    const value = Math.max(0, Math.round(amount));
    target.regen += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得再生 +' + value + '，当前 ' + target.regen + '。', 'trigger', 'STATUS');
    trace(target.name + ' 再生 +' + value, 'trigger');
    return value;
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
    const blackRoses = [];
    if (source && source.name === '黑玫瑰' && !source.dead) blackRoses.push(source);
    if (target.name === '黑玫瑰' && !target.dead && !blackRoses.includes(target)) blackRoses.push(target);
    blackRoses.forEach(blackRose => {
      const multiplier = valueFromEffect(blackRose.effect, [/剧毒量\s*\*\s*(\d+)/], 2);
      healRandomAlly(blackRose, value * multiplier, '黑玫瑰自身施加/受到剧毒触发');
    });
    const crouch = skillList(target.side).find(skill => skill.owner === target.id && skill.name === '蜷缩');
    if (crouch && target.hp > 0) {
      const shield = primaryValueBreakdown(crouch, target, 'shield').value || 25;
      const regen = primaryValueBreakdown(crouch, target, 'regen').value || 2;
      applyShield(crouch, target, shield, '蜷缩受到剧毒触发');
      applyRegen(crouch, target, regen, '蜷缩受到剧毒触发');
    }
    if (old > 0) {
      damageUnit(source, target, old, {status:'剧毒', ignoreShield:true, meta:'POISON PROC'});
      log('目标已有剧毒，淬毒立即触发一次当前剧毒伤害。', 'trigger', 'POISON PROC');
    }
  }

  function applyFrost(source, target, amount, reason) {
    if (!target || target.dead) return;
    const value = Math.max(1, Math.round(amount || 0));
    const old = target.frost;
    target.frost += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得霜冻 +' + value + '，当前 ' + target.frost + '。', 'trigger', 'FROST');
    trace(target.name + ' 霜冻 +' + value, 'trigger');
    if (old > 0) {
      const defenseBefore = Math.max(0, target.def);
      const shieldBefore = Math.max(0, target.shield);
      const defenseLoss = Math.floor(value / 2);
      const shieldLoss = value * 3;
      target.def = Math.max(0, target.def - defenseLoss);
      target.shield = Math.max(0, target.shield - shieldLoss);
      log('<strong>' + esc(target.name) + '</strong> 已有霜冻，覆雪额外削减防御 ' + defenseLoss + '（' + defenseBefore + ' → ' + target.def + '），护盾 ' + shieldLoss + '（' + shieldBefore + ' → ' + target.shield + '）。', 'warn', 'FROST PROC');
      trace(target.name + ' 霜冻削防/护盾', 'trigger');
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
      damageUnit(source, target, value * 2, {status:'点燃', meta:'IGNITE PROC'});
      log('目标已有灼烧，点燃额外造成 ' + value * 2 + ' 点伤害。', 'output', 'IGNITE PROC');
    }
    const crab = source && source.name === '花椒蟹' && !source.dead ? source : null;
    if (crab && attackHit && target.hp > 0) {
      damageUnit(crab, target, 1, {status:'被动', ignoreDefense:false, meta:'FLOWER CRAB'});
      log('花椒蟹被动：技能赋予灼烧后，对同一目标造成1点额外伤害；该被动伤害不算白蔷薇的攻击触发。', 'trigger', 'PET PROC');
    }
    if (source && source.side && source.hp > 0) {
      skillList(source.side).filter(skill => skill.owner === source.id && skill.name === '火中取栗').forEach(skill => reduceCountdown(skill, 1, '装备灵宠触发点燃后'));
    }
  }

  function triggerBurnOnHit(attacker, target, skill, damageBase) {
    if (!target || target.dead || target.burn <= 0) return 0;
    const burnDamage = target.burn;
    damageUnit(attacker, target, burnDamage, {status:'灼烧', meta:'BURN PROC'});
    target.burn = Math.max(1, Math.floor(target.burn * 0.9));
    log('<strong>' + esc(target.name) + '</strong> 被攻击技能命中，灼烧追加 ' + burnDamage + '，层数按10%衰减至 ' + target.burn + '。', 'trigger', 'BURN PROC');
    if (attacker && attacker.name === '白蔷薇') {
      const heal = valueFromEffect(attacker.effect, [/治疗(\d+)点生命/], 7);
      healRandomAlly(attacker, heal, '白蔷薇自身攻击触发灼烧伤害');
    }
    return burnDamage;
  }

  function applyShield(source, target, amount, reason) {
    if (!target || target.dead) return;
    let value = Math.max(0, Math.round(amount || 0));
    if (target.name === '巨伞蕈') value = Math.floor(value / 2);
    if (target.weak > 0) value = Math.floor(value / 2);
    if (target.excited > 0) {
      value *= 2;
      target.excited -= 1;
    }
    target.shield += value;
    log((reason ? esc(reason) + '：' : '') + '<strong>' + esc(target.name) + '</strong> 获得护盾 <strong>+' + value + '</strong>。', 'trigger', 'SHIELD');
    trace(target.name + ' 护盾 +' + value, 'trigger');
    if (target.name === '鲛人抢手' && value > 0) {
      const skill = skillList(target.side).find(item => item.owner === target.id && !isPassiveSkill(item));
      const growth = valueFromEffect(target.effect, [/技能伤害提升(\d+)点/], 10);
      if (skill) addSkillGrowth(skill, 'damageBonus', growth, '鲛人抢手获得护盾后的技能成长');
    }
    if (target.name === '巨伞蕈' && value > 0) {
      const allies = unitsOf(target.side, true).filter(unit => unit.id !== target.id).slice(0, 2);
      allies.forEach(ally => applyShield(target, ally, value, '巨伞蕈护盾联动'));
      if (allies.length) log('巨伞蕈护盾联动：为 ' + allies.map(ally => esc(ally.name)).join('、') + ' 各提供等量护盾。', 'trigger', 'PET PROC');
    }
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

  function advanceCountdown(skill) {
    if (!skill.baseCountdown) return true;
    if (skill.countdown > 0) {
      skill.countdown -= 1;
      log('<strong>' + esc(skill.name) + '</strong> 主动倒计时 -1，当前 ' + skill.countdown + '；从1变0时不会立即触发。', 'trigger', 'COUNTDOWN');
      return false;
    }
    return true;
  }

  function resetCountdown(skill, reason) {
    if (!skill.baseCountdown) return;
    skill.countdown = skill.baseCountdown;
    log('<strong>' + esc(skill.name) + '</strong> 倒计时效果已完成，重置为 ' + skill.countdown + (reason ? '（' + esc(reason) + '）' : '') + '。', 'output', 'COUNTDOWN');
  }

  function reduceCountdown(skill, amount, reason) {
    if (!skill || !skill.baseCountdown || !amount || skill.countdown <= 0) return false;
    const before = skill.countdown;
    skill.countdown = Math.max(0, skill.countdown - amount);
    log('<strong>' + esc(skill.name) + '</strong> ' + esc(reason || '倒计时减少') + '：' + before + ' → ' + skill.countdown + '。', 'trigger', 'COUNTDOWN');
    return true;
  }

  function criticalChance(skill, owner) {
    const abilityChance = valueFromEffect(skill && (skill.ability + ' ' + skill.effect), [/暴击率\s*(\d+)%/], 0);
    const petChance = owner && owner.critBonus ? owner.critBonus : 0;
    const list = owner ? skillList(owner.side) : [];
    const index = list.indexOf(skill);
    const focusBonus = index >= 0 && list.some((item, itemIndex) => item.name === '专注' && Math.abs(itemIndex - index) === 1) ? 10 : 0;
    return Math.min(100, abilityChance + petChance + focusBonus + (skill && skill.critBonus || 0));
  }

  function triggerCritical(owner, skill, targets) {
    if (!owner || !skill || !targets.length) return false;
    const guaranteed = skill.name === '冲刺拳' && skill.used === 0;
    const chance = criticalChance(skill, owner);
    const roll = (state.action * 37 + owner.slot * 13 + skill.used * 17) % 100;
    if (!guaranteed && !(chance > 0 && roll < chance)) return false;
    log('<strong>' + esc(owner.name) + '</strong> 的 <strong>' + esc(skill.name) + '</strong> 触发暴击' + (guaranteed ? '（首次使用必定暴击）' : '（当前暴击率 ' + chance + '%）') + '。', 'output', 'CRITICAL');
    trace(skill.name + ' 暴击', 'output');
    const dragonSkills = skillList(owner.side).filter(item => item.name === '龙牙斩');
    dragonSkills.forEach(dragon => {
      const amount = valueFromEffect(dragon.effect, [/伤害\+(\d+)/], 5);
      skillList(owner.side).filter(item => isMartialSkill(item)).forEach(item => addSkillGrowth(item, 'damageBonus', amount, '龙牙斩暴击联动'));
    });
    const inspiration = skillList(owner.side).filter(item => item.name === '激昂' && item.owner === owner.id);
    inspiration.forEach(item => addEnergy(owner, 1, '激昂暴击触发'));
    skillList(owner.side).filter(item => item.name === '气场' && item.owner === owner.id).forEach(item => {
      const amount = valueFromEffect(item.effect, [/施加(\d+)层亢奋/], 1);
      const allies = unitsOf(owner.side, true).filter(unit => unit.id !== owner.id);
      const target = allies.sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id))[0];
      if (target) applyExcited(owner, target, amount, '气场暴击联动');
    });
    if (skill.name === '雷电牙') targets.filter(target => target && !target.dead).forEach(target => applySilence(owner, target, 1, '雷电牙暴击'));
    return true;
  }

  function triggerPostSkill(owner, skill, side, attackSkill) {
    if (!owner || !skill) return;
    if (skill.name === '魔性飞剑') {
      addSkillGrowth(skill, 'damageBonus', valueFromEffect(skill.effect, [/伤害提升(\d+)/], 4), '使用后自身成长');
    }
    if (isMartialSkill(skill)) {
      skillList(side).filter(item => item.owner === owner.id && item.name === '倾泻' && item.id !== skill.id).forEach(item => reduceCountdown(item, 1, '其它武技使用后触发倾泻'));
      skillList(side).filter(item => item.owner === owner.id && item.name === '凝血铠甲' && item.id !== skill.id).forEach(item => {
        const amount = valueFromEffect(item.effect, [/护盾值上升(\d+)/], 5);
        addSkillGrowth(item, 'shieldBonus', amount, '其它武技使用后护盾成长');
      });
    }
    skillList(side).filter(item => item.name === '凌厉').forEach(item => {
      addSkillGrowth(item, 'critBonus', 10, '友方行动后的暴击率成长');
    });
    if (attackSkill) {
      skillList(opponentSide(side)).filter(item => item.name === '暴起').forEach(item => reduceCountdown(item, 1, '敌方进攻技能释放后触发暴起'));
    }
  }

  function genericAttackValue(skill, owner, kind) {
    return primaryValueBreakdown(skill, owner, kind || 'damage').value;
  }

  function useSkill(skill, side, options) {
    const immediateUse = !!(options && options.immediateUse);
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
    if (isPassiveSkill(skill)) {
      log('<strong>' + esc(skill.name) + '</strong> 为被动技能，等待对应触发，不在技能栏中主动攻击。', 'trigger', 'PASSIVE');
      trace(skill.name + ' 被动等待触发', 'trigger');
      renderAll();
      return;
    }
    const targets = targetsFor(skill, owner, side);
    const attackSkill = isAttackSkill(skill);
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
    let countdownAdvanced = false;
    if (!targets.length && (skill.rangeConfig || !skillIsSupport(skill)) && skill.name !== '轻击') {
      if (skill.baseCountdown && skill.countdown > 0 && !immediateUse) {
        advanceCountdown(skill);
        countdownAdvanced = true;
        log('<strong>' + esc(skill.name) + '</strong> 范围内没有敌人，本次不使用技能效果，但按规则继续减少倒计时。', 'trigger', 'COUNTDOWN');
      } else {
        const targetLabel = skill.rangeConfig ? skill.rangeConfig.targetSide : '敌方';
        log('<strong>' + esc(skill.name) + '</strong> 攻击范围内没有' + targetLabel + '灵宠，不消耗弹药、不触发爆能，也不重置倒计时。', 'warn', 'TARGET');
        trace(skill.name + ' 无目标', 'trigger');
      }
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
    const countdownReady = immediateUse || !skill.baseCountdown || skill.countdown === 0;
    let countdownEffectReady = !immediateUse && (!skill.baseCountdown || countdownReady);
    let resetAfterEffect = !immediateUse && !!skill.baseCountdown && countdownReady;
    let explosion = false;
    if (!immediateUse && skill.baseCountdown && !countdownReady && !countdownAdvanced) {
      advanceCountdown(skill);
      countdownAdvanced = true;
      countdownEffectReady = false;
      resetAfterEffect = false;
    }
    if (skill.explosionCost && !immediateUse) {
      if (skill.explosionBeforeCountdown) {
        if (!skill.explosionAvailable) {
          if (!countdownReady) {
            log('<strong>' + esc(skill.name) + '</strong> 已完成爆能并处于倒计时中，本次只减少倒计时，不重复消耗爆能。', 'trigger', 'EXPLOSION');
            countdownEffectReady = false;
            resetAfterEffect = false;
          } else {
            log('<strong>' + esc(skill.name) + '</strong> 倒计时归零，执行爆能冒号后的效果；本次不再次消耗能量。', 'trigger', 'EXPLOSION');
          }
        } else if (!countdownReady) {
          log('<strong>' + esc(skill.name) + '</strong> 倒计时未结束，本次不触发爆能，也不进行爆能补偿。', 'trigger', 'EXPLOSION');
          countdownEffectReady = false;
          resetAfterEffect = false;
        } else {
          explosion = explosionFor(skill, owner);
          countdownEffectReady = false;
          resetAfterEffect = false;
          if (explosion) {
            skill.explosionAvailable = false;
            skill.countdown = skill.baseCountdown;
            log('<strong>' + esc(skill.name) + '</strong> 爆能成功后开始主动倒计时，当前 ' + skill.countdown + '。', 'trigger', 'COUNTDOWN');
          }
        }
      } else if (skill.countdownBeforeExplosion) {
        if (!countdownReady) {
          log('<strong>' + esc(skill.name) + '</strong> 倒计时未结束，本次不触发爆能，也不进行爆能补偿。', 'trigger', 'EXPLOSION');
          countdownEffectReady = false;
          resetAfterEffect = false;
        } else {
          explosion = explosionFor(skill, owner);
          countdownEffectReady = explosion;
          resetAfterEffect = explosion;
        }
      } else {
        explosion = explosionFor(skill, owner);
        if (skill.explosionTailOnly) countdownEffectReady = explosion;
      }
    }
    const regularEffectReady = countdownEffectReady || (!skill.countdownTailOnly && (!skill.explosionTailOnly || explosion));
    const multi = parseFirst(skill.legacyEffect, [/多重触发\s*(\d+)/], 1);
    const valueTargets = targets.length ? targets : [owner];
    const shieldValue = primaryValueBreakdown(skill, owner, 'shield').value;
    const healValue = primaryValueBreakdown(skill, owner, 'heal').value;
    const regenValue = primaryValueBreakdown(skill, owner, 'regen').value;
    log('<strong>' + esc(owner.name) + '</strong> 使用 <strong>' + esc(skill.name) + '</strong>，按技能栏顺序结算（' + label + '）。', 'trigger', 'SKILL');
    trace(owner.name + ' → ' + skill.name, 'trigger');
    runSimpleRules(skill, '使用时', targets);

    const charge = parseFirst(skill.legacyEffect, [/充能\s*(\d+)/], 0);
    if (charge) addEnergy(owner, charge, skill.name + '技能');
    if (skill.name === '吐纳术' && explosion) {
      const amount = valueFromEffect(skill.effect, [/提升(\d+)点攻击/], 2);
      owner.permanentAtk += amount;
      owner.atk += amount;
      log('吐纳术爆能成功：' + owner.name + ' 获得永久攻击 +' + amount + '。', 'trigger', 'EXPLOSION');
    }
    if (/装填弹药|快速装弹|快速换弹/.test(skill.name)) grantAmmo(side, 2);
    if (skill.name === '轻击') addEnergy(owner, 1, '轻击使用充能（即使未命中）');
    if (shieldValue && /护盾|护甲/.test(skill.ability + skill.effect)) {
      const shieldTargets = skill.name === '蜕壳投掷' || skill.name === '凝血铠甲' || skill.name === '披甲' || skill.name === '叠甲'
        ? [owner]
        : targetsForEffectScope(skill, owner, valueTargets, ['护盾', '护甲']);
      shieldTargets.filter(target => target && !target.dead).forEach(target => applyShield(skill, target, shieldValue, skill.name));
    }
    if (healValue && /治疗/.test(skill.ability)) targetsForEffectScope(skill, owner, valueTargets, ['治疗', '恢复生命']).forEach(target => healUnit(owner, target, healValue, skill.name));
    if (regenValue && /再生/.test(skill.ability) && skill.name !== '泰诺地龙') targetsForEffectScope(skill, owner, valueTargets, ['再生']).forEach(target => applyRegen(owner, target, regenValue, skill.name));
    if (skill.name === '使劲') {
      const amount = valueFromEffect(skill.effect, [/获得(\d+)点技能伤害提升/], 2);
      skillList(side).filter(item => item.owner === owner.id).forEach(item => addSkillGrowth(item, 'damageBonus', amount, '使劲自身技能成长'));
    }
    if (skill.name === '巨力') {
      const target = valueTargets[0] || owner;
      const excited = valueFromEffect(skill.effect, [/获得(\d+)层亢奋/], 3);
      const attack = valueFromEffect(skill.effect, [/攻击\+(\d+)/], 2);
      applyExcited(owner, target, excited, '巨力增益');
      applyBuff(target, 'atk', attack, '巨力攻击');
    }
    if (skill.name === '全力冲撞' && countdownEffectReady) {
      const excited = valueFromEffect(skill.effect, [/施加(\d+)层亢奋/], 2);
      unitsOf(side, true).forEach(target => applyExcited(owner, target, excited, '全力冲撞全体增益'));
    }
    if (skill.name === '灵气淬体' && explosion && countdownEffectReady) {
      const excited = valueFromEffect(skill.effect, [/获得(\d+)层亢奋/], 2);
      unitsOf(side, true).forEach(target => applyExcited(owner, target, excited, '灵气淬体爆能'));
    }

    const burnSkill = (/引火|天火咒|火球|鞭炮|妒火|热流沙/.test(skill.name) || /点燃/.test(skill.ability))
      && (!skill.explosionCost || explosion || !/爆能/.test(skill.legacyEffect))
      && regularEffectReady;
    const poisonSkill = /毒钩|毒雾|蜈蚣锁|寒蛇影|蛇影寒|泰诺地龙|毒腺/.test(skill.name) || /淬毒/.test(skill.ability);
    const frostSkill = /覆雪|结霜/.test(skill.name + ' ' + skill.ability) && regularEffectReady;
    const frostValue = valueEntriesOf(skill).find(entry => entry.kind === 'frost');
    const directDamage = valueEntriesOf(skill).some(entry => entry.kind === 'damage') || /造成伤害/.test(skill.legacyEffect);
    const critical = attackSkill && regularEffectReady ? triggerCritical(owner, skill, targets) : false;
    const directTargets = targets.length ? targets : [owner];
    const damageTargets = targetsForEffectScope(skill, owner, directTargets, ['造成伤害', '发起攻击', '攻击']);
    const burnTargets = burnSkill ? targetsForEffectScope(skill, owner, directTargets, ['点燃', '灼烧']) : [];
    const poisonTargets = poisonSkill && regularEffectReady ? targetsForEffectScope(skill, owner, directTargets, ['剧毒', '淬毒']) : [];
    const frostTargets = frostSkill ? targetsForEffectScope(skill, owner, directTargets, ['霜冻', '覆雪', '结霜']) : [];
    const effectTargets = Array.from(new Map([...damageTargets, ...burnTargets, ...poisonTargets, ...frostTargets].map(target => [target.id, target])).values());
    const damageTargetIds = new Set(damageTargets.map(target => target.id));
    const burnTargetIds = new Set(burnTargets.map(target => target.id));
    const poisonTargetIds = new Set(poisonTargets.map(target => target.id));
    const frostTargetIds = new Set(frostTargets.map(target => target.id));
    effectTargets.forEach(target => {
      if (!regularEffectReady) return;
      if (attackSkill && damageTargetIds.has(target.id) && !target.dead && target.side !== owner.side) triggerBurnOnHit(owner, target, skill, genericAttackValue(skill, owner, 'damage'));
      if (burnTargetIds.has(target.id)) {
        const burn = genericAttackValue(skill, owner, 'burn');
        for (let hit = 0; hit < Math.max(1, multi); hit += 1) applyBurn(owner, target, burn, skill.name + '点燃', owner.name === '花椒蟹');
      }
      if (poisonTargetIds.has(target.id)) {
        applyPoison(owner, target, genericAttackValue(skill, owner, 'poison'), skill.name + '淬毒');
      }
      if (frostTargetIds.has(target.id) && frostValue && attackSkill && target.hp > 0) {
        applyFrost(owner, target, valueBreakdown(skill, owner, frostValue).value, skill.name + '覆雪');
      }
      if (damageTargetIds.has(target.id) && directDamage && attackSkill && target.hp > 0 && regularEffectReady) {
        for (let i = 0; i < multi; i += 1) {
          let value = genericAttackValue(skill, owner, 'damage');
          if (owner.name === '饿狼' && owner.firstMartialReady && /武技|攻击/.test(skill.type + skill.tags)) {
            value *= 2;
            owner.firstMartialReady = false;
            log('饿狼本回合第一个武技技能伤害翻倍。', 'trigger', 'PET PROC');
          }
          damageUnit(owner, target, value, {attackHit:true, meta:'ATTACK'});
          if (/雷电牙|镇雷/.test(skill.name)) applyParalyze(owner, target, 1, skill.name + '命中');
        }
      }
    });
    if (regularEffectReady && (skill.name === '飞抓钩' || skill.name === '上挑')) {
      const mode = skill.name === '飞抓钩' ? 'pull' : 'push';
      directTargets.filter(target => target && target.side !== owner.side).forEach(target => {
        resolveDisplacement(skill, owner, target, mode, genericAttackValue(skill, owner, 'damage'));
      });
    }
    if (regularEffectReady) triggerPassiveAttacks(owner, skill, targets);

    if (skill.name === '火中取栗' && owner.hp > 0 && regularEffectReady) applyExcited(owner, owner, valueFromEffect(skill.effect, [/给予灵兽自身(\d+)层亢奋/], 2), '火中取栗');
    if (skill.name === '元气弹' && explosion && countdownEffectReady) {
      directTargets.forEach(target => {
        if (target.side === owner.side || target.dead) return;
        const splashValue = Math.floor(genericAttackValue(skill, owner, 'damage') / 2);
        unitsOf(opponentSide(side), true).filter(other => other.id !== target.id && !other.dead && Math.abs(other.pos[0] - target.pos[0]) + Math.abs(other.pos[1] - target.pos[1]) <= 2).forEach(other => {
          damageUnit(owner, other, splashValue, {status:'爆能溅射', ignoreDefense:false, meta:'EXPLOSION'});
          log('<strong>' + esc(skill.name) + '</strong> 溅射命中 <strong>' + esc(other.name) + '</strong>，主目标伤害的一半为 <strong>' + splashValue + '</strong>。', 'output', 'EXPLOSION');
        });
      });
    }
    if (skill.name === '泰诺地龙' && owner.hp > 0 && regularEffectReady) {
      applyRegen(owner, owner, primaryValueBreakdown(skill, owner, 'regen').value, '泰诺地龙再生');
      applyExcited(owner, owner, valueFromEffect(skill.effect, [/亢奋(\d+)/], 2), '泰诺地龙亢奋');
    }
    if (skill.name === '钩爪' && regularEffectReady) directTargets.filter(target => target.side !== owner.side && !target.dead).forEach(target => applyWeak(owner, target, valueFromEffect(skill.effect, [/给予(\d+)层衰弱/], 1), '钩爪命中'));
    if (skill.name === '尾鞭' && directTargets[0] && directTargets[0].side !== owner.side && regularEffectReady) applyWeak(owner, directTargets[0], valueFromEffect(skill.effect, [/赋予目标(\d+)层衰弱/], 1), '尾鞭衰弱');
    if (skill.name === '热流沙' && regularEffectReady) directTargets.filter(target => target.side !== owner.side && !target.dead).forEach(target => applyRoot(owner, target, 1, '热流沙命中'));
    if (skill.name === '暴起' && regularEffectReady) directTargets.filter(target => target.side !== owner.side && !target.dead).forEach(target => applyWeak(owner, target, 1, '暴起命中'));
    if (skill.name === '倾泻' && countdownEffectReady) log('倾泻倒计时段触发：本次对范围目标进行多重触发 ' + multi + ' 次。', 'trigger', 'COUNTDOWN');
    if (critical && skill.name === '凌厉') skill.critBonus = 0;
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
    triggerPostSkill(owner, skill, side, attackSkill && regularEffectReady);
    if (resetAfterEffect && countdownEffectReady) {
      resetCountdown(skill, '倒计时段效果触发');
      if (skill.name === '火中取栗' && !skill.immediateUseGuard) {
        skill.immediateUseGuard = true;
        log('<strong>火中取栗</strong> 倒计时触发：立即追加一次此技能。', 'trigger', 'COUNTDOWN');
        useSkill(skill, side, {immediateUse: true});
        skill.immediateUseGuard = false;
      }
      if (skill.explosionBeforeCountdown && !skill.explosionAvailable) {
        skill.explosionAvailable = true;
        log('<strong>' + esc(skill.name) + '</strong> 倒计时段已完成，下次使用重新允许爆能。', 'trigger', 'EXPLOSION');
      }
    }
    skill.used += 1;
    owner.skillUses += 1;
    renderAll();
    checkVictory();
  }

  function endEffects(side) {
    state.phase = 'end-resolving';
    runSimpleRulesForSide('回合结束', side);
    log('—— ' + sideLabel(side) + '第 ' + state.round + ' 回合结束：状态伤害 ——', 'trigger', 'TURN END');
    unitsOf(side, true).forEach(unit => {
      if (unit.poison > 0) {
        const value = unit.poison;
        damageUnit(null, unit, value, {status:'剧毒', ignoreShield:true, meta:'POISON TICK'});
        unit.poison = Math.max(0, unit.poison - 2);
        log('<strong>' + esc(unit.name) + '</strong> 回合结束剧毒 -2，剩余 ' + unit.poison + '。', 'trigger', 'POISON TICK');
      }
      if (unit.regen > 0 && unit.hp > 0) healUnit(null, unit, unit.regen, '再生结算');
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
      const skill = state.enemySkills.find(item => item.owner === enemy.id && isAttackSkill(item) && (!item.ammoMax || item.ammo > 0) && targetsFor(item, enemy, 'enemy').length);
      if (!skill) {
        const dr = Math.sign(nearest.pos[0] - enemy.pos[0]);
        const dc = Math.sign(nearest.pos[1] - enemy.pos[1]);
        const candidate = [Math.max(0, Math.min(ROWS - 1, enemy.pos[0] + dr)), Math.max(0, Math.min(COLS - 1, enemy.pos[1] + dc))];
        const occupied = allUnits().some(unit => !unit.dead && unit.id !== enemy.id && unit.pos[0] === candidate[0] && unit.pos[1] === candidate[1]);
        if (!occupied) {
          moveUnit(enemy, candidate, {
            reason: '敌方AI移动',
            meta: 'AI MOVE',
            message: (old, next) => '<strong>' + esc(enemy.name) + '</strong> AI 向最近目标移动：' + coord(old) + ' → ' + coord(next) + '。'
          });
        }
      } else {
        log('<strong>' + esc(enemy.name) + '</strong> 选择技能 <strong>' + esc(skill.name) + '</strong>，目标按范围内最低生命值确定。', 'trigger', 'AI SELECT');
      }
    });
  }

  function beginEnemyTurn() {
    if (state.winner) return;
    state.side = 'enemy';
    state.enemyCursor = 0;
    state.trace = [];
    startEffects('enemy');
    state.phase = 'enemy-position';
    log('—— 敌方自动走位阶段：按确定性 AI 选择最近目标 ——', 'trigger', 'AI TURN');
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
    ['player', 'enemy'].forEach(side => {
      skillList(side).filter(skill => skill.name === '百战').forEach(skill => {
        const base = valueFromEffect(skill.effect, [/永久提升(\d+)点/], 3);
        const bonus = winnerSide === side ? valueFromEffect(skill.effect, [/额外提升(\d+)点/], 2) : 0;
        addSkillGrowth(skill, 'damageBonus', base + bonus, '战斗结束成长' + (bonus ? '（胜利额外）' : ''));
      });
    });
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
  function splitTags(value) {
    return String(value || '').split(/[，,、\s]+/).map(item => item.trim()).filter(Boolean);
  }

  function skillTagList() {
    const tags = new Set();
    SKILL_CATALOG.forEach(item => splitTags(item.tags).forEach(tag => tags.add(tag)));
    return Array.from(tags);
  }

  function skillTagOptions(selected) {
    return ['全部'].concat(skillTagList()).map(tag => '<option value="' + esc(tag) + '"' + (tag === selected ? ' selected' : '') + '>' + esc(tag === '全部' ? '全部标签' : tag) + '</option>').join('');
  }

  function skillOptions(selected, tagFilter) {
    const filter = tagFilter && tagFilter !== '全部' ? tagFilter : '';
    return SKILL_CATALOG.filter(item => {
      if (!filter || item.name === selected) return true;
      return splitTags(item.tags).includes(filter);
    }).map(item => '<option value="' + esc(item.name) + '"' + (item.name === selected ? ' selected' : '') + '>' + esc(item.name) + '</option>').join('');
  }
  function qualityOptions(selected) {
    return QUALITY.map(item => '<option value="' + item + '"' + (item === selected ? ' selected' : '') + '>' + item + '</option>').join('');
  }
  function ownerOptions(pets, selected) {
    return pets.map((pet, index) => pet.name ? '<option value="' + index + '"' + (Number(selected) === index ? ' selected' : '') + '>' + esc(pet.name) + '</option>' : '').join('');
  }

  function previewOwner(petItem) {
    if (!petItem || !petItem.name) return {id:'preview-owner', side:'player', name:'未分配', quality:'—', atk:0, def:0, hp:0, maxHp:0, dead:false, energy:0, maxEnergy:12};
    const cat = petCatalog(petItem && petItem.name);
    const quality = petItem && petItem.quality || cat.tier || '青铜';
    const scale = qualityScale(cat, quality);
    const hp = Math.max(1, Math.round((Number(qualityField(cat, quality, 'hp', cat.hp)) || 1) * scale));
    const atk = Math.max(0, Math.round((Number(qualityField(cat, quality, '攻击', cat.atk)) || 0) * scale));
    const def = Math.max(0, Math.round((Number(qualityField(cat, quality, '防御', cat.def)) || 0) * scale));
    const effect = String(qualityField(cat, quality, '一句话效果', cat.effect) || '暂无简述');
    const abilityEnergyCost = parseFirst(effect, [/消耗\s*(\d+)\s*点能量/], 0);
    const abilityCountdownMax = parseFirst(effect, [/倒计时\s*(\d+)/], 0);
    return {id:'preview-owner', side:'player', name:petItem && petItem.name || '未分配', quality, atk, def, hp, maxHp:hp, dead:false, energy:0, maxEnergy:12, effect, abilityEnergyCost, abilityCountdownMax, abilityCountdown:abilityCountdownMax};
  }

  function previewSkill(skillItem, owner) {
    const skill = createSkill({name:skillItem.name, quality:skillItem.quality, owner:0}, 'player', 0, [owner || previewOwner(null)]);
    skill.preview = true;
    return skill;
  }

  function configValueHtml(skillItem, owner) {
    const skill = previewSkill(skillItem, owner);
    const values = skillValueBreakdowns(skill, owner);
    if (!values.length) return '<p class="detail-empty">该技能没有可直接计算的数值，具体触发效果请查看原始文案。</p>';
    return '<div class="detail-label">基础实际数值与构成</div><div class="value-breakdown-list">' + values.map(item => '<div class="value-breakdown"><div><span>' + esc(item.label) + '</span><strong>' + item.value + '</strong></div><p>' + esc(valueFormula(item)) + '</p></div>').join('') + '</div>';
  }

  function renderConfigInfoModal() {
    const modal = $('#config-info-modal');
    const info = state.configInfo;
    if (!modal || !info) {
      if (modal) modal.hidden = true;
      return;
    }
    const item = info.item || {};
    const catalog = info.kind === 'pet' ? petCatalog(item.name) : skillCatalog(item.name);
    const quality = item.quality || catalog.tier || '青铜';
    $('#config-info-title').textContent = (info.kind === 'pet' ? '灵宠详情：' : '技能详情：') + (item.name || '未配置');
    if (info.kind === 'pet') {
      const scale = qualityScale(catalog, quality);
      const hp = Math.max(1, Math.round((Number(qualityField(catalog, quality, 'hp', catalog.hp)) || 0) * scale));
      const atk = Math.max(0, Math.round((Number(qualityField(catalog, quality, '攻击', catalog.atk)) || 0) * scale));
      const def = Math.max(0, Math.round((Number(qualityField(catalog, quality, '防御', catalog.def)) || 0) * scale));
      const effect = String(qualityField(catalog, quality, '一句话效果', catalog.effect) || '暂无简述');
      const abilityEnergyCost = parseFirst(effect, [/消耗\s*(\d+)\s*点能量/], 0);
      const abilityCountdownMax = parseFirst(effect, [/倒计时\s*(\d+)/], 0);
      $('#config-info-content').innerHTML =
        '<div class="skill-info-summary"><div class="focus-icon ally">' + esc(iconOf(item.name)) + '</div><div><strong>' + esc(item.name || '未配置') + '</strong><small>' + esc(quality) + ' · ' + (info.side === 'enemy' ? '敌方' : '己方') + '灵宠</small></div></div>' +
        '<p class="skill-info-effect">' + esc(effect) + '</p>' +
        '<div class="skill-info-grid"><div><span>生命</span><b>' + hp + '</b></div><div><span>攻击</span><b>' + atk + '</b></div><div><span>防御</span><b>' + def + '</b></div><div><span>词条</span><b>' + esc(qualityField(catalog, quality, '词条', catalog.tags) || '—') + '</b></div><div><span>套路定位</span><b>' + esc(qualityField(catalog, quality, '套路定位', catalog.role) || '—') + '</b></div><div><span>能力爆能</span><b>' + (abilityEnergyCost ? abilityEnergyCost + ' 点能量' : '—') + '</b></div><div><span>能力倒计时</span><b>' + (abilityCountdownMax ? abilityCountdownMax : '—') + '</b></div></div>';
    } else {
      const cfg = state.setupDraft && state.setupDraft[info.side || 'player'];
      const ownerItem = cfg && cfg.pets && cfg.pets[Number(info.ownerIndex)] && cfg.pets[Number(info.ownerIndex)].name ? cfg.pets[Number(info.ownerIndex)] : null;
      const owner = previewOwner(ownerItem);
      const preview = previewSkill(item, owner);
      $('#config-info-content').innerHTML =
        '<div class="skill-info-summary"><div class="focus-icon skill">' + esc(iconOf(item.name)) + '</div><div><strong>' + esc(item.name || '未配置') + '</strong><small>' + esc(quality) + ' · ' + esc(SIZE_LABEL[preview.size]) + ' · 所属灵宠：' + esc(ownerItem ? ownerItem.name : '未分配') + '</small></div></div>' +
        '<p class="skill-info-effect">' + esc(preview.effect || '暂无效果说明') + '</p>' +
        configValueHtml(item, owner) +
        '<div class="skill-info-grid"><div><span>能力</span><b>' + esc(preview.ability || '效果技能') + '</b></div><div><span>攻击范围</span><b>' + esc(preview.range || '—') + '</b></div><div><span>占用格数</span><b>' + preview.slots + ' 格</b></div><div><span>技能类型</span><b>' + esc(preview.type || '技能') + '</b></div><div><span>品质</span><b>' + esc(quality) + '</b></div><div><span>爆能消耗</span><b>' + (preview.explosionCost || '—') + '</b></div><div><span>倒计时</span><b>' + (preview.baseCountdown ? preview.countdownStart + ' / ' + preview.baseCountdown : '—') + '</b></div></div>';
    }
    modal.hidden = false;
  }

  function openConfigInfo(kind, item, side, ownerIndex) {
    if (!item || !item.name) return;
    state.configInfo = {kind, item:clone(item), side, ownerIndex};
    renderConfigInfoModal();
  }

  function closeConfigInfo() {
    state.configInfo = null;
    const modal = $('#config-info-modal');
    if (modal) modal.hidden = true;
  }

  function renderSetup() {
    const draft = state.setupDraft;
    if (!draft) return;
    let html = '';
    if (TEAM_PRESETS.length) {
      html += '<section class="setup-presets"><div class="setup-presets-head"><div><span class="kicker">QUICK LOAD / 配队范例</span><h3>一键载入完整配队</h3></div><small>来自配队范例.docx · 英雄生命统一为 660</small></div><div class="setup-preset-grid">';
      TEAM_PRESETS.forEach((preset, presetIndex) => {
        html += '<article class="setup-preset-card"><div><span>0' + (presetIndex + 1) + '</span><strong>' + esc(preset.shortName || preset.name) + '</strong><small>' + preset.pets.length + ' 灵宠 · ' + preset.skills.length + ' 技能 · 10 格</small></div><p>' + esc(preset.pets.map(pet => pet.name).join(' / ')) + '</p><footer><button type="button" data-action="apply-preset" data-preset="' + esc(preset.id) + '" data-team="player">载入己方</button><button type="button" data-action="apply-preset" data-preset="' + esc(preset.id) + '" data-team="enemy">载入对手</button></footer></article>';
      });
      html += '</div></section>';
    }
    html += '<div class="setup-grid">';
    ['player', 'enemy'].forEach(side => {
      const cfg = draft[side];
      html += '<section class="setup-team ' + side + '"><div class="setup-team-head"><div><span class="kicker">' + (side === 'player' ? 'PLAYER TEAM' : 'ENEMY TEAM') + '</span><h3>' + (side === 'player' ? '己方队伍' : '对手队伍') + '</h3></div><span class="setup-count">' + cfg.pets.filter(item => item.name).length + ' / 4 灵宠</span></div>';
      html += '<div class="setup-fields"><label>英雄等级<input type="number" min="1" max="99" data-team="' + side + '" data-field="level" value="' + cfg.level + '"></label><label>收入/金币<input type="number" min="0" data-team="' + side + '" data-field="income" value="' + cfg.income + '"></label><label>历史战斗场次<input type="number" min="0" data-team="' + side + '" data-field="history" value="' + cfg.history + '"></label><label>英雄生命上限<input type="number" min="1" data-team="' + side + '" data-field="heroHp" value="' + cfg.heroHp + '"></label></div>';
      html += '<div class="setup-section-label">上场灵宠</div><div class="setup-pets">';
      cfg.pets.forEach((pet, index) => {
        html += '<div class="setup-row"><span class="setup-index">' + (index + 1) + '</span><select data-team="' + side + '" data-kind="pet" data-index="' + index + '" data-field="name">' + petOptions(pet.name) + '</select><select data-team="' + side + '" data-kind="pet" data-index="' + index + '" data-field="quality">' + qualityOptions(pet.quality) + '</select><button type="button" class="setup-info-btn" data-action="config-pet-info" data-team="' + side + '" data-index="' + index + '"' + (pet.name ? '' : ' disabled') + '>详情</button></div>';
      });
      const skillFilter = state.setupSkillFilters[side] || '全部';
      html += '</div><div class="setup-section-label setup-skill-toolbar"><span>技能栏 <span class="setup-muted">总格数 ' + totalSlots(cfg.skills) + ' / 10</span></span><label>标签筛选<select data-action="skill-tag-filter" data-team="' + side + '">' + skillTagOptions(skillFilter) + '</select></label></div><div class="setup-skills">';
      cfg.skills.forEach((skill, index) => {
        html += '<div class="setup-row setup-skill-row"><span class="setup-index">' + (index + 1) + '</span><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="name">' + skillOptions(skill.name, skillFilter) + '</select><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="quality">' + qualityOptions(skill.quality) + '</select><select data-team="' + side + '" data-kind="skill" data-index="' + index + '" data-field="owner">' + ownerOptions(cfg.pets, skill.owner) + '</select><button type="button" class="setup-info-btn" data-action="config-skill-info" data-team="' + side + '" data-index="' + index + '">详情</button><button type="button" class="icon-btn setup-remove" data-action="remove-skill" data-team="' + side + '" data-index="' + index + '">×</button></div>';
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
    return '<div class="shop-item"><div><strong>' + esc(item.name) + '</strong><small>' + esc(item.quality) + ' · ' + cost + '金币</small></div><div class="setup-item-actions"><button type="button" class="setup-info-btn" data-action="config-item-info" data-source="shop" data-kind="' + kind + '" data-index="' + index + '">详情</button><button type="button" class="tool-btn" data-action="buy" data-kind="' + kind + '" data-index="' + index + '">购买</button></div></div>';
  }

  function inventoryHtml() {
    const all = state.inventory.skills.map((item, index) => ({item, kind:'skill', index})).concat(state.inventory.pets.map((item, index) => ({item, kind:'pet', index})));
    if (!all.length) return '<p class="setup-muted">暂无购买物品</p>';
    return all.map(entry => {
      const equipTarget = entry.kind === 'skill'
        ? '<select class="equip-owner" data-equip-owner="' + entry.index + '">' + ownerOptions(state.setupDraft.player.pets, '') + '</select>'
        : '';
      return '<div class="shop-item"><div><strong>' + esc(entry.item.name) + '</strong><small>' + esc(entry.item.quality) + ' · 可卖 ' + Math.floor(itemCost(entry.item) / 2) + '金币</small></div><div class="setup-item-actions">' + equipTarget + '<button type="button" class="setup-info-btn" data-action="config-item-info" data-source="inventory" data-kind="' + entry.kind + '" data-index="' + entry.index + '">详情</button><button type="button" class="tool-btn" data-action="equip" data-kind="' + entry.kind + '" data-index="' + entry.index + '">装备</button><button type="button" class="tool-btn" data-action="sell" data-kind="' + entry.kind + '" data-index="' + entry.index + '">出售</button></div></div>';
    }).join('');
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
    if (target.dataset.action === 'skill-tag-filter') {
      state.setupSkillFilters[target.dataset.team] = target.value || '全部';
      renderSetup();
      return;
    }
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
    state.setupSkillFilters = {player: '全部', enemy: '全部'};
    $('#setup-modal').hidden = false;
    renderSetup();
  }

  function closeSetup() {
    $('#setup-modal').hidden = true;
    state.setupDraft = null;
    closeConfigInfo();
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

  function equipItem(kind, index, requestedOwner) {
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
      const owner = Number.isInteger(requestedOwner) ? requestedOwner : state.setupDraft.player.pets.findIndex(pet => pet.name);
      if (owner < 0) { showToast('请先配置一只己方灵宠', true); return; }
      if (!state.setupDraft.player.pets[owner] || !state.setupDraft.player.pets[owner].name) { showToast('技能不能装备到空的灵宠槽位', true); return; }
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
    if (action === 'apply-preset') {
      const preset = TEAM_PRESETS.find(item => item.id === target.dataset.preset);
      if (!preset || !state.setupDraft[side]) return;
      state.setupDraft[side] = configFromPreset(preset);
      state.setupSkillFilters[side] = '全部';
      renderSetup();
      showToast('已将“' + (preset.shortName || preset.name) + '”载入' + (side === 'player' ? '己方' : '对手') + '编队');
    } else if (action === 'config-pet-info') {
      openConfigInfo('pet', state.setupDraft[side].pets[index], side, index);
    } else if (action === 'config-skill-info') {
      openConfigInfo('skill', state.setupDraft[side].skills[index], side, state.setupDraft[side].skills[index].owner);
    } else if (action === 'config-item-info') {
      const source = target.dataset.source === 'shop' ? state.shop[target.dataset.kind === 'skill' ? 'skills' : 'pets'] : state.inventory[target.dataset.kind === 'skill' ? 'skills' : 'pets'];
      openConfigInfo(target.dataset.kind === 'skill' ? 'skill' : 'pet', source[index], 'player', undefined);
    } else if (action === 'add-skill') {
      state.setupDraft[side].skills.push({name:SKILL_CATALOG[0].name, quality:SKILL_CATALOG[0].tier || '青铜', owner:0});
      renderSetup();
    } else if (action === 'remove-skill') {
      state.setupDraft[side].skills.splice(index, 1);
      renderSetup();
    } else if (action === 'buy') buyItem(target.dataset.kind, index);
    else if (action === 'sell') sellItem(target.dataset.kind, index);
    else if (action === 'equip') {
      const ownerSelect = target.parentElement.querySelector('[data-equip-owner]');
      equipItem(target.dataset.kind, index, ownerSelect ? Number(ownerSelect.value) : undefined);
    }
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
  $('#detail-content').addEventListener('click', event => {
    const target = event.target.closest('[data-skill-info]');
    if (target) openSkillInfo(skillById(target.dataset.skillInfo));
  });
  $('#close-skill-info').addEventListener('click', closeSkillInfo);
  $('#skill-info-modal').addEventListener('click', event => {
    if (event.target.id === 'skill-info-modal') closeSkillInfo();
  });
  $('#close-config-info').addEventListener('click', closeConfigInfo);
  $('#config-info-modal').addEventListener('click', event => {
    if (event.target.id === 'config-info-modal') closeConfigInfo();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSkillInfo();
      closeConfigInfo();
    }
  });
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

  const requestedPresetId = new URLSearchParams(location.search).get('preset');
  const requestedPreset = TEAM_PRESETS.find(preset => preset.id === requestedPresetId);
  const initialConfig = clone(defaultConfig);
  if (requestedPreset) initialConfig.player = configFromPreset(requestedPreset);
  buildFromConfig(initialConfig, true);
  log('战斗模拟器已就绪：先调整部署与技能顺序，再点击开始战斗。', 'trigger', 'SYSTEM');
  renderAll();
  if (requestedPreset) {
    openSetup();
    showToast('已载入配队范例“' + (requestedPreset.shortName || requestedPreset.name) + '”');
  }
})();
