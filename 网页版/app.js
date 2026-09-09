'use strict';
(() => {
 const D=window.ATLAS_DATA,$=s=>document.querySelector(s),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const byId=new Map(D.items.map(i=>[i.id,i]));
 let mechanism=D.mechanisms[0],mode='diagram',scope='mechanism',kind='全部',query='',selected=null,pinned=false,evidence=null,zoom=1,hideTimer;
 const compact=()=>matchMedia('(max-width:980px)').matches;
 const empty=v=>v===null||v===undefined||v==='';
 const value=v=>empty(v)?'原表未填写':String(v);
 const related=()=>D.items.filter(i=>i.mechanisms.includes(mechanism.id));
 const avatar=i=>`<span class="item-avatar ${i.kind==='灵兽'?'pet':''}" aria-hidden="true">${E(i.name[0])}</span>`;
 const tierClass=i=>i.tier==='白银'?'silver':i.tier==='黄金'?'gold':'';
 function announce(s){$('#announcement').textContent=s;}
 function setSelected(i,pin=false,open=false,rule=null){
  selected=i.id;pinned=pin;evidence=rule;renderDetail(i);
  document.querySelectorAll('.flow-row,.catalog-card').forEach(el=>el.classList.toggle('selected',el.dataset.itemId===i.id));
  if(open&&compact())$('#inspector').classList.add('open');
 }
 function section(k,v){return `<section class="detail-section"><h3>${E(k)}</h3><p class="${empty(v)?'empty':''}">${E(value(v))}</p></section>`;}
 function renderDetail(i){
  const f=i.fields,pet=i.kind==='灵兽',stats=pet?['hp','攻击','防御']:['能力','防御'];
  let h=`<div class="detail-topline"><div class="detail-avatar" aria-hidden="true">${E(i.name[0])}</div><span>${pinned?'● 已固定':'◌ 悬停预览'} · ${E(i.kind)}</span></div><h2 class="detail-name">${E(i.name)}</h2><div class="badges"><span class="badge tier ${tierClass(i)}">${E(i.tier)} · 最低品质</span>${String(f['词条']||'').split(/[，,、]/).filter(Boolean).map(t=>`<span class="badge">${E(t)}</span>`).join('')}</div>`;
  h+=`<div class="stats" style="grid-template-columns:repeat(${stats.length},minmax(0,1fr))">${stats.map(k=>`<div class="stat"><span>${k==='hp'?'生命值':E(k)}</span><strong class="${value(f[k]).length>4?'long':''}">${E(value(f[k]))}</strong></div>`).join('')}</div>`;
  if(!pet)h+=section('射程 / 目标',f['射程/目标']);
  h+=section('完整效果 · 原表原文',i.effect);
  if(exampleRole(i))h+=section('在这套小循环中的作用',exampleRole(i));
  if(evidence)h+=`<div class="evidence-box"><strong>当前关系的原文依据</strong>${evidence.condition?`条件：${E(evidence.condition)}<br>`:'原表效果说明<br>'}效果：${E(evidence.result)}<br><br>图中是效果节选；附加效果与限制见上方完整原文。</div>`;
  const other=pet?['套路','主要配合对象','升级理由','套路定位','原型']:['主要配合对象','定位','套路','原型'];
  for(const k of other)if(!empty(f[k]))h+=section(k,f[k]);
  h+=`<div class="source-box"><b>新数值.xlsx</b><br>${E(i.source.sheet)} · 第 ${i.source.row} 行<br>最低可用品质：${E(i.tier)}<br>空白字段未推算，升级数据暂未展开。</div>`;
  $('#detail').innerHTML=h;$('#unpin').hidden=!pinned;
 }
 function hideTip(){clearTimeout(hideTimer);$('#tooltip').hidden=true;}
 function laterHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hideTip,180);}
 function showTip(i,e){
  if(e.pointerType==='touch'||compact())return;
  clearTimeout(hideTimer);const tip=$('#tooltip'),keys=i.kind==='灵兽'?['hp','攻击','防御']:['能力','防御','射程/目标'];
  tip.innerHTML=`<h3>${E(i.name)}</h3><small>${E(i.kind)} / ${E(i.tier)} · 最低品质</small><div class="tip-stats">${keys.map(k=>`${k==='hp'?'生命':E(k)}：${E(value(i.fields[k]))}`).join(' · ')}</div><p>${E(value(i.effect))}</p>${exampleRole(i)?`<p class="tip-role"><b>这套配合中的作用</b><br>${E(exampleRole(i))}</p>`:""}<small style="margin:12px 0 0">${E(i.source.sheet)} · 第 ${i.source.row} 行　点击固定详情</small>`;
  tip.hidden=false;const box=tip.getBoundingClientRect();tip.style.left=`${Math.max(12,Math.min(e.clientX+16,innerWidth-box.width-12))}px`;tip.style.top=`${Math.max(12,Math.min(e.clientY+16,innerHeight-box.height-12))}px`;
  if(!pinned)setSelected(i,false);
 }
 function connectItems(root){
  root.querySelectorAll('[data-inspect]').forEach(el=>{
   const i=byId.get(el.dataset.inspect);
   el.addEventListener('pointerenter',e=>showTip(i,e));el.addEventListener('pointerleave',laterHide);
   el.addEventListener('focus',()=>{if(!pinned)setSelected(i,false);});
   el.addEventListener('click',()=>{hideTip();setSelected(i,true,true);announce(`${i.name}详情已固定`);});
  });
 }
 function arrow(which,label){return `<svg class="connector ${which}" viewBox="0 0 62 25" aria-hidden="true"><text x="31" y="4" text-anchor="middle">${label}</text><path d="M 0 16 C 22 16 40 16 54 16"/><polygon points="54,13 60,16 54,19"/></svg>`;}
 function renderGraph(){
  $('#graph-rows').innerHTML=mechanism.rules.map((r,k)=>{
   const i=byId.get(r.itemId);
   return `<div class="flow-row ${selected===i.id?'selected':''}" data-item-id="${i.id}" data-rule="${r.id}"><div class="flow-condition"><span class="node-label">${r.condition?'WHEN / 条件原文':'CONTEXT / 效果说明'}</span><span class="condition-text ${r.condition?'':'generic'}">${E(r.condition|| (i.kind==='技能'?'技能效果':'灵兽特性'))}</span></div>${arrow('first',r.condition?'满足条件':'查看')}<button class="flow-item" data-inspect="${i.id}" aria-label="${E(i.name)}，查看最低品质详情">${avatar(i)}<span><strong>${E(i.name)}</strong><small>${E(i.kind)} · ${E(i.tier)}</small></span></button>${arrow('second','效果')}<button class="flow-result" data-evidence="${r.id}" aria-label="查看${E(i.name)}关系的原表依据"><span class="node-label">THEN / 效果原文</span><span class="result-text">${E(r.result)}</span><span class="source-line">${E(i.source.sheet)} · 第 ${i.source.row} 行 ↗</span></button></div>`;
  }).join('');
  $('#rule-count').textContent=`${mechanism.rules.length} 条关键关系`;
  connectItems($('#graph-rows'));
  $('#graph-rows').querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>{const r=mechanism.rules.find(r=>r.id===b.dataset.evidence);setSelected(byId.get(r.itemId),true,true,r);announce('已显示当前关系的原文依据');}));
  $('#mechanism-note').textContent=mechanism.note;
  $('#related-items').innerHTML=related().map(i=>`<button class="related-chip" data-inspect="${i.id}"><i></i>${E(i.name)}</button>`).join('');connectItems($('#related-items'));
  requestAnimationFrame(fit);
 }
 function updateHeader(){
  $('#examples-nav').classList.toggle('active',scope==='examples');
  if(scope==='examples'){$('#mechanism-en').textContent='PRESET LOOPS / 已摆好的配合';$('#mechanism-title').textContent='小循环示例';$('#mechanism-description').textContent='先看摆好的组合，再逐步理解每件物品如何接上下一环。';$('#related-count').textContent=D.examples.length;$('.page-stat span').textContent='示例组合';document.querySelectorAll('[data-mechanism]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-current','false');});$('#all-items').classList.remove('active');return;}

  const all=scope==='all';document.documentElement.style.setProperty('--accent',all?'#547b60':mechanism.color);
  $('#mechanism-en').textContent=all?'COLLECTION / BASE TIER':`${String(D.mechanisms.indexOf(mechanism)+1).padStart(2,'0')} / ${mechanism.en}`;
  $('#mechanism-title').textContent=all?'全部物品':mechanism.name;
  $('#mechanism-description').textContent=all?'按原表命名收录灵兽与技能，默认读取各物品的最低可用品质。':mechanism.description;
  $('#related-count').textContent=all?D.items.length:related().length;
  $('.page-stat span').textContent=all?'基础物品':'相关物品';
  document.querySelectorAll('[data-mechanism]').forEach(b=>{const active=!all&&b.dataset.mechanism===mechanism.id;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
  $('#all-items').classList.toggle('active',all);
 }
 function setMode(next){mode=next;$('#examples-section').hidden=next!=='examples';$('#diagram-section').hidden=next!=='diagram';$('#catalog-section').hidden=next!=='catalog';for(const [id,m]of[['examples-tab','examples'],['diagram-tab','diagram'],['catalog-tab','catalog']]){const active=next===m;$('#'+id).classList.toggle('active',active);$('#'+id).setAttribute('aria-pressed',String(active));}hideTip();if(next==='catalog')renderCatalog();else requestAnimationFrame(fit);}
 function renderCatalog(){
  const source=query||scope==='all'?D.items:related();const results=source.filter(i=>(kind==='全部'||i.kind===kind)&&(!query||`${i.name} ${JSON.stringify(i.fields)}`.toLowerCase().includes(query)));
  $('#catalog-count').textContent=`${query?'全表搜索':'物品目录'} · ${results.length} 件`;
  $('#catalog-grid').innerHTML=results.length?results.map(i=>`<button class="catalog-card ${selected===i.id?'selected':''}" data-item-id="${i.id}" data-inspect="${i.id}" aria-label="${E(i.name)}，查看最低品质详情"><header>${avatar(i)}<div><h3>${E(i.name)}</h3><small>${E(i.kind)} · ${E(i.tier)}</small></div></header><p>${E(value(i.effect))}</p><small>${E(i.source.sheet)} · 第 ${i.source.row} 行 ↗</small></button>`).join(''):'<div class="no-results">没有找到对应物品。试试名称或效果关键词。</div>';
  connectItems($('#catalog-grid'));
 }
 function applyZoom(){
  const scale=$('#graph-scale');scale.style.zoom=zoom;
  $('#zoom-value').textContent=`${Math.round(zoom*100)}%`;$('#zoom-out').disabled=zoom<=.501;$('#zoom-in').disabled=zoom>=1.999;hideTip();
 }
 function fit(){if(mode!=='diagram')return;zoom=Math.min(1.12,Math.max(innerWidth<=680?.9:.65,($('#graph-viewport').clientWidth-2)/890));applyZoom();}
 function showMechanism(m){mechanism=m;scope='mechanism';query='';$('#search').value='';updateHeader();renderGraph();setMode('diagram');$('#graph-viewport').scrollTop=0;$('#graph-viewport').scrollLeft=0;}
 $('#mechanism-nav').innerHTML=D.mechanisms.map((m,k)=>`<button class="nav-item" data-mechanism="${m.id}" style="--color:${m.color}"><span class="nav-icon">${E(m.symbol)}</span><span>${E(m.name)}</span><span class="nav-number">${String(k+1).padStart(2,'0')}</span></button>`).join('');
 document.querySelectorAll('[data-mechanism]').forEach(b=>b.addEventListener('click',()=>showMechanism(D.mechanisms.find(m=>m.id===b.dataset.mechanism))));
 $('#all-items').addEventListener('click',()=>{scope='all';query='';$('#search').value='';updateHeader();setMode('catalog');});
 $('#diagram-tab').addEventListener('click',()=>{query='';$('#search').value='';scope='mechanism';updateHeader();setMode('diagram');});
 $('#catalog-tab').addEventListener('click',()=>{if(scope==='examples'){scope='all';updateHeader();}setMode('catalog');});
 $('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();if(scope==='examples'){scope='all';updateHeader();}setMode('catalog');});
 $('#kind-filters').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(!b)return;kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',String(el===b));});renderCatalog();});
 $('#unpin').addEventListener('click',()=>{pinned=false;evidence=null;renderDetail(byId.get(selected));});
 $('#close-detail').addEventListener('click',()=>$('#inspector').classList.remove('open'));
 $('#zoom-in').addEventListener('click',()=>{zoom=Math.min(2,zoom+.15);applyZoom();});$('#zoom-out').addEventListener('click',()=>{zoom=Math.max(.5,zoom-.15);applyZoom();});$('#fit').addEventListener('click',fit);
 $('#expand').addEventListener('click',()=>{const on=document.body.classList.toggle('expanded');$('#expand').textContent=on?'⛶ 收起':'⛶ 展开';$('#expand').setAttribute('aria-label',on?'收起关系图':'展开关系图');requestAnimationFrame(fit);});
 $('#tooltip').addEventListener('pointerenter',()=>clearTimeout(hideTimer));$('#tooltip').addEventListener('pointerleave',laterHide);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTip();$('#inspector').classList.remove('open');if(document.body.classList.contains('expanded'))$('#expand').click();if(pinned){pinned=false;evidence=null;renderDetail(byId.get(selected));}}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}});
 new ResizeObserver(()=>{if(!document.body.classList.contains('expanded'))fit();}).observe($('.main'));
 const byName=new Map(D.items.map(i=>[i.name,i]));let currentExample=0,exampleStep=0;
 function exampleRole(i){return mode==='examples'?(D.examples[currentExample]?.roles[i.name]||''):'';}
 const drawings={
 '鲛人抢手':'M45 18 Q15 25 25 49 Q32 65 52 59 L63 70 L64 48 Q78 27 57 21 M39 36h1 M28 51L17 62 M65 26L82 16 M77 13L85 20 M76 21L83 28',
 '蜈蚣锁':'M23 28 Q9 43 23 51 Q35 57 44 42 L57 25 Q67 14 77 24 Q88 36 72 51 M24 42L57 43 M32 28L31 16 M43 27L46 13 M55 56L56 69 M66 56L69 70',
 '蜷缩':'M69 64 Q30 77 20 48 Q12 17 48 18 Q82 16 79 46 Q78 64 56 61 Q34 60 35 42 Q37 27 54 33 Q66 37 58 48 M24 66L17 73 M76 64L83 70',
 '玄铁龟':'M27 34L44 24L63 31L70 49L57 65L36 66L22 52Z M43 34L56 38L57 52L44 59L32 50L34 39Z M69 38L84 34L88 43L72 49 M28 31L20 23 M25 61L18 69 M60 64L65 76',
 '蓄能':'M54 14L32 45H49L41 77L71 37H53Z M22 22L18 17 M80 20L85 15 M19 62L13 66 M80 63L86 69',
 '袖箭':'M20 68L70 18 M50 18H70V38 M29 54L16 52L16 69L33 69 M35 48L27 40 M43 40L35 32',
 '巨鳄蚁':'M43 31Q29 20 39 12Q51 5 60 18L52 33 M35 39Q50 28 64 43L67 59L51 72L34 60Z M37 46L18 31 M36 54L14 55 M37 62L23 78 M61 45L80 29 M65 53L85 53 M61 63L75 78',
 '冲刺拳':'M25 55L22 36Q21 29 30 29L34 40L33 20Q34 12 42 18L45 35L48 16Q53 11 58 18L57 37L64 23Q72 23 71 32L68 52L58 66L38 67Z M32 69L31 80H60L61 68 M13 42H5 M17 63L7 70',
 '龙牙斩':'M28 76L40 55L25 46L43 41L73 13L65 48L46 60L40 77 M35 55L50 68 M25 70L35 80'
 };
 function art(i){return `<svg viewBox="0 0 96 90" aria-hidden="true"><circle cx="48" cy="45" r="32" fill="currentColor" opacity=".07"/><path d="${drawings[i.name]||'M25 65L48 20L71 65Z'}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
 function boardCard(name,role){const i=byName.get(name),stat=i.kind==='灵兽'?`生命 ${i.fields.hp} · 攻 ${i.fields['攻击']} · 防 ${i.fields['防御']}`:value(i.fields['能力']);return `<button class="board-card ${i.kind==='灵兽'?'board-pet':''}" data-inspect="${i.id}" data-board-name="${E(i.name)}" aria-label="${E(i.name)}，查看最低品质详情"><span class="board-card-top">${E(i.kind)}<b>${E(i.tier)}</b></span><span class="board-art">${art(i)}</span><strong>${E(i.name)}</strong><span class="board-stats">${E(stat)}</span><span class="board-role">${E(role)}</span><span class="board-card-foot">${E(i.fields['词条']||'')} <span>ⓘ</span></span></button>`;}
 function renderExample(){
  const ex=D.examples[currentExample];document.documentElement.style.setProperty('--accent',ex.theme);
  $('#example-picker').innerHTML=D.examples.map((e,k)=>`<button class="example-choice ${k===currentExample?'active':''}" data-example="${k}" aria-pressed="${k===currentExample}"><small>0${k+1}</small><span>${E(e.name)}</span><b>${k===currentExample?'已摆好':'查看 →'}</b></button>`).join('');
  $('#example-stage').innerHTML=`<article class="example-build"><header class="build-heading"><div><span class="eyebrow">READY TO EXPLORE / 0${currentExample+1}</span><h2>${E(ex.name)}</h2><p>${E(ex.subtitle)}</p></div><span class="build-tag">${E(ex.tag)}</span></header><div class="playmat"><div class="playmat-label"><span>核心灵兽 + 两件技能</span><span>悬停看效果 · 点击固定</span></div><div class="loadout"><div class="pet-slot"><span class="slot-label">核心灵兽</span>${boardCard(ex.pet,'这套配合的核心特性')}</div><div class="equip-link" aria-hidden="true"><span>装备</span>→</div><div class="skill-slots"><span class="slot-label">以下技能均配给 ${E(ex.pet)}</span><div class="skill-pair">${ex.skills.map((n,k)=>boardCard(n,k===0?'启动 / 供给':'转化 / 受益')).join('')}</div></div></div><div class="board-caption">示意摆放 · 卡片位置用于讲解配合，不代表正式站位或槽位容量</div></div><div class="build-summary"><span>↻</span><p>${E(ex.summary)}</p></div><section class="walkthrough"><div class="walkthrough-heading"><h3>走一遍小循环</h3><span>步骤讲解 · 非战斗模拟</span></div><div id="example-step-tabs" class="example-step-tabs">${ex.steps.map((s,k)=>`<button data-example-step="${k}" aria-label="第${k+1}步：${E(s.title)}">${k+1}</button>`).join('')}</div><div id="example-step-content"></div><div class="walkthrough-controls"><button id="example-reset">↺ 从头看</button><span id="example-progress"></span><button id="example-next">下一步 →</button></div></section><div class="example-boundary"><strong>循环成立的条件</strong><p>${E(ex.boundary)}</p></div></article>`;
  connectItems($('#example-stage'));
  document.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{currentExample=Number(b.dataset.example);exampleStep=0;hideTip();renderExample();setSelected(byName.get(D.examples[currentExample].pet),false);}));
  document.querySelectorAll('[data-example-step]').forEach(b=>b.addEventListener('click',()=>{exampleStep=Number(b.dataset.exampleStep);renderExampleStep();}));
  $('#example-next').addEventListener('click',()=>{exampleStep=(exampleStep+1)%ex.steps.length;renderExampleStep();});$('#example-reset').addEventListener('click',()=>{exampleStep=0;renderExampleStep();});
  renderExampleStep();
 }
 function renderExampleStep(){const ex=D.examples[currentExample],s=ex.steps[exampleStep],i=byName.get(s.source);
  $('#example-step-content').innerHTML=`<h4>${E(s.title)}</h4><p>${E(s.text)}</p><button id="example-evidence">原表依据 · ${E(s.source)} · ${E(i.source.sheet)} 第${i.source.row}行 ↗</button>`;
  document.querySelectorAll('[data-example-step]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.exampleStep)===exampleStep);b.setAttribute('aria-pressed',String(Number(b.dataset.exampleStep)===exampleStep));});
  document.querySelectorAll('[data-board-name]').forEach(b=>b.classList.toggle('step-active',s.active.includes(b.dataset.boardName)));
  $('#example-progress').textContent=`${exampleStep+1} / ${ex.steps.length}`;$('#example-next').textContent=exampleStep===ex.steps.length-1?'再看一轮 ↻':'下一步 →';
  $('#example-evidence').onclick=()=>setSelected(i,true,true,{condition:'',result:s.quote});announce(s.title);
 }
 function showExamples(){scope='examples';query='';$('#search').value='';updateHeader();setMode('examples');renderExample();setSelected(byName.get(D.examples[currentExample].pet),false);}
 $('#examples-nav').addEventListener('click',showExamples);$('#examples-tab').addEventListener('click',showExamples);

 const initial=D.items.find(i=>i.name==='火球');setSelected(initial);showMechanism(D.mechanisms[0]);showExamples();
})();
