window.TODOS=(function(){
'use strict';
let Y=null,showDone=false;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
const LISTS=[{key:'ma',name:'Ma',emoji:'☀️',hint:'Amit ma elintézel – ez látszik a kezdőlapon.'},{key:'holnap',name:'Holnap',emoji:'🌅',hint:'Amit a következő napon elintézel – éjfél után átkerül a Ma listába.'},{key:'heten',name:'Héten',emoji:'📆',hint:'Ezen a héten sorra kerül.'},{key:'majd',name:'Majd',emoji:'🗂️',hint:'Gyűjtő – amikor lesz rá idő.'}];
// one milestone (kind feladat) per list under the Todok intézése habit holds the todos
function bucket(key,create){
  const hid=Y.todoHabitId(),L=LISTS.find(l=>l.key===key);
  let m=S().milestones.find(x=>x.todoList===key&&!x.archived);
  if(!m&&create){m={id:Y.uid(),habitId:hid,kind:'feladat',type:'tasks',amount:0,startedAt:Y.today(),name:L.name,deadline:'',xp:0,archived:false,completedAt:'',tasks:[],todoList:key};S().milestones.push(m)}
  return m||null;
}
const localToday=()=>Y?Y.today():new Date(Date.now()-(window.DAY_START_MIN||0)*60000).toLocaleDateString('sv-SE');
const luid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-6);
// a new day: the open items of Holnap become today's list; also de-duplicate a task that
// a sync merge may have left in two lists (the Ma copy wins)
function roll(s){
  const d=localToday(),ms=s.milestones||[];
  if(s.todoRoll!==d){
    const from=ms.find(x=>x.todoList==='holnap'&&!x.archived);
    if(from&&(from.tasks||[]).some(t=>!t.completedAt)){
      let to=ms.find(x=>x.todoList==='ma'&&!x.archived);
      if(!to){to={id:luid(),habitId:from.habitId,kind:'feladat',type:'tasks',amount:0,startedAt:d,name:'Ma',deadline:'',xp:0,archived:false,completedAt:'',tasks:[],todoList:'ma'};ms.push(to)}
      to.tasks=(to.tasks||[]).concat(from.tasks.filter(t=>!t.completedAt));from.tasks=from.tasks.filter(t=>t.completedAt);
    }
    s.todoRoll=d;
  }
  const seen=new Set();
  ms.filter(x=>x.todoList&&!x.archived).sort((a,b)=>(a.todoList==='ma'?0:1)-(b.todoList==='ma'?0:1)).forEach(m=>{m.tasks=(m.tasks||[]).filter(t=>{if(seen.has(t.id))return false;seen.add(t.id);return true})});
}
function migrate(s){try{roll(s)}catch(e){}}
// the home card: today's list, open items first, then the ones finished today
function todayItems(){
  roll(S());const m=bucket('ma',false);if(!m)return[];const d=Y.today();
  const open=(m.tasks||[]).filter(t=>!t.completedAt),done=(m.tasks||[]).filter(t=>t.completedAt&&String(t.completedAt).slice(0,10)===d);
  return open.concat(done).map(t=>({m,t,done:!!t.completedAt}));
}
function counts(){const out={};LISTS.forEach(l=>{const m=(s=>s.milestones.find(x=>x.todoList===l.key&&!x.archived))(S());out[l.key]=m?(m.tasks||[]).filter(t=>!t.completedAt).length:0});return out}
function mapsOf(m,t){const ref=m.id+'|'+t.id;return S().pmaps.filter(p=>p.nodes.some(n=>n.ref===ref))}
function taskRow(m,t){
  const done=!!t.completedAt,maps=mapsOf(m,t);
  return`<div class="todo-row ${done?'done':''}" draggable="true" data-todo-drag="${m.id}|${t.id}"><input type="checkbox" data-todo-tick="${m.id}|${t.id}" ${done?'checked':''}><span class="grow todo-name" data-todo-edit="${m.id}|${t.id}">${esc(t.name)}${maps.length?` <span class="todo-map" title="${esc(maps.map(p=>p.name).join(', '))} térkép állomása">🗺️</span>`:''}${t.deadline?`<small>📅 ${t.deadline}</small>`:''}</span><span class="todo-actions"><button type="button" class="btn small" data-todo-plan="${m.id}|${t.id}" title="Napitervbe">📅</button><select class="todo-move" data-todo-move="${m.id}|${t.id}" title="Áthelyezés">${LISTS.map(l=>`<option value="${l.key}" ${m.todoList===l.key?'selected':''}>${l.emoji}</option>`).join('')}</select><button type="button" class="btn small" data-todo-del="${m.id}|${t.id}" title="Törlés">🗑️</button></span></div>`;
}
function view(){
  roll(S());
  const hid=Y.todoHabitId(),h=S().habits.find(x=>x.id===hid);
  const doneToday=S().entries.filter(en=>en.kind==='task'&&en.date===Y.today()&&en.habitId===hid).length;
  const cols=LISTS.map(l=>{const m=bucket(l.key,false),tasks=m?(m.tasks||[]):[],open=tasks.filter(t=>!t.completedAt),done=tasks.filter(t=>t.completedAt).sort((a,b)=>a.completedAt<b.completedAt?1:-1);
    return`<div class="card todo-col" data-todo-col="${l.key}"><div class="section" style="margin:0 0 6px"><h3>${l.emoji} ${l.name}</h3><span class="chip">${open.length}</span>${l.key==='ma'?'<button type="button" class="btn small" data-todo-pull title="A Holnap lista nyitott teendői átkerülnek ide">⬇ Holnap</button>':''}</div><p class="vow-note" style="margin:0 0 8px">${l.hint}</p><form class="todo-add" data-todo-add="${l.key}"><input placeholder="+ új teendő… (Enter)" autocomplete="off"><button class="btn primary small" type="submit">+</button></form><div class="todo-list">${open.length?open.map(t=>taskRow(m,t)).join(''):'<div class="todo-empty">üres</div>'}</div>${done.length?`<details class="todo-done" ${showDone?'open':''}><summary>${done.length} kész</summary>${done.slice(0,30).map(t=>taskRow(m,t)).join('')}</details>`:''}</div>`}).join('');
  const head=Y.top('✅ Feladatok',`Teendők négy listában – a Ma lista a kezdőlapon is látszik. Amit itt kipipálsz, az a <b>${esc(h?h.name:'Todok intézése')}</b> szokáshoz könyvelődik${h&&h.measure==='check'&&Number(h.target)>1?` (napi cél: ${h.target} alkalom)`:''}.`,`<button class="btn" data-go="activities">← Tevékenységek</button><button class="btn" data-go="groups">🧰 Feladatcsoportok</button>`);
  return head+`<div class="chips" style="margin-bottom:12px"><span class="chip">ma kipipálva: ${doneToday}${h&&h.measure==='check'?` / ${h.target}`:''}</span></div><div class="todo-grid">${cols}</div>`;
}
function tick(mid,tid){
  const m=S().milestones.find(x=>x.id===mid),t=m&&(m.tasks||[]).find(x=>x.id===tid);if(!t)return;
  const hid=Y.todoHabitId(),h=S().habits.find(x=>x.id===hid),d=Y.today();
  Y.toggleTask(mid,tid);       // completedAt, entry, XP, sync – the app's own path
  if(h&&h.measure!=='minutes'){const cur=Y.getLog(hid,d);if(t.completedAt){Y.setLog(hid,d,cur+1)}else{const nv=Math.max(0,cur-1);if(nv>0)Y.setLog(hid,d,nv);else Y.clearLog(hid,d)}}
}
function bind(){
  const q=s=>document.querySelectorAll(s);
  q('[data-todo-add]').forEach(f=>f.onsubmit=e=>{e.preventDefault();const inp=f.querySelector('input'),name=inp.value.trim();if(!name)return;const m=bucket(f.dataset.todoAdd,true);m.tasks.push({id:Y.uid(),name,type:'📅',deadline:'',highlighted:false,completedAt:'',subtasks:[]});Y.save();Y.render();setTimeout(()=>{const nf=document.querySelector(`[data-todo-add="${f.dataset.todoAdd}"] input`);if(nf)nf.focus()},0)});
  q('[data-todo-tick]').forEach(c=>c.onchange=()=>{const[mid,tid]=c.dataset.todoTick.split('|');tick(mid,tid)});
  q('[data-todo-del]').forEach(b=>b.onclick=()=>{const[mid,tid]=b.dataset.todoDel.split('|');const m=S().milestones.find(x=>x.id===mid);if(!m)return;m.tasks=m.tasks.filter(x=>x.id!==tid);Y.save();Y.render()});
  q('[data-todo-edit]').forEach(el=>el.onclick=()=>{const[mid,tid]=el.dataset.todoEdit.split('|');const m=S().milestones.find(x=>x.id===mid),t=m&&m.tasks.find(x=>x.id===tid);if(!t)return;const v=prompt('Teendő neve',t.name);if(v===null)return;t.name=v.trim()||t.name;const dl=prompt('Határidő (ÉÉÉÉ-HH-NN, üres = nincs)',t.deadline||'');if(dl!==null)t.deadline=/^\d{4}-\d{2}-\d{2}$/.test(dl.trim())?dl.trim():'';Y.save();Y.render()});
  const move=(mid,tid,key)=>{const m=S().milestones.find(x=>x.id===mid),t=m&&m.tasks.find(x=>x.id===tid);if(!t||m.todoList===key)return;m.tasks=m.tasks.filter(x=>x.id!==tid);bucket(key,true).tasks.push(t);Y.save();Y.render()};
  q('[data-todo-move]').forEach(s=>s.onchange=()=>{const[mid,tid]=s.dataset.todoMove.split('|');move(mid,tid,s.value)});
  q('[data-todo-plan]').forEach(b=>b.onclick=()=>{const[mid,tid]=b.dataset.todoPlan.split('|');Y.planTaskModal(mid,tid)});
  q('[data-todo-pull]').forEach(b=>b.onclick=()=>{const from=bucket('holnap',false);if(!from||!(from.tasks||[]).some(t=>!t.completedAt))return Y.toast('A Holnap lista üres.');const to=bucket('ma',true),open=from.tasks.filter(t=>!t.completedAt);to.tasks=to.tasks.concat(open);from.tasks=from.tasks.filter(t=>t.completedAt);Y.save();Y.render();Y.toast(`${open.length} teendő átkerült a Ma listába`)});
  let drag=null;
  q('[data-todo-drag]').forEach(r=>{r.addEventListener('dragstart',e=>{drag=r.dataset.todoDrag;r.classList.add('dragging');e.dataTransfer.effectAllowed='move'});r.addEventListener('dragend',()=>{r.classList.remove('dragging');q('.todo-col.over').forEach(x=>x.classList.remove('over'))})});
  q('[data-todo-col]').forEach(col=>{col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('over')});col.addEventListener('dragleave',()=>col.classList.remove('over'));col.addEventListener('drop',e=>{e.preventDefault();if(!drag)return;const[mid,tid]=drag.split('|');drag=null;move(mid,tid,col.dataset.todoCol)})});
  q('details.todo-done').forEach(d=>d.ontoggle=()=>{showDone=d.open});
}
return{init,migrate,view,bind,counts,todayItems,LISTS};
})();
