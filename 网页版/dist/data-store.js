'use strict';
(() => {
  const STORAGE_KEY = 'spirit-atlas-editor-v1';
  const atlas = window.ATLAS_DATA;
  if (!atlas || !Array.isArray(atlas.items)) return;

  const clone = value => JSON.parse(JSON.stringify(value));
  function syncItemTags(item) {
    const clean = clone(item);
    const variants = Array.isArray(clean.variants) ? clean.variants : [];
    const baseVariant = variants.find(variant => variant.tier === clean.tier);
    const baseFields = baseVariant && baseVariant.fields ? baseVariant.fields : clean.fields || {};
    const tags = baseFields['词条'] == null ? ((clean.fields || {})['词条'] || '') : baseFields['词条'];
    clean.fields = {...(clean.fields || {}), '词条': tags};
    variants.forEach(variant => {
      variant.fields = {...(variant.fields || {}), '词条': tags};
    });
    clean.variants = variants;
    return clean;
  }
  const baseItems = atlas.items.map(syncItemTags);
  const baseIds = new Set(baseItems.map(item => item.id));
  let memoryState = {version: 1, updatedAt: null, overrides: {}, custom: []};
  let storageAvailable = true;

  function normalizeState(value) {
    const state = value && typeof value === 'object' ? value : {};
    const overrides = state.overrides && typeof state.overrides === 'object'
      ? Object.fromEntries(Object.entries(state.overrides).map(([id, item]) => [id, syncItemTags(item)]))
      : {};
    return {
      version: 1,
      updatedAt: state.updatedAt || null,
      overrides,
      custom: Array.isArray(state.custom) ? state.custom.map(syncItemTags) : []
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      memoryState = normalizeState(raw ? JSON.parse(raw) : memoryState);
    } catch (error) {
      storageAvailable = false;
    }
    return clone(memoryState);
  }

  function writeState(next) {
    memoryState = normalizeState(next);
    memoryState.updatedAt = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
    }
    applyToAtlas();
    window.dispatchEvent(new CustomEvent('atlas-data-change', {detail: {updatedAt: memoryState.updatedAt}}));
    return clone(memoryState);
  }

  function getItems() {
    const state = readState();
    const merged = baseItems.map(base => {
      const override = state.overrides[base.id];
      return override ? {...syncItemTags(override), originalName: base.name, edited: true} : syncItemTags(base);
    });
    state.custom.forEach(item => merged.push({...syncItemTags(item), custom: true, edited: true}));
    return merged;
  }

  function applyToAtlas() {
    const items = getItems();
    atlas.items.splice(0, atlas.items.length, ...items);
    if (atlas.meta) {
      atlas.meta.itemCount = items.length;
      atlas.meta.petCount = items.filter(item => item.kind === '灵兽').length;
      atlas.meta.skillCount = items.filter(item => item.kind === '技能').length;
    }
  }

  function saveItem(item) {
    if (!item || !item.id) throw new Error('图鉴条目缺少唯一编号');
    const state = readState();
    const clean = syncItemTags(item);
    delete clean.edited;
    delete clean.originalName;
    if (baseIds.has(clean.id)) state.overrides[clean.id] = clean;
    else {
      clean.custom = true;
      const index = state.custom.findIndex(entry => entry.id === clean.id);
      if (index >= 0) state.custom[index] = clean;
      else state.custom.push(clean);
    }
    return writeState(state);
  }

  function resetItem(id) {
    const state = readState();
    if (baseIds.has(id)) delete state.overrides[id];
    else state.custom = state.custom.filter(item => item.id !== id);
    return writeState(state);
  }

  function createSkill(seed) {
    const id = 'custom-skill-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const qualities = ['青铜', '白银', '黄金', '钻石'];
    const baseFields = {
      '技能名': seed && seed.name ? seed.name : '未命名技能',
      '品质': '青铜',
      '能力': '',
      '防御': 0,
      '射程/目标': '正前方第一个敌人',
      '效果': '',
      '词条': '短篇，技能',
      '主要配合对象': '',
      '定位': '',
      '套路': '',
      '原型': ''
    };
    const item = {
      id,
      name: baseFields['技能名'],
      kind: '技能',
      tier: '青铜',
      fields: clone(baseFields),
      effect: '',
      source: {sheet: '编辑器新增', row: '—'},
      variants: qualities.map((tier, index) => ({
        tier,
        fields: {...clone(baseFields), '技能名': index === 0 ? baseFields['技能名'] : null, '品质': tier},
        source: {sheet: '编辑器新增', row: '—'}
      })),
      mechanisms: [],
      custom: true
    };
    if (seed) {
      item.name = (seed.name || '技能') + ' · 副本';
      item.tier = seed.tier || '青铜';
      item.fields = clone(seed.fields || baseFields);
      item.fields['技能名'] = item.name;
      item.effect = seed.effect || item.fields['效果'] || '';
      item.variants = clone(seed.variants || item.variants).map(variant => ({
        ...variant,
        source: {sheet: '编辑器新增', row: '—'},
        fields: {...variant.fields, '技能名': variant.tier === item.tier ? item.name : null}
      }));
    }
    return syncItemTags(item);
  }

  function createPet(seed) {
    const id = 'custom-pet-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const qualities = ['青铜', '白银', '黄金', '钻石'];
    const baseFields = {
      '宠物名': seed && seed.name ? seed.name : '未命名灵宠',
      '品质': '青铜',
      '词条': '生灵',
      'hp': 100,
      '攻击': 5,
      '防御': 0,
      '一句话效果': '',
      '主要配合对象': '',
      '升级理由': '',
      '套路定位': '',
      '套路': '',
      '原型': ''
    };
    const name = seed ? (seed.name || '灵宠') + ' · 副本' : baseFields['宠物名'];
    const tier = seed && qualities.includes(seed.tier) ? seed.tier : '青铜';
    const seedVariants = seed && Array.isArray(seed.variants) ? seed.variants : [];
    const seedFields = seed && seed.fields ? seed.fields : baseFields;
    const variants = qualities.map(quality => {
      const sourceVariant = seedVariants.find(variant => variant.tier === quality);
      const fields = clone(sourceVariant && sourceVariant.fields ? sourceVariant.fields : seedFields);
      fields['宠物名'] = quality === tier ? name : null;
      fields['品质'] = quality;
      return {tier: quality, fields, source: {sheet: '编辑器新增', row: '—'}};
    });
    const fields = clone(variants.find(variant => variant.tier === tier).fields);
    return syncItemTags({
      id,
      name,
      kind: '灵兽',
      tier,
      fields,
      effect: fields['一句话效果'] || '',
      source: {sheet: '编辑器新增', row: '—'},
      variants,
      mechanisms: clone(seed && seed.mechanisms ? seed.mechanisms : []),
      custom: true
    });
  }

  function exportPackage() {
    const state = readState();
    return {
      format: 'spirit-atlas-patch',
      version: 1,
      source: '新数值.xlsx',
      exportedAt: new Date().toISOString(),
      overrides: state.overrides,
      custom: state.custom
    };
  }

  function importPackage(payload) {
    if (!payload || payload.format !== 'spirit-atlas-patch') throw new Error('请选择图鉴编辑器导出的 JSON 文件');
    const current = readState();
    const incoming = normalizeState(payload);
    current.overrides = {...current.overrides, ...incoming.overrides};
    incoming.custom.forEach(item => {
      const index = current.custom.findIndex(entry => entry.id === item.id);
      if (index >= 0) current.custom[index] = item;
      else current.custom.push(item);
    });
    return writeState(current);
  }

  function isModified(id) {
    const state = readState();
    return !!state.overrides[id] || state.custom.some(item => item.id === id);
  }

  window.ATLAS_EDITOR = {
    storageKey: STORAGE_KEY,
    getItems,
    saveItem,
    resetItem,
    createSkill,
    createPet,
    exportPackage,
    importPackage,
    isModified,
    getState: readState,
    storageAvailable: () => storageAvailable,
    syncItemTags,
    apply: applyToAtlas
  };
  applyToAtlas();
  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      readState();
      applyToAtlas();
      window.dispatchEvent(new CustomEvent('atlas-data-change'));
    }
  });
})();
