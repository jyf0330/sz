# 命契3v3 战斗模拟器

> 状态：未完成构筑示例。它不进入主入口、不构成正式模式或第二规则权威，也不得改写原战斗模拟器的默认规则与阵容。

内部示例页：`battle-life-link.html`。可直接用浏览器离线打开，不需要后端或网络请求。

## 文件边界

- `battle-life-link.html`：命契3v3未完成构筑示例页。
- `life-link-data.js`：6 只宠物、阵容、规则文本与明示暂定项。
- `life-link-engine.js`：可复现的离散事件队列和战斗状态。
- `life-link-app.js`：自动播放、暂停、单事件、单回合、视角交换与日志界面。
- `life-link.css`：该模式的独立响应式样式。
- `scripts/verify_life_link.cjs`：引擎与桌面/手机界面验证。

这些文件不读取、不修改 `battle.html` 或 `battle-engine.js` 的战斗状态。

## 已实现规则

- 双方英雄固定 50 生命，每方 3 只宠物，宠物初始总生命严格为 30。
- 宠物阵亡时，英雄按其初始最大生命受到反噬。
- 河豚对宠物和英雄施加两份独立毒源。每份毒按「基础毒 × 毒龄」结算，毒龄从 1 开始。
- 宠物死亡后清除其毒源；英雄毒源保留；毒源不因施放者阵亡而消失。
- 水母扩散毒并复制毒龄，猫鱼对最高毒龄宠物收割，锦鲤把英雄毒转为灼烧，巨龙收割带火目标。
- 回合末按阵亡、灼烧、剧毒、状态增龄、胜负检查的顺序结算。状态伤害导致的阵亡会立即插入阵亡与反噬事件。

## 暂定规则

原需求未定义灼烧递减、猫鱼伤害、巨龙伤害与若干选敌细则。本原型将这些值放在 `life-link-data.js` 的 `assumptions` 中，并在页面「规则与暂定项」弹窗内直接展示，不伪装成已确认数值。

## 验证

```sh
NODE_PATH=/Users/ywh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
PLAYWRIGHT_MODULE=/Users/ywh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
node scripts/verify_life_link.cjs
```

结果写入 `verification/life-link-results.json`，并生成桌面与手机截图。
