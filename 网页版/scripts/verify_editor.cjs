const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const editorJs = fs.readFileSync(path.join(root, 'editor.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const battleHtml = fs.readFileSync(path.join(root, 'battle.html'), 'utf8');

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
assert(editorJs.includes("create_codex_pet"));

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
window.ATLAS_EDITOR.saveItem(edited);
assert.equal(window.ATLAS_EDITOR.getItems().find(item => item.id === edited.id).fields['能力'], '攻击999+');

const custom = window.ATLAS_EDITOR.createSkill();
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

console.log(JSON.stringify({ok: true, baseCount, checkedDomIds: queriedIds.size, sharedDataPages: ['index.html', 'editor.html', 'battle.html']}));
