const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const editorJs = fs.readFileSync(path.join(root, 'editor.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const battleHtml = fs.readFileSync(path.join(root, 'battle.html'), 'utf8');
const battleJs = fs.readFileSync(path.join(root, 'battle-v2.js'), 'utf8');

const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => match[1]));
const queriedIds = new Set(Array.from(editorJs.matchAll(/\$\('#([^']+)'\)/g), match => match[1]));
for (const id of queriedIds) assert(ids.has(id), `editor.js references missing #${id}`);

assert(indexHtml.indexOf('graph-data.js') < indexHtml.indexOf('data-store.js'));
assert(indexHtml.indexOf('data-store.js') < indexHtml.indexOf('app.js'));
assert(battleHtml.indexOf('graph-data.js') < battleHtml.indexOf('data-store.js'));
assert(battleHtml.indexOf('data-store.js') < battleHtml.indexOf('battle-v2.js'));
assert(html.includes('id="new-pet"'));
assert(html.includes('id="pet-fields"'));
assert(html.includes('id="export-pet-csv"'));
assert(html.includes('id="range-grid"'));
assert(html.includes('id="range-sync-previous"'));
for (const id of ['simple-effect-title', 'simple-effect-read', 'simple-effect-scope', 'simple-effect-action', 'simple-effect-value', 'simple-effect-add', 'simple-gate-options', 'simple-gate-mode', 'simple-extra-controls', 'simple-extra-action', 'simple-extra-value', 'simple-effect-list', 'simple-effect-clear', 'simple-effect-apply']) assert(html.includes(`id="${id}"`));
for (const id of ['simple-addon', 'simple-addon-value', 'simple-passive-addon', 'simple-passive-addon-value']) assert(html.includes(`id="${id}"`));
assert(html.includes('name="skill-activation"'));
for (const timing of ['战斗开始时', '回合开始', '回合结束', '被攻击时', '使用时']) assert(html.includes(`value="${timing}"`));
for (const action of ['充能', '装填弹药', '拖拽', '击退', '爆能', '倒计时', '多重触发', '伤害', '治疗', '护盾', '再生', '点燃', '剧毒', '霜冻', '亢奋', '衰弱']) assert(html.includes(`<option>${action}</option>`));
const activeActionOptions = html.match(/id="simple-effect-action">([\s\S]*?)<\/select>/)[1];
const passiveActionOptions = html.match(/id="simple-passive-effect-action">([\s\S]*?)<\/select>/)[1];
assert(!activeActionOptions.includes('<option>多重触发</option>'));
assert(!activeActionOptions.includes('<option>破壳</option>'));
assert(!passiveActionOptions.includes('<option>多重触发</option>'));
assert(!passiveActionOptions.includes('<option>破壳</option>'));
assert(html.includes('class="field active-skill-option"'));
assert(editorJs.includes("input.value !== '使用时'"));
assert(editorJs.includes('activeBuilder.root.hidden = passiveSkill'));
for (const scope of ['左侧相邻技能', '右侧相邻技能', '灵兽自身技能', '己方所有技能']) assert(html.includes(`<option>${scope}</option>`));
for (const mode of ['额外效果', '应用于此技能']) assert(html.includes(`<option>${mode}</option>`));
assert(html.includes('name="range-target-side"'));
for (const side of ['敌方', '友方', '自身', '自身与友方', '自身与敌方']) assert(html.includes(`<option>${side}</option>`));
assert(html.includes('name="range-target-mode"'));
assert(html.includes('name="range-condition"'));
assert(editorJs.includes("create_codex_pet"));
for (const condition of ['生命最低', '生命最高', '攻击最高', '防御最低', '防御最高', '最前方', '最后方', '带有点燃', '带有剧毒', '带有霜冻', '带有护盾', '随机1个目标', '随机2个目标', '随机3个目标']) assert(html.includes(`<option>${condition}</option>`));
assert(battleJs.includes('function structuredTargetsFor'));
assert(battleJs.includes('function targetsForEffectScope'));
assert(battleJs.includes('function parseSimpleEffectRules'));
assert(battleJs.includes("runSimpleRules(skill, '使用时', targets)"));
assert(battleJs.includes("runSimpleRulesForSide('回合开始', side)"));
assert(battleJs.includes("runSimpleRulesForSide('回合结束', side)"));
assert(battleJs.includes("runSimpleRules(skill, '被攻击时', [source])"));
assert(battleJs.includes("runSimpleRules(target, '被攻击时', [source])"));
assert(battleJs.includes("unitsOf(side, true).forEach(pet => runSimpleRules(pet, timing, []))"));
assert(battleJs.includes('const isPassiveSkill'));
assert(battleJs.includes("skill.activationMode === '被动'"));
assert(battleJs.includes("const effectiveActiveEffect = activationMode === '被动' ? '' : activeEffect"));
assert(battleJs.includes('parseSimpleEffectRules(effectiveActiveEffect)'));
assert(editorJs.includes("field: '主动效果'"));
assert(editorJs.includes("field: '被动效果'"));
assert(html.includes('name="弹药技能"'));
assert(html.includes('name="skill-ammo"'));
assert(html.includes('id="simple-passive-effect-builder"'));
assert(battleJs.includes('function simpleRuleSkillTargets'));
assert(battleJs.includes('legacyChargeBeforeSimpleGate'));
assert(battleJs.includes("targetsForEffectScope(passive, owner, inheritedTargets"));
assert(battleJs.includes("targetsForEffectScope(retaliation, target, [source]"));
assert(!battleJs.includes("'泰诺地龙自毒'"));
assert(!battleJs.includes("'蜈蚣锁自毒'"));
assert(battleJs.includes("qualityField(cat, quality, '攻击范围配置'"));
assert(editorJs.includes('function syncPreviousRange'));
assert(editorJs.includes('function applySimpleEffects'));

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

const simpleRuleContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'parseSimpleEffectRules')}\n${extractFunction(battleJs, 'stripSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('攻击5。\\n【使用时】对自身：充能3、爆能6（应用于此技能）、施加亢奋2。\\n【回合开始】己方所有技能：倒计时2（额外效果：装填弹药1）。\\n【被攻击时】对目标：弹药2、击退。');\nthis.manual = stripSimpleEffectRules('攻击5。\\n【使用时】左侧相邻技能：装填弹药2。');`, simpleRuleContext);
assert.equal(simpleRuleContext.rules.length, 3);
assert.equal(simpleRuleContext.rules[0].timing, '使用时');
assert.deepEqual(simpleRuleContext.rules[0].actions.map(action => action.type), ['充能', '爆能', '亢奋']);
assert.equal(simpleRuleContext.rules[0].actions[1].gateMode, '应用于此技能');
assert.equal(simpleRuleContext.rules[1].scope, '己方所有技能');
assert.equal(simpleRuleContext.rules[1].actions[0].extraType, '装填弹药');
assert.equal(simpleRuleContext.rules[2].actions[0].type, '装填弹药');
assert(simpleRuleContext.manual.includes('攻击5'));
assert(!simpleRuleContext.manual.includes('【使用时】'));

const addonRuleContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'parseSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('【使用时】【对目标】：伤害4〔附加：多重触发3〕、护盾2〔附加：破壳〕。');`, addonRuleContext);
assert.equal(addonRuleContext.rules.length, 1);
assert.deepEqual(addonRuleContext.rules[0].actions.map(action => action.type), ['伤害', '多重触发', '护盾']);
assert.equal(addonRuleContext.rules[0].actions[1].value, 3);
assert.equal(addonRuleContext.rules[0].actions[2].addon, '破壳');

const simpleRuntimeState = {gateReady: false, calls: []};
const simpleRuntimeContext = {
  consumeEnergy() { return simpleRuntimeState.gateReady; },
  executeSimpleAction(source, owner, rule, action) { simpleRuntimeState.calls.push(action.type); return true; },
  log() {},
  esc: String
};
vm.createContext(simpleRuntimeContext);
vm.runInContext(`${extractFunction(battleJs, 'resolveSimpleGate')}\n${extractFunction(battleJs, 'executeSimpleRule')}`, simpleRuntimeContext);
const gateSource = {name: '门控技能', simpleRuleState: {}};
const applicationRule = {id: 1, timing: '使用时', actions: [
  {type: '充能', value: 2},
  {type: '爆能', value: 5, gateMode: '应用于此技能'},
  {type: '伤害', value: 9}
]};
let gateResult = simpleRuntimeContext.executeSimpleRule(gateSource, {}, applicationRule, []);
assert.equal(gateResult.allowBase, false);
assert.deepEqual(simpleRuntimeState.calls, ['充能']);
simpleRuntimeState.gateReady = true;
simpleRuntimeState.calls.length = 0;
gateResult = simpleRuntimeContext.executeSimpleRule(gateSource, {}, applicationRule, []);
assert.equal(gateResult.allowBase, true);
assert.deepEqual(simpleRuntimeState.calls, ['充能', '伤害']);
const extraRule = {id: 2, timing: '回合开始', actions: [
  {type: '爆能', value: 3, gateMode: '额外效果', extraType: '装填弹药', extraValue: 2},
  {type: '治疗', value: 1}
]};
simpleRuntimeState.gateReady = false;
simpleRuntimeState.calls.length = 0;
assert.equal(simpleRuntimeContext.executeSimpleRule(gateSource, {}, extraRule, []).allowBase, true);
assert.deepEqual(simpleRuntimeState.calls, ['治疗']);
simpleRuntimeState.gateReady = true;
simpleRuntimeState.calls.length = 0;
simpleRuntimeContext.executeSimpleRule(gateSource, {}, extraRule, []);
assert.deepEqual(simpleRuntimeState.calls, ['装填弹药', '治疗']);
const countdownRule = {id: 3, timing: '使用时', actions: [{type: '倒计时', value: 2, gateMode: '应用于此技能'}]};
assert.equal(simpleRuntimeContext.executeSimpleRule(gateSource, {}, countdownRule, []).allowBase, false);
assert.equal(simpleRuntimeContext.executeSimpleRule(gateSource, {}, countdownRule, []).allowBase, true);

const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value))
};
const window = {
  addEventListener() {},
  dispatchEvent() {},
  ATLAS_DATA: null
};
const context = vm.createContext({window, localStorage, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }});
vm.runInContext(fs.readFileSync(path.join(root, 'graph-data.js'), 'utf8'), context);
const baseCount = window.ATLAS_DATA.items.length;
vm.runInContext(fs.readFileSync(path.join(root, 'data-store.js'), 'utf8'), context);
assert(window.ATLAS_EDITOR, 'ATLAS_EDITOR was not created');

