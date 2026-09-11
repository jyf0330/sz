/* 灵宠战斗规则引擎 v3 —— 依据《玩法.docx》+《新数值.xlsx》机制词典 M01-M54。
 * 与 UI 解耦：浏览器挂 window.BattleEngine，Node 下 module.exports。
 * 规则决定与暂定项清单见 战斗规则_v3.md。
 * 技能/灵兽行为定义见 battle-defs.js（BattleEngine.Defs）。 */
(function (global) {
'use strict';

const QUALITIES = ['青铜', '白银', '黄金', '钻石'];
const QUALITY_MULT = { '青铜': 1, '白银': 2, '黄金': 4, '钻石': 8 };
const SIZE_SLOTS = { '短篇': 1, '中篇': 2, '长篇': 3 };
const ROWS = 5, COLS = 6;
const BASE_CRIT = 5;            // 暂定①：技能基础暴击率 5%（原表未定义基础值）
const MAX_ROUND = 100;          // 超时平局
const EVENT_DEPTH_LIMIT = 16;   // 暂定②：事件链深度上限（R-001 防循环）
const LISTENER_PER_TURN_LIMIT = 32;
const MAX_ENERGY = 12;
const PARALYZE_RATE = 7;        // M11：每层 7%

// ---------- RNG（mulberry32，种子可复现） ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 数据 ----------
const DATA = global.BATTLE_DATA;
if (!DATA) throw new Error('缺少 BATTLE_DATA，请先运行 scripts/build_battle_data.py');
const PET_DATA = new Map(DATA.pets.map(p => [p.name, p]));
const SKILL_DATA = new Map(DATA.skills.map(s => [s.name, s]));
function petInfo(name) { return PET_DATA.get(name) || PET_DATA.get('蚁王'); }
function skillInfo(name) { return SKILL_DATA.get(name) || SKILL_DATA.get('啃咬'); }
function heroMaxHp(level) {
  const table = DATA.heroHp;
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (table[lv] != null) return table[lv];
  const maxLv = Math.max(...Object.keys(table).map(Number));
  return lv < maxLv ? table[lv] || table[maxLv] : table[maxLv] + 210 * (lv - maxLv);
}
// 价值（玩法.docx“价值”节；沙盒内按买入价，局外成长不参与本场）
function petValue(quality) { return 3 * QUALITY_MULT[quality]; }
function skillValue(name, quality) { return SIZE_SLOTS[skillInfo(name).size] * 2 * QUALITY_MULT[quality]; }

// ---------- 事件类型 ----------
const EV = {
  BATTLE_START: 'battleStart',
  TURN_START: 'turnStart',
  TURN_END: 'turnEnd',
  SKILL_USED: 'skillUsed',
  MARTIAL_USED: 'martialUsed',
  MEDIUM_USED: 'mediumUsed',
  OFFENSIVE_USED: 'offensiveUsed',
  ACTION: 'action',
  ATTACK_HIT: 'attackHit',
  DAMAGE: 'damage',
  BURN_APPLIED: 'burnApplied',
  POISON_APPLIED: 'poisonApplied',
  BURN_TICK: 'burnTick',
  POISON_TICK: 'poisonTick',
  SHIELD_GAINED: 'shieldGained',
  HEALED: 'healed',
  CRIT: 'crit',
  EXCITE_APPLIED: 'exciteApplied',
  WEAKEN_APPLIED: 'weakenApplied',
  KILL: 'kill',
  REVIVED: 'revived',
};

// ---------- 棋盘方向：玩家在棋盘下方（大行号）朝上；敌方反之 ----------
function forward(side) { return side === 'player' ? -1 : 1; }
function homeRow(side) { return side === 'player' ? ROWS - 1 : 0; }
function inBoard(r, c) { return r >= 0 && r < ROWS && c >= 0 && c < COLS; }
function dist(a, b) { return Math.abs(a.pos[0] - b.pos[0]) + Math.abs(a.pos[1] - b.pos[1]); }
function coord(p) { return String.fromCharCode(65 + p[1]) + (p[0] + 1); }

let uid = 0;

// ---------- 技能实例 ----------
class SkillInstance {
  constructor(name, quality) {
    const info = skillInfo(name);
    this.id = 'sk' + (++uid);
    this.name = name;
    this.quality = quality in info.tiers ? quality : info.baseTier;
    this.info = info;
    this.tier = info.tiers[this.quality];
    this.size = info.size;
    this.slots = SIZE_SLOTS[info.size];
    this.category = info.category || '';
    this.abilities = this.tier.abilities || [];
    this.rangeText = this.tier.range || '';
    this.effect = this.tier.effect || {};
    this.owner = null;               // Unit.id
    this.ammoMax = this.effect.ammo || 0;
    this.ammo = this.ammoMax;
    this.countdownBase = this.effect.countdown || 0;
    this.countdown = this.countdownBase;
    this.burstCost = this.effect.burst || 0;
    this.critBonus = this.effect.crit || 0;
    this.critGrowth = 0;
    this.damageGrowth = 0;
    this.igniteGrowth = 0;
    this.shieldGrowth = 0;
    this.firstUseDone = false;
    this.usedCount = 0;
    this.value = skillValue(name, this.quality);
    this.burstCountdown = null;      // 元气弹专属
    this.pendingValue = 0;           // 局外价值成长（沙盒固定，仅展示）
  }
  get offensive() { return this.abilities.some(a => ['attack', 'damage', 'ignite', 'poison'].includes(a.kind)); }
  get multi() { return this.effect.multi || 1; }
}

// ---------- 灵兽实例 ----------
class Unit {
  constructor(name, quality, side, slot) {
    const info = petInfo(name);
    this.id = 'u' + (++uid);
    this.name = name;
    this.quality = quality in info.tiers ? quality : info.baseTier;
    this.side = side;
    this.slot = slot;
    this.info = info;
    this.tier = info.tiers[this.quality];
    this.maxHp = this.tier.hp;
    this.hp = this.maxHp;
    this.baseAtk = this.tier.atk;
    this.baseDef = this.tier.def;
    this.atk = this.baseAtk;
    this.def = this.baseDef;
    this.permanentAtk = 0;   // 战斗内持续（吐纳术爆能、幼熊击杀）
    this.permanentDef = 0;
    this.tempAtk = 0;        // 回合内临时（巨力/黑犬/钝化）
    this.tempDef = 0;
    this.energy = 0;
    this.shield = 0;
    this.burn = 0;
    this.poison = 0;
    this.regen = 0;
    this.excited = 0;
    this.weak = 0;
    this.paralyze = 0;
    this.sealed = 0;
    this.rooted = 0;
    this.dead = false;
    this.reviveAt = null;
    this.skillDamageBonus = 0;  // 自身全部技能伤害加成（使劲/赤精鱼/圣象甲虫）
    this.igniteBonus = 0;       // 赤精鱼点燃加成
    this.critAura = 0;          // 气场累计暴击
    this.skills = [];
    this.passiveCountdown = 0;  // 灵宠倒计时（铁丸子）
    this.passiveState = {};
    this.pos = [homeRow(side), Math.min(COLS - 1, 1 + slot)];
    this.firstMartialThisTurn = true;
    this.firstSkillThisTurn = true;
    this.killCount = 0;
    this.value = petValue(this.quality);
  }
  get alive() { return !this.dead && this.hp > 0; }
}

// ---------- 英雄 ----------
class Hero {
  constructor(side, level) {
    this.side = side;
    this.level = Math.max(1, Math.floor(Number(level) || 1));
    this.maxHp = heroMaxHp(this.level);
    this.hp = this.maxHp;
  }
}

// ---------- 战斗主控 ----------
class Battle {
  constructor(config, options = {}) {
    this.rng = mulberry32(options.seed == null ? 20260910 : options.seed);
    this.config = config;
    this.round = 0;
    this.seq = 0;
    this.eventSeq = 0;
    this.log = [];
    this.winner = null;
    this.depth = 0;
    this.responded = new Map();
    this.listenerFires = new Map();
    this.listeners = [];
    this.started = false;
    this.phase = 'idle';        // idle|battleStart|beginTurn|skill|endTurn|done
    this.turnSide = null;
    this.cursor = 0;
    this.stepGuard = 0;

    this.hero = { player: new Hero('player', config.player.level), enemy: new Hero('enemy', config.enemy.level) };
    this.units = { player: [], enemy: [] };
    this.skills = { player: [], enemy: [] };
    this.teamGrowth = { player: { skillDamage: 0 }, enemy: { skillDamage: 0 } }; // 角蛙/龙牙斩（仅武技引用）
    this.pendingBattles = [];

    for (const side of ['player', 'enemy']) {
      const cfg = config[side];
      const pets = (cfg.pets || []).filter(p => p && p.name);
      pets.forEach((p, i) => this.units[side].push(new Unit(p.name, p.quality, side, i)));
      (cfg.skills || []).filter(s => s && s.name).forEach(s => {
        const sk = new SkillInstance(s.name, s.quality);
        const ownerIdx = Math.max(0, Math.min(pets.length - 1, Number(s.owner) || 0));
        const owner = this.units[side][ownerIdx];
        if (owner) { sk.owner = owner.id; owner.skills.push(sk); }
        this.skills[side].push(sk);
      });
      // 装备防御加成（技能表“防御”列 → 基本防御）
      this.units[side].forEach(u => {
        u.baseDef = u.tier.def + u.skills.reduce((sum, s) => sum + (s.tier.defBonus || 0), 0);
        u.def = u.baseDef;
      });
    }
  }

  // ---------- 查询 ----------
  allUnits() { return [...this.units.player, ...this.units.enemy]; }
  unitById(id) { return this.allUnits().find(u => u.id === id) || null; }
  unitsOf(side, aliveOnly) {
    const list = this.units[side];
    return aliveOnly ? list.filter(u => u.alive) : list;
  }
  skillsOf(side) { return this.skills[side]; }
  ownerOf(sk) { return sk ? this.unitById(sk.owner) : null; }
  oppSide(side) { return side === 'player' ? 'enemy' : 'player'; }
  heroOf(side) { return this.hero[side]; }

  // ---------- 日志（R-020：阶段/事件/来源/目标/前后值） ----------
  L(event, source, target, text, detail) {
    this.log.push({
      round: this.round, seq: this.seq, phase: this.phase, side: this.turnSide,
      event, source: source ? { id: source.id, name: source.name, side: source.side } : null,
      target: target ? { id: target.id, name: target.name, side: target.side } : null,
      text, detail: detail || null,
    });
    if (this.log.length > 6000) this.log.shift();
  }

  // ---------- 事件总线（R-001：同被动对同事件只响应一次 + 链深/每回合上限） ----------
  on(key, event, unit, fn) { this.listeners.push({ key, event, unit, fn }); }
  clearListenersOf(unit) { this.listeners = this.listeners.filter(l => l.unit !== unit); }
  fire(event, payload) {
    const id = ++this.eventSeq;
    if (this.depth >= EVENT_DEPTH_LIMIT) {
      this.L('GUARD', null, null, `事件链深度达上限 ${EVENT_DEPTH_LIMIT}，截断 ${event}`);
      return;
    }
    this.depth++;
    try {
      for (const l of [...this.listeners]) {
        if (l.event !== event) continue;
        if (l.unit && !l.unit.alive) continue;
        let set = this.responded.get(l.key);
        if (!set) { set = new Set(); this.responded.set(l.key, set); }
        if (set.has(id)) continue;
        const fires = this.listenerFires.get(l.key) || 0;
        if (fires >= LISTENER_PER_TURN_LIMIT) continue;
        set.add(id);
        this.listenerFires.set(l.key, fires + 1);
        try { l.fn(Object.assign({ id, battle: this }, payload)); }
        catch (e) { this.L('ERROR', null, null, `被动 ${l.key} 异常: ${e.message}`); }
      }
    } finally { this.depth--; }
  }

  // ---------- 亢奋/衰弱修正（M21/M22；每次触发消耗一层） ----------
  modifyGain(unit, amount) {
    let v = Math.floor(amount);
    if (unit.excited > 0) { v *= 2; unit.excited = Math.max(0, unit.excited - 1); }
    if (unit.weak > 0) { v = Math.floor(v / 2); unit.weak = Math.max(0, unit.weak - 1); }
    return Math.max(0, v);
  }
  modifyLoss(unit, amount) {
    let v = Math.floor(amount);
    if (unit.excited > 0) { v = Math.floor(v / 2); unit.excited = Math.max(0, unit.excited - 1); }
    if (unit.weak > 0) { v *= 2; unit.weak = Math.max(0, unit.weak - 1); }
    return v;
  }

  // ---------- 伤害管线（暂定③：伤害 → 减防御 → 护盾 → 生命；受击后防御-1） ----------
  // 剧毒 pierceShield（M17 无视护甲、受防御减伤）。灼烧/普通伤害走标准管线。
  dealDamage(source, target, amount, opts = {}) {
    if (!target || !target.alive || !(amount > 0)) return { dealt: 0, absorbed: 0 };
    const before = { hp: target.hp, shield: target.shield, def: target.def };
    let rest = Math.max(0, Math.round(amount));
    if (!opts.pierceDef) rest = Math.max(0, rest - Math.max(0, target.def));
    let absorbed = 0;
    if (!opts.pierceShield && target.shield > 0) {
      absorbed = Math.min(target.shield, rest);
      target.shield -= absorbed;
      rest -= absorbed;
    }
    if (rest > 0) target.hp = Math.max(0, target.hp - rest);
    if ((rest > 0 || absorbed > 0) && !opts.noDefDrop) target.def = Math.max(0, target.def - 1);
    const dealt = rest;
    this.L(opts.tag || 'DAMAGE', source, target,
      `${source ? source.name : '环境'} 对 ${target.name} 造成 ${dealt} 点${opts.label || '伤害'}` +
      (absorbed ? `（护盾吸收 ${absorbed}）` : '') + (!dealt && !absorbed ? '（被防御完全抵消）' : ''),
      { before, after: { hp: target.hp, shield: target.shield, def: target.def }, amount, dealt, absorbed });
    this.fire(EV.DAMAGE, { source, target, amount: dealt, absorbed, tag: opts.tag || 'DAMAGE' });
    if (target.hp <= 0) this.killUnit(source, target);
    return { dealt, absorbed };
  }

  killUnit(source, target) {
    if (!target.alive && target.dead) return;
    if (target.alive) return;
    target.dead = true;
    target.hp = 0;
    target.reviveAt = this.round + 2;   // 玩法.docx：2回合后复活
    target.shield = 0; target.burn = 0; target.poison = 0; target.regen = 0;
    target.tempAtk = 0; target.tempDef = 0;
    const hero = this.hero[target.side];
    hero.hp = Math.max(0, hero.hp - target.maxHp);
    this.L('DEATH', source, target,
      `${target.name} 被击倒，${target.side === 'player' ? '己方' : '敌方'}英雄失去 ${target.maxHp} 点生命（剩余 ${hero.hp}），预计第 ${target.reviveAt} 回合复活`);
    this.clearListenersOf(target);
    if (source && source.alive) {
      source.killCount++;
      this.fire(EV.KILL, { source, target });
    }
    if (hero.hp <= 0) this.finishBattle(this.oppSide(target.side));
  }

  finishBattle(winner) {
    if (this.winner) return;
    this.winner = winner;
    this.phase = 'done';
    this.L('RESULT', null, null, winner === 'draw'
      ? `达到 ${MAX_ROUND} 回合上限，平局`
      : `${winner === 'player' ? '己方' : '敌方'}获胜（对方英雄生命归零）`);
  }

  // ---------- 治疗/护盾/能量 ----------
  heal(source, target, amount, label) {
    if (!target || !target.alive || !(amount > 0)) return 0;
    const before = target.hp;
    const actual = Math.min(Math.floor(amount), target.maxHp - target.hp);
    target.hp += actual;
    this.L('HEAL', source, target, `${label || '治疗'}：${target.name} 恢复 ${actual} 点生命`, { before, after: target.hp, amount: actual });
    if (actual > 0) this.fire(EV.HEALED, { source, target, amount: actual });
    return actual;
  }
  applyShield(source, target, amount, skill, label) {
    if (!target || !target.alive || !(amount > 0)) return 0;
    let value = Math.floor(amount);
    const isMushroom = target.name === '巨伞蕈';   // 巨伞蕈：自身获得量减半并分发给两名其它友方
    if (isMushroom) value = Math.floor(value / 2);
    value = this.modifyGain(target, value);
    target.shield += value;
    this.L('SHIELD', source, target, `${label || '护盾'}：${target.name} 获得 ${value} 点护盾（当前 ${target.shield}）`, { amount: value, after: target.shield });
    this.fire(EV.SHIELD_GAINED, { source, target, amount: value, skill });
    if (isMushroom) {
      const others = this.unitsOf(target.side, true).filter(u => u !== target);
      for (let i = 0; i < 2 && others.length; i++) {
        const pick = others.splice(Math.floor(this.rng() * others.length), 1)[0];
        this.applyShield(target, pick, value, skill, '巨伞蕈分盾');
      }
    }
    return value;
  }
  addEnergy(unit, amount, reason) {
    if (!unit || !unit.alive || !amount) return 0;
    const before = unit.energy;
    unit.energy = Math.min(MAX_ENERGY, unit.energy + Math.max(0, Math.floor(amount)));
    const actual = unit.energy - before;
    if (actual) {
      this.L('ENERGY', null, unit, `${unit.name} ${reason || '获得'} ${actual} 点能量（当前 ${unit.energy}）`, { before, after: unit.energy });
    }
    return actual;
  }
  spendEnergy(unit, amount, reason) {
    if (!unit || unit.energy < amount) return false;
    unit.energy -= amount;
    this.L('ENERGY', null, unit, `${unit.name} 消耗 ${amount} 点能量（${reason}），剩余 ${unit.energy}`);
    return true;
  }

  // ---------- 灼烧/剧毒（M15/M17/M18/M19） ----------
  burnOnHit(attacker, target) {
    if (!target.alive || target.burn <= 0) return;
    const v = target.burn;
    this.dealDamage(attacker, target, v, { tag: 'BURN_TICK', label: '灼烧', pierceShield: true });
    target.burn = Math.max(1, Math.floor(target.burn * 0.9));
    this.L('BURN', attacker, target, `${target.name} 灼烧衰减 10%，剩余 ${target.burn} 层`);
    this.fire(EV.BURN_TICK, { source: attacker, target, amount: v });
  }
  applyIgnite(source, target, value, skill) {
    if (!target.alive || !(value > 0)) return;
    if (target.burn > 0) {   // M18：此前已有灼烧 → 点燃值×2 额外伤害
      this.dealDamage(source, target, value * 2, { tag: 'IGNITE_PROC', label: '点燃引爆' });
    }
    if (!target.alive) return;
    target.burn += value;
    this.L('BURN', source, target, `${skill ? skill.name : '点燃'}：${target.name} 获得灼烧 +${value}（当前 ${target.burn}）`, { amount: value, after: target.burn });
    this.fire(EV.BURN_APPLIED, { source, target, amount: value, skill });
  }
  applyPoison(source, target, value, skill) {
    if (!target.alive || !(value > 0)) return;
    const had = target.poison > 0;
    target.poison += value;
    this.L('POISON', source, target, `${skill ? skill.name : '淬毒'}：${target.name} 获得剧毒 +${value}（当前 ${target.poison}）`, { amount: value, after: target.poison });
    this.fire(EV.POISON_APPLIED, { source, target, amount: value, skill });
    if (had) this.poisonTick(target, '淬毒引爆');   // M19：立即结算一次
  }
  poisonTick(target, label) {
    if (!target.alive || target.poison <= 0) return;
    const v = target.poison;
    this.dealDamage(null, target, v, { tag: 'POISON_TICK', label, pierceShield: true });
    target.poison = Math.max(0, target.poison - 2);
    this.L('POISON', null, target, `${target.name} 剧毒 -2，剩余 ${target.poison} 层`);
    this.fire(EV.POISON_TICK, { target, amount: v });
  }

  // ---------- 状态 ----------
  applyExcite(source, target, amount) {
    if (!target.alive || !(amount > 0)) return;
    target.excited += amount;
    this.L('STATUS', source, target, `${target.name} 获得亢奋 +${amount}（当前 ${target.excited}）`);
    this.fire(EV.EXCITE_APPLIED, { source, target, amount });
  }
  applyWeaken(source, target, amount) {
    if (!target.alive || !(amount > 0)) return;
    target.weak += amount;
    this.L('STATUS', source, target, `${target.name} 获得衰弱 +${amount}（当前 ${target.weak}）`);
    this.fire(EV.WEAKEN_APPLIED, { source, target, amount });
  }
  applyParalyze(source, target, amount) {
    if (!target.alive || !(amount > 0)) return;
    target.paralyze += amount;
    this.L('STATUS', source, target, `${target.name} 获得麻痹 +${amount}（当前 ${target.paralyze}）`);
  }
  applySeal(source, target) {
    if (!target.alive || target.sealed) return;
    target.sealed = 1;
    this.L('STATUS', source, target, `${target.name} 获得封刃（本回合无法使用进攻技能）`);
  }
  applyRoot(source, target) {
    if (!target.alive || target.rooted) return;
    target.rooted = 1;
    this.L('STATUS', source, target, `${target.name} 获得禁足（本回合无法移动）`);
  }

  // ---------- 攻防变化 ----------
  changeAtk(source, target, amount, label, permanent) {
    if (!target || !target.alive || !amount) return;
    const v = amount > 0 ? this.modifyGain(target, amount) : this.modifyLoss(target, -amount);
    const delta = amount > 0 ? v : -v;
    if (permanent) target.permanentAtk += delta; else target.tempAtk += delta;
    this.refreshDerived(target);
    this.L('BUFF', source, target, `${label || '攻击变化'}：${target.name} 攻击 ${delta >= 0 ? '+' : ''}${delta}（当前 ${target.atk}）`);
  }
  changeDef(source, target, amount, label, permanent) {
    if (!target || !target.alive || !amount) return;
    const v = amount > 0 ? this.modifyGain(target, amount) : this.modifyLoss(target, -amount);
    const delta = amount > 0 ? v : -v;
    if (permanent) target.permanentDef += delta; else target.tempDef += delta;
    this.refreshDerived(target);
    this.L('BUFF', source, target, `${label || '防御变化'}：${target.name} 防御 ${delta >= 0 ? '+' : ''}${delta}（当前 ${target.def}）`);
  }
  refreshDerived(unit) {
    unit.atk = Math.max(0, unit.baseAtk + unit.permanentAtk + unit.tempAtk + this.auraAtk(unit));
    unit.def = Math.max(0, unit.baseDef + unit.permanentDef + unit.tempDef);
  }
  // 动态光环：鬼蜂（每存活友方+N）、圣象甲虫（其它友方+N/M）
  auraAtk(unit) {
    let bonus = 0;
    const allies = this.unitsOf(unit.side, true);
    if (unit.name === '鬼蜂') {
      bonus += allies.length * ({ '青铜': 2, '白银': 4, '黄金': 6, '钻石': 10 }[unit.quality] || 2);
    }
    for (const a of allies) {
      if (a.name === '圣象甲虫' && a !== unit) {
        const b = ({ '白银': [3, 1], '黄金': [6, 2], '钻石': [12, 3] }[a.quality] || [3, 1]);
        bonus += b[0];
      }
    }
    return bonus;
  }
  // 技能伤害加成汇总（使劲/鲛人抢手/魔性飞剑等单技能成长 + 灵兽自身加成 + 蚁王光环 + 角蛙/龙牙斩全队）
  skillDamageBonusFor(owner, skill) {
    let bonus = (owner.skillDamageBonus || 0) + (skill ? skill.damageGrowth : 0);
    if (skill && skill.category === '武技') bonus += this.teamGrowth[owner.side].skillDamage;
    for (const a of this.unitsOf(owner.side, true)) {
      if (a.name === '蚁王') bonus += ({ '青铜': 2, '白银': 4, '黄金': 8, '钻石': 16 }[a.quality] || 2);
    }
    return bonus;
  }
  hasTongLingZhong(side) { return this.unitsOf(side, true).some(u => u.name === '通灵钟'); }

  // ---------- 射程几何（R-011，暂定④：距离=曼哈顿；并列随机） ----------
  cellEnemyAt(owner, r, c) {
    if (!inBoard(r, c)) return null;
    return this.unitsOf(this.oppSide(owner.side), true).find(u => u.pos[0] === r && u.pos[1] === c) || null;
  }
  fwdCell(owner, n) { return [owner.pos[0] + forward(owner.side) * n, owner.pos[1]]; }
  rayEnemies(owner) {
    const d = forward(owner.side);
    const out = [];
    for (let r = owner.pos[0] + d; inBoard(r, owner.pos[1]); r += d) {
      const e = this.cellEnemyAt(owner, r, owner.pos[1]);
      if (e) out.push(e);
    }
    return out;
  }
  pickBy(list, cmpFn, label) {
    if (!list.length) return null;
    const sorted = list.slice().sort(cmpFn);
    const best = sorted.filter(u => cmpFn(u, sorted[0]) === 0);
    const pick = best[Math.floor(this.rng() * best.length)];
    if (best.length > 1) this.L('TARGET', null, pick, `${label}并列（${best.map(u => u.name).join('/')}），随机选择 ${pick.name}`);
    return pick;
  }
  lowestHp(list) { return this.pickBy(list, (a, b) => a.hp - b.hp || a.id.localeCompare(b.id), '生命最低'); }
  highestAtk(list) { return this.pickBy(list, (a, b) => this.effAtk(b) - this.effAtk(a) || a.id.localeCompare(b.id), '攻击最高'); }
  effAtk(u) { return u.baseAtk + u.permanentAtk + u.tempAtk + this.auraAtk(u); }
  nearest(list, to) { return this.pickBy(list, (a, b) => dist(to, a) - dist(to, b) || a.id.localeCompare(b.id), '距离最近'); }
  randomOf(list) { return list.length ? list[Math.floor(this.rng() * list.length)] : null; }

  targetsFor(skill, owner) {
    const t = String(skill.rangeText || '').replace(/\s/g, '');
    const enemies = this.unitsOf(this.oppSide(owner.side), true);
    const allies = this.unitsOf(owner.side, true);
    const out = { units: [], self: false, skill: false, area: false };

    if (t.includes('正前方第三格，灵兽自身')) {          // 火中取栗
      const e = this.cellEnemyAt(owner, ...this.fwdCell(owner, 3));
      out.units = e ? [e] : []; out.self = true;
      return out;
    }
    if (t.includes('技能')) { out.skill = true; return out; }   // 装填/专注/毒腺等以技能为目标
    if (t.includes('灵兽自身')) { out.self = true; return out; }
    if (t.includes('所有友方')) { out.units = allies.slice(); out.area = true; return out; }
    if (t.includes('我方随机灵兽')) { out.units = [this.randomOf(allies)].filter(Boolean); return out; }
    if (t.includes('生命最低的友方')) { out.units = [this.lowestHp(allies)].filter(Boolean); return out; }
    if (t.includes('友方攻击最高的灵兽和生命最低的灵兽')) {  // 双盾
      const a = this.highestAtk(allies), b = this.lowestHp(allies);
      out.units = a && b && a !== b ? [a, b] : [a || b].filter(Boolean);
      return out;
    }
    if (t.includes('两步范围内的所有友方')) {
      out.units = allies.filter(u => dist(owner, u) <= 2); out.area = true; return out;
    }
    if (!enemies.length) return out;
    if (t.includes('三步范围内生命值最低')) {
      const cand = enemies.filter(u => dist(owner, u) <= 3);
      out.units = [this.lowestHp(cand)].filter(Boolean); return out;
    }
    if (t.includes('两步范围内的所有敌人')) {
      out.units = enemies.filter(u => dist(owner, u) <= 2); out.area = true; return out;
    }
    if (t.includes('距离最近')) { out.units = [this.nearest(enemies, owner)].filter(Boolean); return out; }
    if (t.includes('正前方直线最远')) { const ray = this.rayEnemies(owner); out.units = ray.length ? [ray[ray.length - 1]] : []; return out; }
    if (t.includes('正前方直线')) { const ray = this.rayEnemies(owner); out.units = ray.length ? [ray[0]] : []; return out; }
    if (t.includes('正前方三格中最远')) {
      const cand = [1, 2, 3].map(n => this.cellEnemyAt(owner, ...this.fwdCell(owner, n))).filter(Boolean);
      if (!cand.length) return out;
      const d = forward(owner.side);
      cand.sort((a, b) => Math.abs((b.pos[0] - owner.pos[0]) * d) - Math.abs((a.pos[0] - owner.pos[0]) * d));
      out.units = [cand[0]]; return out;
    }
    if (t.includes('第一二格及其左右相邻格')) {          // 暴起/倾泻：前1、前2格及各自左右
      const cells = [];
      for (const n of [1, 2]) {
        const [r, c] = this.fwdCell(owner, n);
        cells.push([r, c], [r, c - 1], [r, c + 1]);
      }
      out.units = cells.map(([r, c]) => this.cellEnemyAt(owner, r, c)).filter(Boolean);
      out.area = true; return out;
    }
    if (t.includes('第一格及其左右两格')) {              // 钝化：3 格中攻击最高
      const [r, c] = this.fwdCell(owner, 1);
      const cand = [[r, c], [r, c - 1], [r, c + 1]].map(([rr, cc]) => this.cellEnemyAt(owner, rr, cc)).filter(Boolean);
      out.units = cand.length ? [this.highestAtk(cand)] : []; return out;
    }
    if (t.includes('第二格及其左右两格')) {              // 横扫：3 格全部
      const [r, c] = this.fwdCell(owner, 2);
      out.units = [[r, c], [r, c - 1], [r, c + 1]].map(([rr, cc]) => this.cellEnemyAt(owner, rr, cc)).filter(Boolean);
      out.area = true; return out;
    }
    if (t.includes('第二和第三格')) {                    // 重劈
      out.units = [this.cellEnemyAt(owner, ...this.fwdCell(owner, 2)), this.cellEnemyAt(owner, ...this.fwdCell(owner, 3))].filter(Boolean);
      out.area = true; return out;
    }
    if (t.includes('第二格或第三格')) {                  // 风刃/妒火/泰诺地龙：优先第二格
      const a = this.cellEnemyAt(owner, ...this.fwdCell(owner, 2));
      const b = this.cellEnemyAt(owner, ...this.fwdCell(owner, 3));
      out.units = a ? [a] : (b ? [b] : []); return out;
    }
    if (t.includes('第三格')) { const e = this.cellEnemyAt(owner, ...this.fwdCell(owner, 3)); out.units = e ? [e] : []; return out; }
    if (t.includes('第二格')) { const e = this.cellEnemyAt(owner, ...this.fwdCell(owner, 2)); out.units = e ? [e] : []; return out; }
    if (t.includes('第一格') || t.includes('正前方一格')) {
      const e = this.cellEnemyAt(owner, ...this.fwdCell(owner, 1)); out.units = e ? [e] : []; return out;
    }
    return out;   // 被动技能（饮血倒刺等）无主动目标
  }

  // ---------- 位移（M30/M31：无法移动则本次伤害翻倍 → 由调用方处理） ----------
  moveUnit(source, target, dir) {
    if (!target || !target.alive) return false;
    const d = forward(source.side);
    const nr = target.pos[0] + (dir === 'pull' ? d : -d);
    const nc = target.pos[1];
    if (!inBoard(nr, nc)) return false;
    if (this.allUnits().some(u => u.alive && u !== target && u.pos[0] === nr && u.pos[1] === nc)) return false;
    const before = target.pos.slice();
    target.pos = [nr, nc];
    this.L('MOVE', source, target, `${target.name} 被${dir === 'pull' ? '拖拽拉近' : '击退'}：${coord(before)} → ${coord(target.pos)}`);
    return true;
  }

  // ---------- 暴击（暂定⑤：每次使用掷一次；命中全体可暴击数值×2；被动追加不暴击） ----------
  critChanceOf(skill, owner) {
    if (!owner) return BASE_CRIT;
    let c = BASE_CRIT + (skill.critBonus || 0) + (skill.critGrowth || 0);
    for (const a of this.unitsOf(owner.side, true)) {
      if (a.name === '巨鳄蚁') c += ({ '青铜': 35, '白银': 45, '黄金': 55, '钻石': 65 }[a.quality] || 35);
      if (a.name === '见闻兽') c += ({ '白银': 10, '黄金': 20, '钻石': 30 }[a.quality] || 10);
    }
    if (owner.name === '气场') c += owner.critAura;
    for (const s of owner.skills) {                    // 激昂：暴击率 = 能量 × N%
      if (s.name === '激昂' && s.owner === owner.id) {
        c += owner.energy * ({ '青铜': 3, '白银': 3, '黄金': 4, '钻石': 5 }[s.quality] || 3);
      }
    }
    const bar = this.skillsOf(owner.side);             // 专注：左右相邻技能暴击率提升
    const idx = bar.indexOf(skill);
    if (idx >= 0) {
      for (const [j, dir] of [[idx - 1, -1], [idx + 1, 1]]) {
        const nb = bar[j];
        if (nb && nb.name === '专注') c += ({ '青铜': 10, '白银': 20, '黄金': 30, '钻石': 40 }[nb.quality] || 10);
      }
    }
    return Math.min(99, c);
  }
  rollCrit(skill, owner) {
    if (skill.name === '冲刺拳' && !skill.firstUseDone) return true;
    return this.rng() * 100 < this.critChanceOf(skill, owner);
  }

  // ---------- 能力列数值计算 ----------
  abilityValue(skill, owner, ab, isCrit) {
    let v = ab.value;
    const dotScale = SIZE_SLOTS[skill.size] / 4;       // 玩法.docx Dot 公式：基础值 + 攻击×体积/4
    switch (ab.kind) {
      case 'attack':
        if (ab.plus) v += this.effAtk(owner);
        v += this.skillDamageBonusFor(owner, skill);
        break;
      case 'damage':
        v += this.skillDamageBonusFor(owner, skill);
        if (skill.name === '啃食') v += Math.floor(this.critChanceOf(skill, owner) / 10); // 啃食：每10%暴击率伤害+1
        break;
      case 'ignite':
        if (ab.plus) v += Math.floor(this.effAtk(owner) * dotScale);
        v += (skill.igniteGrowth || 0) + (owner.igniteBonus || 0);
        break;
      case 'poison': {
        if (ab.plus) v += Math.floor(this.effAtk(owner) * dotScale);
        if (owner.name === '蕈章' && owner.shield > 0) v *= 2;   // 蕈章：有护盾时淬毒翻倍
        break;
      }
      case 'shield': v += (skill.shieldGrowth || 0); break;
      case 'heal': break;
      case 'regen': break;
    }
    if (isCrit) v *= 2;                                 // M50：暴击使可暴击数值翻倍
    return Math.max(0, Math.floor(v));
  }

  // ---------- 单次命中执行（进攻能力段 + 灼烧受击联动） ----------
  executeHit(skill, owner, target, isCrit, label) {
    if (!target || !target.alive) return;
    // 被进攻技能命中 → 先结算灼烧受击（M15，含点燃/淬毒命中）
    if (target.burn > 0) this.burnOnHit(owner, target);
    if (!target.alive) return;
    for (const ab of skill.abilities) {
      if (!target.alive) return;
      const v = this.abilityValue(skill, owner, ab, isCrit);
      if (ab.kind === 'attack' || ab.kind === 'damage') {
        let amount = v;
        if (owner.name === '饿狼') {                    // 饿狼：每回合第一个（黄金起为任意）技能伤害翻倍
          const anySkill = ['黄金', '钻石'].includes(owner.quality);
          if ((anySkill ? owner.firstSkillThisTurn : owner.firstMartialThisTurn) && (anySkill || skill.category === '武技')) {
            amount *= 2;
            if (anySkill) owner.firstSkillThisTurn = false; else owner.firstMartialThisTurn = false;
            this.L('PET', owner, target, `饿狼特性：本回合首个${anySkill ? '' : '武技'}技能伤害翻倍`);
          }
        }
        this.dealDamage(owner, target, amount, { tag: 'ATTACK', label: label || '攻击' });
        this.fire(EV.ATTACK_HIT, { source: owner, target, skill });
      } else if (ab.kind === 'ignite') {
        this.applyIgnite(owner, target, v, skill);
        this.fire(EV.ATTACK_HIT, { source: owner, target, skill });
      } else if (ab.kind === 'poison') {
        this.applyPoison(owner, target, v, skill);
        this.fire(EV.ATTACK_HIT, { source: owner, target, skill });
      }
    }
  }

  // ---------- 技能使用主流程 ----------
  useSkill(skill, opts = {}) {
    if (this.winner) return false;
    const owner = this.ownerOf(skill);
    this.seq += 1;
    const viaPassive = !!opts.viaPassive;
    const def = (global.BattleEngine && global.BattleEngine.Defs && global.BattleEngine.Defs.skills[skill.name]) || {};

    // 被动技能不主动使用（连抓/锋锐鳞片/蜷缩/回春丹由事件驱动）
    if (skill.effect.passive && !viaPassive) {
      this.L('SKIP', owner, null, `${skill.name} 为被动技能，不在主动结算序列中触发`);
      return false;
    }
    if (!owner || !owner.alive) {
      this.L('SKIP', null, null, `${skill.name} 的装备灵宠已阵亡，跳过`);
      return false;
    }
    if (owner.sealed && skill.offensive) {
      this.L('SKIP', owner, null, `${owner.name} 处于封刃，${skill.name}（进攻技能）无法使用`);
      return false;
    }
    if (owner.paralyze > 0) {                           // M11
      const chance = owner.paralyze * PARALYZE_RATE;
      if (this.rng() * 100 < chance) {
        owner.paralyze = Math.max(0, owner.paralyze - 1);
        this.L('PARALYZE', owner, null, `${owner.name} 麻痹触发（${chance}%），${skill.name} 使用失败`);
        return false;
      }
    }

    const targeting = this.targetsFor(skill, owner);
    const hasCombatTarget = targeting.units.length > 0;
    const needTarget = def.needTarget != null ? def.needTarget : skill.offensive;

    if (needTarget && !hasCombatTarget && !targeting.skill && !targeting.self) {
      this.L('SKIP', owner, null, `${skill.name} 射程内无有效目标，本次不出招（不消耗弹药）`);
      return false;
    }
    // 弹药（M35：有目标才消耗；归零不可用；黄金飞梭被动触发为例外）
    if (skill.ammoMax > 0 && !viaPassive) {
      if (skill.ammo <= 0) {
        this.L('SKIP', owner, null, `${skill.name} 弹药耗尽，无法使用`);
        return false;
      }
      if (hasCombatTarget || targeting.self || def.alwaysConsume) {
        if (skill.name === '飞针盒') skill.ammo = 0;     // 飞针盒：使用时消耗所有弹药
        else skill.ammo -= 1;
        this.L('AMMO', owner, null, `${skill.name} 消耗弹药，剩余 ${skill.ammo}/${skill.ammoMax}`);
      }
    }

    skill.usedCount += 1;
    skill.firstUseDone = true;
    this.L('SKILL', owner, null,
      `${owner.name} 使用 ${skill.name}（${skill.quality}·${skill.size}）` +
      (targeting.units.length ? `，目标：${targeting.units.map(u => u.name).join('、')}` : targeting.self ? '，目标：自身' : ''));

    // 倒计时推进（M32：>0 使用时 -1；=0 使用时触发段内效果并重置；通灵钟额外-1）
    let cdFire = false;
    if (skill.countdownBase > 0) {
      if (skill.countdown > 0) {
        skill.countdown -= 1;
        let extra = this.hasTongLingZhong(owner.side) ? 1 : 0;
        if (extra) skill.countdown = Math.max(0, skill.countdown - extra);
        this.L('COUNTDOWN', owner, null, `${skill.name} 倒计时 -1${extra ? '（通灵钟额外-1）' : ''}，当前 ${skill.countdown}`);
      } else {
        cdFire = true;
        skill.countdown = skill.countdownBase;
        this.L('COUNTDOWN', owner, null, `${skill.name} 倒计时归零，本次触发倒计时段效果并重置为 ${skill.countdownBase}`);
      }
    }
    // 爆能（M38/M39：能量不足 → 爆能补偿 = 体积能量；段外效果不受影响）
    let burstOk = false;
    if (skill.burstCost > 0) {
      if (owner.energy >= skill.burstCost) {
        this.spendEnergy(owner, skill.burstCost, `${skill.name} 爆能`);
        burstOk = true;
      } else {
        this.addEnergy(owner, skill.slots, `${skill.name} 爆能补偿（体积 ${skill.slots} 格）`);
      }
    }
    const isCrit = this.rollCrit(skill, owner);
    if (isCrit) {
      this.L('CRIT', owner, null, `${skill.name} 暴击！（暴击率 ${this.critChanceOf(skill, owner)}%）本次可暴击数值×2`);
      skill.critGrowth = 0;                             // 凌厉：暴击后重置
      this.fire(EV.CRIT, { unit: owner, skill });
    }

    const ctx = { skill, owner, targeting, isCrit, cdFire, burstOk, viaPassive, battle: this, hits: 0 };

    // 主效果：能力列数值段（蓄力型技能 main=false 时跳过，仅在段内引用）
    if (def.main !== false) {
      const times = skill.multi;
      for (let i = 0; i < times; i++) {
        for (const u of targeting.units) this.executeHit(skill, owner, u, isCrit);
        if (targeting.self) this.executeSelfAbility(skill, owner, isCrit);
        if (def.onHit) def.onHit(ctx, i);
      }
      ctx.hits = times * (targeting.units.length || (targeting.self ? 1 : 0));
    } else if (def.onIdleUse) {
      def.onIdleUse(ctx);                                // 蓄力型的段外非伤害动作（灵气淬体充能等）
    }

    // 通用效果列段外附加（吸血/衰弱/麻痹/位移/降攻/净化等交给 def.onUse 统一处理）
    if (def.onUse) def.onUse(ctx);

    // 倒计时归零段（段内文字）
    if (cdFire && def.onCountdown) def.onCountdown(ctx);
    // 爆能段
    if (burstOk && def.onBurst) def.onBurst(ctx);

    // 事件
    this.fire(EV.SKILL_USED, { unit: owner, skill, targeting });
    this.fire(EV.ACTION, { unit: owner, skill });
    if (skill.category === '武技') this.fire(EV.MARTIAL_USED, { unit: owner, skill, targets: targeting.units });
    if (skill.size === '中篇') this.fire(EV.MEDIUM_USED, { unit: owner, skill });
    if (skill.offensive) this.fire(EV.OFFENSIVE_USED, { unit: owner, skill, targets: targeting.units });
    this.fire(EV.ACTION + ':' + owner.side, { unit: owner, skill });
    return true;
  }

  // 自身向能力（护盾/治疗/再生/自身加成）
  executeSelfAbility(skill, owner, isCrit) {
    for (const ab of skill.abilities) {
      const v = this.abilityValue(skill, owner, ab, isCrit);
      if (ab.kind === 'shield') this.applyShield(owner, owner, v, skill, skill.name);
      else if (ab.kind === 'heal') this.heal(owner, owner, v, skill.name);
      else if (ab.kind === 'regen') {
        owner.regen += v;
        this.L('REGEN', owner, owner, `${owner.name} 获得再生 +${v}（当前 ${owner.regen}）`);
      }
    }
  }

  // ---------- 回合流程 ----------
  battleStart() {
    if (this.started) return;
    this.started = true;
    this.phase = 'battleStart';
    this.round = 1;
    this.L('PHASE', null, null, `—— 战斗开始 ——`);
    // 注册全部被动
    const Defs = global.BattleEngine && global.BattleEngine.Defs;
    if (Defs && Defs.registerAll) Defs.registerAll(this);
    this.fire(EV.BATTLE_START, {});
    this.phase = 'idle';
  }

  firstSideOfRound(r) { return r % 2 === 1 ? 'player' : 'enemy'; }   // 暂定⑥：奇数回合己方先手

  beginTurn(side) {
    if (this.winner) return;
    this.turnSide = side;
    this.phase = 'beginTurn';
    this.cursor = 0;
    this.resetListenerTurnLimits();
    this.L('PHASE', null, null, `—— 第 ${this.round} 回合 · ${side === 'player' ? '己方' : '敌方'}回合开始 ——`);
    const units = this.unitsOf(side, false);

    // 1. 复活（2 回合后；全灭则立即复活一只）
    units.filter(u => u.dead && u.reviveAt != null && u.reviveAt <= this.round).forEach(u => this.reviveUnit(u));
    if (!this.unitsOf(side, true).length) {
      const forced = units.find(u => u.dead);
      if (forced) { this.reviveUnit(forced, true); }
    }
    // 2. 基础属性重置（防御复原；临时攻防清空；回合内标记复位）
    this.unitsOf(side, true).forEach(u => {
      u.tempAtk = 0; u.tempDef = 0; u.sealed = 0; u.rooted = 0;
      u.firstMartialThisTurn = true; u.firstSkillThisTurn = true;
      this.refreshDerived(u);
    });
    this.L('PHASE', null, null, `${side === 'player' ? '己方' : '敌方'}灵宠防御复原，临时攻防重置`);
    // 3. 灵宠倒计时（M32：回合开始结算；归零触发并重置）
    for (const u of this.unitsOf(side, true)) {
      if (u.passiveCountdown > 0) {
        u.passiveCountdown -= 1;
        this.L('COUNTDOWN', null, u, `${u.name} 灵宠倒计时 -1，当前 ${u.passiveCountdown}`);
      } else if (u.passiveCountdown === 0 && u.passiveState.cdArmed) {
        u.passiveState.cdArmed = false;
        u.passiveCountdown = u.passiveState.cdBase;
        const Defs = global.BattleEngine.Defs;
        if (Defs && Defs.pets[u.name] && Defs.pets[u.name].onCountdown) Defs.pets[u.name].onCountdown(this, u);
        u.passiveState.cdArmed = true;                  // 重置后再武装
      }
    }
    // 4. 灵宠特性（回合开始：充能与爆能类）
    const Defs = global.BattleEngine.Defs;
    for (const u of this.unitsOf(side, true)) {
      const pd = Defs && Defs.pets[u.name];
      if (pd && pd.onTurnStart) pd.onTurnStart(this, u);
    }
    this.fire(EV.TURN_START, { side });
    this.phase = 'skill';
  }

  reviveUnit(unit, forced) {
    if (!unit.dead) return;
    unit.dead = false;
    unit.hp = unit.maxHp;
    unit.energy = 0; unit.shield = 0; unit.burn = 0; unit.poison = 0; unit.regen = 0;
    unit.excited = 0; unit.weak = 0; unit.paralyze = 0; unit.sealed = 0; unit.rooted = 0;
    unit.reviveAt = null;
    this.refreshDerived(unit);
    // 原位优先，被占则找空位
    if (this.allUnits().some(u => u.alive && u !== unit && u.pos[0] === unit.pos[0] && u.pos[1] === unit.pos[1])) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!this.allUnits().some(u => u.alive && u !== unit && u.pos[0] === r && u.pos[1] === c)) { unit.pos = [r, c]; break; }
      }
    }
    this.L('REVIVE', null, unit, `${unit.name} ${forced ? '被强制' : ''}复活于 ${coord(unit.pos)}（满生命）`);
    const Defs = global.BattleEngine.Defs;              // 重新注册该灵兽被动
    if (Defs && Defs.registerPets) Defs.registerPets(this, [unit]);
    this.fire(EV.REVIVED, { unit });
  }

  // 结算当前回合下一个技能；返回是否还有
  resolveNext() {
    if (this.winner) return false;
    const side = this.turnSide;
    const bar = this.skillsOf(side);
    while (this.cursor < bar.length) {
      const skill = bar[this.cursor];
      // 乌角鲨：跳过自身技能（由 def 拦截重放）
      const owner = this.ownerOf(skill);
      if (owner && owner.name === '乌角鲨') {
        this.L('SKIP', owner, null, `乌角鲨跳过使用自身装备的 ${skill.name}`);
        this.cursor += 1;
        continue;
      }
      this.cursor += 1;
      this.useSkill(skill, {});
      return true;
    }
    return false;
  }

  endTurn() {
    if (this.winner) return;
    const side = this.turnSide;
    this.phase = 'endTurn';
    this.L('PHASE', null, null, `—— 第 ${this.round} 回合 · ${side === 'player' ? '己方' : '敌方'}回合结束 ——`);
    // 1. 封刃/禁足持续一回合 → 回合结束解除
    this.unitsOf(side, true).forEach(u => { u.sealed = 0; u.rooted = 0; });
    // 2. 剧毒（M17：无视护盾、受防御减伤、-2 层）
    for (const u of [...this.unitsOf(side, true)]) this.poisonTick(u, '回合结束剧毒');
    // 3. 再生（M12：回合结束恢复再生量生命）
    for (const u of [...this.unitsOf(side, true)]) {
      if (u.alive && u.regen > 0) this.heal(null, u, u.regen, `再生 ${u.regen}`);
    }
    // 4. 亢奋/衰弱回合结束 -1 层
    this.unitsOf(side, true).forEach(u => {
      if (u.excited > 0) u.excited -= 1;
      if (u.weak > 0) u.weak -= 1;
    });
    // 5. 回合结束特性（角蛙/玄铁龟等）
    const Defs = global.BattleEngine.Defs;
    for (const u of [...this.unitsOf(side, true)]) {
      if (!u.alive) continue;
      const pd = Defs && Defs.pets[u.name];
      if (pd && pd.onTurnEnd) pd.onTurnEnd(this, u);
    }
    this.fire(EV.TURN_END, { side });
    this.phase = 'idle';
    this.turnSide = null;
  }

  // ---------- 单步推进（UI“结算一步”） ----------
  step() {
    if (this.winner) return { type: 'done', winner: this.winner };
    if (++this.stepGuard > 100000) { this.finishBattle('draw'); return { type: 'done', winner: 'draw' }; }
    if (!this.started) {
      this.battleStart();
      this.beginTurn(this.firstSideOfRound(this.round));
      return { type: 'battleStart' };
    }
    if (this.phase === 'skill') {
      if (this.resolveNext()) return { type: 'skill', side: this.turnSide };
      this.endTurn();
      // 同回合另一方
      const other = this.oppSide(this.firstSideOfRound(this.round));
      if (this.turnSide === null && !this.winner) {
        this.beginTurn(other);
        return { type: 'beginTurn', side: other };
      }
      return { type: 'endTurn', side: null };
    }
    if (this.phase === 'idle') {
      // 上一回合结束 → 新回合
      this.round += 1;
      if (this.round > MAX_ROUND) { this.finishBattle('draw'); return { type: 'done', winner: 'draw' }; }
      const first = this.firstSideOfRound(this.round);
      this.beginTurn(first);
      return { type: 'beginTurn', side: first };
    }
    return { type: 'done', winner: this.winner };
  }

  runToEnd() {
    while (!this.winner) this.step();
    return this.winner;
  }

  // ---------- 快照（UI/测试） ----------
  snapshot() {
    const sideSnap = side => ({
      hero: { hp: this.hero[side].hp, maxHp: this.hero[side].maxHp, level: this.hero[side].level },
      units: this.units[side].map(u => ({
        id: u.id, name: u.name, quality: u.quality, pos: u.pos.slice(), hp: u.hp, maxHp: u.maxHp,
        atk: this.effAtk(u), def: u.def, baseDef: u.baseDef, shield: u.shield, energy: u.energy,
        burn: u.burn, poison: u.poison, regen: u.regen, excited: u.excited, weak: u.weak,
        paralyze: u.paralyze, sealed: u.sealed, rooted: u.rooted, dead: u.dead, reviveAt: u.reviveAt,
        killCount: u.killCount, value: u.value,
        skills: u.skills.map(s => s.id),
      })),
      skills: this.skills[side].map(s => ({
        id: s.id, name: s.name, quality: s.quality, owner: s.owner, size: s.size, category: s.category,
        ammo: s.ammo, ammoMax: s.ammoMax, countdown: s.countdown, countdownBase: s.countdownBase,
        burstCost: s.burstCost, crit: this.critChanceOf(s, this.ownerOf(s)),
        damageGrowth: s.damageGrowth, slots: s.slots, value: s.value, usedCount: s.usedCount,
      })),
    });
    return {
      round: this.round, phase: this.phase, turnSide: this.turnSide, cursor: this.cursor,
      winner: this.winner, seq: this.seq,
      player: sideSnap('player'), enemy: sideSnap('enemy'),
    };
  }
}

// ---------- 导出 ----------
const Engine = {
  Battle, SkillInstance, Unit, Hero, EV, QUALITIES, QUALITY_MULT, SIZE_SLOTS,
  ROWS, COLS, BASE_CRIT, MAX_ENERGY, PARALYZE_RATE, MAX_ROUND,
  heroMaxHp, petValue, skillValue, mulberry32, forward, homeRow, dist, coord,
  petInfo, skillInfo,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
else global.BattleEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
