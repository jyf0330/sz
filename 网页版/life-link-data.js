/* 命契3v3 首个独立规则集。本文件不依赖原战斗模拟器数据。 */
(function (global) {
  'use strict';

  const data = {
    version: 'life-link-3v3.v1',
    modeName: '命契3v3模式',
    heroMaxHp: 50,
    petHpBudget: 30,
    maxRounds: 12,
    rules: {
      poison: '每份毒源独立计龄；回合末伤害 = 基础毒 × 毒龄，结算后毒龄 +1。',
      burn: '回合末对宿主造成当前灼烧值伤害，然后灼烧 -2，最低为 0。',
      backlash: '宠物阵亡时，所属英雄失去该宠物的初始最大生命。',
      exposure: '一方三只宠物全部阵亡后英雄暴露，后续普通攻击可直接命中英雄。',
      statusOrder: '阵亡结算 → 灼烧 → 剧毒 → 状态年龄增加 → 胜负检查。'
    },
    assumptions: [
      '灼烧的递减规则原需求未给出；原型暂定为结算后 -2。',
      '水母的「另一个」优先选未中毒的最低生命敌宠；全部已中毒时选当前生命最低者。',
      '猫鱼撕咬的原型伤害暂定为 5，从第 2 回合开始每回合可用。',
      '巨龙龙息的原型伤害暂定为 6，第 2、4、6…回合发动。',
      '锦鲤的转化目标暂定为当前生命最低的敌方宠物，仅在第 2 回合开始触发一次。',
      '河豚与打火机首版只有战斗开始效果，不自行补毒或补火。'
    ],
    teams: {
      poison: {
        name: '侵蚀体系',
        shortName: '毒队',
        theme: 'venom',
        description: '宠物与英雄双通道施压，把三回合变成可视化的死亡时钟。',
        pets: [
          {
            id: 'puffer', name: '毒毒河豚', icon: '🐡', maxHp: 14, speed: 7, position: 0,
            role: '倒计时核心',
            ability: '毒素喷发',
            text: '战斗开始：对最低生命敌宠与敌方英雄各施加一份基础 8 毒。',
            schedule: '战斗开始'
          },
          {
            id: 'jellyfish', name: '水母', icon: '🪼', maxHp: 7, speed: 8, position: 1,
            role: '扩散与加速',
            ability: '毒触须',
            text: '每回合对另一只敌宠施加基础 2 毒；敌人毒死时，将其最高毒龄复制给敌方英雄的最老毒源。',
            schedule: '每回合'
          },
          {
            id: 'catfish', name: '猫鱼', icon: '🐟', maxHp: 9, speed: 6, position: 2,
            role: '斩杀与提前结算',
            ability: '嗜毒撕咬',
            text: '攻击毒龄最高的敌宠，造成 5 伤害；亲手击杀时使敌方英雄最老的毒立即结算一次。',
            schedule: '第 2 回合起每回合'
          }
        ]
      },
      fire: {
        name: '爆燃体系',
        shortName: '火队',
        theme: 'ember',
        description: '快速击杀宠物，把宠物生命预算转化为英雄反噬损血。',
        pets: [
          {
            id: 'koi', name: '锦鲤', icon: '🎏', maxHp: 10, speed: 8, position: 0,
            role: '毒火转换',
            ability: '逆鳞净火',
            text: '第 2 回合开始：削减己方英雄最老毒源最多 4 点基础毒，把实际削减值转为敌宠灼烧。',
            schedule: '第 2 回合开始'
          },
          {
            id: 'lighter', name: '打火机', icon: '🔥', maxHp: 6, speed: 10, position: 1,
            role: '首回合启动',
            ability: '星火点燃',
            text: '战斗开始：对速度最高的敌宠施加 6 灼烧。',
            schedule: '战斗开始'
          },
          {
            id: 'dragon', name: '巨龙', icon: '🐉', maxHp: 14, speed: 4, position: 2,
            role: '群体收割',
            ability: '爆燃龙息',
            text: '每两回合对全部带灼烧的敌宠造成 6 伤害；本技能击杀宠物时额外对其英雄造成 4 爆燃伤害。',
            schedule: '第 2、4、6…回合'
          }
        ]
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  global.LIFE_LINK_DATA = data;
})(typeof window !== 'undefined' ? window : globalThis);