const firstSkill = window.ATLAS_EDITOR.getItems().find(item => item.kind === '技能');
const edited = JSON.parse(JSON.stringify(firstSkill));
edited.fields['能力'] = '攻击999+';
const editedBase = edited.variants.find(variant => variant.tier === edited.tier);
editedBase.fields['词条'] = '统一标签，验证';
edited.variants.forEach(variant => { if (variant !== editedBase) variant.fields['词条'] = '不应保留'; });
window.ATLAS_EDITOR.saveItem(edited);
assert.equal(window.ATLAS_EDITOR.getItems().find(item => item.id === edited.id).fields['能力'], '攻击999+');
assert(window.ATLAS_EDITOR.getItems().find(item => item.id === edited.id).variants.every(variant => variant.fields['词条'] === '统一标签，验证'));

const custom = window.ATLAS_EDITOR.createSkill();
assert.equal(custom.fields['主动/被动'], '主动');
assert.deepEqual(custom.fields['攻击范围配置'].caster, [4, 4]);
assert.equal(custom.fields['攻击范围配置'].size, 9);
assert.equal(custom.fields['攻击范围配置'].targetSide, '敌方');
assert.equal(custom.fields['攻击范围配置'].targetMode, '单目标');
assert.deepEqual(custom.fields['攻击范围配置'].cells.hits, [[3, 4]]);
custom.name = '验证技能';
custom.fields['技能名'] = custom.name;
custom.fields['效果'] = '造成伤害9';
custom.effect = custom.fields['效果'];
window.ATLAS_EDITOR.saveItem(custom);
assert.equal(window.ATLAS_EDITOR.getItems().length, baseCount + 1);
assert(window.ATLAS_DATA.items.some(item => item.name === '验证技能'));

