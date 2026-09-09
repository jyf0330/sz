'use strict';
(() => {
  const data = window.GRAPH_DATA;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nodes = new Map(data.nodes.map(n => [n.id, n]));
  const items = data.nodes.filter(n => n.kind !== '概念');
  const viewport = $('#viewport'), layer = $('#map-transform'), hover = $('#hover-card');
  layer.innerHTML = data.svg;
  const mapNode = id => layer.querySelector(`[data-node="${id}"]`);
  let kind = '全部', query = '', selected = null, pinned = false, region = null;
  let scale = 1, fitScale = 1, tx = 0, ty = 0, drag = null, didDrag = false, hideTimer;
  let hoverNode = null;
  const origin = {x:575, y:-30}, size = {w:3475,h:2660};
  const isCompact = () => matchMedia('(max-width:800px)').matches;
  $('#item-count').textContent = items.length;
  function field(n, k) { return n.record?.fields[k]; }
  function shown(v) { return v === null || v === undefined || v === '' ? '原表未填写' : String(v); }
  function tier(n) { return n.record?.tier || (n.kind === '概念' ? '概念节点' : '待确认'); }
  function effect(n) { return field(n, n.kind === '灵兽' ? '一句话效果' : '效果'); }
  function renderList() {
    const found = items.filter(n => (kind === '全部' || n.kind === kind) &&
      `${n.name} ${JSON.stringify(n.record?.fields || {})}`.toLowerCase().includes(query));
    $('#list-count').textContent = `${found.length} / ${items.length}`;
    $('#item-list').innerHTML = found.length ? found.map(n => `<button class="item-row${selected===n.id?' selected':''}" data-item="${n.id}" aria-label="${esc(n.name)}，定位并查看详情"><span class="item-icon ${n.kind==='技能'?'skill':''}" aria-hidden="true">${esc(n.name[0])}</span><span class="item-name">${esc(n.name)}<small>${esc(n.kind)} · ${esc(tier(n))}</small></span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('') : '<div class="empty">没有找到对应物品<br>试试名称或效果关键词</div>';
    for (const n of items) mapNode(n.id).classList.toggle('match', !!query && found.includes(n));
  }
  function section(label, value) {
    const missing = value === null || value === undefined || value === '';
    return `<section class="detail-section"><h4>${esc(label)}</h4><p${missing?' class="placeholder"':''}>${esc(shown(value))}</p></section>`;
  }
  function renderDetail(n) {
    const r=n.record, f=r?.fields || {};
    const statNames=n.kind==='灵兽' ? ['hp','攻击','防御'] : ['能力','防御'];
    const tags=String(f['词条'] || '').split(/[，,、]/).filter(Boolean);
    let content=`<div class="detail-hero"><div class="detail-symbol" aria-hidden="true">${esc(n.name[0])}</div><span class="detail-type">${pinned?'● 已固定':'◌ 悬停预览'} · ${esc(n.kind)}</span><h3>${esc(n.name)}</h3><div class="badges"><span class="badge tier ${tier(n)==='白银'?'silver':''}">${esc(tier(n))}${r?' · 最低品质':''}</span>${tags.map(t=>`<span class="badge">${esc(t)}</span>`).join('')}</div>${n.regions.length?`<p class="detail-lead">原图分区 · ${n.regions.map(esc).join(' / ')}</p>`:''}</div>`;
    if(r) {
      content+=`<div class="stats" style="grid-template-columns:repeat(${statNames.length},1fr)">${statNames.map(k=>`<div class="stat"><span>${k==='hp'?'生命值':esc(k)}</span><strong class="${shown(f[k]).length>4?'long':''}">${esc(shown(f[k]))}</strong></div>`).join('')}</div>`;
      if(n.kind==='技能') content+=section('射程 / 目标',f['射程/目标']);
      content+=section(n.kind==='灵兽'?'一句话效果':'效果', effect(n));
      const other=n.kind==='灵兽'?['套路','主要配合对象','升级理由','套路定位','原型']:['主要配合对象','定位','套路','原型'];
      for (const k of other) if(f[k]!==null&&f[k]!==undefined&&f[k]!=='') content+=section(k,f[k]);
      if(r.name!==n.name) content+=`<div class="warning">原图名称：${esc(n.name)}<br>表格对应名称：${esc(r.name)}</div>`;
      content+=`<div class="source-note"><strong>基础数据原文</strong><br>${esc(r.source.file)} · ${esc(r.source.sheet)} · 第 ${r.source.row} 行<br>仅显示该物品的最低可用品质；空白字段不推算。</div>`;
    } else if(n.candidate) {
      content+=`<div class="warning">名称对应待确认<br>PDF：${esc(n.name)}<br>表格候选：${esc(n.candidate)}<br>确认两者为同一物品后即可补入数据。</div>`;
    } else {
      content+=section('原图说明','“中型技能”是原图的概念节点，保留其触发关系，不作为具体物品配置数值。');
    }
    $('#detail').innerHTML=content;
    $('#unpin').hidden=!pinned;
  }
  function select(n, pin=false, open=false) {
    selected=n.id;pinned=pin;
    for(const el of layer.querySelectorAll('.selected')) el.classList.remove('selected');
    mapNode(n.id).classList.add('selected');
    for(const el of document.querySelectorAll('.item-row')) el.classList.toggle('selected',el.dataset.item===n.id);
    renderDetail(n);
    if(open && isCompact()) $('#inspector').classList.add('open');
  }
  function announce(s){$('#announcement').textContent=s;}
  function tooltip(n,clientX,clientY){
    clearTimeout(hideTimer);hoverNode=n.id;
    const r=n.record; const statKeys=n.kind==='灵兽'?['hp','攻击','防御']:['能力','防御','射程/目标'];
    const meta=r?statKeys.map(k=>`${k==='hp'?'生命':k} ${shown(field(n,k))}`).join(' · '):'';
    hover.innerHTML=`<h3>${esc(n.name)}</h3><div class="hover-meta">${esc(n.kind)} · ${esc(tier(n))}${r?' / 最低品质':''}</div>${meta?`<div class="hover-meta">${esc(meta)}</div>`:''}<p>${esc(r?shown(effect(n)):(n.candidate?'名称对应待确认，尚未绑定表格数据。':'原图概念节点，保留其触发关系。'))}</p><small>点击物品固定完整详情 · Esc 关闭</small>`;
    hover.hidden=false;
    const w=hover.offsetWidth,h=hover.offsetHeight;
    hover.style.left=`${Math.max(12,Math.min(clientX+18,innerWidth-w-12))}px`;
    hover.style.top=`${Math.max(12,Math.min(clientY+15,innerHeight-h-12))}px`;
    if(!pinned)select(n,false);
  }
  function hideTooltip(){clearTimeout(hideTimer);hover.hidden=true;hoverNode=null;}
  function deferHide(){clearTimeout(hideTimer);hideTimer=setTimeout(hideTooltip,160);}
  hover.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
  hover.addEventListener('pointerleave',deferHide);
  function apply(){
    layer.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;
    $('#zoom-value').textContent=`${Math.round(scale/fitScale*100)}%`;
    $('#zoom-out').disabled=scale<=fitScale*.501;
    $('#zoom-in').disabled=scale>=fitScale*7.99;
  }
  function setRegion(id){region=id;document.querySelectorAll('.region-chip').forEach(b=>{b.classList.toggle('active',b.dataset.region===id);b.setAttribute('aria-pressed',String(b.dataset.region===id));});}
  function fit(){
    fitScale=Math.min((viewport.clientWidth-34)/size.w,(viewport.clientHeight-100)/size.h);
    fitScale=Math.max(.025,fitScale);scale=fitScale;
    tx=(viewport.clientWidth-size.w*scale)/2;ty=(viewport.clientHeight-size.h*scale)/2-12;
    apply();setRegion('all');hideTooltip();
  }
  function zoom(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){
    const next=Math.max(fitScale*.5,Math.min(fitScale*8,scale*factor));
    tx=cx-(cx-tx)*next/scale;ty=cy-(cy-ty)*next/scale;scale=next;apply();hideTooltip();
  }
  function focusBounds(bounds, item=false){
    const [x,y,x1,y1]=bounds;
    scale=Math.min((viewport.clientWidth-60)/(x1-x+80),(viewport.clientHeight-120)/(y1-y+100),fitScale*(item?5:8));
    scale=Math.max(fitScale*.5,scale);
    tx=viewport.clientWidth/2-((x+x1)/2-origin.x)*scale;
    ty=(viewport.clientHeight-25)/2-((y+y1)/2-origin.y)*scale;
    apply();hideTooltip();
  }
  const uniqueRegions=data.regions.filter((r,i,a)=>a.findIndex(q=>q.name===r.name)===i);
  $('#regions').innerHTML='<button class="region-chip active" data-region="all" aria-pressed="true">全部</button>'+uniqueRegions.map(r=>`<button class="region-chip" data-region="${r.id}" style="--region:${r.color}" aria-pressed="false"><i></i>${esc(r.name)}</button>`).join('');
  $('#regions').addEventListener('click',e=>{const b=e.target.closest('[data-region]');if(!b)return;if(b.dataset.region==='all'){fit();return;}const r=data.regions.find(r=>r.id===b.dataset.region);focusBounds(r.bounds);setRegion(r.id);announce(`已定位到${r.name}分区`);});
  $('#item-list').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(!b)return;const n=nodes.get(b.dataset.item);select(n,true,true);focusBounds(n.bounds,true);setRegion(null);announce(`已定位到${n.name}，详情已固定`);});
  $('#item-list').addEventListener('pointerover',e=>{const b=e.target.closest('[data-item]');if(b&&!pinned&&e.pointerType!=='touch')select(nodes.get(b.dataset.item),false);});
  $('#search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();renderList();});
  document.querySelector('.type-filter').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(!b)return;kind=b.dataset.kind;document.querySelectorAll('[data-kind]').forEach(el=>{el.classList.toggle('active',el===b);el.setAttribute('aria-pressed',String(el===b));});renderList();});
  for(const el of layer.querySelectorAll('[data-node]')){
    const n=nodes.get(el.dataset.node);
    el.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch'&&!drag)tooltip(n,e.clientX,e.clientY);});
    el.addEventListener('pointerleave',deferHide);
    el.addEventListener('focus',()=>{if(!pinned)select(n,false);});
    el.addEventListener('click',()=>{if(didDrag)return;select(n,true,true);hideTooltip();announce(`${n.name}详情已固定`);});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();select(n,true,true);announce(`${n.name}详情已固定`);}});
  }
  $('#unpin').addEventListener('click',()=>{pinned=false;renderDetail(nodes.get(selected));announce('已取消固定，悬停物品可切换详情');});
  $('#close-detail').addEventListener('click',()=>{$('#inspector').classList.remove('open');});
  $('#zoom-in').addEventListener('click',()=>zoom(1.35));$('#zoom-out').addEventListener('click',()=>zoom(1/1.35));
  $('#reset').addEventListener('click',fit);$('#reset-bottom').addEventListener('click',fit);
  $('#fullscreen').addEventListener('click',()=>{const on=$('.workspace').classList.toggle('expanded');document.body.classList.toggle('map-expanded',on);$('#fullscreen').setAttribute('aria-label',on?'收起画布':'展开画布');$('#fullscreen').innerHTML=on?'⛶ <span>收起</span>':'⛶ <span>展开</span>';requestAnimationFrame(fit);});
  viewport.addEventListener('wheel',e=>{if(e.target.closest('button'))return;e.preventDefault();const r=viewport.getBoundingClientRect();zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003),e.clientX-r.left,e.clientY-r.top);},{passive:false});
  viewport.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,tx,ty};didDrag=false;});
  viewport.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4){didDrag=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');hideTooltip();}if(didDrag){tx=drag.tx+dx;ty=drag.ty+dy;apply();setRegion(null);}});
  function stopDrag(e){if(!drag||e.pointerId!==drag.id)return;drag=null;viewport.classList.remove('dragging');if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);setTimeout(()=>{didDrag=false;},0);}
  viewport.addEventListener('pointerup',stopDrag);viewport.addEventListener('pointercancel',stopDrag);
  viewport.addEventListener('keydown',e=>{if(e.target.closest('[data-node]'))return;const step=50;switch(e.key){case '+':case '=':zoom(1.25);break;case '-':zoom(.8);break;case '0':fit();break;case 'ArrowLeft':tx+=step;apply();break;case 'ArrowRight':tx-=step;apply();break;case 'ArrowUp':ty+=step;apply();break;case 'ArrowDown':ty-=step;apply();break;default:return;}e.preventDefault();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideTooltip();$('#inspector').classList.remove('open');if(pinned){pinned=false;renderDetail(nodes.get(selected));}}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}});
  new ResizeObserver(()=>fit()).observe(viewport);
  renderList();select(items.find(n=>n.name==='蚁王') || items[0]);requestAnimationFrame(fit);
})();
