import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire((process.env.AQ_WEB_REPO ?? '/private/tmp/aeroquetzal-phase4-review')+'/package.json');
const {chromium}=require('@playwright/test');
const base=process.env.AQ_PANEL_URL ?? 'http://127.0.0.1:18088';
const browser=await chromium.launch({headless:true});
const failures=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',error=>failures.push(error.message));
try {
 await page.goto(base,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#notice').classList.contains('good'));
 assert.equal(await page.title(),'AeroQuetzal · Observatorio SNMP');
 const metrics=await (await page.request.get(base+'/data/metrics.json')).json();
 const history=await (await page.request.get(base+'/data/history.json')).json();
 assert(metrics.targets.edge.ok && metrics.targets.core.ok);
 assert(history.length>=2,'Las gráficas necesitan por lo menos dos muestras reales');
 for(const host of ['edge','core']) {
  assert(metrics.targets[host].interfaces.length>0);
  assert(Number.isFinite(metrics.targets[host].memory_used_percent));
 }
 assert(await page.locator('svg path.series').count()>=3,'Faltan gráficas de historial');
 await page.getByRole('button',{name:'02 / core-app'}).click();
 assert((await page.locator('#agent-address').textContent()).includes('10.10.0.49'));
 assert(await page.locator('#interfaces-body tr').count()>0);
 await page.locator('#window').selectOption('86400');
 await page.screenshot({path:'/private/tmp/aq-snmp-panel-preview.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desbordamiento horizontal en móvil');
 await page.screenshot({path:'/private/tmp/aq-snmp-panel-mobile.png',fullPage:true});
 assert.deepEqual(failures,[]);
 const result={passed:true,desktop:true,mobile:true,history_samples:history.length,targets:Object.keys(metrics.targets),charts:await page.locator('svg path.series').count(),javascript_errors:failures};
 await writeFile(new URL('../validacion-panel.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
} finally {await browser.close();}