const firstPet = window.ATLAS_EDITOR.getItems().find(item => item.kind === '灵兽');
const editedPet = JSON.parse(JSON.stringify(firstPet));
editedPet.fields.hp = 777;
window.ATLAS_EDITOR.saveItem(editedPet);
assert.equal(window.ATLAS_EDITOR.getItems().find(item => item.id === editedPet.id).fields.hp, 777);

const customPet = window.ATLAS_EDITOR.createPet();
assert.equal(customPet.kind, '灵兽');
assert.equal(customPet.variants.length, 4);
assert(customPet.variants.every(variant => variant.fields['词条'] === customPet.fields['词条']));
customPet.name = '验证灵宠';
customPet.fields['宠物名'] = customPet.name;
customPet.fields.hp = 321;
customPet.fields['一句话效果'] = '我方单位攻击+3';
customPet.effect = customPet.fields['一句话效果'];
window.ATLAS_EDITOR.saveItem(customPet);
assert.equal(window.ATLAS_EDITOR.getItems().length, baseCount + 2);
assert(window.ATLAS_DATA.items.some(item => item.kind === '灵兽' && item.name === '验证灵宠'));
const patchPackage = window.ATLAS_EDITOR.exportPackage();
assert(patchPackage.custom.some(item => item.id === customPet.id));

window.ATLAS_EDITOR.resetItem(customPet.id);
window.ATLAS_EDITOR.resetItem(editedPet.id);
window.ATLAS_EDITOR.resetItem(custom.id);
window.ATLAS_EDITOR.resetItem(edited.id);
assert.equal(window.ATLAS_EDITOR.getItems().length, baseCount);
assert(window.ATLAS_EDITOR.getItems().every(item => (item.variants || []).every(variant => variant.fields['词条'] === item.fields['词条'])));

console.log(JSON.stringify({ok: true, baseCount, checkedDomIds: queriedIds.size, sharedDataPages: ['index.html', 'editor.html', 'battle.html']}));
