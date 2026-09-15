'use strict';
(() => {
  const store = window.ATLAS_EDITOR;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const qualities = ['青铜', '白银', '黄金', '钻石'];
  const RANGE_SIZE = 9;
  const RANGE_CENTER = [4, 4];
  const targetSides = ['敌方', '友方', '自身', '自身与友方', '自身与敌方'];
  const rangeConditions = ['生命最低', '生命最高', '攻击最高', '防御最低', '防御最高', '最前方', '最后方', '带有点燃', '带有剧毒', '带有霜冻', '带有护盾', '随机1个目标', '随机2个目标', '随机3个目标'];
  const simpleTimings = ['战斗开始时', '回合开始', '回合结束', '被攻击时', '使用时', '战斗结束时', '使用自身携带其它技能时', '使用任意技能时', '造成伤害时', '受到伤害时', '失去护盾', '生命值低于（%）时', '生命值下降至以下时', '战斗胜利时', '弹药耗尽时'];
  const passiveTriggerSources = ['敌方', '友方', '自身', '自身及友方', '左侧相邻技能', '右侧相邻技能', '自身携带技能', '友方所有技能'];
  const simpleConditions = ['无条件', '爆能', '倒计时', '剩余弹药', '消耗弹药', '每拥有能量弹药'];
  const simpleScopes = ['对目标', '对自身', '对目标和自身', '对我方全体', '对敌方全体', '左侧相邻技能', '右侧相邻技能', '灵兽自身技能', '己方所有技能'];
  const simpleSkillScopes = new Set(['左侧相邻技能', '右侧相邻技能', '灵兽自身技能', '己方所有技能']);
  const simpleActions = ['充能', '装填弹药', '拖拽', '击退', '爆能', '倒计时', '伤害', '治疗', '护盾', '再生', '点燃', '灼烧', '剧毒', '淬毒', '霜冻', '覆雪', '亢奋', '衰弱', '攻击提升', '攻击下降', '防御提升', '防御下降', '伤害提升', '暴击率提升', '麻痹', '封刃', '禁足', '能量', '推进倒计时'];
  const simpleExtraActions = simpleActions.filter(action => !['爆能', '倒计时'].includes(action));
  const simpleAddons = ['无', '多重触发', '破壳'];
  const simpleGates = new Set(['爆能', '倒计时']);
  const simpleModifiers = new Set(['爆能', '倒计时', '多重触发']);
  const sharedBindings = [
    {field: '主要配合对象', input: '主要配合对象'},
    {field: '套路', input: '套路'},
    {field: '原型', input: '原型'}
  ];
  const skillBindings = [
    {field: '能力', input: '能力'},
    {field: '防御', input: 'skill-defense', numeric: true},
    {field: '弹药技能', input: '弹药技能', checkbox: true},
    {field: '弹药', input: 'skill-ammo', numeric: true},
    {field: '主动/被动', input: 'skill-activation'},
    {field: '主动效果', input: '主动效果'},
    {field: '被动效果', input: '被动效果'},
    {field: '定位', input: '定位'}
  ];
  const petBindings = [
    {field: 'hp', input: 'hp', numeric: true},
    {field: '攻击', input: '攻击', numeric: true},
    {field: '防御', input: 'pet-defense', numeric: true},
    {field: '一句话效果', input: '一句话效果'},
    {field: '套路定位', input: '套路定位'},
    {field: '升级理由', input: '升级理由'}
  ];
  let items = store.getItems();
  let kind = '技能';
  let query = '';
  let selectedId = new URLSearchParams(location.search).get('item') || (items.find(item => item.kind === '技能') || items[0]).id;
  let quality = null;
  let draft = null;
  let dirty = false;
  let rangeConfig = null;
  let rangeStructured = false;
  let simpleDraft = [];
  let simpleDraftPassive = [];
  let simpleBuilderKey = '';
  let toastTimer;

  function splitTags(value) {
    return String(value || '').split(/[，,、\s]+/).map(tag => tag.trim()).filter(Boolean);
  }

  function value(input, fallback = '未填写') {
    return input === null || input === undefined || input === '' ? fallback : String(input);
  }

  function checkedValue(input) {
    return input === true || input === 'true' || input === '是' || input === '启用' || input === 'on';
  }

  function rangeCellKey(cell) {
    return Array.isArray(cell) ? `${cell[0]},${cell[1]}` : String(cell || '');
  }

  function cleanRangeCells(cells) {
    const seen = new Set();
    return (Array.isArray(cells) ? cells : []).filter(cell => {
      if (!Array.isArray(cell) || cell.length !== 2) return false;
      const row = Number(cell[0]);
      const col = Number(cell[1]);
      const key = `${row},${col}`;
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= RANGE_SIZE || col < 0 || col >= RANGE_SIZE || key === '4,4' || seen.has(key)) return false;
      cell[0] = row;
      cell[1] = col;
      seen.add(key);
      return true;
    });
  }

  function everyRangeCell() {
    const cells = [];
    for (let row = 0; row < RANGE_SIZE; row += 1) {
      for (let col = 0; col < RANGE_SIZE; col += 1) {
        if (row !== RANGE_CENTER[0] || col !== RANGE_CENTER[1]) cells.push([row, col]);
      }
    }
    return cells;
  }

  function defaultRangeConfig() {
    return store.defaultAttackRange ? store.defaultAttackRange() : {
      version: 1, size: RANGE_SIZE, caster: RANGE_CENTER.slice(), facing: '上',
      targetSide: '敌方', targetMode: '单目标', condition: '', cells: {range: [], hits: [[3, 4]]}
    };
  }

  function skillActiveEffect(fields) {
    const source = fields || {};
    return String(source['主动效果'] == null ? (source['效果'] || '') : source['主动效果']);
  }

  function skillPassiveEffect(fields) {
    return String((fields || {})['被动效果'] || '');
  }

  function combinedSkillEffect(fields) {
    return [skillActiveEffect(fields), skillPassiveEffect(fields)].filter(Boolean).join('\n');
  }

  function legacyRangeConfig(fields) {
    const text = String((fields || {})['射程/目标'] || '正前方第一个敌人');
    const effectText = combinedSkillEffect(fields);
    const targetAndSelf = /目标(?:和|与|及)自身|自身(?:和|与|及)目标/.test(effectText);
    const config = defaultRangeConfig();
    if (targetAndSelf && /友方|我方/.test(text)) config.targetSide = '自身与友方';
    else if (targetAndSelf) config.targetSide = '自身与敌方';
    else if (/自身/.test(text) && /友方|我方/.test(text)) config.targetSide = '自身与友方';
    else if (/自身/.test(text) && /敌方|敌人|目标|前方|格/.test(text)) config.targetSide = '自身与敌方';
    else if (/自身/.test(text)) config.targetSide = '自身';
    else if (/友方|我方/.test(text)) config.targetSide = '友方';
    const condition = rangeConditions.find(item => text.includes(item))
      || (/生命最低/.test(text) ? '生命最低' : '')
      || (/生命最高/.test(text) ? '生命最高' : '')
      || (/攻击最高/.test(text) ? '攻击最高' : '')
      || (/防御最低/.test(text) ? '防御最低' : '')
      || (/防御最高/.test(text) ? '防御最高' : '')
      || (/随机友方|随机敌人/.test(text) ? '随机1个目标' : '')
      || (/第一个敌人|直线上第一个/.test(text) ? '最前方' : '');
    config.condition = condition;
    if (/全体|所有/.test(text)) config.targetMode = '范围内全体';
    else if (/多目标|第一二格|第二格和第三格|第二和第三格|左右/.test(text)) config.targetMode = '多目标';
    let cells = [[3, 4]];
    if (/第三格/.test(text)) cells = [[1, 4]];
    else if (/第二格/.test(text) && !/第一二格/.test(text)) cells = [[2, 4]];
    if (/第一二格/.test(text)) cells = [[3, 4], [2, 4]];
    if (/第二格和第三格|第二和第三格|第二格或第三格/.test(text)) cells = [[2, 4], [1, 4]];
    if (/直线/.test(text)) cells = [[3, 4], [2, 4], [1, 4], [0, 4]];
    const area = text.match(/(\d+|一|二|两|三|四)步范围/);
    if (area) {
      const numberMap = {一: 1, 二: 2, 两: 2, 三: 3, 四: 4};
      const radius = /^\d+$/.test(area[1]) ? Number(area[1]) : numberMap[area[1]];
      cells = everyRangeCell().filter(cell => Math.abs(cell[0] - 4) + Math.abs(cell[1] - 4) <= radius);
    }
    if (/全体|所有/.test(text)) cells = everyRangeCell();
    if (config.targetSide === '自身') cells = [];
    config.cells = condition ? {range: cells, hits: []} : {range: [], hits: cells};
    return config;
  }

  function normalizeRangeConfig(fields) {
    const raw = fields && fields['攻击范围配置'];
    if (!raw || typeof raw !== 'object') return legacyRangeConfig(fields);
    const config = defaultRangeConfig();
    config.targetSide = targetSides.includes(raw.targetSide) ? raw.targetSide : '敌方';
    config.targetMode = ['单目标', '多目标', '范围内全体'].includes(raw.targetMode) ? raw.targetMode : '单目标';
    config.condition = rangeConditions.includes(raw.condition) ? raw.condition : '';
    config.cells = {
      range: cleanRangeCells(raw.cells && raw.cells.range ? clone(raw.cells.range) : []),
      hits: cleanRangeCells(raw.cells && raw.cells.hits ? clone(raw.cells.hits) : [])
    };
    return config;
  }

  function rangeSummary(config) {
    const conditional = !!config.condition;
    const count = conditional ? config.cells.range.length : config.cells.hits.length;
    const cellSummary = config.targetSide === '自身' ? '施法者自身' : `${count}格${conditional ? '范围' : '命中'}`;
    return `${config.targetSide} · ${config.targetMode} · ${config.condition || '无条件'} · ${cellSummary}`;
  }

  function rangeGridMarkup(config, interactive) {
    const selfOnly = config.targetSide === '自身';
    const activeCells = new Set((selfOnly ? [] : config.condition ? config.cells.range : config.cells.hits).map(rangeCellKey));
    const activeClass = config.condition ? 'eligible' : 'hit';
    const tag = interactive ? 'button' : 'span';
    let html = '';
    for (let row = 0; row < RANGE_SIZE; row += 1) {
      for (let col = 0; col < RANGE_SIZE; col += 1) {
        const caster = row === RANGE_CENTER[0] && col === RANGE_CENTER[1];
        const key = `${row},${col}`;
        const cls = `range-cell${caster ? ' caster' : activeCells.has(key) ? ` ${activeClass}` : ''}`;
        const label = caster ? '施法者，面朝上方' : `第${row + 1}行第${col + 1}列${activeCells.has(key) ? (config.condition ? '，技能范围' : '，命中目标') : ''}`;
        html += `<${tag}${interactive ? ' type="button"' : ''} class="${cls}" data-row="${row}" data-col="${col}" aria-label="${label}"${(caster || selfOnly) && interactive ? ' disabled' : ''}>${caster ? '↑' : ''}</${tag}>`;
      }
    }
    return html;
  }

  function updateRangeSummaryInput() {
    const input = $('#item-form').elements['射程/目标'];
    if (input && rangeConfig) input.value = rangeSummary(rangeConfig);
  }

  function renderRangeGrid() {
    const grid = $('#range-grid');
    if (!grid || !rangeConfig) return;
    grid.innerHTML = rangeGridMarkup(rangeConfig, true);
    $$('.range-cell:not(.caster)', grid).forEach(cell => cell.addEventListener('click', () => {
      const point = [Number(cell.dataset.row), Number(cell.dataset.col)];
      const bucket = rangeConfig.condition ? 'range' : 'hits';
      const key = rangeCellKey(point);
      const exists = rangeConfig.cells[bucket].some(item => rangeCellKey(item) === key);
      if (!rangeConfig.condition && rangeConfig.targetMode === '单目标') rangeConfig.cells.hits = exists ? [] : [point];
      else if (exists) rangeConfig.cells[bucket] = rangeConfig.cells[bucket].filter(item => rangeCellKey(item) !== key);
      else rangeConfig.cells[bucket].push(point);
      rangeStructured = true;
      updateRangeSummaryInput();
      renderRangeGrid();
      updateRangeHelp();
      markDirty();
    }));
  }

  function updateRangeHelp() {
    if (!rangeConfig) return;
    const help = $('#range-help');
    if (rangeConfig.targetSide === '自身') help.textContent = '自身技能：绿色中央格就是唯一目标，不需要设置其它范围格。';
    else {
      const selfIncluded = rangeConfig.targetSide.startsWith('自身与') ? '；施法者自身始终同时包含在目标中' : '';
      help.textContent = rangeConfig.condition
        ? `条件技能：灰色方块是候选范围，模拟器会在其中选择“${rangeConfig.condition}”的${rangeConfig.targetSide.replace('自身与', '')}目标${selfIncluded}。`
        : `${rangeConfig.targetMode}技能：点击棋盘设置红色命中格；模拟器只会命中这些格内的${rangeConfig.targetSide.replace('自身与', '')}目标${selfIncluded}。`;
    }
  }

  function updateRangeActionState() {
    const disabled = !rangeConfig || rangeConfig.targetSide === '自身';
    $('#range-clear').disabled = disabled;
    $('#range-fill').disabled = disabled;
  }

  function renderRangeEditor(fields) {
    rangeStructured = !!(fields && fields['攻击范围配置'] && typeof fields['攻击范围配置'] === 'object');
    rangeConfig = normalizeRangeConfig(fields);
    const form = $('#item-form');
    form.elements['range-target-side'].value = rangeConfig.targetSide;
    form.elements['range-target-mode'].value = rangeConfig.targetMode;
    form.elements['range-condition'].value = rangeConfig.condition;
    updateRangeSummaryInput();
    renderRangeGrid();
    updateRangeHelp();
    updateRangeActionState();
  }

  function changeRangeControl(name, nextValue) {
    if (!rangeConfig) return;
    if (name === 'range-target-side') rangeConfig.targetSide = targetSides.includes(nextValue) ? nextValue : '敌方';
    if (name === 'range-target-mode') {
      rangeConfig.targetMode = ['单目标', '多目标', '范围内全体'].includes(nextValue) ? nextValue : '单目标';
      if (!rangeConfig.condition && rangeConfig.targetMode === '单目标' && rangeConfig.cells.hits.length > 1) rangeConfig.cells.hits = rangeConfig.cells.hits.slice(0, 1);
    }
    if (name === 'range-condition') {
      const before = rangeConfig.condition;
      rangeConfig.condition = rangeConditions.includes(nextValue) ? nextValue : '';
      if (/^随机[23]个目标$/.test(rangeConfig.condition) && rangeConfig.targetMode === '单目标') {
        rangeConfig.targetMode = '多目标';
        $('#item-form').elements['range-target-mode'].value = rangeConfig.targetMode;
      }
      if (!before && rangeConfig.condition) {
        if (!rangeConfig.cells.range.length) rangeConfig.cells.range = rangeConfig.cells.hits.length ? clone(rangeConfig.cells.hits) : [[3, 4]];
        rangeConfig.cells.hits = [];
      } else if (before && !rangeConfig.condition) {
        if (!rangeConfig.cells.hits.length) rangeConfig.cells.hits = rangeConfig.targetMode === '单目标' ? rangeConfig.cells.range.slice(0, 1) : clone(rangeConfig.cells.range);
        rangeConfig.cells.range = [];
      }
    }
    rangeStructured = true;
    updateRangeSummaryInput();
    renderRangeGrid();
    updateRangeHelp();
    updateRangeActionState();
    markDirty();
  }

  function setRangeCells(fill) {
    if (!rangeConfig) return;
    const bucket = rangeConfig.condition ? 'range' : 'hits';
    rangeConfig.cells[bucket] = fill ? (!rangeConfig.condition && rangeConfig.targetMode === '单目标' ? [[3, 4]] : everyRangeCell()) : [];
    rangeStructured = true;
    updateRangeSummaryInput();
    renderRangeGrid();
    updateRangeHelp();
    updateRangeActionState();
    markDirty();
  }

  function syncPreviousRange() {
    const qualityIndex = qualities.indexOf(quality);
    if (qualityIndex <= 0) return;
    captureForm();
    const item = selectedItem();
    const previousTier = qualities[qualityIndex - 1];
    const previousVariant = (item.variants || []).find(entry => entry.tier === previousTier);
    const current = (item.variants || []).find(entry => entry.tier === quality);
    if (!previousVariant || !current) {
      showToast(`没有找到${previousTier}品质的射程配置`, 'error');
      return;
    }
    const previousFields = previousVariant.fields || {};
    const hasStructuredRange = previousFields['攻击范围配置'] && typeof previousFields['攻击范围配置'] === 'object';
    rangeConfig = normalizeRangeConfig(previousFields);
    rangeStructured = !!hasStructuredRange;
    if (!hasStructuredRange) {
      delete current.fields['攻击范围配置'];
      current.fields['射程/目标'] = previousFields['射程/目标'] || current.fields['射程/目标'];
    }
    const form = $('#item-form');
    form.elements['range-target-side'].value = rangeConfig.targetSide;
    form.elements['range-target-mode'].value = rangeConfig.targetMode;
    form.elements['range-condition'].value = rangeConfig.condition;
    updateRangeSummaryInput();
    renderRangeGrid();
    updateRangeHelp();
    updateRangeActionState();
    markDirty();
    showToast(`已将${previousTier}品质的射程同步到${quality}`);
  }

  function selectedItem() {
    return draft && draft.id === selectedId ? draft : items.find(item => item.id === selectedId) || items[0];
  }

  function bindingsFor(item) {
    return [...(item.kind === '灵兽' ? petBindings : skillBindings), ...sharedBindings];
  }

  function nameFieldFor(item) {
    return item.kind === '灵兽' ? '宠物名' : '技能名';
  }

  function effectFieldFor(item, mode = 'active') {
    if (item.kind === '灵兽') return '一句话效果';
    return mode === 'passive' ? '被动效果' : '主动效果';
  }

  function activationFor(item, fields) {
    if (item && item.kind === '技能') {
      if (fields && (fields['主动/被动'] === '主动' || fields['主动/被动'] === '被动')) return fields['主动/被动'];
      if (skillActiveEffect(fields).trim()) return '主动';
      if (skillPassiveEffect(fields).trim()) return '被动';
    }
    return /被动/.test(((fields || {})['效果'] || '') + ((fields || {})['词条'] || '')) || ['连抓', '锋锐鳞片', '饮血倒刺'].includes(item.name) ? '被动' : '主动';
  }

  function simpleActionNeedsValue(action) {
    return action !== '拖拽' && action !== '击退';
  }

  function normalizeSimpleAction(action) {
    return ({弹药: '装填弹药', 填充弹药: '装填弹药', 灼烧: '点燃', 淬毒: '剧毒', 覆雪: '霜冻', 能量: '充能'})[action] || action;
  }

  function simpleRulePattern() {
    const timings = ['生命值(?:低于|下降至)[^】]*时', '战斗开始时', '回合开始', '回合结束', '被攻击时', '使用时', '战斗结束时', '使用自身携带其它技能时', '使用任意技能时', '造成伤害时', '受到伤害时', '失去护盾', '战斗胜利时', '弹药耗尽时'];
    const timing = timings.map((item, index) => index === 0 ? item : escapeRegExp(item)).join('|');
    const scope = simpleScopes.map(escapeRegExp).join('|');
    return new RegExp(`(?:【(?:触发来源|来源)[：:=]([^】]+)】)?【(${timing})】(?:【额外条件[：:=]([^】]+)】)?(?:【(${scope})】|(${scope}))：([^。\\n]+)。?`, 'g');
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeSimpleTiming(label) {
    const raw = String(label || '').trim();
    const threshold = raw.match(/^生命值(?:低于|下降至)\s*[（(]?(\d+(?:\.\d+)?)%?[）)]?\s*(?:时|以下时)?$/);
    if (threshold) return {timing: '生命值低于（%）时', threshold: Math.max(1, Math.min(99, Number(threshold[1]) || 50))};
    if (raw === '生命值下降至以下时') return {timing: '生命值低于（%）时', threshold: 50};
    if (raw === '回合开始时') return {timing: '回合开始'};
    if (raw === '回合结束时') return {timing: '回合结束'};
    return {timing: raw};
  }

  function parseSimpleCondition(text) {
    const raw = String(text || '').trim();
    if (!raw || raw === '无' || raw === '无条件') return {condition: '无条件', conditionValue: 0};
    const match = raw.match(/^(爆能|倒计时|消耗弹药|每拥有能量弹药)\s*(\d+)?/);
    if (match) return {condition: match[1], conditionValue: Math.max(1, Number(match[2]) || 1)};
    if (/剩余弹药|是否剩余弹药/.test(raw)) return {condition: '剩余弹药', conditionValue: 0};
    return {condition: '无条件', conditionValue: 0};
  }

  function parseSimpleAction(part) {
    const addonMatch = String(part || '').match(/\s*〔附加：(多重触发|破壳)\s*(\d+)?〕\s*$/);
    const addon = addonMatch ? addonMatch[1] : '无';
    const addonValue = addon === '多重触发' ? Math.max(1, Number(addonMatch && addonMatch[2]) || 2) : 0;
    const source = addonMatch ? String(part).slice(0, addonMatch.index).trim() : String(part || '').trim();
    const gate = source.match(/^(爆能|倒计时)\s*(\d+)?(?:[（(](额外效果|应用于此技能)(?:[：:](?:施加)?(充能|弹药|装填弹药|拖拽|击退|伤害|治疗|护盾|再生|点燃|剧毒|霜冻|亢奋|衰弱)\s*(\d+)?)?[）)])?$/);
    if (gate) {
      const extraAction = normalizeSimpleAction(gate[4] || '');
      return {
        action: gate[1],
        value: Math.max(1, Number(gate[2]) || 1),
        gateMode: gate[3] || '',
        extraAction,
        extraValue: extraAction && simpleActionNeedsValue(extraAction) ? Math.max(1, Number(gate[5]) || 1) : 0,
        addon,
        addonValue
      };
    }
    const match = source.match(/^(?:施加)?(充能|能量|弹药|装填弹药|拖拽|击退|爆能|倒计时|多重触发|伤害|治疗|护盾|再生|点燃|灼烧|剧毒|淬毒|霜冻|覆雪|亢奋|衰弱|攻击提升|攻击下降|防御提升|防御下降|伤害提升|暴击率提升|麻痹|封刃|禁足|推进倒计时)\s*(\d+)?$/);
    if (!match) return null;
    const action = normalizeSimpleAction(match[1]);
    return {action, value: simpleActionNeedsValue(action) ? Math.max(1, Number(match[2]) || 1) : 0, gateMode: '', extraAction: '', extraValue: 0, addon, addonValue};
  }

  function parseSimpleEffectText(text) {
    const rules = [];
    const pattern = simpleRulePattern();
    let match;
    while ((match = pattern.exec(String(text || '')))) {
      const timing = normalizeSimpleTiming(match[2]);
      const condition = parseSimpleCondition(match[3]);
      const scope = match[4] || match[5];
      match[6].split('、').map(part => part.trim()).filter(Boolean).forEach(part => {
        const parsed = parseSimpleAction(part);
        if (parsed) rules.push({timing: timing.timing, threshold: timing.threshold || 0, triggerSource: match[1] || '自身', scope, ...condition, ...parsed});
      });
    }
    return rules;
  }

  function simpleEffectActionText(action, value) {
    const prefix = ['亢奋', '衰弱'].includes(action) ? '施加' : '';
    return `${prefix}${action}${simpleActionNeedsValue(action) ? value : ''}`;
  }

  function simpleActionText(rule) {
    const main = simpleEffectActionText(rule.action, rule.value);
    let text = main;
    if (simpleGates.has(rule.action) && rule.gateMode) {
      if (rule.gateMode === '应用于此技能') text = `${main}（应用于此技能）`;
      else {
        const extra = rule.extraAction ? simpleEffectActionText(rule.extraAction, rule.extraValue) : '';
        text = `${main}（额外效果${extra ? `：${extra}` : ''}）`;
      }
    }
    if (rule.addon === '多重触发') return `${text}〔附加：多重触发${Math.max(1, Number(rule.addonValue) || 2)}〕`;
    if (rule.addon === '破壳') return `${text}〔附加：破壳〕`;
    return text;
  }

  function simpleTimingText(rule) {
    if (rule.timing === '生命值低于（%）时') return `生命值低于（${Math.max(1, Math.min(99, Number(rule.threshold) || 50))}%）时`;
    return rule.timing;
  }

  function simpleConditionText(rule) {
    const condition = rule.condition || '无条件';
    if (condition === '无条件') return '无条件';
    if (condition === '剩余弹药') return '是否剩余弹药';
    if (condition === '每拥有能量弹药') return `每拥有${Math.max(1, Number(rule.conditionValue) || 1)}点能量/弹药`;
    return `${condition}${Math.max(1, Number(rule.conditionValue) || 1)}`;
  }

  function generatedSimpleRuleText(rule, mode) {
    const sourcePrefix = mode === 'passive' ? `【触发来源：${rule.triggerSource || '自身'}】` : '';
    const conditionPrefix = mode === 'passive' && rule.condition && rule.condition !== '无条件' ? `【额外条件：${simpleConditionText(rule)}】` : '';
    return `${sourcePrefix}【${simpleTimingText(rule)}】${conditionPrefix}【${rule.scope}】：${simpleActionText(rule)}。`;
  }

  function simplePanel(mode = 'active') {
    const passive = mode === 'passive';
    const prefix = passive ? 'simple-passive' : 'simple';
    return {
      root: $(`#${prefix}-effect-builder`),
      list: $(`#${prefix}-effect-list`),
      title: $(`#${prefix}-effect-title`),
      read: $(`#${prefix}-effect-read`),
      timing: `input[name="${prefix}-timing"]`,
      scope: $(`#${prefix}-effect-scope`),
      action: $(`#${prefix}-effect-action`),
      value: $(`#${prefix}-effect-value`),
      add: $(`#${prefix}-effect-add`),
      gateOptions: $(`#${prefix}-gate-options`),
      gateMode: $(`#${prefix}-gate-mode`),
      extraControls: $(`#${prefix}-extra-controls`),
      extraAction: $(`#${prefix}-extra-action`),
      extraValue: $(`#${prefix}-extra-value`),
      addon: $(`#${prefix}-addon`),
      addonValue: $(`#${prefix}-addon-value`),
      triggerSource: $(`#${prefix}-trigger-source`),
      condition: $(`#${prefix}-condition`),
      conditionValue: $(`#${prefix}-condition-value`),
      threshold: $(`#${prefix}-threshold`),
      clear: $(`#${prefix}-effect-clear`),
      apply: $(`#${prefix}-effect-apply`),
      help: $(`#${prefix}-effect-help`)
    };
  }

  function simpleDraftFor(mode = 'active') {
    return mode === 'passive' ? simpleDraftPassive : simpleDraft;
  }

  function setSimpleDraft(mode, next) {
    if (mode === 'passive') simpleDraftPassive = next;
    else simpleDraft = next;
  }

  function groupedSimpleRules(mode = 'active') {
    const groups = new Map();
    simpleDraftFor(mode).forEach(rule => {
      const key = `${rule.timing}\u0000${rule.threshold || 0}\u0000${rule.triggerSource || '自身'}\u0000${rule.condition || '无条件'}\u0000${rule.conditionValue || 0}\u0000${rule.scope}`;
      if (!groups.has(key)) groups.set(key, {timing: rule.timing, scope: rule.scope, rules: []});
      groups.get(key).rules.push(rule);
    });
    return Array.from(groups.values()).sort((a, b) => simpleTimings.indexOf(a.timing) - simpleTimings.indexOf(b.timing) || simpleScopes.indexOf(a.scope) - simpleScopes.indexOf(b.scope));
  }

  function renderSimpleEffectBuilder(mode = 'active') {
    const panel = simplePanel(mode);
    if (!panel.root) return;
    const currentDraft = simpleDraftFor(mode);
    panel.list.innerHTML = currentDraft.map((rule, index) => `<div class="simple-effect-row"><b>${esc(simpleTimingText(rule))}</b><i>${esc(rule.triggerSource || rule.scope)}</i><span>${esc(rule.condition && rule.condition !== '无条件' ? `${simpleConditionText(rule)} · ` : '')}${esc(rule.scope)} · ${esc(simpleActionText(rule))}</span><button type="button" data-simple-remove="${index}" aria-label="删除${esc(simpleActionText(rule))}">删除</button></div>`).join('');
    const action = panel.action.value;
    if (panel.value) panel.value.disabled = !simpleActionNeedsValue(action);
    const item = selectedItem();
    const pet = item && item.kind === '灵兽';
    const gate = simpleGates.has(action);
    if (panel.gateOptions) panel.gateOptions.hidden = !gate;
    const gateMode = panel.gateMode;
    if (gateMode) {
      const applyOption = Array.from(gateMode.options).find(option => option.value === '应用于此技能');
      if (applyOption) applyOption.disabled = pet || mode === 'passive';
      if (pet && gateMode.value === '应用于此技能') gateMode.value = '额外效果';
    }
    if (panel.extraControls) panel.extraControls.hidden = !gate || !gateMode || gateMode.value !== '额外效果';
    if (panel.extraValue && panel.extraAction) panel.extraValue.disabled = !simpleActionNeedsValue(panel.extraAction.value);
    if (panel.addon && panel.addonValue) {
      const addonField = panel.addonValue.closest('.simple-addon-value-field');
      const needsAddonValue = panel.addon.value === '多重触发';
      panel.addonValue.disabled = !needsAddonValue;
      if (addonField) addonField.hidden = !needsAddonValue;
    }
    if (panel.condition) {
      const condition = panel.condition.value;
      if (panel.conditionValue) {
        panel.conditionValue.disabled = !['爆能', '倒计时', '消耗弹药', '每拥有能量弹药'].includes(condition);
        const conditionField = panel.conditionValue.closest('.field');
        if (conditionField) conditionField.hidden = !['爆能', '倒计时', '消耗弹药', '每拥有能量弹药'].includes(condition);
      }
    }
    if (panel.threshold) {
      const thresholdField = panel.threshold.closest('.threshold-value-field');
      const hasThreshold = $$(panel.timing + ':checked').some(input => normalizeSimpleTiming(input.value).timing === '生命值低于（%）时');
      if (thresholdField) thresholdField.hidden = !hasThreshold;
      if (hasThreshold) panel.threshold.value = Math.max(1, Math.min(99, Number(panel.threshold.value) || 50));
    }
    Array.from(panel.scope.options).forEach(option => {
      option.disabled = pet && simpleSkillScopes.has(option.value) && option.value !== '灵兽自身技能' && option.value !== '己方所有技能';
    });
    if (panel.scope.selectedOptions[0] && panel.scope.selectedOptions[0].disabled) panel.scope.value = '对自身';
    const fixedActiveTiming = !pet && mode === 'active';
    const timingLegend = panel.root.querySelector('.simple-timings legend');
    if (timingLegend) timingLegend.textContent = fixedActiveTiming ? '触发时机（主动技能固定）' : mode === 'passive' ? '被动触发时机（可多选）' : '触发时机（可多选）';
    $$(panel.timing).forEach(input => {
      const label = input.closest('label');
      if (label) label.hidden = fixedActiveTiming && input.value !== '使用时';
      if (fixedActiveTiming) {
        input.checked = input.value === '使用时';
        input.disabled = true;
      } else {
        input.disabled = pet && input.value === '使用时';
        if (input.disabled) input.checked = false;
      }
    });
    panel.help.textContent = pet
      ? '灵宠只有被动能力；简化效果只通过所选时机触发，可为自身技能或己方技能装填弹药。手写效果仍为最终依据。'
      : mode === 'passive'
        ? '被动效果只在触发时机满足时结算；手写效果优先级最高。'
        : '“应用于此技能”会门控能力和主动效果；写在爆能前的充能仍会先结算，写在爆能后的效果需爆能成功。';
  }

  function loadSimpleEffectBuilder(mode = 'active', showMessage = false) {
    const item = selectedItem();
    const panel = simplePanel(mode);
    const textarea = $('#item-form').elements[effectFieldFor(item, mode)];
    const parsed = parseSimpleEffectText(textarea ? textarea.value : '');
    const next = mode === 'active' && item.kind !== '灵兽' ? parsed.filter(rule => rule.timing === '使用时') : parsed;
    setSimpleDraft(mode, next);
    renderSimpleEffectBuilder(mode);
    if (showMessage) showToast(next.length ? `已读取 ${next.length} 项${mode === 'passive' ? '被动' : '主动'}简化效果` : '效果栏中没有可读取的简化规则');
  }

  function addSimpleEffect(mode = 'active') {
    const panel = simplePanel(mode);
    const timings = $$(panel.timing + ':checked').map(input => input.value).filter(value => simpleTimings.includes(value));
    if (!timings.length) {
      showToast('请至少选择一个触发时机', 'error');
      return;
    }
    const scope = panel.scope.value;
    const action = panel.action.value;
    if (!simpleScopes.includes(scope) || !simpleActions.includes(action)) return;
    const value = simpleActionNeedsValue(action) ? Math.max(1, Math.min(99, Number(panel.value.value) || 1)) : 0;
    const gateMode = simpleGates.has(action) ? panel.gateMode.value : '';
    const extraAction = gateMode === '额外效果' ? panel.extraAction.value : '';
    if (extraAction && !simpleExtraActions.includes(extraAction)) return;
    const extraValue = extraAction && simpleActionNeedsValue(extraAction) ? Math.max(1, Math.min(99, Number(panel.extraValue.value) || 1)) : 0;
    const addon = panel.addon && simpleAddons.includes(panel.addon.value) ? panel.addon.value : '无';
    const addonValue = addon === '多重触发' && panel.addonValue ? Math.max(1, Math.min(99, Number(panel.addonValue.value) || 2)) : 0;
    const triggerSource = mode === 'passive' && panel.triggerSource && passiveTriggerSources.includes(panel.triggerSource.value) ? panel.triggerSource.value : '自身';
    const condition = mode === 'passive' && panel.condition && simpleConditions.includes(panel.condition.value) ? panel.condition.value : '无条件';
    const conditionValue = mode === 'passive' && panel.conditionValue && ['爆能', '倒计时', '消耗弹药', '每拥有能量弹药'].includes(condition)
      ? Math.max(1, Math.min(99, Number(panel.conditionValue.value) || 1)) : 0;
    const threshold = mode === 'passive' && panel.threshold
      ? Math.max(1, Math.min(99, Number(panel.threshold.value) || 50)) : 0;
    const currentDraft = simpleDraftFor(mode);
    timings.forEach(timing => {
      const normalizedTiming = normalizeSimpleTiming(timing);
      const next = {timing: normalizedTiming.timing, threshold: normalizedTiming.timing === '生命值低于（%）时' ? threshold : 0, triggerSource, condition, conditionValue, scope, action, value, gateMode, extraAction, extraValue, addon, addonValue};
      const existing = currentDraft.find(rule => rule.timing === next.timing && rule.threshold === next.threshold && rule.scope === scope && rule.action === action && (mode !== 'passive' || rule.triggerSource === triggerSource));
      if (existing) Object.assign(existing, next);
      else currentDraft.push(next);
    });
    renderSimpleEffectBuilder(mode);
  }

  function applySimpleEffects(mode = 'active') {
    const groups = groupedSimpleRules(mode);
    if (!groups.length) {
      showToast('请先加入至少一项简化效果', 'error');
      return;
    }
    if (groups.some(group => group.rules.every(rule => simpleModifiers.has(rule.action) && !rule.gateMode))) {
      showToast('每个触发时机和对象组合至少需要一项实际效果', 'error');
      return;
    }
    if (groups.some(group => group.rules.some(rule => rule.gateMode === '额外效果' && !rule.extraAction))) {
      showToast('“额外效果”需要选择一项额外泛用效果', 'error');
      return;
    }
    const item = selectedItem();
    const textarea = $('#item-form').elements[effectFieldFor(item, mode)];
    if (!textarea) return;
    const manual = textarea.value
      .replace(simpleRulePattern(), '')
      .split('\n').map(line => line.trim()).filter(Boolean).join('\n');
    const generated = groups.map(group => {
      const first = group.rules[0];
      const sourcePrefix = mode === 'passive' ? `【触发来源：${first.triggerSource || '自身'}】` : '';
      const conditionPrefix = mode === 'passive' && first.condition && first.condition !== '无条件' ? `【额外条件：${simpleConditionText(first)}】` : '';
      return `${sourcePrefix}【${simpleTimingText(first)}】${conditionPrefix}【${group.scope}】：${group.rules.map(simpleActionText).join('、')}。`;
    }).join('\n');
    textarea.value = [manual, generated].filter(Boolean).join('\n');
    loadSimpleEffectBuilder(mode);
    markDirty();
    showToast('简化规则已应用；保存后同步到战斗模拟器');
  }

  function currentVariant(item) {
    const tier = quality || item.tier || '青铜';
    return (item.variants || []).find(variant => variant.tier === tier) || {tier, fields: {...item.fields, '品质': tier}, source: item.source};
  }

  function canonicalTags(item) {
    const base = (item.variants || []).find(variant => variant.tier === item.tier);
    return value(base && base.fields ? base.fields['词条'] : (item.fields || {})['词条'], '');
  }

  function isChanged(item) {
    return item.custom || item.edited || store.isModified(item.id);
  }

  function showToast(message, type) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function setSaveState(label, state) {
    const node = $('#save-state');
    node.textContent = label;
    node.className = 'save-state' + (state ? ' ' + state : '');
  }

  function refreshItems() {
    items = store.getItems();
    window.ATLAS_DATA.items.splice(0, window.ATLAS_DATA.items.length, ...items);
    simpleBuilderKey = '';
  }

  function activateKind(nextKind) {
    kind = nextKind;
    $$('.kind-tabs button').forEach(button => {
      const active = button.dataset.kind === kind;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderList() {
    const available = draft && !items.some(item => item.id === draft.id) ? [...items, draft] : items;
    const source = available.filter(item => (kind === '全部' || item.kind === kind) && (!query || `${item.name} ${JSON.stringify(item.fields)} ${JSON.stringify(item.variants)}`.toLowerCase().includes(query)));
    $('#item-count').textContent = source.length;
    $('#result-label').textContent = (kind === '全部' ? '全部条目' : kind === '灵兽' ? '灵宠列表' : '技能列表') + ` · ${source.length}`;
    $('#catalog-list').innerHTML = source.length ? source.map(item => {
      const fields = item.fields || {};
      const summary = item.kind === '灵兽' ? `${value(fields.hp, '—')} 生命 · ${value(fields['攻击'], '—')} 攻击` : value(fields['词条'], '未设置标签');
      return `<button class="catalog-item ${item.kind === '灵兽' ? 'pet' : ''} ${item.id === selectedId ? 'active' : ''}" data-id="${esc(item.id)}" role="option" aria-selected="${item.id === selectedId}"><span class="item-glyph">${esc(item.name.slice(0, 1))}</span><span class="catalog-copy"><strong>${esc(item.name)}${isChanged(item) ? '<i title="有本地修改"></i>' : ''}</strong><small>${esc(summary)}</small></span><span class="catalog-tier">${esc(item.tier)}</span></button>`;
    }).join('') : '<div class="empty-list">没有找到对应内容。<br>可尝试名称、标签或效果关键词。</div>';
    $$('.catalog-item').forEach(button => button.addEventListener('click', () => select(button.dataset.id)));
  }

  function renderPreview() {
    const item = selectedItem();
    const variant = currentVariant(item);
    const fields = variant.fields || item.fields || {};
    const pet = item.kind === '灵兽';
    const passiveSkill = !pet && activationFor(item, fields) === '被动';
    const tags = [...(pet ? [] : [activationFor(item, fields)]), ...splitTags(fields['词条'])];
    const ammoEnabled = !pet && (fields['弹药技能'] === true || fields['弹药技能'] === 'true' || fields['弹药技能'] === '是' || fields['弹药技能'] === '启用');
    const ammoText = ammoEnabled ? `${value(fields['弹药'], '0')} / ${value(fields['弹药'], '0')}` : '-/-';
    const stats = pet
      ? [['生命值', fields.hp], ['攻击', fields['攻击']], ['防御', fields['防御']]]
      : passiveSkill
        ? [['防御', fields['防御']], ['弹药', ammoText]]
        : [['能力', fields['能力']], ['防御', fields['防御']], ['弹药', ammoText], ['射程 / 目标', fields['射程/目标']]];
    const activeEffect = pet || passiveSkill ? '' : skillActiveEffect(fields);
    const passiveEffect = pet ? String(fields['一句话效果'] || '') : skillPassiveEffect(fields);
    const previewRange = pet || passiveSkill ? null : normalizeRangeConfig(fields);
    const rangePreviewHtml = pet || passiveSkill ? '' : `<div class="preview-range-block"><div class="range-grid" aria-label="技能攻击范围预览">${rangeGridMarkup(previewRange, false)}</div><div class="preview-range-copy"><span>ATTACK RANGE</span><strong>${esc(rangeSummary(previewRange))}</strong><small>${fields['攻击范围配置'] ? '绿色为施法者；灰色为条件候选范围；红色为无条件命中目标。' : '当前由旧版射程文字推导预览；在右侧编辑棋盘后会保存为精确范围。'}</small></div></div>`;
    const source = variant.source || item.source || {sheet: '编辑器新增', row: '—'};
    $('#preview-title').textContent = pet ? '灵宠详情' : '技能详情';
    $('#item-preview').innerHTML = `
      <div class="preview-top"><span>${esc(item.kind)} · ${esc(variant.tier || item.tier)}</span><span class="modified-mark">${isChanged(item) || dirty ? '● 工作副本' : '○ 表格基线'}</span></div>
      <div class="preview-name"><span class="preview-avatar">${esc(item.name.slice(0, 1))}</span><div><h2>${esc(item.name)}</h2><p>${esc(value(pet ? fields['套路定位'] : fields['定位'], pet ? '未设置套路定位' : '未设置定位'))}</p></div></div>
      <div class="preview-tags">${tags.length ? tags.map(tag => `<span>${esc(tag)}</span>`).join('') : '<span>未设置标签</span>'}</div>
      <div class="preview-stats">${stats.map(([label, content]) => `<div class="preview-stat"><span>${esc(label)}</span><strong>${esc(value(content))}</strong></div>`).join('')}</div>
      ${rangePreviewHtml}
      ${pet || passiveSkill
        ? `<div class="preview-effect"><span class="effect-channel-label">被动效果</span>${esc(value(passiveEffect, pet ? '请在右侧输入灵宠被动效果' : '未设置被动效果'))}</div>`
        : `<div class="preview-effect preview-effect-active"><span class="effect-channel-label">主动效果</span>${esc(value(activeEffect, '未设置主动效果；能力栏仍会在战斗中显示'))}</div><div class="preview-effect preview-effect-passive"><span class="effect-channel-label">被动效果</span>${esc(value(passiveEffect, '未设置被动效果'))}</div>`}
      <div class="source-card"><b>${esc(source.sheet || '新数值.xlsx')}</b> · 第 ${esc(source.row || '—')} 行<br>${item.custom ? `编辑器新建${pet ? '灵宠' : '技能'}，将随编辑补丁或 CSV 导出。` : '来源：新数值.xlsx；本地修改以覆盖层保存。'}</div>`;
  }

  function renderQualityTabs() {
    const tabs = $('#quality-tabs');
    tabs.innerHTML = qualities.map(tier => `<button type="button" role="tab" data-quality="${tier}" class="${quality === tier ? 'active' : ''}" aria-selected="${quality === tier}">${tier}</button>`).join('');
    $$('[data-quality]', tabs).forEach(button => button.addEventListener('click', () => {
      if (button.dataset.quality === quality) return;
      captureForm();
      quality = button.dataset.quality;
      renderEditor();
      renderPreview();
    }));
  }

  function renderEditor() {
    const item = selectedItem();
    const pet = item.kind === '灵兽';
    if (!quality || !qualities.includes(quality)) quality = item.tier || '青铜';
    const variant = currentVariant(item);
    const fields = variant.fields || {};
    const form = $('#item-form');
    $('#skill-fields').hidden = pet;
    $('#pet-fields').hidden = !pet;
    $('#item-name-label').textContent = pet ? '灵宠名称' : '技能名称';
    $('#editor-title').textContent = pet ? (item.custom ? '设计新灵宠' : '编辑灵宠') : (item.custom ? '设计新技能' : '编辑技能');
    form.elements.name.value = item.name || '';
    form.elements.tier.value = item.tier || '青铜';
    bindingsFor(item).forEach(binding => {
      const fallback = binding.numeric ? '0' : '';
      const control = form.elements[binding.input];
      if (!control) return;
      if (binding.checkbox) control.checked = checkedValue(fields[binding.field]);
      else control.value = value(fields[binding.field], fallback);
    });
    if (!pet) form.elements['skill-activation'].value = activationFor(item, fields);
    if (!pet && form.elements['skill-ammo']) form.elements['skill-ammo'].disabled = !form.elements['弹药技能'].checked;
    const passiveBuilder = $('#simple-passive-effect-builder');
    if (passiveBuilder) passiveBuilder.hidden = pet;
    if (pet) {
      const activePanel = simplePanel('active');
      if (activePanel.title) activePanel.title.textContent = '灵宠被动效果 · 简化编辑';
      const subtitle = activePanel.title && activePanel.title.parentElement ? activePanel.title.parentElement.querySelector('small') : null;
      if (subtitle) subtitle.textContent = '灵宠只有被动能力；组合常用触发与效果，再应用到效果栏';
      if (activePanel.apply) activePanel.apply.textContent = '应用到灵宠效果栏';
    } else {
      const activePanel = simplePanel('active');
      if (activePanel.title) activePanel.title.textContent = '主动效果 · 简化编辑';
      const subtitle = activePanel.title && activePanel.title.parentElement ? activePanel.title.parentElement.querySelector('small') : null;
      if (subtitle) subtitle.textContent = '组合常用触发与效果，再应用到主动效果栏';
      if (activePanel.apply) activePanel.apply.textContent = '应用到主动效果栏';
    }
    const nextBuilderKey = `${item.id}:${quality}`;
    if (simpleBuilderKey !== nextBuilderKey) {
      simpleBuilderKey = nextBuilderKey;
      simpleDraft = parseSimpleEffectText(pet ? (fields['一句话效果'] || '') : skillActiveEffect(fields));
      if (!pet) simpleDraft = simpleDraft.filter(rule => rule.timing === '使用时');
      simpleDraftPassive = pet ? [] : parseSimpleEffectText(skillPassiveEffect(fields));
      $$('input[name="simple-timing"], input[name="simple-passive-timing"]').forEach(input => { input.checked = false; });
    }
    renderSimpleEffectBuilder('active');
    renderSimpleEffectBuilder('passive');
    const passiveSkill = !pet && form.elements['skill-activation'].value === '被动';
    $$('.active-skill-option').forEach(container => {
      container.hidden = passiveSkill;
      $$('input, select, textarea, button', container).forEach(control => { control.disabled = passiveSkill; });
    });
    const activeBuilder = simplePanel('active');
    if (activeBuilder.root) {
      activeBuilder.root.hidden = passiveSkill;
      $$('input, select, button', activeBuilder.root).forEach(control => { control.disabled = passiveSkill; });
      if (!passiveSkill) renderSimpleEffectBuilder('active');
    }
    if (pet) {
      rangeConfig = null;
      rangeStructured = false;
    } else {
      renderRangeEditor(fields);
      const syncButton = $('#range-sync-previous');
      const qualityIndex = qualities.indexOf(quality);
      syncButton.disabled = qualityIndex <= 0;
      syncButton.title = syncButton.disabled ? '青铜是第一品质，没有上一品质' : `复制${qualities[qualityIndex - 1]}品质的射程配置`;
    }
    const tagInput = form.elements['词条'];
    tagInput.value = canonicalTags(item);
    tagInput.disabled = quality !== item.tier;
    $('#tag-sync-note').textContent = tagInput.disabled
      ? `沿用${item.tier}起步品质标签，请切换到${item.tier}修改`
      : '修改后会同步到全部品质阶段';
    renderQualityTabs();
    renderTags();
    $('#reset-item').textContent = item.custom ? `删除这个新${pet ? '灵宠' : '技能'}` : '撤销本地修改';
    $('#reset-item').disabled = !item.custom && !store.isModified(item.id);
    $('#duplicate-item').textContent = `复制为新${pet ? '灵宠' : '技能'}`;
    $('#editor-note').textContent = item.custom
      ? pet
        ? '新灵宠会加入图鉴，并出现在战斗模拟器的灵宠选择列表中。生命、攻击、防御和效果文本会同步；特殊机制仍按模拟器已支持的关键词解析。'
        : '新技能会加入图鉴，并出现在战斗模拟器的“战斗配置 → 添加技能”列表中。通用伤害、治疗、护盾、点燃、淬毒、弹药与倒计时会按文本识别。'
      : `已有${pet ? '灵宠' : '技能'}来自表格基线。保存会建立本地覆盖，不会改写原始 Excel 文件；战斗模拟器会优先读取覆盖后的数值。`;
    if (dirty) setSaveState('待保存', 'dirty');
    else setSaveState(isChanged(item) ? '已同步' : '未修改', isChanged(item) ? 'saved' : '');
  }

  function renderTags() {
    const input = $('#item-form').elements['词条'];
    $('#tag-preview').innerHTML = splitTags(input.value).map(tag => `<span>${esc(tag)}</span>`).join('');
  }

  function captureForm() {
    const item = selectedItem();
    if (!item) return;
    if (!draft || draft.id !== item.id) draft = clone(item);
    const form = $('#item-form');
    const nextTier = form.elements.tier.value || draft.tier || '青铜';
    const nameField = nameFieldFor(draft);
    const ensureVariant = tier => {
      let variant = draft.variants.find(entry => entry.tier === tier);
      if (!variant) {
        variant = {tier, fields: {...draft.fields, '品质': tier, [nameField]: null}, source: draft.source};
        draft.variants.push(variant);
      }
      variant.fields = {...(variant.fields || {})};
      return variant;
    };
    draft.name = form.elements.name.value.trim();
    draft.tier = nextTier;
    draft.variants = Array.isArray(draft.variants) ? draft.variants : [];
    const variant = ensureVariant(quality);
    bindingsFor(draft).forEach(binding => {
      const control = form.elements[binding.input];
      if (!control) return;
      const raw = binding.checkbox ? control.checked : control.value;
      variant.fields[binding.field] = binding.numeric && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    });
    if (draft.kind === '技能') {
      variant.fields['效果'] = skillActiveEffect(variant.fields);
      variant.fields['主动/被动'] = activationFor(draft, variant.fields);
      if (!variant.fields['弹药技能']) variant.fields['弹药'] = 0;
    }
    if (draft.kind === '技能' && rangeConfig && rangeStructured) {
      variant.fields['攻击范围配置'] = clone(rangeConfig);
      variant.fields['射程/目标'] = rangeSummary(rangeConfig);
    }
    variant.fields['品质'] = quality;
    ensureVariant(nextTier);
    draft.variants.forEach(entry => {
      entry.fields = {...(entry.fields || {}), '品质': entry.tier};
      entry.fields[nameField] = entry.tier === nextTier ? draft.name : null;
    });
    const baseVariant = ensureVariant(nextTier);
    if (quality === nextTier && !form.elements['词条'].disabled) baseVariant.fields['词条'] = form.elements['词条'].value;
    const tags = baseVariant.fields['词条'] == null ? '' : baseVariant.fields['词条'];
    draft.variants.forEach(entry => { entry.fields['词条'] = tags; });
    draft.fields = clone(baseVariant.fields);
    draft.effect = draft.kind === '灵兽' ? (baseVariant.fields['一句话效果'] || '') : skillActiveEffect(baseVariant.fields);
  }

  function markDirty() {
    const item = selectedItem();
    if (!item) return;
    captureForm();
    dirty = true;
    setSaveState('待保存', 'dirty');
    renderList();
    renderPreview();
  }

  function select(id) {
    selectedId = id;
    draft = null;
    dirty = false;
    simpleBuilderKey = '';
    const item = items.find(entry => entry.id === id);
    quality = item ? item.tier : '青铜';
    const url = new URL(location.href);
    url.searchParams.set('item', id);
    history.replaceState(null, '', url);
    renderList();
    renderEditor();
    renderPreview();
  }

  function saveCurrent(event) {
    event.preventDefault();
    captureForm();
    const label = draft.kind === '灵兽' ? '灵宠' : '技能';
    if (!draft.name.trim()) {
      showToast(`请先填写${label}名称`, 'error');
      return;
    }
    store.saveItem(draft);
    selectedId = draft.id;
    draft = null;
    dirty = false;
    refreshItems();
    renderAll();
    showToast(`已保存${label}，并同步到图鉴与战斗模拟器`);
  }

  function newItem(itemKind, seed) {
    activateKind(itemKind);
    query = '';
    $('#catalog-search').value = '';
    draft = itemKind === '灵兽' ? store.createPet(seed) : store.createSkill(seed);
    selectedId = draft.id;
    quality = draft.tier;
    dirty = true;
    const url = new URL(location.href);
    url.searchParams.set('item', selectedId);
    history.replaceState(null, '', url);
    renderList();
    renderEditor();
    renderPreview();
    $('#item-form').elements.name.focus();
  }

  function resetCurrent() {
    const item = selectedItem();
    if (!item) return;
    const custom = item.custom || !items.some(entry => entry.id === item.id);
    const label = item.kind === '灵兽' ? '灵宠' : '技能';
    const message = custom ? `删除新${label}“${item.name}”？` : `撤销“${item.name}”的全部本地修改？`;
    if (!confirm(message)) return;
    if (custom && !store.isModified(item.id)) draft = null;
    else {
      store.resetItem(item.id);
      draft = null;
      refreshItems();
    }
    activateKind(item.kind);
    selectedId = (items.find(entry => entry.kind === item.kind) || items[0]).id;
    quality = null;
    dirty = false;
    renderAll();
    showToast(custom ? `新${label}已删除` : '已恢复表格基线');
  }

  function download(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(input) {
    const text = String(input == null ? '' : input);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function exportCsv(itemKind) {
    refreshItems();
    const pet = itemKind === '灵兽';
    const headers = pet
      ? ['套路', '宠物名', '品质', '词条', 'hp', '攻击', '防御', '一句话效果', '主要配合对象', '升级理由', '套路定位', '原型', '来源工作表', '来源行']
      : ['技能名', '品质', '主动/被动', '能力', '防御', '弹药技能', '弹药', '射程/目标', '目标阵营', '目标方式', '目标条件', '攻击范围配置', '主动效果', '被动效果', '效果', '词条', '主要配合对象', '定位', '套路', '原型', '来源工作表', '来源行'];
    const rows = [headers];
    items.filter(item => item.kind === itemKind).forEach(item => {
      const variants = item.variants && item.variants.length ? item.variants : [{tier: item.tier, fields: item.fields, source: item.source}];
      variants.forEach(variant => {
        const fields = variant.fields || {};
        const source = variant.source || item.source || {};
        const attackRange = pet ? null : normalizeRangeConfig(fields);
        rows.push(pet
          ? [fields['套路'], variant.tier === item.tier ? item.name : '', variant.tier, fields['词条'], fields.hp, fields['攻击'], fields['防御'], fields['一句话效果'], fields['主要配合对象'], fields['升级理由'], fields['套路定位'], fields['原型'], source.sheet, source.row]
          : [variant.tier === item.tier ? item.name : '', variant.tier, activationFor(item, fields), fields['能力'], fields['防御'], fields['弹药技能'] ? '是' : '否', fields['弹药技能'] ? fields['弹药'] : '', fields['射程/目标'], attackRange.targetSide, attackRange.targetMode, attackRange.condition, JSON.stringify(attackRange), skillActiveEffect(fields), skillPassiveEffect(fields), fields['效果'], fields['词条'], fields['主要配合对象'], fields['定位'], fields['套路'], fields['原型'], source.sheet, source.row]);
      });
    });
    const label = pet ? '灵宠' : '技能';
    download(`新数值_${label}编辑导出.csv`, '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    showToast(`已导出 Excel 可打开的${label} CSV`);
  }

  function exportJson() {
    download('灵宠图鉴_编辑补丁.json', JSON.stringify(store.exportPackage(), null, 2), 'application/json');
    showToast('已导出编辑补丁');
  }

  async function importJson(file) {
    try {
      const payload = JSON.parse(await file.text());
      store.importPackage(payload);
      refreshItems();
      draft = null;
      if (!items.some(item => item.id === selectedId)) selectedId = (items.find(item => item.kind === '技能') || items[0]).id;
      renderAll();
      showToast('编辑补丁已导入并同步');
    } catch (error) {
      showToast(error.message || '导入失败', 'error');
    }
  }

  function registerModelTools() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== 'function') return;
    const controller = new AbortController();
    const registrations = [];
    registrations.push(context.registerTool({
      name: 'create_codex_skill',
      title: '创建图鉴技能',
      description: '在灵宠图鉴中创建一个新技能，保存到当前浏览器工作副本，并同步给战斗模拟器。',
      inputSchema: {
        type: 'object',
        properties: {
          name: {type: 'string', minLength: 1, description: '技能名称'},
          quality: {type: 'string', enum: qualities, description: '起始品质'},
          activation: {type: 'string', enum: ['主动', '被动'], description: '技能使用方式'},
          ability: {type: 'string', description: '能力数值，例如攻击12+'},
          defense: {type: 'number', description: '防御数值'},
          ammoEnabled: {type: 'boolean', description: '是否为弹药技能；启用后主动使用会消耗弹药'},
          ammo: {type: 'number', minimum: 1, description: '弹药上限'},
          range: {type: 'string', description: '射程或目标'},
          targetSide: {type: 'string', enum: targetSides, description: '技能目标阵营'},
          targetMode: {type: 'string', enum: ['单目标', '多目标', '范围内全体'], description: '技能目标方式'},
          targetCondition: {type: 'string', enum: ['', ...rangeConditions], description: '目标筛选条件'},
          tags: {type: 'array', items: {type: 'string'}, description: '技能标签'},
          effect: {type: 'string', description: '兼容字段：完整技能效果文本，等同于主动效果'},
          activeEffect: {type: 'string', description: '主动效果文本'},
          passiveEffect: {type: 'string', description: '被动效果文本'}
        },
        required: ['name'],
        additionalProperties: false
      },
      annotations: {readOnlyHint: false, untrustedContentHint: true},
      execute(input) {
        if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new Error('技能名称不能为空');
        const activeText = typeof input.activeEffect === 'string' ? input.activeEffect.trim() : (typeof input.effect === 'string' ? input.effect.trim() : '');
        const passiveText = typeof input.passiveEffect === 'string' ? input.passiveEffect.trim() : '';
        if (!activeText && !passiveText) throw new Error('主动效果或被动效果至少填写一项');
        const item = store.createSkill();
        const targetQuality = qualities.includes(input.quality) ? input.quality : '青铜';
        item.name = input.name.trim();
        item.tier = targetQuality;
        item.variants.forEach(entry => { entry.fields['技能名'] = entry.tier === targetQuality ? item.name : null; });
        const variant = item.variants.find(entry => entry.tier === targetQuality);
        variant.fields['主动/被动'] = activeText ? '主动' : '被动';
        variant.fields['能力'] = input.ability || '';
        variant.fields['防御'] = Number.isFinite(input.defense) ? input.defense : 0;
        variant.fields['弹药技能'] = input.ammoEnabled === true;
        variant.fields['弹药'] = variant.fields['弹药技能'] ? Math.max(1, Number(input.ammo) || 1) : 0;
        variant.fields['射程/目标'] = input.range || '正前方第一个敌人';
        const attackRange = legacyRangeConfig(variant.fields);
        attackRange.targetSide = targetSides.includes(input.targetSide) ? input.targetSide : '敌方';
        attackRange.targetMode = ['单目标', '多目标', '范围内全体'].includes(input.targetMode) ? input.targetMode : attackRange.targetMode;
        attackRange.condition = rangeConditions.includes(input.targetCondition) ? input.targetCondition : attackRange.condition;
        if (attackRange.condition && !attackRange.cells.range.length) {
          attackRange.cells.range = attackRange.cells.hits.length ? clone(attackRange.cells.hits) : [[3, 4]];
          attackRange.cells.hits = [];
        }
        variant.fields['攻击范围配置'] = attackRange;
        variant.fields['射程/目标'] = rangeSummary(attackRange);
        variant.fields['词条'] = Array.isArray(input.tags) && input.tags.length ? input.tags.join('，') : '短篇，技能';
        variant.fields['主动效果'] = activeText;
        variant.fields['被动效果'] = passiveText;
        variant.fields['效果'] = activeText;
        item.fields = clone(variant.fields);
        item.effect = activeText;
        store.saveItem(item);
        refreshItems();
        activateKind('技能');
        selectedId = item.id;
        draft = null;
        quality = targetQuality;
        dirty = false;
        renderAll();
        return {id: item.id, name: item.name, quality: item.tier, status: 'saved_and_synced'};
      }
    }, {signal: controller.signal}));
    registrations.push(context.registerTool({
      name: 'create_codex_pet',
      title: '创建图鉴灵宠',
      description: '在灵宠图鉴中设计一个新灵宠，保存到当前浏览器工作副本，并同步给战斗模拟器。',
      inputSchema: {
        type: 'object',
        properties: {
          name: {type: 'string', minLength: 1, description: '灵宠名称'},
          quality: {type: 'string', enum: qualities, description: '起始品质'},
          hp: {type: 'number', description: '生命值'},
          attack: {type: 'number', description: '攻击'},
          defense: {type: 'number', description: '防御'},
          tags: {type: 'array', items: {type: 'string'}, description: '灵宠标签'},
          effect: {type: 'string', description: '完整灵宠效果文本'},
          positioning: {type: 'string', description: '套路定位'}
        },
        required: ['name'],
        additionalProperties: false
      },
      annotations: {readOnlyHint: false, untrustedContentHint: true},
      execute(input) {
        if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new Error('灵宠名称不能为空');
        const item = store.createPet();
        const targetQuality = qualities.includes(input.quality) ? input.quality : '青铜';
        item.name = input.name.trim();
        item.tier = targetQuality;
        item.variants.forEach(entry => { entry.fields['宠物名'] = entry.tier === targetQuality ? item.name : null; });
        const variant = item.variants.find(entry => entry.tier === targetQuality);
        variant.fields.hp = Number.isFinite(input.hp) ? input.hp : 100;
        variant.fields['攻击'] = Number.isFinite(input.attack) ? input.attack : 5;
        variant.fields['防御'] = Number.isFinite(input.defense) ? input.defense : 0;
        variant.fields['词条'] = Array.isArray(input.tags) && input.tags.length ? input.tags.join('，') : '生灵';
        variant.fields['一句话效果'] = typeof input.effect === 'string' ? input.effect.trim() : '';
        variant.fields['套路定位'] = typeof input.positioning === 'string' ? input.positioning.trim() : '';
        item.fields = clone(variant.fields);
        item.effect = variant.fields['一句话效果'];
        store.saveItem(item);
        refreshItems();
        activateKind('灵兽');
        selectedId = item.id;
        draft = null;
        quality = targetQuality;
        dirty = false;
        renderAll();
        return {id: item.id, name: item.name, quality: item.tier, status: 'saved_and_synced'};
      }
    }, {signal: controller.signal}));
    registrations.forEach(registration => Promise.resolve(registration).catch(() => {}));
    window.addEventListener('pagehide', () => controller.abort(), {once: true});
  }

  function renderAll() {
    renderList();
    renderEditor();
    renderPreview();
    const state = store.getState();
    const edits = Object.keys(state.overrides).length + state.custom.length;
    $('#sync-summary').textContent = `新数值.xlsx · ${items.filter(item => item.kind === '灵兽').length} 灵宠 / ${items.filter(item => item.kind === '技能').length} 技能${edits ? ` · ${edits} 项本地编辑` : ''}`;
    if (!store.storageAvailable()) showToast('浏览器阻止了持久保存，本次编辑只在当前页面有效', 'warn');
  }

  $$('.kind-tabs button').forEach(button => button.addEventListener('click', () => {
    activateKind(button.dataset.kind);
    renderList();
  }));
  $('#catalog-search').addEventListener('input', event => { query = event.target.value.trim().toLowerCase(); renderList(); });
  $('#new-pet').addEventListener('click', () => newItem('灵兽'));
  $('#new-skill').addEventListener('click', () => newItem('技能'));
  $('#item-form').addEventListener('submit', saveCurrent);
  $('#item-form').addEventListener('input', event => { if (event.target.name && !event.target.name.startsWith('range-')) { if (event.target.name === '词条') renderTags(); markDirty(); } });
  $('#item-form').addEventListener('change', event => {
    if (!event.target.name) return;
    if (event.target.name.startsWith('range-')) {
      changeRangeControl(event.target.name, event.target.value);
      return;
    }
    markDirty();
    if (event.target.name === 'tier') {
      quality = draft.tier;
      renderEditor();
      renderPreview();
    }
    if (event.target.name === '弹药技能') {
      renderEditor();
      renderPreview();
    }
    if (event.target.name === 'skill-activation') {
      renderEditor();
      renderPreview();
    }
  });
  $('#range-clear').addEventListener('click', () => setRangeCells(false));
  $('#range-fill').addEventListener('click', () => setRangeCells(true));
  $('#range-sync-previous').addEventListener('click', syncPreviousRange);
  ['active', 'passive'].forEach(mode => {
    const panel = simplePanel(mode);
    if (!panel.root) return;
    panel.action.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.gateMode) panel.gateMode.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.extraAction) panel.extraAction.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.addon) panel.addon.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.condition) panel.condition.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.triggerSource) panel.triggerSource.addEventListener('change', () => renderSimpleEffectBuilder(mode));
    if (panel.threshold) panel.threshold.addEventListener('input', () => renderSimpleEffectBuilder(mode));
    $$(panel.timing).forEach(input => input.addEventListener('change', () => renderSimpleEffectBuilder(mode)));
    panel.add.addEventListener('click', () => addSimpleEffect(mode));
    panel.read.addEventListener('click', () => loadSimpleEffectBuilder(mode, true));
    panel.clear.addEventListener('click', () => { setSimpleDraft(mode, []); renderSimpleEffectBuilder(mode); });
    panel.apply.addEventListener('click', () => applySimpleEffects(mode));
    panel.list.addEventListener('click', event => {
      const button = event.target.closest('[data-simple-remove]');
      if (!button) return;
      const currentDraft = simpleDraftFor(mode);
      currentDraft.splice(Number(button.dataset.simpleRemove), 1);
      renderSimpleEffectBuilder(mode);
    });
  });
  $('#reset-item').addEventListener('click', resetCurrent);
  $('#duplicate-item').addEventListener('click', () => { captureForm(); const item = selectedItem(); newItem(item.kind, item); });
  $('#export-pet-csv').addEventListener('click', () => exportCsv('灵兽'));
  $('#export-skill-csv').addEventListener('click', () => exportCsv('技能'));
  $('#export-json').addEventListener('click', exportJson);
  $('#import-json').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) importJson(file); event.target.value = ''; });
  window.addEventListener('atlas-data-change', () => {
    refreshItems();
    if (!dirty) renderAll();
  });
  renderAll();
  registerModelTools();
})();
