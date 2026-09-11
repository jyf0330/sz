/* 命契3v3 离散回合引擎。与 battle-engine.js 无依赖、无共享状态。 */
(function (global) {
  'use strict';

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class LifeLinkEngine {
    constructor(data, options) {
      if (!data || !data.teams) throw new Error('缺少命契3v3数据');
      this.data = data;
      this.options = Object.assign({ seed: 3303, leftTeam: 'poison' }, options || {});
      this.reset();
    }

    reset(options) {
      if (options) this.options = Object.assign({}, this.options, options);
      this.seed = Math.max(1, Number(this.options.seed) || 3303) >>> 0;
      this.random = mulberry32(this.seed);
      const leftKey = this.options.leftTeam === 'fire' ? 'fire' : 'poison';
      const rightKey = leftKey === 'poison' ? 'fire' : 'poison';
      this.teams = {
        left: this._makeTeam(leftKey, 'left'),
        right: this._makeTeam(rightKey, 'right')
      };
      this.round = 0;
      this.phase = 'ready';
      this.started = false;
      this.ended = false;
      this.winner = null;
      this.queue = [];
      this.log = [];
      this.eventSeq = 0;
      this.poisonSeq = 0;
      this.roundStartLogIndex = 0;
      return this.snapshot();
    }

    _makeTeam(key, side) {
      const source = this.data.teams[key];
      const pets = source.pets.map((pet) => Object.assign(clone(pet), {
        side,
        hp: pet.maxHp,
        dead: false,
        burn: 0,
        poisonSources: [],
        deathCause: null
      }));
      const budget = pets.reduce((sum, pet) => sum + pet.maxHp, 0);
      if (budget !== this.data.petHpBudget) throw new Error(source.name + '生命预算不是 ' + this.data.petHpBudget);
      return {
        key, side, name: source.name, shortName: source.shortName, theme: source.theme,
        description: source.description,
        hero: { id: side + '-hero', name: source.shortName + '英雄', hp: this.data.heroMaxHp, maxHp: this.data.heroMaxHp, poisonSources: [], exposed: false },
        pets
      };
    }

    snapshot() {
      return clone({
        version: this.data.version,
        seed: this.seed,
        round: this.round,
        phase: this.phase,
        started: this.started,
        ended: this.ended,
        winner: this.winner,
        pendingEvents: this.queue.length,
        teams: this.teams,
        log: this.log
      });
    }

    start() {
      if (this.started) return this.snapshot();
      this.started = true;
      this.phase = 'countdown';
      this.queue.push(
        { type: 'countdown', value: 3 },
        { type: 'countdown', value: 2 },
        { type: 'countdown', value: 1 },
        { type: 'seed_lock' },
        { type: 'battle_start' }
      );
      const opening = [];
      for (const side of ['left', 'right']) {
        const team = this.teams[side];
        for (const pet of team.pets) {
          if (pet.id === 'puffer' || pet.id === 'lighter') opening.push({ type: 'ability', side, petId: pet.id, opening: true, speed: pet.speed, position: pet.position });
        }
      }
      opening.sort((a, b) => b.speed - a.speed || a.position - b.position || a.side.localeCompare(b.side));
      this.queue.push(...opening, { type: 'opening_complete' });
      return this.snapshot();
    }

    step() {
      if (this.ended) return null;
      if (!this.started) this.start();
      if (!this.queue.length) this._scheduleRound();
      const event = this.queue.shift();
      if (!event) return null;
      const entry = this._resolve(event);
      if (entry) this.log.push(entry);
      return entry ? clone(entry) : this.step();
    }

    stepRound() {
      if (this.ended) return [];
      if (!this.started) this.start();
      const targetRound = this.round === 0 ? 1 : this.round + 1;
      const events = [];
      let guard = 0;
      while (!this.ended && guard++ < 200) {
        const event = this.step();
        if (event) events.push(event);
        if (this.round >= targetRound && this.phase === 'round_complete') break;
      }
      return events;
    }

    runToEnd(limit) {
      const events = [];
      let guard = 0;
      const cap = limit || 1000;
      while (!this.ended && guard++ < cap) {
        const event = this.step();
        if (event) events.push(event);
      }
      if (!this.ended) throw new Error('命契3v3超出最大事件数');
      return events;
    }

    _scheduleRound() {
      this.round += 1;
      this.phase = 'round_start';
      this.roundStartLogIndex = this.log.length;
      this.queue.push({ type: 'round_start' }, { type: 'cooldown' });
      const actions = [];
      for (const side of ['left', 'right']) {
        for (const pet of this.teams[side].pets) {
          if (pet.dead) continue;
          let ready = false;
          if (pet.id === 'jellyfish') ready = true;
          if (pet.id === 'catfish') ready = this.round >= 2;
          if (pet.id === 'koi') ready = this.round === 2;
          if (pet.id === 'dragon') ready = this.round % 2 === 0;
          if (ready) actions.push({ type: 'ability', side, petId: pet.id, speed: pet.speed, position: pet.position });
        }
      }
      actions.sort((a, b) => b.speed - a.speed || a.position - b.position || a.side.localeCompare(b.side));
      this.queue.push(...actions, { type: 'death_sweep' }, { type: 'burn_phase' }, { type: 'poison_phase' }, { type: 'status_age' }, { type: 'victory_check' }, { type: 'round_end' });
    }

    _entry(event, values) {
      this.eventSeq += 1;
      return Object.assign({
        id: this.eventSeq,
        round: this.round,
        phase: this.phase,
        time: this.round ? ('R' + this.round + '·' + String(this.eventSeq).padStart(2, '0')) : ('00·' + String(this.eventSeq).padStart(2, '0')),
        type: event.type,
        source: '系统',
        target: '全场',
        effect: '',
        result: '',
        tone: 'system'
      }, values || {});
    }

    _resolve(event) {
      if (event.type === 'countdown') {
        this.phase = 'countdown';
        return this._entry(event, { source: '开战倒计时', target: '双方阵容', effect: '阵容即将锁定', result: String(event.value), countdown: event.value });
      }
      if (event.type === 'seed_lock') {
        return this._entry(event, { source: '随机种子', target: '本场战斗', effect: '锁定阵容与事件序列', result: '#' + this.seed });
      }
      if (event.type === 'battle_start') {
        this.phase = 'opening';
        return this._entry(event, { source: '战斗开始', target: '双方', effect: '战斗开始效果按速度、站位入队', result: '打火机 10速 → 河豚 7速' });
      }
      if (event.type === 'opening_complete') {
        this.phase = 'opening_complete';
        return this._entry(event, { source: '开场结算', target: '事件队列', effect: '所有战斗开始效果已入体', result: '进入第 1 回合' });
      }
      if (event.type === 'round_start') {
        this.phase = 'round_start';
        return this._entry(event, { source: '回合开始', target: '双方', effect: '回合开始效果就绪', result: '第 ' + this.round + ' 回合' });
      }
      if (event.type === 'cooldown') {
        this.phase = 'cooldown';
        return this._entry(event, { source: '冷却阶段', target: '全部存活宠物', effect: '可用技能根据回合表减少冷却', result: '已确定本回合行动队列' });
      }
      if (event.type === 'ability') return this._resolveAbility(event);
      if (event.type === 'death_sweep') {
        this.phase = 'death';
        return this._entry(event, { source: '阵亡结算', target: '双方宠物', effect: '检查技能阶段后的生命值', result: '无延迟阵亡' });
      }
      if (event.type === 'burn_phase') return this._beginBurnPhase(event);
      if (event.type === 'burn_tick') return this._burnTick(event);
      if (event.type === 'poison_phase') return this._beginPoisonPhase(event);
      if (event.type === 'poison_tick') return this._poisonTick(event);
      if (event.type === 'death') return this._resolveDeath(event);
      if (event.type === 'backlash') return this._resolveBacklash(event);
      if (event.type === 'jelly_copy') return this._resolveJellyCopy(event);
      if (event.type === 'catfish_execute') return this._resolveCatfishExecute(event);
      if (event.type === 'dragon_burst') return this._resolveDragonBurst(event);
      if (event.type === 'status_age') {
        this.phase = 'status_age';
        let sources = 0;
        for (const team of Object.values(this.teams)) {
          for (const source of team.hero.poisonSources) { source.age += 1; sources += 1; }
          for (const pet of team.pets) for (const source of pet.poisonSources) { source.age += 1; sources += 1; }
        }
        return this._entry(event, { source: '持续状态', target: sources + ' 份存活毒源', effect: '每份毒源毒龄 +1', result: sources ? '下回合毒伤提高' : '场上无毒源' });
      }
      if (event.type === 'victory_check') return this._victoryCheck(event);
      if (event.type === 'round_end') {
        this.phase = 'round_complete';
        return this._entry(event, { source: '回合结束', target: '双方', effect: '本回合所有事件已结算', result: this.ended ? '战斗结束' : '等待第 ' + (this.round + 1) + ' 回合' });
      }
      return null;
    }

    _resolveAbility(event) {
      this.phase = event.opening ? 'opening' : 'abilities';
      const team = this.teams[event.side];
      const enemy = this.teams[event.side === 'left' ? 'right' : 'left'];
      const pet = team.pets.find((item) => item.id === event.petId);
      if (!pet || pet.dead) return this._entry(event, { source: pet ? pet.name : event.petId, target: '技能队列', effect: '行动时已阵亡', result: '技能取消', tone: 'muted' });

      if (pet.id === 'puffer') {
        const target = this._lowestHpPet(enemy.pets);
        if (target) this._addPoison(target, 8, pet, 1);
        this._addPoison(enemy.hero, 8, pet, 1);
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: (target ? target.name : '无存活敌宠') + ' + ' + enemy.hero.name, effect: '分别施加基础 8 毒，两份毒源独立计龄', result: target ? (target.name + ' 8毒；' + enemy.hero.name + ' 8毒') : (enemy.hero.name + ' 8毒'), tone: 'poison' });
      }
      if (pet.id === 'lighter') {
        const alive = enemy.pets.filter((item) => !item.dead);
        const fastest = alive.sort((a, b) => b.speed - a.speed || a.position - b.position)[0];
        if (fastest) fastest.burn += 6;
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: fastest ? fastest.name : '无存活敌宠', effect: '对速度最高的敌宠施加 6 灼烧', result: fastest ? (fastest.name + '获得 6 灼烧') : '无可用目标', tone: 'burn' });
      }
      if (pet.id === 'jellyfish') {
        const alive = enemy.pets.filter((item) => !item.dead);
        const pool = alive.some((item) => !item.poisonSources.length) ? alive.filter((item) => !item.poisonSources.length) : alive;
        const target = this._lowestHpPet(pool);
        if (target) this._addPoison(target, 2, pet, 1);
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: target ? target.name : enemy.hero.name, effect: target ? '施加一份基础 2、毒龄 1 的新毒源' : '敌方已无存活宠物', result: target ? (target.name + '新增 2 毒') : '无可用目标', tone: 'poison' });
      }
      if (pet.id === 'catfish') {
        const alive = enemy.pets.filter((item) => !item.dead);
        let target = null;
        if (alive.length) {
          target = alive.sort((a, b) => this._maxPoisonAge(b) - this._maxPoisonAge(a) || a.hp - b.hp || a.position - b.position)[0];
          const before = target.hp;
          this._damagePet(target, 5, { kind: 'attack', source: pet, catfish: true });
          return this._entry(event, { source: pet.name + '·' + pet.ability, target: target.name, effect: '攻击毒龄最高的敌宠，造成 5 伤害', result: target.name + ' ' + before + ' → ' + target.hp, tone: 'attack' });
        }
        const before = enemy.hero.hp;
        enemy.hero.hp = clamp(enemy.hero.hp - 5, 0, enemy.hero.maxHp);
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: enemy.hero.name, effect: '宠物全灭，普通攻击直接命中暴露英雄', result: enemy.hero.name + ' ' + before + ' → ' + enemy.hero.hp, tone: 'attack' });
      }
      if (pet.id === 'koi') {
        const oldest = this._oldestPoison(team.hero.poisonSources);
        const removed = oldest ? Math.min(4, oldest.base) : 0;
        if (oldest) {
          oldest.base -= removed;
          if (oldest.base <= 0) team.hero.poisonSources = team.hero.poisonSources.filter((source) => source.id !== oldest.id);
        }
        const target = this._lowestHpPet(enemy.pets);
        if (target) target.burn += removed;
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: team.hero.name + (target ? ' → ' + target.name : ''), effect: '削减最老英雄毒源最多 4 基础毒，实际削减值转为敌宠灼烧', result: removed ? ('基础毒 -' + removed + (target ? '；' + target.name + ' 灼烧 +' + removed : '')) : '无可净化毒源', tone: removed ? 'cleanse' : 'muted' });
      }
      if (pet.id === 'dragon') {
        const targets = enemy.pets.filter((item) => !item.dead && item.burn > 0);
        if (!targets.length) return this._entry(event, { source: pet.name + '·' + pet.ability, target: '敌方全体', effect: '搜索带灼烧的敌宠', result: '无带火目标，龙息落空', tone: 'muted' });
        const results = [];
        for (const target of targets) {
          const before = target.hp;
          this._damagePet(target, 6, { kind: 'attack', source: pet, dragon: true });
          results.push(target.name + ' ' + before + '→' + target.hp);
        }
        return this._entry(event, { source: pet.name + '·' + pet.ability, target: targets.map((item) => item.name).join('、'), effect: '对全部带灼烧的敌宠造成 6 伤害', result: results.join('；'), tone: 'burn' });
      }
      return this._entry(event, { source: pet.name, target: '技能队列', effect: '未知能力', result: '未执行', tone: 'muted' });
    }

    _damagePet(pet, amount, cause) {
      if (!pet || pet.dead || pet.hp <= 0) return;
      pet.hp = clamp(pet.hp - amount, 0, pet.maxHp);
      if (pet.hp === 0) {
        pet.deathCause = cause;
        this.queue.unshift({ type: 'death', side: pet.side, petId: pet.id, cause });
      }
    }

    _beginBurnPhase(event) {
      this.phase = 'burn';
      const targets = [];
      for (const side of ['left', 'right']) for (const pet of this.teams[side].pets) if (!pet.dead && pet.burn > 0) targets.push({ type: 'burn_tick', side, petId: pet.id });
      this.queue.unshift(...targets);
      return this._entry(event, { source: '灼烧阶段', target: targets.length + ' 个带火宠物', effect: '按当前灼烧值逐个结算', result: targets.length ? '灼烧事件已入队' : '无灼烧可结算', tone: 'burn' });
    }

    _burnTick(event) {
      this.phase = 'burn';
      const pet = this.teams[event.side].pets.find((item) => item.id === event.petId);
      if (!pet || pet.dead || !pet.burn) return this._entry(event, { source: '灼烧', target: pet ? pet.name : event.petId, effect: '目标已失效', result: '跳过', tone: 'muted' });
      const amount = pet.burn;
      const before = pet.hp;
      pet.burn = Math.max(0, pet.burn - 2);
      this._damagePet(pet, amount, { kind: 'burn', amount });
      return this._entry(event, { source: '灼烧·' + amount, target: pet.name, effect: '造成 ' + amount + ' 灼烧伤害，结算后灼烧 -2', result: pet.name + ' ' + before + ' → ' + pet.hp + '；剩余 ' + pet.burn + ' 灼烧', tone: 'burn' });
    }

    _beginPoisonPhase(event) {
      this.phase = 'poison';
      const targets = [];
      for (const side of ['left', 'right']) {
        const team = this.teams[side];
        for (const pet of team.pets) if (!pet.dead && pet.poisonSources.length) targets.push({ type: 'poison_tick', side, targetType: 'pet', targetId: pet.id });
        if (team.hero.poisonSources.length) targets.push({ type: 'poison_tick', side, targetType: 'hero', targetId: team.hero.id });
      }
      this.queue.unshift(...targets);
      return this._entry(event, { source: '剧毒阶段', target: targets.length + ' 个中毒单位', effect: '每份毒源按「基础毒 × 毒龄」合计', result: targets.length ? '剧毒事件已入队' : '无剧毒可结算', tone: 'poison' });
    }

    _poisonTick(event) {
      this.phase = 'poison';
      const team = this.teams[event.side];
      const target = event.targetType === 'hero' ? team.hero : team.pets.find((item) => item.id === event.targetId);
      if (!target || target.dead || !target.poisonSources.length) return this._entry(event, { source: '剧毒', target: target ? target.name : event.targetId, effect: '毒源已失效', result: '跳过', tone: 'muted' });
      const parts = target.poisonSources.map((source) => ({ source, damage: source.base * source.age }));
      const amount = parts.reduce((sum, part) => sum + part.damage, 0);
      const detail = parts.map((part) => part.source.base + '×龄' + part.source.age + '=' + part.damage).join(' + ');
      const before = target.hp;
      if (event.targetType === 'hero') target.hp = clamp(target.hp - amount, 0, target.maxHp);
      else this._damagePet(target, amount, { kind: 'poison', amount, maxAge: this._maxPoisonAge(target) });
      return this._entry(event, { source: '剧毒·' + detail, target: target.name, effect: '独立毒源合计造成 ' + amount + ' 伤害', result: target.name + ' ' + before + ' → ' + target.hp, tone: 'poison' });
    }

    _resolveDeath(event) {
      this.phase = 'death';
      const team = this.teams[event.side];
      const pet = team.pets.find((item) => item.id === event.petId);
      if (!pet || pet.dead) return null;
      pet.dead = true;
      pet.poisonSources = [];
      pet.burn = 0;
      const cause = event.cause || pet.deathCause || { kind: 'unknown' };
      const followups = [{ type: 'backlash', side: event.side, petId: pet.id }];
      const enemySide = event.side === 'left' ? 'right' : 'left';
      const enemyTeam = this.teams[enemySide];
      if (cause.kind === 'poison') {
        const jelly = enemyTeam.pets.find((item) => item.id === 'jellyfish' && !item.dead);
        if (jelly) followups.push({ type: 'jelly_copy', side: enemySide, victimSide: event.side, age: cause.maxAge || 1 });
      }
      if (cause.catfish) followups.push({ type: 'catfish_execute', side: enemySide });
      if (cause.dragon) followups.push({ type: 'dragon_burst', side: enemySide, victim: pet.name });
      this.queue.unshift(...followups);
      return this._entry(event, { source: cause.kind === 'poison' ? '剧毒' : cause.kind === 'burn' ? '灼烧' : (cause.source ? cause.source.name : '伤害'), target: pet.name, effect: '生命降至 0，移除该宠物身上所有持续状态', result: pet.name + '阵亡', tone: 'death' });
    }

    _resolveBacklash(event) {
      const team = this.teams[event.side];
      const pet = team.pets.find((item) => item.id === event.petId);
      const before = team.hero.hp;
      team.hero.hp = clamp(team.hero.hp - pet.maxHp, 0, team.hero.maxHp);
      const alive = team.pets.some((item) => !item.dead);
      team.hero.exposed = !alive;
      return this._entry(event, { source: pet.name + '·阵亡反噬', target: team.hero.name, effect: '英雄失去该宠物的初始最大生命 ' + pet.maxHp, result: team.hero.name + ' ' + before + ' → ' + team.hero.hp + (team.hero.exposed ? '；三宠全灭，英雄暴露' : ''), tone: 'death' });
    }

    _resolveJellyCopy(event) {
      const team = this.teams[event.side];
      const enemy = this.teams[event.victimSide];
      const jelly = team.pets.find((item) => item.id === 'jellyfish');
      if (!jelly || jelly.dead) return this._entry(event, { source: '水母·毒龄回声', target: enemy.hero.name, effect: '水母已阵亡', result: '被动取消', tone: 'muted' });
      const oldest = this._oldestPoison(enemy.hero.poisonSources);
      if (oldest) oldest.age = Math.max(oldest.age, event.age);
      else this._addPoison(enemy.hero, 2, jelly, event.age);
      return this._entry(event, { source: '水母·毒龄回声', target: enemy.hero.name, effect: '将毒死宠物的最高毒龄 ' + event.age + ' 复制给英雄最老毒源', result: oldest ? ('英雄最老毒源毒龄为 ' + oldest.age) : ('新建基础 2、毒龄 ' + event.age + ' 的毒源'), tone: 'poison' });
    }

    _resolveCatfishExecute(event) {
      const team = this.teams[event.side];
      const enemy = this.teams[event.side === 'left' ? 'right' : 'left'];
      const oldest = this._oldestPoison(enemy.hero.poisonSources);
      if (!oldest) return this._entry(event, { source: '猫鱼·毒爆', target: enemy.hero.name, effect: '查找最老英雄毒源', result: '无毒源可提前结算', tone: 'muted' });
      const amount = oldest.base * oldest.age;
      const before = enemy.hero.hp;
      enemy.hero.hp = clamp(enemy.hero.hp - amount, 0, enemy.hero.maxHp);
      return this._entry(event, { source: '猫鱼·毒爆', target: enemy.hero.name, effect: '最老毒源提前结算：' + oldest.base + '×龄' + oldest.age, result: enemy.hero.name + ' ' + before + ' → ' + enemy.hero.hp, tone: 'poison' });
    }

    _resolveDragonBurst(event) {
      const enemy = this.teams[event.side === 'left' ? 'right' : 'left'];
      const before = enemy.hero.hp;
      enemy.hero.hp = clamp(enemy.hero.hp - 4, 0, enemy.hero.maxHp);
      return this._entry(event, { source: '巨龙·爆燃追击', target: enemy.hero.name, effect: '龙息击杀 ' + event.victim + '，额外造成 4 英雄伤害', result: enemy.hero.name + ' ' + before + ' → ' + enemy.hero.hp, tone: 'burn' });
    }

    _victoryCheck(event) {
      this.phase = 'victory_check';
      const leftDead = this.teams.left.hero.hp <= 0;
      const rightDead = this.teams.right.hero.hp <= 0;
      let result = '双方英雄仍可战斗';
      if (leftDead || rightDead || this.round >= this.data.maxRounds) {
        this.ended = true;
        this.phase = 'ended';
        if (leftDead && rightDead) this.winner = 'draw';
        else if (leftDead) this.winner = 'right';
        else if (rightDead) this.winner = 'left';
        else if (this.teams.left.hero.hp === this.teams.right.hero.hp) this.winner = 'draw';
        else this.winner = this.teams.left.hero.hp > this.teams.right.hero.hp ? 'left' : 'right';
        result = this.winner === 'draw' ? '双方同时倒下，平局' : this.teams[this.winner].name + '获胜';
        this.queue = [];
      }
      return this._entry(event, { source: '胜负检查', target: '双方英雄', effect: '检查英雄生命是否归零', result, tone: this.ended ? 'victory' : 'system' });
    }

    _addPoison(target, base, sourcePet, age) {
      target.poisonSources.push({ id: 'poison-' + (++this.poisonSeq) + '-' + Math.floor(this.random() * 1e6), base, age: age || 1, sourceId: sourcePet.id, sourceName: sourcePet.name });
    }

    _lowestHpPet(pets) {
      return pets.filter((pet) => !pet.dead).sort((a, b) => a.hp - b.hp || a.maxHp - b.maxHp || a.position - b.position)[0] || null;
    }

    _maxPoisonAge(target) {
      if (!target || !target.poisonSources || !target.poisonSources.length) return 0;
      return Math.max(...target.poisonSources.map((source) => source.age));
    }

    _oldestPoison(sources) {
      return sources.slice().sort((a, b) => b.age - a.age || b.base - a.base || a.id.localeCompare(b.id))[0] || null;
    }
  }

  const api = { LifeLinkEngine, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.LifeLinkEngine = LifeLinkEngine;
})(typeof window !== 'undefined' ? window : globalThis);
