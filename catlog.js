window.CATLOG=(function(){
'use strict';
let Y=null;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);

function items(c){
  const s=S(),out=[];
  const hs=s.habits.filter(h=>h.categoryId===c.id);
  hs.filter(h=>!h.parentId).forEach(h=>{
    out.push({key:'h|'+h.id,label:`${h.emoji||'🌱'} ${h.name}`,sub:h.measure==='minutes'?'szokás · perc':'szokás'});
    hs.filter(x=>x.parentId===h.id).forEach(x=>out.push({key:'h|'+x.id,label:`↳ ${x.emoji||''} ${x.name}`,sub:'alszokás'}));
  });
  const hids=new Set(hs.map(h=>h.id)),gids=new Set((s.taskGroups||[]).filter(g=>g.categoryId===c.id).map(g=>g.id));
  (s.milestones||[]).filter(m=>!m.archived&&!m.completedAt&&m.kind==='feladat'&&((m.habitId&&hids.has(m.habitId))||(m.groupId&&gids.has(m.groupId)))).forEach(m=>{
    const open=(m.tasks||[]).filter(t=>!t.completedAt);
    if(open.length)open.forEach(t=>out.push({key:'t|'+m.id+'|'+t.id,label:`📋 ${t.name}`,sub:m.name}));
    else out.push({key:'m|'+m.id,label:`🎯 ${m.name}`,sub:'feladat'});
  });
  (s.events||[]).filter(e=>e.categoryId===c.id).forEach(e=>out.push({key:'e|'+e.id,label:`${e.emoji||'📔'} ${e.name}`,sub:e.parentId?'al-esemény':'esemény'}));
  return out;
}

function minDate(){const d=new Date(Y.today()+'T12:00:00');d.setDate(d.getDate()-2);return d.toLocaleDateString('sv-SE')}
function card(c){
  return`<div class="card catlog" data-catlog="${c.id}"><h3>⏱ Idő könyvelése</h3><div class="catlog-row"><input type="number" min="0" step="any" class="catlog-amount" placeholder="pl. 7" inputmode="decimal"><select class="catlog-unit"><option value="60">óra</option><option value="1">perc</option></select><input type="date" class="catlog-date" value="${Y.today()}" min="${minDate()}" max="${Y.today()}"></div><div class="catlog-row"><button class="btn small" data-catlog-general="${c.id}">Általános</button><button class="btn primary small" data-catlog-specific="${c.id}">Specifikus</button></div><div class="catlog-list" style="display:none"></div><p class="vow-note" style="margin:8px 0 0">Általános: az egész idő a kategóriára megy. Specifikus: szétosztod a kategória szokásai, feladatai és eseményei között – a maradék általánosként könyvelődik.</p></div>`;
}
function minutesOf(root){const a=Number(root.querySelector('.catlog-amount').value)||0,u=Number(root.querySelector('.catlog-unit').value)||1;return Math.round(a*u)}
function dateOf(root){const d=root.querySelector('.catlog-date').value||Y.today();return d}

function renderList(root,c){
  const list=root.querySelector('.catlog-list'),total=minutesOf(root),it=items(c);
  if(!it.length){list.innerHTML='<div class="empty" style="padding:12px">Ehhez a kategóriához nincs szokás, feladat vagy esemény – használd az Általánost.</div>';list.style.display='';return}
  list.innerHTML=`<div class="catlog-items">${it.map(x=>`<label class="catlog-item"><span class="grow"><b>${esc(x.label)}</b><small>${esc(x.sub||'')}</small></span><input type="number" min="0" step="5" inputmode="numeric" data-catlog-min="${x.key}" placeholder="perc"></label>`).join('')}</div><div class="catlog-sum"><span>Szétosztva: <b class="catlog-sumv">0</b> / ${total} perc</span><label style="display:inline-flex;gap:6px;align-items:center;font-weight:600"><input type="checkbox" class="catlog-rest" checked> maradék általánosként</label><button class="btn primary small" data-catlog-save="${c.id}">Mentés</button></div>`;
  list.style.display='';
  const sumEl=list.querySelector('.catlog-sumv');
  list.querySelectorAll('[data-catlog-min]').forEach(i=>i.oninput=()=>{const s=[...list.querySelectorAll('[data-catlog-min]')].reduce((a,x)=>a+(Number(x.value)||0),0);sumEl.textContent=s;sumEl.style.color=s>total?'var(--danger)':''});
  list.querySelector('[data-catlog-save]').onclick=()=>saveSpecific(root,c);
  const first=list.querySelector('[data-catlog-min]');if(first)first.focus();
}

function bookItem(c,date,key,min){
  const s=S(),p=key.split('|');
  if(p[0]==='h'){const h=s.habits.find(x=>x.id===p[1]);if(!h)return;
    if(h.measure==='minutes'){Y.setLog(h.id,date,Y.getLog(h.id,date)+min);return}
    Y.catLogAdd(c.id,date,min);Y.addEntry({kind:'catlog',catId:c.id,habitId:h.id,date,minutes:min,source:'catlog'});return}
  if(p[0]==='e'){Y.addEntry({kind:'event',eventId:p[1],date,time:'',minutes:min,source:'catlog'});return}
  Y.catLogAdd(c.id,date,min);Y.addEntry({kind:'catlog',catId:c.id,mid:p[1],tid:p[2]||'',date,minutes:min,source:'catlog'});
}
function saveGeneral(root,c){
  const total=minutesOf(root),date=dateOf(root);
  if(!total)return Y.toast('Írd be, mennyi időt.');
  Y.catLogAdd(c.id,date,total);Y.save();Y.render();Y.toast(`${c.name}: +${total} perc (${date})`);
}
function saveSpecific(root,c){
  const total=minutesOf(root),date=dateOf(root),list=root.querySelector('.catlog-list');
  const rows=[...list.querySelectorAll('[data-catlog-min]')].map(i=>({key:i.dataset.catlogMin,min:Math.round(Number(i.value)||0)})).filter(r=>r.min>0);
  const sum=rows.reduce((a,r)=>a+r.min,0);
  if(!rows.length&&!total)return Y.toast('Írd be, mennyi időt.');
  if(sum>total&&total)return Y.toast('Több van szétosztva, mint a teljes idő.');
  rows.forEach(r=>bookItem(c,date,r.key,r.min));
  const rest=total-sum;
  if(rest>0&&list.querySelector('.catlog-rest').checked)Y.catLogAdd(c.id,date,rest);
  Y.save();Y.render();Y.toast(`${c.name}: ${rows.length} tétel + ${rest>0?rest+' perc általános':'nincs maradék'} (${date})`);
}

function bind(){
  document.querySelectorAll('[data-catlog]').forEach(root=>{
    const c=S().categories.find(x=>x.id===root.dataset.catlog);if(!c)return;
    root.querySelector('[data-catlog-general]').onclick=()=>saveGeneral(root,c);
    root.querySelector('[data-catlog-specific]').onclick=()=>{if(!minutesOf(root))return Y.toast('Előbb írd be a teljes időt.');renderList(root,c)};
  });
}
return{init,card,bind,items};
})();
