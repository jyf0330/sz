const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'verification');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({offline:true,viewport:{width:1500,height:1050}}),page=await context.newPage();
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 // Only the share file is copied. All checks run with network disabled.
 const isolated=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'atlas-v2-')),'share.html');fs.copyFileSync(path.join(root,'交互关系_单文件分享版.html'),isolated);
 await page.goto('file://'+isolated);
 assert.equal(await page.locator('.nav-item').count(),9);assert.equal(await page.locator('.flow-row').count(),6);
 await page.locator('[data-mechanism="burn"]').click();await page.getByRole('button',{name:'火球，查看最低品质详情',exact:true}).click();assert.match(await page.locator('#detail').innerText(),/点燃6/);
 for(const id of ['burn','poison','shield','energy','ammo','critical','status','tempo','healing']){
  await page.locator(`[data-mechanism="${id}"]`).click();
  assert.equal(await page.locator('.flow-row').count(),6);
  // Every rendered statement is checked against the source-loaded rule, not an invented summary.
  assert.ok(await page.evaluate(id=>{const m=window.ATLAS_DATA.mechanisms.find(m=>m.id===id);return m.rules.every(r=>{const row=document.querySelector(`[data-rule="${r.id}"]`);return row.querySelector('.result-text').textContent===r.result&&row.querySelector('.flow-item strong').textContent===r.item})},id));
 }
 await page.locator('[data-mechanism="burn"]').click();
 const fire=page.getByRole('button',{name:'火球，查看最低品质详情',exact:true});
 await fire.hover();await page.locator('#tooltip').waitFor({state:'visible'});
 assert.match(await page.locator('#tooltip').innerText(),/点燃6/);
 await page.locator('#tooltip').hover();await page.waitForTimeout(220);assert.ok(await page.locator('#tooltip').isVisible());await page.keyboard.press('Escape');
 await fire.click();assert.ok(await page.locator('#unpin').isVisible());
 await page.locator('[data-inspect="item-8"]').first().hover();assert.match(await page.locator('.detail-name').innerText(),/火球/);
 await page.locator('#unpin').click();await page.keyboard.press('Escape');
 await page.locator('[data-evidence="burn-3"]').click();assert.match(await page.locator('#detail').innerText(),/自身发动攻击并触发灼烧伤害时/);assert.ok(await page.locator('.evidence-box').isVisible());
 await page.locator('#all-items').click();assert.equal(await page.locator('.catalog-card').count(),100);
 await page.locator('[data-kind="灵兽"]').click();assert.equal(await page.locator('.catalog-card').count(),25);
 await page.locator('[data-kind="技能"]').click();assert.equal(await page.locator('.catalog-card').count(),75);
 await page.locator('[data-kind="全部"]').click();
 for(const [name,tier]of[['鲛人抢手','白银'],['钩链','白银'],['快速换弹','青铜'],['蛇影寒','青铜'],['通灵钟','黄金'],['黄金飞梭','黄金']]){
  await page.locator('#search').fill(name);await page.getByRole('button',{name:`${name}，查看最低品质详情`,exact:true}).click();assert.equal(await page.locator('.detail-name').innerText(),name);assert.match(await page.locator('#detail').innerText(),new RegExp(tier+' · 最低品质'));
 }
 await page.locator('#search').fill('没有此物');assert.equal(await page.locator('.catalog-card').count(),0);assert.ok(await page.locator('.no-results').isVisible());
 await page.locator('#search').fill('');await page.locator('#diagram-tab').click();
 await page.locator('#zoom-in').click();const big=await page.locator('#zoom-value').innerText();await page.locator('#zoom-out').click();assert.notEqual(big,await page.locator('#zoom-value').innerText());await page.locator('#fit').click();
 await page.locator('#expand').click();assert.ok(await page.locator('body.expanded').count());await page.keyboard.press('Escape');assert.equal(await page.locator('body.expanded').count(),0);
 await fire.focus();await page.keyboard.press('Enter');assert.match(await page.locator('#detail').innerText(),/已固定/);
 await page.locator('#graph-viewport').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(out,'desktop-v2.png'),fullPage:true});
 const attachmentLinks=page.locator('[data-attachment]');assert.equal(await attachmentLinks.count(),2);
 for(const name of ['交互关系.pdf','新数值.xlsx']){const bytes=await page.locator(`[data-attachment="${name}"]`).evaluate(async a=>Array.from(new Uint8Array(await(await fetch(a.href)).arrayBuffer())));assert.deepEqual(Buffer.from(bytes),fs.readFileSync(path.join(root,'source',name)));}
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-attachment="新数值.xlsx"]').click();assert.equal((await downloadPromise).suggestedFilename(),'新数值.xlsx');
 await page.setViewportSize({width:390,height:844});await page.locator('#graph-viewport').evaluate(el=>{el.scrollTop=0;el.scrollLeft=0});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.ok(await page.locator('#graph-viewport').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await page.screenshot({path:path.join(out,'mobile-v2.png'),fullPage:true});
 await fire.click();assert.ok(await page.locator('#inspector').isVisible());assert.match(await page.locator('#detail').innerText(),/点燃6/);await page.screenshot({path:path.join(out,'mobile-detail-v2.png'),fullPage:true});await page.locator('#close-detail').click();assert.ok(await page.locator('#inspector').isHidden());
 await page.locator('#all-items').click();assert.equal(await page.locator('.catalog-card').count(),100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith('file:')||r.startsWith('blob:')));
 const result={status:'PASS',rules:54,items:100,offlineIsolatedShareFile:true,checks:['9 类机制及逐条原文渲染','悬停与浮层保持','点击固定与证据','100 件物品、分类、搜索与空结果','原表名称及黄金起始品质','缩放、展开、键盘','手机纵向流程与详情、无横向溢出','内嵌 PDF / Excel 字节与下载'],pageErrors:errors,externalRequests:requests.filter(r=>!r.startsWith('file:')&&!r.startsWith('blob:'))};fs.writeFileSync(path.join(out,'browser-results-v2.json'),JSON.stringify(result,null,2));console.log(result);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
