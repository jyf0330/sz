'use strict';
(() => {
  const store = window.ATLAS_EDITOR;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const qualities = ['青铜', '白银', '黄金', '钻石'];
  const sharedBindings = [
    {field: '主要配合对象', input: '主要配合对象'},
    {field: '套路', input: '套路'},
    {field: '原型', input: '原型'}
  ];
  const skillBindings = [
    {field: '能力', input: '能力'},
    {field: '防御', input: 'skill-defense', numeric: true},
    {field: '射程/目标', input: '射程/目标'},
    {field: '效果', input: '效果'},
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
  let toastTimer;

  function splitTags(value) {
    return String(value || '').split(/[，,、\s]+/).map(tag => tag.trim()).filter(Boolean);
  }

  function value(input, fallback = '未填写') {
    return input === null || input === undefined || input === '' ? fallback : String(input);
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

  function effectFieldFor(item) {
    return item.kind === '灵兽' ? '一句话效果' : '效果';
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
    const tags = splitTags(fields['词条']);
    const pet = item.kind === '灵兽';
    const stats = pet
      ? [['生命值', fields.hp], ['攻击', fields['攻击']], ['防御', fields['防御']]]
      : [['能力', fields['能力']], ['防御', fields['防御']], ['射程 / 目标', fields['射程/目标']]];
    const effect = fields[effectFieldFor(item)];
    const source = variant.source || item.source || {sheet: '编辑器新增', row: '—'};
    $('#preview-title').textContent = pet ? '灵宠详情' : '技能详情';
    $('#item-preview').innerHTML = `
      <div class="preview-top"><span>${esc(item.kind)} · ${esc(variant.tier || item.tier)}</span><span class="modified-mark">${isChanged(item) || dirty ? '● 工作副本' : '○ 表格基线'}</span></div>
      <div class="preview-name"><span class="preview-avatar">${esc(item.name.slice(0, 1))}</span><div><h2>${esc(item.name)}</h2><p>${esc(value(pet ? fields['套路定位'] : fields['定位'], pet ? '未设置套路定位' : '未设置定位'))}</p></div></div>
      <div class="preview-tags">${tags.length ? tags.map(tag => `<span>${esc(tag)}</span>`).join('') : '<span>未设置标签</span>'}</div>
      <div class="preview-stats">${stats.map(([label, content]) => `<div class="preview-stat"><span>${esc(label)}</span><strong>${esc(value(content))}</strong></div>`).join('')}</div>
      <div class="preview-effect">${esc(value(effect, pet ? '请在右侧主动输入灵宠效果' : '请在右侧主动输入技能效果'))}</div>
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
      form.elements[binding.input].value = value(fields[binding.field], fallback);
    });
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
      const raw = form.elements[binding.input].value;
      variant.fields[binding.field] = binding.numeric && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    });
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
    draft.effect = baseVariant.fields[effectFieldFor(draft)] || '';
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
      : ['技能名', '品质', '能力', '防御', '射程/目标', '效果', '词条', '主要配合对象', '定位', '套路', '原型', '来源工作表', '来源行'];
    const rows = [headers];
    items.filter(item => item.kind === itemKind).forEach(item => {
      const variants = item.variants && item.variants.length ? item.variants : [{tier: item.tier, fields: item.fields, source: item.source}];
      variants.forEach(variant => {
        const fields = variant.fields || {};
        const source = variant.source || item.source || {};
        rows.push(pet
          ? [fields['套路'], variant.tier === item.tier ? item.name : '', variant.tier, fields['词条'], fields.hp, fields['攻击'], fields['防御'], fields['一句话效果'], fields['主要配合对象'], fields['升级理由'], fields['套路定位'], fields['原型'], source.sheet, source.row]
          : [variant.tier === item.tier ? item.name : '', variant.tier, fields['能力'], fields['防御'], fields['射程/目标'], fields['效果'], fields['词条'], fields['主要配合对象'], fields['定位'], fields['套路'], fields['原型'], source.sheet, source.row]);
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
          ability: {type: 'string', description: '能力数值，例如攻击12+'},
          defense: {type: 'number', description: '防御数值'},
          range: {type: 'string', description: '射程或目标'},
          tags: {type: 'array', items: {type: 'string'}, description: '技能标签'},
          effect: {type: 'string', minLength: 1, description: '完整技能效果文本'}
        },
        required: ['name', 'effect'],
        additionalProperties: false
      },
      annotations: {readOnlyHint: false, untrustedContentHint: true},
      execute(input) {
        if (!input || typeof input.name !== 'string' || !input.name.trim()) throw new Error('技能名称不能为空');
        if (typeof input.effect !== 'string' || !input.effect.trim()) throw new Error('技能效果不能为空');
        const item = store.createSkill();
        const targetQuality = qualities.includes(input.quality) ? input.quality : '青铜';
        item.name = input.name.trim();
        item.tier = targetQuality;
        item.variants.forEach(entry => { entry.fields['技能名'] = entry.tier === targetQuality ? item.name : null; });
        const variant = item.variants.find(entry => entry.tier === targetQuality);
        variant.fields['能力'] = input.ability || '';
        variant.fields['防御'] = Number.isFinite(input.defense) ? input.defense : 0;
        variant.fields['射程/目标'] = input.range || '正前方第一个敌人';
        variant.fields['词条'] = Array.isArray(input.tags) && input.tags.length ? input.tags.join('，') : '短篇，技能';
        variant.fields['效果'] = input.effect.trim();
        item.fields = clone(variant.fields);
        item.effect = variant.fields['效果'];
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
  $('#item-form').addEventListener('input', event => { if (event.target.name) { if (event.target.name === '词条') renderTags(); markDirty(); } });
  $('#item-form').addEventListener('change', event => {
    if (!event.target.name) return;
    markDirty();
    if (event.target.name === 'tier') {
      quality = draft.tier;
      renderEditor();
      renderPreview();
    }
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
