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
for (const id of ['simple-addon-controls', 'simple-addon-value', 'simple-addon-crit-value', 'simple-passive-addon-controls', 'simple-passive-addon-value', 'simple-passive-addon-crit-value']) assert(html.includes(`id="${id}"`));
assert(html.includes('name="skill-activation"'));
for (const timing of ['战斗开始时', '回合开始', '回合结束', '被攻击时', '使用时']) assert(html.includes(`value="${timing}"`));
const activeTimingOptions = html.match(/name="simple-timing"[\s\S]*?<\/fieldset>/)[0];
const passiveTimingOptions = html.match(/name="simple-passive-timing"[\s\S]*?<\/fieldset>/)[0];
assert(!activeTimingOptions.includes('value="造成伤害时"'));
assert(!activeTimingOptions.includes('value="受到伤害时"'));
assert(!passiveTimingOptions.includes('value="造成伤害时"'));
assert(!passiveTimingOptions.includes('value="受到伤害时"'));
for (const timing of ['使用任意技能时', '使用左侧相邻技能时', '使用右侧相邻技能时', '使用两侧相邻技能时', '使用自身携带的其它技能时']) assert(passiveTimingOptions.includes(`value="${timing}"`));
const activeActionOptions = html.match(/id="simple-effect-action">([\s\S]*?)<\/select>/)[1];
const passiveActionOptions = html.match(/id="simple-passive-effect-action">([\s\S]*?)<\/select>/)[1];
for (const action of ['充能', '装填弹药', '爆能', '倒计时', '伤害', '治疗', '护盾', '再生', '点燃', '剧毒', '霜冻', '亢奋', '衰弱']) assert(html.includes(`<option>${action}</option>`));
for (const action of ['攻击+', '点燃+', '淬毒+', '覆雪+']) assert(html.includes(`<option>${action}</option>`));
for (const action of ['点燃提升', '淬毒提升', '覆雪提升', '护盾提升', '再生提升', '治疗提升']) {
  assert(activeActionOptions.includes(`<option>${action}</option>`));
  assert(passiveActionOptions.includes(`<option>${action}</option>`));
}
for (const action of ['伤害+', '点燃+', '淬毒+', '覆雪+']) assert(passiveActionOptions.includes(`<option>${action}</option>`));
for (const addon of ['多重触发', '破壳', '暴击率', '击退', '拖拽']) assert(html.includes(`data-simple-addon="${addon}"`));
assert(!activeActionOptions.includes('<option>多重触发</option>'));
assert(!activeActionOptions.includes('<option>破壳</option>'));
assert(!activeActionOptions.includes('<option>拖拽</option>'));
assert(!activeActionOptions.includes('<option>击退</option>'));
assert(!passiveActionOptions.includes('<option>多重触发</option>'));
assert(!passiveActionOptions.includes('<option>破壳</option>'));
assert(!passiveActionOptions.includes('<option>拖拽</option>'));
assert(!passiveActionOptions.includes('<option>击退</option>'));
assert(html.includes('class="field active-skill-option"'));
assert(editorJs.includes("input.value !== '使用时'"));
assert(editorJs.includes('activeBuilder.root.hidden = passiveSkill'));
for (const scope of ['左侧相邻技能', '右侧相邻技能', '左右两侧相邻技能', '灵兽自身技能', '己方所有技能']) assert(html.includes(`<option>${scope}</option>`));
assert(html.includes('<option>技能同一目标</option>'));
assert.equal((html.match(/data-copy-previous-effect=/g) || []).length, 2);
assert(html.includes('id="simple-passive-trigger-chain"'));
for (const mode of ['受到', '造成', '触发']) assert(html.includes(`value="${mode}"`));
for (const reason of ['灼烧', '淬毒', '霜冻', '能量增加', '装填弹药', '伤害提升', '治疗降低']) assert(html.includes(`value="${reason}"`));
for (const event of ['技能触发暴击时', '触发目标灼烧伤害时', '触发霜冻伤害时', '触发剧毒伤害时']) assert(html.includes(`value="${event}"`));
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
assert(battleJs.includes('parseActiveEffectAddons(effectiveActiveEffect)'));
assert(battleJs.includes('activeValueEntries: activeAbilityManaged ? valueEntriesFromSimpleRules(activeRules) : parseValueEntries(ability)'));
assert(battleJs.includes('passiveValueEntries: valueEntriesFromSimpleRules(passiveRules)'));
assert(battleJs.includes('valueEntries: activeAbilityManaged ? [] : parseValueEntries(ability)'));
assert(battleJs.includes('主动实际数值'));
assert(battleJs.includes('被动实际数值'));
assert(editorJs.includes("field: '主动效果'"));
assert(editorJs.includes("field: '被动效果'"));
assert(html.includes('name="弹药技能"'));
assert(html.includes('name="skill-ammo"'));
assert(html.includes('id="simple-passive-effect-builder"'));
assert(battleJs.includes('function simpleRuleSkillTargets'));
assert(battleJs.includes('function emitPassiveEffectEvent'));
assert(battleJs.includes("emitPassiveEffectPair('伤害'"));
assert(battleJs.includes("emitPassiveEffectEvent('触发', '技能触发暴击时'"));
assert(battleJs.includes("scope === '左右两侧相邻技能'"));
assert(battleJs.includes('legacyChargeBeforeSimpleGate'));
assert(battleJs.includes("targetsForEffectScope(passive, owner, inheritedTargets"));
assert(battleJs.includes("targetsForEffectScope(retaliation, target, [source]"));
assert(!battleJs.includes("'泰诺地龙自毒'"));
assert(!battleJs.includes("'蜈蚣锁自毒'"));
assert(battleJs.includes("qualityField(cat, quality, '攻击范围配置'"));
assert(editorJs.includes('function syncPreviousRange'));
assert(editorJs.includes('function copyPreviousEffect'));
assert(editorJs.includes('function applySimpleEffects'));
assert(battleJs.includes("scope === '技能同一目标'"));
assert(battleJs.includes("['使用左侧相邻技能时'"));
assert(battleJs.includes("['使用右侧相邻技能时'"));
assert(battleJs.includes("['使用两侧相邻技能时'"));
assert(battleJs.includes("点燃提升:'burnBonus'"));

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
vm.runInNewContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseSimpleEffectRules')}\n${extractFunction(battleJs, 'stripSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('攻击5。\\n【使用时】对自身：充能3、爆能6（应用于此技能）、施加亢奋2。\\n【回合开始】己方所有技能：倒计时2（额外效果：装填弹药1）。\\n【被攻击时】对目标：弹药2、击退。');\nthis.manual = stripSimpleEffectRules('攻击5。\\n【使用时】左侧相邻技能：装填弹药2。');`, simpleRuleContext);
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
vm.runInNewContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('【使用时】【对目标】：攻击4+〔附加：多重触发3、暴击率25%、击退〕、护盾2〔附加：破壳、拖拽〕。');`, addonRuleContext);
assert.equal(addonRuleContext.rules.length, 1);
assert.deepEqual(addonRuleContext.rules[0].actions.map(action => action.type), ['伤害', '护盾']);
assert.equal(addonRuleContext.rules[0].actions[0].plus, true);
assert.equal(addonRuleContext.rules[0].actions[0].addons.find(addon => addon.type === '多重触发').value, 3);
assert.equal(addonRuleContext.rules[0].actions[0].addons.find(addon => addon.type === '暴击率').value, 25);
assert(addonRuleContext.rules[0].actions[0].addons.some(addon => addon.type === '击退'));
assert(addonRuleContext.rules[0].actions[1].addons.some(addon => addon.type === '破壳'));
assert(addonRuleContext.rules[0].actions[1].addons.some(addon => addon.type === '拖拽'));

const passiveChainContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('【触发来源：左右两侧相邻技能】【受到灼烧时】【额外条件：爆能2】【左右两侧相邻技能】：护盾3。\\n【触发来源：自身】【触发剧毒伤害时】【对目标】：治疗2。');`, passiveChainContext);
assert.equal(passiveChainContext.rules.length, 2);
assert.equal(passiveChainContext.rules[0].timing, '受到灼烧时');
assert.equal(passiveChainContext.rules[0].triggerSource, '左右两侧相邻技能');
assert.equal(passiveChainContext.rules[0].scope, '左右两侧相邻技能');
assert.equal(passiveChainContext.rules[0].condition, '爆能');
assert.equal(passiveChainContext.rules[1].timing, '触发剧毒伤害时');

const inheritedTargetContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseSimpleEffectRules')}\nthis.rules = parseSimpleEffectRules('【触发来源：左侧相邻技能】【使用左侧相邻技能时】【技能同一目标】：伤害4+、点燃提升2。');`, inheritedTargetContext);
assert.equal(inheritedTargetContext.rules.length, 1);
assert.equal(inheritedTargetContext.rules[0].scope, '技能同一目标');
assert.equal(inheritedTargetContext.rules[0].actions[0].type, '伤害');
assert.equal(inheritedTargetContext.rules[0].actions[0].plus, true);
assert.equal(inheritedTargetContext.rules[0].actions[1].type, '点燃提升');

const actualValueContext = {VALUE_LABELS:{damage:'伤害', burn:'点燃', poison:'淬毒', frost:'覆雪', shield:'护盾', heal:'治疗', regen:'再生'}};
vm.createContext(actualValueContext);
vm.runInContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseSimpleEffectRules')}\n${extractFunction(battleJs, 'valueEntriesFromSimpleRules')}\nthis.active = parseSimpleEffectRules('【使用时】【对目标】：伤害4+、点燃3。').map(rule => ({...rule, channel:'主动'}));\nthis.passive = parseSimpleEffectRules('【触发来源：自身】【回合开始】【对自身】：护盾5、再生2。').map(rule => ({...rule, channel:'被动'}));\nthis.activeValues = valueEntriesFromSimpleRules(active);\nthis.passiveValues = valueEntriesFromSimpleRules(passive);`, actualValueContext);
assert.deepEqual(actualValueContext.activeValues.map(entry => [entry.label, entry.base, entry.plus]), [['伤害', 4, true], ['点燃', 3, false]]);
assert.deepEqual(actualValueContext.passiveValues.map(entry => [entry.label, entry.base]), [['护盾', 5], ['再生', 2]]);

