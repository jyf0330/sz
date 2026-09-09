'use strict';
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const qualityInfo = {
    '铜': {mult: 1, color: 'copper'},
    '白银': {mult: 1.1, color: 'silver'},
    '黄金': {mult: 1.22, color: 'gold'},
    '陨石': {mult: 1.36, color: 'meteor'}
  };
  const itemCatalog = [
    {id:'burn-potion', name:'灼烧药', price:3, icon:'焰', desc:'使用带灼烧标签的技能时，额外获得1枚药剂触发。'},
    {id:'energy-core', name:'能量核心', price:4, icon:'核', desc:'回合开始时额外获得1点能量。'},
    {id:'guard-charm', name:'护身符', price:5, icon:'盾', desc:'每回合第一次受到伤害时，伤害减少2点。'},
    {id:'focus-rune', name:'聚焦符文', price:6, icon:'符', desc:'技能结算时，若没有目标，保留1点能量。'}
  ];
  const skillCatalog = [
    {id:'s1',name:'蓄能',type:'心法',size:'short',ability:'充能2',range:'自身',effect:'获得2点能量，为后续爆能技能准备资源。',tags:['能量','启动'],role:'trigger',behavior:'energy',amount:2},
    {id:'s2',name:'轻击',type:'武技',size:'short',ability:'攻击3+',range:'前方第一格',effect:'造成伤害并充能1，未命中也会充能。',tags:['能量','武技'],role:'trigger',behavior:'strike',power:3,energy:1},
    {id:'s3',name:'天火咒',type:'术法',size:'medium',ability:'点燃6+',range:'正前方第二格',effect:'爆能2：造成灼烧，能量达到门槛时强化点燃。',tags:['灼烧','爆能'],role:'output',behavior:'burn',amount:6,energyCost:2},
    {id:'s4',name:'引火',type:'术法',size:'short',ability:'点燃2+',range:'正前方第二格',effect:'赋予灼烧，引爆已有灼烧。',tags:['灼烧','启动'],role:'trigger',behavior:'burn',amount:2},
    {id:'s5',name:'鞭炮',type:'术法',size:'short',ability:'点燃1+',range:'正前方第二格',effect:'多重触发2，赋予灼烧，制造高频触发。',tags:['灼烧','频率'],role:'output',behavior:'multiBurn',amount:2},
    {id:'s6',name:'火中取栗',type:'武技',size:'short',ability:'攻击3+',range:'前方第一格',effect:'造成伤害并获得亢奋；装备灵宠触发点燃后倒计时-1。',tags:['亢奋','倒计时'],role:'engine',behavior:'strike',power:3,cooldown:2},
    {id:'s7',name:'乱抓',type:'武技',size:'short',ability:'攻击6+',range:'前方第一格',effect:'多重触发2；白蔷薇自身攻击触发灼烧时可接治疗。',tags:['灼烧','攻击'],role:'output',behavior:'multiStrike',power:6},
    {id:'s8',name:'元气弹',type:'武技',size:'long',ability:'攻击125+',range:'目标两步范围',effect:'爆能10：倒计时2后造成范围伤害。',tags:['能量','范围','终结'],role:'output',behavior:'bigStrike',power:125,cooldown:2,energyCost:10},
    {id:'e1a',name:'裂牙撕咬',type:'武技',size:'short',ability:'攻击12+',range:'前方第一格',effect:'撕咬最近的敌方灵宠。',tags:['攻击'],role:'output',behavior:'strike',power:12},
    {id:'e2a',name:'砂甲冲撞',type:'武技',size:'short',ability:'攻击8+',range:'前方第一格',effect:'冲撞并保持护甲。',tags:['护甲','攻击'],role:'engine',behavior:'strike',power:8},
    {id:'e3a',name:'毒刺',type:'武技',size:'short',ability:'攻击10+',range:'前方第二格',effect:'造成伤害并施加剧毒。',tags:['剧毒','攻击'],role:'output',behavior:'poisonStrike',power:10,amount:2},
    {id:'e4a',name:'火羽连击',type:'武技',size:'medium',ability:'攻击14+',range:'前方第二格',effect:'高频攻击，连续造成两次伤害。',tags:['高频','攻击'],role:'output',behavior:'multiStrike',power:14},
    {id:'e5a',name:'月影治疗',type:'心法',size:'short',ability:'治疗8+',range:'自身',effect:'为己方生命最低的灵宠恢复生命。',tags:['治疗'],role:'trigger',behavior:'heal',amount:8},
    {id:'e6a',name:'护盾咏唱',type:'心法',size:'short',ability:'护甲2+',range:'自身',effect:'为自己补充护甲。',tags:['护甲'],role:'engine',behavior:'guard',amount:2}
  ];
  const petCatalog = [
    {id:'p1',name:'烁德童子',icon:'烁',base:{hp:55,atk:4,def:1,energy:2,maxEnergy:12},states:['元素','充能核心'],skills:['s1','s2','s3']},
    {id:'p2',name:'花椒蟹',icon:'椒',base:{hp:120,atk:5,def:2,energy:1,maxEnergy:12},states:['灼烧引擎'],skills:['s4','s5','s6']},
    {id:'p3',name:'白蔷薇',icon:'蔷',base:{hp:110,atk:6,def:5,energy:0,maxEnergy:12},states:['治疗转换'],skills:['s7','s8']},
    {id:'e1',name:'裂牙狼',icon:'狼',base:{hp:92,atk:12,def:2,energy:0,maxEnergy:8},states:['敌方·武技'],skills:['e1a']},
    {id:'e2',name:'砂甲虫',icon:'甲',base:{hp:125,atk:8,def:6,energy:0,maxEnergy:8},states:['护甲'],skills:['e2a','e6a']},
    {id:'e3',name:'毒尾蝎',icon:'蝎',base:{hp:105,atk:10,def:3,energy:0,maxEnergy:8},states:['剧毒'],skills:['e3a']},
    {id:'e4',name:'火羽鸟',icon:'羽',base:{hp:82,atk:14,def:1,energy:0,maxEnergy:8},states:['高频攻击'],skills:['e4a']},
    {id:'e5',name:'月影兔',icon:'兔',base:{hp:96,atk:7,def:3,energy:1,maxEnergy:8},states:['治疗'],skills:['e5a','e6a']}
  ];
  const defaultConfig = {
    players:[
      {enabled:true,pet:'p1',quality:'黄金',skills:['s1','s2','s3']},
      {enabled:true,pet:'p2',quality:'白银',skills:['s4','s5','s6']},
      {enabled:true,pet:'p3',quality:'铜',skills:['s7','s8']},
      {enabled:false,pet:'',quality:'铜',skills:[]}
    ],
    enemies:[
      {enabled:true,pet:'e1',quality:'铜',skills:['e1a']},
      {enabled:true,pet:'e2',quality:'白银',skills:['e2a','e6a']},
      {enabled:true,pet:'e3',quality:'铜',skills:['e3a']},
      {enabled:true,pet:'e4',quality:'黄金',skills:['e4a']}
    ],
    meta:{players:{level:6,income:20,history:3,items:{'burn-potion':1,'energy-core':1,'guard-charm':0,'focus-rune':0}},enemies:{level:5,income:14,history:2,items:{'burn-potion':0,'energy-core':0,'guard-charm':1,'focus-rune':0}}}
  };
  const state = {round:1,turnIndex:0,activeSide:'players',phase:'planning',running:false,auto:false,selectedId:'p1',selectedSkill:null,damage:0,events:0,roundEvents:0,action:0,cursor:0,dragSkill:null,autoTimer:null,logs:[],trace:[],traceLabel:'等待操作',players:[],enemies:[],skills:[],teamOrders:{players:[],enemies:[]},config:copy(defaultConfig)};
  let setupDraft = null;

  const allUnits = () => [...state.players,...state.enemies];
  const unitById = id => allUnits().find(u => u.id === id);
  const skillById = id => state.skills.find(s => s.id === id);
  const petById = id => petCatalog.find(p => p.id === id);
  const teamOf = side => side === 'players' ? state.players : state.enemies;
  const otherSide = side => side === 'players' ? 'enemies' : 'players';
  const sideName = side => side === 'players' ? '己方' : '对手';
  const activeSkills = () => state.teamOrders[state.activeSide].map(skillById).filter(Boolean);
  const positionLabel = pos => `${String.fromCharCode(65 + pos[1])}${pos[0] + 1}`;

  function log(text, kind='info', meta='SYSTEM') {
    state.events += 1; state.roundEvents += 1;
    state.logs.push({round:state.round,action:state.action,text,kind,meta});
    if (state.logs.length > 120) state.logs.shift();
    renderLog();
  }
  function showToast(text,warn=false) {
    const node=$('#toast'); node.textContent=text; node.hidden=false; node.classList.toggle('warn',warn);
    clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>{node.hidden=true;},1800);
  }
  function syncStates(unit) {
    unit.states = [...unit.baseStates];
    if (unit.effects.burn) unit.states.push(`灼烧 ${unit.effects.burn}`);
    if (unit.effects.poison) unit.states.push(`剧毒 ${unit.effects.poison}`);
    if (unit.effects.guard) unit.states.push(`护甲 ${unit.effects.guard}`);
  }
  function buildTeam(side,slots,meta) {
    const result=[];
    slots.filter(slot=>slot.enabled && slot.pet).forEach((slot,index)=>{
      const pet=petById(slot.pet); if(!pet)return;
      const q=qualityInfo[slot.quality]||qualityInfo['铜'];
      const level=Number(meta.level)||1;
      const scale=1+(level-1)*0.06;
      const id=`${side==='players'?'p':'e'}${index+1}`;
      const base=pet.base;
      const unit={id,name:pet.name,icon:pet.icon,quality:slot.quality,level,hp:Math.round(base.hp*scale*q.mult),maxHp:Math.round(base.hp*scale*q.mult),atk:Math.max(1,Math.round(base.atk*scale*q.mult)),def:Math.max(0,Math.round(base.def*scale*q.mult)),energy:base.energy,maxEnergy:base.maxEnergy,baseStates:[...pet.states],states:[],effects:{burn:0,poison:0,guard:0},pos:side==='players'?[1,index*2+1]:[4,index*2],skills:[],slotSkills:[...slot.skills],items:copy(meta.items||{})};
      slot.skills.forEach((baseId,skillIndex)=>{
        const template=skillCatalog.find(s=>s.id===baseId); if(!template)return;
        unit.skills.push(`${id}-skill-${skillIndex}`);
        state.skills.push({...copy(template),id:`${id}-skill-${skillIndex}`,baseId,owner:id,currentCountdown:template.cooldown||0,quality:slot.quality});
      });
      syncStates(unit); result.push(unit);
    });
    return result;
  }
  function buildBattle(config) {
    stopAuto();
    state.config=copy(config); state.round=1; state.turnIndex=0; state.activeSide='players'; state.phase='planning'; state.running=false; state.auto=false; state.selectedSkill=null; state.damage=0; state.events=0; state.roundEvents=0; state.action=0; state.cursor=0; state.logs=[]; state.trace=[]; state.traceLabel='等待己方操作'; state.skills=[];
    state.players=buildTeam('players',state.config.players,state.config.meta.players);
    state.enemies=buildTeam('enemies',state.config.enemies,state.config.meta.enemies);
    state.teamOrders={players:state.players.flatMap(u=>u.skills),enemies:state.enemies.flatMap(u=>u.skills)};
    state.selectedId=state.players[0]?.id||state.enemies[0]?.id||null;
    prepareTurn('players',true);
  }
  function prepareTurn(side,initial=false) {
    state.activeSide=side; state.phase='roundStart'; state.cursor=0; state.roundEvents=0; state.selectedSkill=null;
    const alive=teamOf(side).filter(u=>u.hp>0);
    state.selectedId=alive[0]?.id||state.selectedId;
    log(`${sideName(side)}回合开始：结算回合开始效果。`,'trigger','ROUND START');
    alive.forEach(unit=>{
      let gain=1;
      if ((unit.items['energy-core']||0)>0) gain+=1;
      unit.energy=Math.min(unit.maxEnergy,unit.energy+gain);
      log(`${unit.name} 回合开始获得 ${gain} 点能量，当前 ${unit.energy}/${unit.maxEnergy}。`,'trigger','ENERGY');
      if(unit.effects.burn>0){const dmg=unit.effects.burn; applyDamage(unit,dmg,`${unit.name} 的灼烧`,'DOT'); unit.effects.burn=Math.max(0,unit.effects.burn-1);}
      if(unit.effects.poison>0){const dmg=unit.effects.poison; applyDamage(unit,dmg,`${unit.name} 的剧毒`,'DOT'); unit.effects.poison=Math.max(0,unit.effects.poison-1);}
      syncStates(unit);
    });
    state.phase='planning'; state.running=false;
    log(`${sideName(side)}开始操作：可调整灵宠位置，点击“开始战斗”按技能栏顺序结算。`,'info','PLANNING');
    if(!initial) renderAll();
  }
  function applyDamage(target,amount,source,meta='DAMAGE') {
    if(!target || target.hp<=0)return 0;
    let dmg=Math.max(0,Math.round(amount));
    if(target.effects.guard>0){dmg=Math.max(0,dmg-target.effects.guard); target.effects.guard=0; syncStates(target); log(`${target.name} 消耗护甲，伤害减免后为 ${dmg}。`,'trigger','GUARD');}
    target.hp=Math.max(0,target.hp-dmg); state.damage+=dmg;
    log(`${source} 对 <strong>${target.name}</strong> 造成 <strong>${dmg}</strong> 点伤害。`,dmg?'output':'trigger',meta);
    if(target.hp===0) log(`<strong>${target.name}</strong> 失去战斗能力。`,'warn','DEFEATED');
    return dmg;
  }
  function inRange(skill,owner,target) {
    const dr=Math.abs(owner.pos[0]-target.pos[0]),dc=Math.abs(owner.pos[1]-target.pos[1]);
    if(skill.range==='自身')return owner.id===target.id;
    if(skill.range.includes('范围')||skill.range.includes('两步'))return dr<=2&&dc<=2;
    if(skill.range.includes('第二格'))return dr+dc<=2;
    return dr+dc<=1;
  }
  function targetFor(skill,owner) {
    const allies=teamOf(state.activeSide).filter(u=>u.hp>0);
    const opponents=teamOf(otherSide(state.activeSide)).filter(u=>u.hp>0);
    if(['energy','guard'].includes(skill.behavior))return [];
    if(skill.behavior==='heal')return [allies.slice().sort((a,b)=>a.hp-b.hp)[0]].filter(Boolean);
    return opponents.filter(u=>inRange(skill,owner,u)).sort((a,b)=>a.hp-b.hp);
  }
  function settleSkill(skill) {
    const owner=unitById(skill.owner); if(!owner||owner.hp<=0){log(`<strong>${skill.name}</strong> 所属灵宠已无法行动，跳过。`,'warn','SKIP');return;}
    if(skill.currentCountdown>0){skill.currentCountdown-=1;log(`<strong>${skill.name}</strong> 倒计时 -1，当前为 ${skill.currentCountdown}。`,'trigger','COUNTDOWN');if(skill.currentCountdown===0)log(`<strong>${skill.name}</strong> 已准备好，下一次技能栏轮到它时释放。`,'output','READY');return;}
    const targets=targetFor(skill,owner);
    state.selectedSkill=skill; state.selectedId=owner.id;
    log(`<strong>${owner.name}</strong> 结算 <strong>${skill.name}</strong>（${skill.quality}品质）。`,'trigger','SKILL');
    if(skill.behavior==='energy'){owner.energy=Math.min(owner.maxEnergy,owner.energy+skill.amount);log(`${owner.name} 充能 ${skill.amount} 点，当前 ${owner.energy}。`,'trigger','ENERGY');return;}
    if(skill.behavior==='guard'){owner.effects.guard+=skill.amount;syncStates(owner);log(`${owner.name} 获得 ${skill.amount} 点护甲。`,'trigger','GUARD');return;}
    if(skill.behavior==='heal'){const target=targets[0];if(target){target.hp=Math.min(target.maxHp,target.hp+skill.amount);log(`${owner.name} 为 <strong>${target.name}</strong> 恢复 ${skill.amount} 点生命。`,'output','HEAL');}return;}
    if(!targets.length){log(`${owner.name} 的 ${skill.name} 没有有效目标，结算结束。`,'warn','TARGET');if((owner.items['focus-rune']||0)>0)owner.energy=Math.min(owner.maxEnergy,owner.energy+1);return;}
    const target=targets[0];
    if(skill.behavior==='burn'||skill.behavior==='multiBurn'){
      const stacks=skill.amount*(skill.behavior==='multiBurn'?2:1); target.effects.burn+=stacks; syncStates(target); log(`<strong>${target.name}</strong> 获得 ${stacks} 层灼烧。`,'output','BURN');
      if(skill.behavior==='multiBurn')applyDamage(target,1,`${skill.name} 的多重触发`,'PET PROC');
    } else if(skill.behavior==='poisonStrike'){
      applyDamage(target,Math.max(1,owner.atk+skill.power-target.def),skill.name); target.effects.poison+=skill.amount; syncStates(target); log(`<strong>${target.name}</strong> 获得 ${skill.amount} 层剧毒。`,'output','POISON');
    } else {
      const hits=skill.behavior==='multiStrike'?2:1;
      for(let i=0;i<hits;i++)applyDamage(target,Math.max(1,owner.atk+skill.power-target.def),skill.name);
      if(skill.behavior==='bigStrike'){targets.slice(1).forEach(extra=>applyDamage(extra,Math.max(1,Math.round(skill.power*.45)-extra.def),skill.name,'AREA'));}
      if(skill.energy)owner.energy=Math.min(owner.maxEnergy,owner.energy+skill.energy);
    }
    if(skill.energyCost)owner.energy=Math.max(0,owner.energy-skill.energyCost);
    if(skill.cooldown)skill.currentCountdown=skill.cooldown;
  }
  function beginResolution(){if(state.phase!=='planning')return false;state.phase='resolving';state.running=true;state.cursor=0;log(`${sideName(state.activeSide)}锁定位置，开始按技能栏顺序结算。`,'trigger','START');return true;}
  function resolveOneSkill(){
    if(state.phase!=='resolving')return;
    const skills=activeSkills();
    if(state.cursor>=skills.length){endTurn();return;}
    const skill=skills[state.cursor]; state.action+=1; settleSkill(skill); renderTrace([{text:`${sideName(state.activeSide)} · ${skill.name}`,kind:'trigger'},{text:skill.currentCountdown?`倒计时 ${skill.currentCountdown}`:'技能事件已完成',kind:'output'}],`Step ${state.action} · ${skill.name}`); state.cursor+=1;
    if(state.players.every(u=>u.hp<=0)||state.enemies.every(u=>u.hp<=0)){finishBattle();return;}
    if(state.cursor>=skills.length)endTurn();
    renderAll(); flashBanner(skill);
  }
  function resolveAllSkills(){
    if(!beginResolution())return;
    while(state.phase==='resolving')resolveOneSkill();
    state.running=false; renderAll();
  }
  function endTurn(){
    state.phase='roundEnd'; state.running=false;
    log(`${sideName(state.activeSide)}技能栏结算完成，进入回合结束阶段。`,'trigger','ROUND END');
    teamOf(state.activeSide).filter(u=>u.hp>0).forEach(unit=>{
      if(unit.effects.guard>0){unit.effects.guard=Math.max(0,unit.effects.guard-1);syncStates(unit);log(`${unit.name} 回合结束护甲衰减，剩余 ${unit.effects.guard}。`,'trigger','EFFECT');}
      log(`${unit.name} 的回合结束效果结算完毕。`,'info','ROUND END');
    });
    if(state.players.every(u=>u.hp<=0)||state.enemies.every(u=>u.hp<=0)){finishBattle();return;}
    state.turnIndex+=1; state.round=Math.floor(state.turnIndex/2)+1;
    prepareTurn(otherSide(state.activeSide));
  }
  function finishBattle(){
    state.phase='finished';state.running=false;stopAuto();
    const winner=state.enemies.every(u=>u.hp<=0)?'己方获胜':state.players.every(u=>u.hp<=0)?'对手获胜':'战斗结束';
    log(`<strong>${winner}</strong>，本次战斗模拟结束。`,'output','RESULT');renderAll();flashBanner({name:winner,owner:''});
  }
  function clearHighlights(){document.querySelectorAll('.cell.range,.cell.move-target,.unit.in-range').forEach(n=>n.classList.remove('range','move-target','in-range'));}
  function renderBoard(){
    const board=$('#board');board.innerHTML='';const cells=new Map();
    for(let row=0;row<6;row++)for(let col=0;col<9;col++){const cell=document.createElement('button');cell.className='cell';cell.dataset.row=row;cell.dataset.col=col;cell.innerHTML=`<span class="cell-coordinate">${String.fromCharCode(65+col)}${row+1}</span>`;cell.addEventListener('click',()=>handleCellClick(row,col));board.appendChild(cell);cells.set(`${row},${col}`,cell);}
    allUnits().forEach(unit=>{const cell=cells.get(`${unit.pos[0]},${unit.pos[1]}`);if(!cell)return;const pct=Math.max(0,Math.round(unit.hp/unit.maxHp*100));const node=document.createElement('div');node.className=`unit ${unit.id[0]==='e'?'enemy':'ally'}${unit.id===state.selectedId?' selected':''}${unit.hp<=0?' defeated':''}`;node.innerHTML=`<span class="unit-quality ${qualityInfo[unit.quality]?.color||'copper'}">${esc(unit.quality)}</span><span class="unit-energy">${unit.energy>0?`◆${unit.energy}`:''}</span><span class="unit-icon">${esc(unit.icon)}</span><span class="unit-name">${esc(unit.name)}</span><span class="unit-hp"><i style="width:${pct}%"></i></span>`;node.addEventListener('click',e=>{e.stopPropagation();state.selectedId=unit.id;state.selectedSkill=null;renderAll();});cell.appendChild(node);});
    const selected=unitById(state.selectedId);if(selected&&selected.id[0]===state.activeSide[0]&&state.phase==='planning'){document.querySelectorAll('.cell').forEach(cell=>{if(!cell.querySelector('.unit'))cell.classList.add('move-target');});}
    if(state.selectedSkill)highlightSkill(state.selectedSkill);
  }
  function highlightSkill(skill){clearHighlights();const owner=unitById(skill.owner);if(!owner)return;document.querySelectorAll('.cell').forEach(cell=>{const r=Number(cell.dataset.row),c=Number(cell.dataset.col),probe={id:'probe',pos:[r,c],hp:1};if(skill.range==='自身'&&r===owner.pos[0]&&c===owner.pos[1]||skill.range!=='自身'&&inRange(skill,owner,probe))cell.classList.add('range');});teamOf(otherSide(state.activeSide)).filter(u=>u.hp>0&&inRange(skill,owner,u)).forEach(u=>document.querySelector(`.cell[data-row="${u.pos[0]}"][data-col="${u.pos[1]}"] .unit`)?.classList.add('in-range'));}
  function renderSkills(){
    const bar=$('#skill-bar');bar.innerHTML='';const skills=activeSkills();
    skills.forEach((skill,index)=>{const owner=unitById(skill.owner);const card=document.createElement('article');card.className=`skill-card ${skill.size}${state.selectedSkill?.id===skill.id?' active-skill':''}`;card.draggable=true;card.dataset.id=skill.id;const cd=skill.currentCountdown||'—';card.innerHTML=`<div class="skill-card-top"><div><div class="skill-name">${esc(skill.name)}</div><div class="skill-owner">${esc(owner?.name||'未知灵宠')} · ${esc(skill.quality)}</div></div><span class="skill-type">${esc(skill.type)}</span></div><div class="skill-ability">${esc(skill.ability)}</div><div class="skill-meta"><div class="meta-item">能力<b>${esc(skill.ability)}</b></div><div class="meta-item">范围<b>${esc(skill.range)}</b></div><div class="meta-item">品质<b class="quality-text ${qualityInfo[skill.quality]?.color||''}">${esc(skill.quality)}</b></div><div class="meta-item">倒计时<b class="countdown">${esc(cd)}</b></div></div><div class="skill-footer"><span>${index+1} / ${skill.size==='short'?'短篇':skill.size==='medium'?'中篇':'长篇'}</span><span>${skill.role==='output'?'主要输出':skill.role==='trigger'?'启动扳机':'体系运转'}</span></div>`;card.addEventListener('click',()=>{state.selectedSkill=skill;state.selectedId=skill.owner;renderAll();});card.addEventListener('dragstart',()=>{state.dragSkill=skill.id;card.classList.add('dragging');});card.addEventListener('dragend',()=>{state.dragSkill=null;card.classList.remove('dragging');});card.addEventListener('dragover',e=>e.preventDefault());card.addEventListener('drop',e=>{e.preventDefault();reorderSkills(state.dragSkill,skill.id);});bar.appendChild(card);});
    if(!skills.length)bar.innerHTML='<div class="detail-empty">当前回合没有装备技能</div>';
  }
  function reorderSkills(fromId,toId){if(!fromId||fromId===toId||state.phase!=='planning')return;const order=state.teamOrders[state.activeSide];const from=order.indexOf(fromId),to=order.indexOf(toId);if(from<0||to<0)return;order.splice(from,1);order.splice(to,0,fromId);const skill=skillById(fromId);log(`<strong>${skill?.name||'技能'}</strong> 调整到技能栏第 ${to+1} 格。`,'trigger','LOADOUT');renderAll();showToast('本回合技能顺序已更新');}
  function renderDetail(){
    const unit=unitById(state.selectedId),skill=state.selectedSkill,content=$('#detail-content');
    if(skill){const owner=unitById(skill.owner);content.innerHTML=`<div class="focus-card"><div class="focus-top"><div class="focus-icon skill">${esc(skill.name[0])}</div><div><div class="focus-name">${esc(skill.name)}</div><div class="focus-sub">${esc(skill.type)} · ${esc(skill.size==='short'?'短篇':skill.size==='medium'?'中篇':'长篇')} · 所属 ${esc(owner?.name||'未知')}</div></div></div><p class="focus-effect">${esc(skill.effect)}</p></div><div class="detail-label">基础信息</div><div class="stat-grid"><div class="stat-box"><span>能力</span><strong>${esc(skill.ability)}</strong></div><div class="stat-box"><span>攻击范围</span><strong>${esc(skill.range)}</strong></div><div class="stat-box"><span>品质</span><strong class="quality-text ${qualityInfo[skill.quality]?.color||''}">${esc(skill.quality)}</strong></div><div class="stat-box"><span>倒计时</span><strong>${esc(skill.currentCountdown||'—')}</strong></div></div><div class="detail-label">标签</div><div class="tag-row">${skill.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-label">结算阶段</div><p class="focus-effect">技能只在当前操作方点击“开始战斗”后，按技能栏从左到右结算。</p>`;return;}
    if(!unit){content.innerHTML='<div class="detail-empty">选择棋盘上的灵宠或下方技能<br>查看实时战斗信息</div>';return;}
    const hpPct=Math.max(0,Math.round(unit.hp/unit.maxHp*100)),enPct=Math.max(0,Math.round(unit.energy/unit.maxEnergy*100));const current=unit.id[0]===state.activeSide[0];content.innerHTML=`<div class="focus-card"><div class="focus-top"><div class="focus-icon ${unit.id[0]==='e'?'enemy':'ally'}">${esc(unit.icon)}</div><div><div class="focus-name">${esc(unit.name)}</div><div class="focus-sub">${unit.id[0]==='e'?'对手灵宠':'己方灵宠'} · ${positionLabel(unit.pos)}</div></div></div><p class="focus-effect">${current?'当前操作方':'非当前操作方'} · ${esc(unit.quality)}品质 · 等级 ${unit.level}</p></div><div class="stat-grid"><div class="stat-box"><span>生命</span><strong>${unit.hp} / ${unit.maxHp}</strong></div><div class="stat-box"><span>攻击 / 防御</span><strong>${unit.atk} / ${unit.def}</strong></div><div class="stat-box"><span>能量</span><strong>${unit.energy} / ${unit.maxEnergy}</strong></div><div class="stat-box"><span>技能数</span><strong>${unit.skills.length}</strong></div></div><div class="meter"><div class="meter-line"><span>生命状态</span><b>${hpPct}%</b></div><div class="meter-track"><i class="meter-fill" style="width:${hpPct}%"></i></div></div><div class="meter"><div class="meter-line"><span>能量</span><b>${unit.energy} / ${unit.maxEnergy}</b></div><div class="meter-track"><i class="meter-fill energy" style="width:${enPct}%"></i></div></div><div class="detail-label">状态与定位</div><div class="tag-row">${unit.states.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="detail-label">装备技能</div><div class="tag-row">${unit.skills.map(id=>{const s=skillById(id);return `<span class="tag">${esc(s?.name||id)}</span>`}).join('')}</div>`;
  }
  function renderLog(){const node=$('#combat-log');node.innerHTML=state.logs.length?state.logs.map(entry=>`<div class="log-entry ${entry.kind}"><div class="log-time"><span>R${entry.round} · STEP ${entry.action||'—'}</span><span>${esc(entry.meta)}</span></div><div class="log-text">${entry.text}</div></div>`).join(''):'<div class="detail-empty">暂无战斗事件</div>';node.scrollTop=node.scrollHeight;$('#damage-total').textContent=state.damage;$('#event-total').textContent=state.events;$('#round-log-count').textContent=state.roundEvents;}
  function renderTrace(items,label){state.trace=items;state.traceLabel=label;$('#trace-label').textContent=label;$('#trace-items').innerHTML=items.length?items.map(item=>`<span class="trace-item ${item.kind||'trigger'}">${esc(item.text)}</span>`).join(''):'<span class="trace-empty">点击“结算一步”开始记录技能链</span>';}
  function renderFlow(){const stages=[['roundStart','回合开始','结算状态与资源'],['planning','玩家操作','调整位置与技能序'],['resolving','技能结算','按技能栏顺序释放'],['roundEnd','回合结束','结算结束效果并换边']];$('#turn-flow').innerHTML=stages.map(([key,title,desc],i)=>`<div class="flow-stage ${state.phase===key?'active':''} ${['roundStart','planning','resolving','roundEnd'].indexOf(state.phase)>i?'done':''}"><span>${String(i+1).padStart(2,'0')}</span><div><b>${title}</b><small>${desc}</small></div></div>`).join('<i class="flow-arrow">→</i>');}
  function renderContext(){const teamCard=side=>{const meta=state.config.meta[side],units=teamOf(side),slots=state.teamOrders[side].length;return `<div class="team-context-card ${state.activeSide===side?'active':''}"><div class="team-context-title"><span class="context-dot ${side==='players'?'ally':'enemy'}"></span><b>${sideName(side)}</b><small>${state.activeSide===side?'当前操作方':'等待行动'}</small></div><div class="context-metrics"><span>等级 <b>${meta.level}</b></span><span>收入 <b>◆${meta.income}</b></span><span>历史 <b>${meta.history} 场</b></span><span>技能 <b>${slots}/10</b></span></div><div class="context-units">${units.map(u=>`<span class="context-unit ${u.hp<=0?'down':''}">${esc(u.icon)} ${esc(u.name)}</span>`).join('')}</div></div>`;};$('#team-context').innerHTML=teamCard('players')+teamCard('enemies');}
  function updateControls(){const label=state.phase==='planning'?'可操作 · 调整位置后开始':state.phase==='resolving'?'技能结算中':state.phase==='roundEnd'?'回合结束':'战斗已结束';$('#battle-state-text').textContent=label;$('#turn-side-label').textContent=state.phase==='finished'?'—':`${sideName(state.activeSide)}回合`;$('#round-number').textContent=state.round;$('#action-number').textContent=state.action;$('#run-btn').textContent=state.phase==='planning'?'开始战斗':state.phase==='finished'?'重新配置':state.phase==='resolving'?'结算中':'准备下一回合';$('#run-btn').disabled=state.phase!=='planning';}
  function renderAll(){renderBoard();renderSkills();renderDetail();renderLog();renderTrace(state.trace,state.traceLabel);renderFlow();renderContext();updateControls();}
  function handleCellClick(row,col){if(state.phase!=='planning')return;const unit=unitById(state.selectedId);if(!unit||unit.id[0]!==state.activeSide[0]||unit.hp<=0)return;const occupied=allUnits().find(u=>u.pos[0]===row&&u.pos[1]===col);if(occupied){state.selectedId=occupied.id;state.selectedSkill=null;renderAll();return;}const old=[...unit.pos];unit.pos=[row,col];state.selectedSkill=null;log(`<strong>${unit.name}</strong> 从 ${positionLabel(old)} 移动到 ${positionLabel(unit.pos)}。`,'trigger','MOVE');renderAll();showToast(`${unit.name} 已移动到 ${positionLabel(unit.pos)}`);}
  function flashBanner(skill){if(!skill)return;const node=$('#resolution-banner');node.innerHTML=`<strong>${esc(skill.name)}</strong><span>${esc(skill.owner?unitById(skill.owner)?.name||'':'')} · 事件已写入日志</span>`;node.hidden=false;clearTimeout(flashBanner.timer);flashBanner.timer=setTimeout(()=>{node.hidden=true;},900);}
  function autoTick(){if(!state.auto)return;if(state.phase==='planning')beginResolution();if(state.phase==='resolving')resolveOneSkill();if(state.phase==='finished'){state.auto=false;return;}state.autoTimer=setTimeout(autoTick,900);}
  function stopAuto(){clearTimeout(state.autoTimer);state.autoTimer=null;}
  function renderSetup(){
    const draft=setupDraft;const qualityOptions=Object.keys(qualityInfo).map(q=>`<option value="${q}">${q}</option>`).join('');
    const teamEditor=(side,title,subtitle)=>{const slots=draft[side];const meta=draft.meta[side];return `<section class="setup-section"><div class="setup-section-head"><div><span class="kicker">${side==='players'?'PLAYER':'OPPONENT'} LOADOUT</span><h3>${title}</h3><p>${subtitle}</p></div><div class="setup-meta"><label>英雄等级<input type="number" min="1" max="20" data-side="${side}" data-role="level" value="${meta.level}"></label><label>收入<input type="number" min="0" max="999" data-side="${side}" data-role="income" value="${meta.income}"></label><label>历史战斗<input type="number" min="0" max="999" data-side="${side}" data-role="history" value="${meta.history}"></label></div></div><div class="loadout-grid">${slots.map((slot,index)=>{const pet=petById(slot.pet);const available=pet?pet.skills.map(id=>skillCatalog.find(s=>s.id===id)).filter(Boolean):[];return `<div class="loadout-slot ${slot.enabled?'enabled':''}"><div class="slot-head"><b>位置 ${index+1}</b><label class="switch-label"><input type="checkbox" data-side="${side}" data-slot="${index}" data-role="enabled" ${slot.enabled?'checked':''}><span>上场</span></label></div><label class="select-label">灵宠<select data-side="${side}" data-slot="${index}" data-role="pet"><option value="">空置</option>${petCatalog.map(p=>`<option value="${p.id}" ${slot.pet===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label><label class="select-label">品质<select data-side="${side}" data-slot="${index}" data-role="quality" ${!slot.enabled?'disabled':''}>${qualityOptions.replace(`value="${slot.quality}"`,`value="${slot.quality}" selected`)}</select></label><div class="skill-picks"><span>装备技能（可多选）</span>${available.length?available.map(s=>`<label><input type="checkbox" data-side="${side}" data-slot="${index}" data-role="skill" value="${s.id}" ${slot.skills.includes(s.id)?'checked':''} ${!slot.enabled?'disabled':''}><i>${s.name}</i><small>${s.size==='short'?'2格':s.size==='medium'?'3格':'4格'}</small></label>`).join(''):'<em>先选择灵宠</em>'}</div></div>`}).join('')}</div><div class="shop-row"><div><b>物品与资源</b><small>买入扣除收入，卖出返还一半价值</small></div>${itemCatalog.map(item=>`<div class="shop-item"><span class="item-glyph">${item.icon}</span><span><b>${item.name}</b><small>◆${item.price} · 持有 ${meta.items[item.id]||0}</small></span><button type="button" data-side="${side}" data-item="${item.id}" data-item-action="sell">−</button><button type="button" data-side="${side}" data-item="${item.id}" data-item-action="buy">＋</button></div>`).join('')}</div></section>`;};
    $('#setup-body').innerHTML=teamEditor('players','己方队伍','最多4只灵宠；技能会按装备顺序进入当前队伍技能栏。')+teamEditor('enemies','对手队伍','对手回合同样按其技能栏结算，可在棋盘上调整对手位置。');
    const summary=['players','enemies'].map(side=>draft[side].filter(s=>s.enabled).reduce((n,s)=>n+s.skills.length,0));$('#setup-validation').textContent=`技能格：己方 ${summary[0]}/10 · 对手 ${summary[1]}/10；每只上场灵宠至少装备1个技能。`;
  }
  function openSetup(){stopAuto();setupDraft=copy(state.config);renderSetup();$('#setup-modal').hidden=false;}
  function applySetup(){for(const side of ['players','enemies']){const slots=setupDraft[side];const count=slots.filter(s=>s.enabled).reduce((n,s)=>n+s.skills.length,0);if(count>10){showToast(`${sideName(side)}技能格超过10格`,true);return;}if(slots.some(s=>s.enabled&&(!s.pet||!s.skills.length))){showToast(`${sideName(side)}存在上场灵宠未装备技能`,true);return;}}buildBattle(setupDraft);$('#setup-modal').hidden=true;renderAll();showToast('战斗配置已应用');}
  $('#setup-body').addEventListener('change',e=>{if(!setupDraft)return;const el=e.target,side=el.dataset.side,slotIndex=Number(el.dataset.slot),role=el.dataset.role;if(side&&role==='level')setupDraft.meta[side].level=Math.max(1,Number(el.value)||1);else if(side&&role==='income')setupDraft.meta[side].income=Math.max(0,Number(el.value)||0);else if(side&&role==='history')setupDraft.meta[side].history=Math.max(0,Number(el.value)||0);else if(side&&role==='enabled')setupDraft[side][slotIndex].enabled=el.checked;else if(side&&role==='pet'){const slot=setupDraft[side][slotIndex];slot.pet=el.value;const pet=petById(el.value);slot.skills=pet?pet.skills.slice(0,3):[];}else if(side&&role==='quality')setupDraft[side][slotIndex].quality=el.value;else if(side&&role==='skill'){const skills=setupDraft[side][slotIndex].skills;el.checked?(!skills.includes(el.value)&&skills.push(el.value)):setupDraft[side][slotIndex].skills=skills.filter(id=>id!==el.value);}renderSetup();});
  $('#setup-body').addEventListener('click',e=>{const btn=e.target.closest('[data-item-action]');if(!btn||!setupDraft)return;const side=btn.dataset.side,item=itemCatalog.find(i=>i.id===btn.dataset.item),meta=setupDraft.meta[side];meta.items[item.id]=meta.items[item.id]||0;if(btn.dataset.itemAction==='buy'){if(meta.income<item.price){showToast('收入不足，无法购买',true);return;}meta.income-=item.price;meta.items[item.id]+=1;}else if(meta.items[item.id]>0){meta.items[item.id]-=1;meta.income+=Math.floor(item.price/2);}renderSetup();});
  $('#config-btn').addEventListener('click',openSetup);$('#close-setup').addEventListener('click',()=>$('#setup-modal').hidden=true);$('#cancel-setup').addEventListener('click',()=>$('#setup-modal').hidden=true);$('#apply-setup').addEventListener('click',applySetup);
  $('#run-btn').addEventListener('click',()=>{if(state.phase==='finished'){openSetup();return;}resolveAllSkills();});
  $('#step-btn').addEventListener('click',()=>{if(state.phase==='planning'){showToast('先点击“开始战斗”锁定本回合操作');return;}resolveOneSkill();});
  $('#auto-btn').addEventListener('click',()=>{state.auto=!state.auto;$('#auto-btn').textContent=state.auto?'停止自动':'自动播放';if(state.auto){if(state.phase==='finished')state.auto=false;else autoTick();}else stopAuto();});
  $('#reset-btn').addEventListener('click',()=>{buildBattle(defaultConfig);renderAll();showToast('已恢复默认战斗配置');});
  $('#clear-log').addEventListener('click',()=>{state.logs=[];state.events=0;state.damage=0;state.roundEvents=0;renderLog();});
  buildBattle(defaultConfig);renderAll();
})();
