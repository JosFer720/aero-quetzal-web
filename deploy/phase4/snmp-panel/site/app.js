'use strict';
let target = 'edge', metrics = null, history = [], busy = false;
const $ = id => document.getElementById(id);
const clock = value => new Intl.DateTimeFormat('es-GT',{timeZone:'America/Guatemala',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
const decimal = (value,digits=2) => Number.isFinite(value) ? value.toLocaleString('es-GT',{maximumFractionDigits:digits,minimumFractionDigits:digits}) : '—';
const set = (id,value) => {$(id).textContent=value;};
const svgNode = (name,attrs,text) => {const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
function bytes(value){if(!Number.isFinite(value))return '—';for(const [divisor,label] of [[2**40,'TiB'],[2**30,'GiB'],[2**20,'MiB'],[2**10,'KiB']])if(value>=divisor)return decimal(value/divisor,1)+' '+label;return value+' B';}
function uptime(ticks){if(!Number.isFinite(ticks))return '—';const seconds=ticks/100;return Math.floor(seconds/86400)+'d '+Math.floor(seconds%86400/3600)+'h '+Math.floor(seconds%3600/60)+'m';}
function chart(id,keys,fixedMaximum){
 const svg=$(id);svg.replaceChildren();const width=id==='traffic-chart'?1200:600,height=id==='traffic-chart'?230:220;
 const left=44,right=16,top=12,bottom=31,w=width-left-right,h=height-top-bottom;
 const cutoff=Date.now()-Number($('window').value)*1000;
 const samples=history.filter(row=>Date.parse(row.timestamp)>=cutoff),values=samples.flatMap(row=>keys.map(key=>row.targets[target]?.[key])).filter(Number.isFinite);
 const max=fixedMaximum||Math.max(id==='traffic-chart'?0.001:1,...values)*1.15;
 const digits=max<0.1?3:max<1?2:max>10?0:1;
 for(let i=0;i<5;i++){const y=top+h*i/4;svg.append(svgNode('line',{x1:left,x2:width-right,y1:y,y2:y,class:'grid-line'}));svg.append(svgNode('text',{x:left-8,y:y+4,'text-anchor':'end'},decimal(max*(1-i/4),digits)));}
 if(!samples.length||!values.length){svg.append(svgNode('text',{x:width/2,y:height/2,'text-anchor':'middle'},'Esperando muestras SNMP reales…'));return;}
 const start=Date.parse(samples[0].timestamp),end=Math.max(start+60000,Date.parse(samples.at(-1).timestamp));
 keys.forEach((key,series)=>{let path='',last=false,valid=0,only;
  for(const row of samples){const value=row.targets[target]?.[key];if(!Number.isFinite(value)){last=false;continue;}const x=left+(Date.parse(row.timestamp)-start)/(end-start)*w,y=top+h-Math.min(max,Math.max(0,value))/max*h;path+=(last?'L':'M')+x.toFixed(2)+','+y.toFixed(2)+' ';last=true;only={x,y};valid++;}
  if(path)svg.append(svgNode('path',{d:path.trim(),class:'series'+(series?' tx':'')}));
  if(valid===1)svg.append(svgNode('circle',{cx:only.x,cy:only.y,r:3,class:'series'+(series?' tx':'')}));
 });
 svg.append(svgNode('text',{x:left,y:height-5},clock(start)));svg.append(svgNode('text',{x:width-right,y:height-5,'text-anchor':'end'},clock(end)));
}
function render(){
 if(!metrics)return;
 const row=metrics.targets[target],age=(Date.now()-Date.parse(metrics.timestamp))/1000;
 const stale=age>150,notice=$('notice');notice.className='notice '+(!row.ok?'error':stale?'warning':'good');
 notice.textContent=!row.ok?'El agente no respondió. Se conserva el historial; las métricas actuales pueden no estar disponibles.':stale?'La última muestra está atrasada. Revisa el colector; no se están inventando valores nuevos.':'Colector activo · '+history.length+' muestras guardadas · Actualización cada 60 segundos';
 set('agent-state',row.ok?(stale?'Atrasado':'Disponible'):'Sin respuesta');set('agent-address',row.address+':161 · sólo lectura');set('load',decimal(row.load_1min));set('memory',decimal(row.memory_used_percent,1)+(Number.isFinite(row.memory_used_percent)?' %':''));set('memory-total',decimal(row.memory_total_mib,0)+' MiB totales · sin buffers/caché');set('uptime',uptime(row.uptime_ticks));set('interfaces-count',(row.interface_count??'—')+' interfaces registradas');set('last-update','Última muestra · '+clock(metrics.timestamp)+' GT');
 set('uplink',(target==='edge'?'eth0 · enlace público':'enp7s0 · enlace privado')+' / Mbps promedio del intervalo');
 document.querySelectorAll('[data-target]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.target===target)));
 chart('load-chart',['load_1min']);chart('memory-chart',['memory_used_percent'],100);chart('traffic-chart',['rx_mbps','tx_mbps']);
 const body=$('interfaces-body');body.replaceChildren();const reserved=new Set(['br-disponib','br-perimetro']);
 for(const iface of row.interfaces){const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=iface.name;tr.append(name);const status=document.createElement('td'),badge=document.createElement('span');badge.className='state'+(iface.up?'':reserved.has(iface.name)?' reserved':' down');badge.textContent=iface.up?'ACTIVA':reserved.has(iface.name)?'RESERVADA':'INACTIVA';status.append(badge);tr.append(status);
  for(const value of [decimal(iface.rx_mbps,3)+' Mbps',decimal(iface.tx_mbps,3)+' Mbps',bytes(iface.rx_bytes),bytes(iface.tx_bytes)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}body.append(tr);
 }
 if(!row.interfaces.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.textContent='No hay datos de interfaces para esta muestra.';tr.append(td);body.append(tr);}
 set('link-summary',row.interfaces.filter(x=>x.up).length+' / '+row.interfaces.length+' ACTIVAS');
}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{const responses=await Promise.all(['/data/metrics.json','/data/history.json'].map(url=>fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)})));if(responses.some(x=>!x.ok))throw new Error('Datos no disponibles');const [current,past]=await Promise.all(responses.map(x=>x.json()));if(!current.timestamp||!current.targets?.edge||!current.targets?.core||!Array.isArray(past))throw new Error('Formato no válido');metrics=current;history=past;render();}
 catch(error){$('notice').className='notice error';$('notice').textContent='No se pudo actualizar el panel. '+(metrics?'Se muestran los últimos datos recibidos. ':'')+'Intenta de nuevo o revisa el colector.';}
 finally{busy=false;$('refresh').disabled=false;}
}
document.querySelectorAll('[data-target]').forEach(button=>button.addEventListener('click',()=>{target=button.dataset.target;render();}));$('window').addEventListener('change',render);$('refresh').addEventListener('click',refresh);refresh();setInterval(refresh,30000);