const adjacencySource = {id: 'middle', entityType: 'skill', side: 'player', owner: 'pet-a'};
const adjacencyLeft = {id: 'left', entityType: 'skill', side: 'player', owner: 'pet-a'};
const adjacencyRight = {id: 'right', entityType: 'skill', side: 'player', owner: 'pet-a'};
const adjacencyFar = {id: 'far', entityType: 'skill', side: 'player', owner: 'pet-a'};
const adjacencyContext = {
  skillList: () => [adjacencyLeft, adjacencySource, adjacencyRight, adjacencyFar],
  ownerOf: skill => ({id: skill.owner, side: skill.side, entityType: 'pet'})
};
vm.createContext(adjacencyContext);
vm.runInContext(`${extractFunction(battleJs, 'simpleRuleSkillTargets')}\n${extractFunction(battleJs, 'triggerSourceMatches')}`, adjacencyContext);
assert.deepEqual(adjacencyContext.simpleRuleSkillTargets(adjacencySource, {id:'pet-a', side:'player'}, '左右两侧相邻技能').map(skill => skill.id), ['left', 'right']);
const adjacentRule = {channel:'被动', triggerSource:'左右两侧相邻技能'};
assert.equal(adjacencyContext.triggerSourceMatches(adjacentRule, adjacencySource, {id:'pet-a', side:'player'}, [adjacencyLeft]), true);
assert.equal(adjacencyContext.triggerSourceMatches(adjacentRule, adjacencySource, {id:'pet-a', side:'player'}, [adjacencyRight]), true);
assert.equal(adjacencyContext.triggerSourceMatches(adjacentRule, adjacencySource, {id:'pet-a', side:'player'}, [adjacencyFar]), false);

const emitted = [];
const eventSkill = {id:'event-skill', entityType:'skill', side:'player', owner:'actor'};
const eventTarget = {id:'target', entityType:'pet', side:'enemy', hp:10};
const eventContext = {
  passiveEventStack: [],
  ownerOf: skill => ({id:skill.owner, entityType:'pet', side:skill.side}),
  skillList: side => [{id:`${side}-listener`, entityType:'skill', side, owner:`${side}-pet`}],
  unitsOf: side => [{id:`${side}-pet`, entityType:'pet', side, hp:10}],
  runSimpleRules: (source, timing, contextTargets) => emitted.push({source:source.id, timing, candidate:contextTargets[0].id, target:contextTargets[1] && contextTargets[1].id})
};
vm.createContext(eventContext);
vm.runInContext(`${extractFunction(battleJs, 'eventEntitySide')}\n${extractFunction(battleJs, 'emitPassiveEffectEvent')}\n${extractFunction(battleJs, 'emitPassiveEffectPair')}`, eventContext);
eventContext.emitPassiveEffectPair('灼烧', {id:'actor', entityType:'pet', side:'player'}, eventTarget, eventSkill);
assert(emitted.some(entry => entry.source === 'player-listener' && entry.timing === '造成灼烧时'));
assert(emitted.some(entry => entry.source === 'enemy-listener' && entry.timing === '受到灼烧时'));
assert(emitted.every(entry => entry.candidate === 'event-skill'));

const activeAddonContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'parseEffectAddons')}\n${extractFunction(battleJs, 'parseActiveEffectAddons')}\nthis.addons = parseActiveEffectAddons('【主动附加：多重触发2、暴击率35%、击退、拖拽】');`, activeAddonContext);
assert.deepEqual(activeAddonContext.addons.map(addon => addon.type), ['多重触发', '暴击率', '击退', '拖拽']);
assert.equal(activeAddonContext.addons[1].value, 35);

const plusValueContext = {};
vm.runInNewContext(`${extractFunction(battleJs, 'simpleActionValue')}\nthis.damage = simpleActionValue({size:'medium'}, {atk:8}, {type:'伤害', value:4, plus:true});\nthis.poison = simpleActionValue({size:'medium'}, {atk:8}, {type:'剧毒', value:3, plus:true});`, plusValueContext);
assert.equal(plusValueContext.damage, 12);
assert.equal(plusValueContext.poison, 7);

const simpleRuntimeState = {gateReady: false, calls: []};
const simpleRuntimeContext = {
  consumeEnergy() { return simpleRuntimeState.gateReady; },
  executeSimpleAction(source, owner, rule, action) { simpleRuntimeState.calls.push(action.type); return true; },
  log() {},
  esc: String
};
vm.createContext(simpleRuntimeContext);
vm.runInContext(`${extractFunction(battleJs, 'resolveSimpleGate')}\n${extractFunction(battleJs, 'simpleActionAddons')}\n${extractFunction(battleJs, 'executeSimpleDisplacementAddons')}\n${extractFunction(battleJs, 'executeSimpleRule')}`, simpleRuntimeContext);
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
