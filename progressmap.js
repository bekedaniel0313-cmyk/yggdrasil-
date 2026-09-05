window.PMAP=(function(){
'use strict';
let Y=null,cur='',focusStage='',single=null,resizeBound=false;
const LANE_COLORS=['#497a55','#4a7cc0','#c07f3a','#9a5fb5','#c05a5a','#3f9a8f','#7a6bd0','#b5677f'];
const S=()=>Y.state();
const esc=s=>Y.esc(s);

function init(bridge){Y=bridge}

function migrate(s){
  s.pmaps=s.pmaps||[];
  s.pmaps.forEach(p=>{
    p.emoji=p.emoji||'🗺️';
    p.description=p.description||'';
    p.fragmentPrice=Number(p.fragmentPrice)||5000;
    p.lanes=p.lanes||[];p.stages=p.stages||[];p.nodes=p.nodes||[];p.rewards=p.rewards||[];p.log=p.log||[];
    p.lanes.forEach((l,i)=>{if(!l.color)l.color=LANE_COLORS[i%LANE_COLORS.length]});
    p.stages.forEach(st=>{st.gift=Number(st.gift)||0;st.giftOpened=!!st.giftOpened});
    p.nodes.forEach(n=>{n.ref=n.ref||'';n.deps=n.deps||[];n.required=!!n.required;n.gift=Number(n.gift)||0;n.giftOpened=!!n.giftOpened;n.val=Number(n.val)||0;n.target=Number(n.target)||0;n.done=!!n.done});
    p.rewards.forEach(r=>{r.price=Number(r.price)||0;r.fragments=Math.max(1,Number(r.fragments)||1);r.collected=Number(r.collected)||0;r.unlockedAt=r.unlockedAt||''});
  });
}

function leave(){cur='';focusStage=''}
function project(){return S().pmaps.find(p=>p.id===cur)}
function openProject(id){cur=id;focusStage='';Y.show('pmapDetail')}

function linkedTask(n){
  if(!n.ref)return null;
  const [mid,tid]=n.ref.split('|');
  const m=S().milestones.find(x=>x.id===mid);
  const t=m&&(m.tasks||[]).find(x=>x.id===tid);
  return t?{m,t}:null;
}
function nodeDone(n){const lt=linkedTask(n);return lt?!!lt.t.completedAt:n.done}
function nodeProgress(n){
  const lt=linkedTask(n);
  if(lt&&(lt.t.subtasks||[]).length)return{val:lt.t.subtasks.filter(s=>s.completedAt).length,target:lt.t.subtasks.length};
  if(n.target>0)return{val:n.val,target:n.target};
  return null;
}
function stageNodes(p,sid){return p.nodes.filter(n=>n.stageId===sid)}
function stageUnlocked(p,i){
  if(i<=0)return true;
  if(!stageUnlocked(p,i-1))return false;
  return stageNodes(p,p.stages[i-1].id).filter(n=>n.required).every(nodeDone);
}
function stageComplete(p,i){const ns=stageNodes(p,p.stages[i].id);return stageUnlocked(p,i)&&ns.length>0&&ns.every(nodeDone)}
function activeStageIndex(p){
  for(let i=0;i<p.stages.length;i++){if(stageUnlocked(p,i)&&!stageComplete(p,i))return i}
  return Math.max(0,p.stages.length-1);
}
function depsMet(p,n){return n.deps.every(id=>{const d=p.nodes.find(x=>x.id===id);return!d||nodeDone(d)})}
function stageIdx(p,sid){return p.stages.findIndex(s=>s.id===sid)}

function useSingle(){return single==null?window.innerWidth<900:single}

/* ---------- views ---------- */
function list(){
  const ps=S().pmaps;
  return Y.top('Térképek','Projektek párhuzamos pályákkal, stációkkal és ajándékokkal.','<button class="btn" data-pm-prompt>📋 Prompt Claude-nak</button><button class="btn" data-pm-import>📥 Importálás</button><button class="btn primary" data-pm-new-project>+ Új projekt</button>')+
  (ps.length?`<div class="grid g2">${ps.map(p=>{
    const done=p.nodes.filter(nodeDone).length,total=p.nodes.length,pct=total?Math.round(done/total*100):0;
    const stDone=p.stages.filter((s,i)=>stageComplete(p,i)).length,ai=activeStageIndex(p),act=p.stages[ai];
    const unlocked=p.rewards.filter(r=>r.unlockedAt).length;
    return`<div class="card habit-card habit-click" data-pm-open="${p.id}"><div class="row" style="border:0;padding:0"><div class="thumb">${p.emoji}</div><div class="grow"><h4>${esc(p.name)}</h4><p>${esc(p.description||(act?'Aktuális: '+act.name:'Még nincs stáció'))}</p><div class="chips"><span class="chip">${stDone} / ${p.stages.length} stáció</span><span class="chip">${done} / ${total} állomás</span><span class="chip">🎁 ${unlocked} / ${p.rewards.length}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div><button class="btn small" data-pm-edit-project="${p.id}">✏️</button><button class="btn small" data-pm-del-project="${p.id}">🗑️</button></div></div>`}).join('')}</div>`
  :'<div class="card empty">Hozd létre az első projektedet – pl. „Diplomamunka”.</div>');
}

function detail(){
  const p=project();if(!p){cur='';return list()}
  const ai=activeStageIndex(p);
  const showIdx=useSingle()?[p.stages.findIndex(s=>s.id===focusStage)>=0?p.stages.findIndex(s=>s.id===focusStage):ai]:p.stages.map((s,i)=>i);
  const done=p.nodes.filter(nodeDone).length,total=p.nodes.length;
  const actions=`<button class="btn" data-go="pmaps">← Térképek</button><button class="btn" data-pm-rewards>🎁 Ajándékok</button><button class="btn primary" data-pm-new-node>+ Állomás</button>`;
  let html=Y.top(`${p.emoji} ${esc(p.name)}`,esc(p.description||'Kattints egy állomásra a szerkesztéshez, a körre a kipipáláshoz.'),actions);
  html+=`<div class="pm-summary"><span class="chip">${done} / ${total} állomás</span><span class="chip">${p.stages.filter((s,i)=>stageComplete(p,i)).length} / ${p.stages.length} stáció</span><span class="chip">🎁 ${p.rewards.filter(r=>r.unlockedAt).length} / ${p.rewards.length} feloldva</span><span class="grow"></span><button class="btn small" data-pm-new-lane>+ Pálya</button><button class="btn small" data-pm-new-stage>+ Stáció</button><button class="btn small" data-pm-toggle-single>${useSingle()?'⟷ Minden stáció':'▣ Egy stáció'}</button><button class="btn small" data-pm-export="${p.id}">📤 Export</button><button class="btn small" data-pm-edit-project="${p.id}">✏️ Projekt</button></div>`;
  if(!p.stages.length||!p.lanes.length){
    html+=`<div class="card empty">${!p.lanes.length?'Adj hozzá legalább egy pályát (pl. Ügyintézés, Tanulás, Írás)':''}${!p.lanes.length&&!p.stages.length?' és ':''}${!p.stages.length?'legalább egy stációt':''}.</div>`;
    return html;
  }
  html+=`<div class="pm-tabs">${p.stages.map((s,i)=>`<button class="pm-tab ${showIdx.includes(i)&&useSingle()?'active':''} ${stageUnlocked(p,i)?'':'locked'}" data-pm-tab="${s.id}">${stageComplete(p,i)?'✅':stageUnlocked(p,i)?(i===ai?'▶':'○'):'🔒'} ${i+1}. ${esc(s.name)}</button>`).join('')}</div>`;
  html+=`<div class="card" style="padding:12px"><div class="pm-wrap" id="pmWrap"><div class="pm-grid" style="grid-template-columns:auto repeat(${showIdx.length},minmax(230px,1fr))">`;
  html+=`<div class="pm-corner"></div>`;
  showIdx.forEach(i=>{
    const s=p.stages[i],unl=stageUnlocked(p,i),comp=stageComplete(p,i);
    const req=stageNodes(p,s.id).filter(n=>n.required),reqDone=req.filter(nodeDone).length;
    const gift=s.gift?`<button class="pm-gift big ${s.giftOpened?'opened':comp?'ready':''}" data-pm-stage-gift="${s.id}" title="${s.giftOpened?'Már kibontva':comp?'Kibontható!':'Akkor nyílik, ha a stáció minden állomása kész'}">🎁</button>`:'';
    html+=`<div class="pm-stagehead ${unl?'':'locked'} ${comp?'complete':''}"><h4>${i+1}. ${esc(s.name)} ${gift}</h4><div class="pm-status"><span class="chip">${comp?'kész':unl?(i===ai?'aktív':'nyitott'):'zárt'}</span>${req.length?`<span class="chip" title="kötelező a továbblépéshez">⚑ ${reqDone}/${req.length}</span>`:''}<button class="btn small" data-pm-edit-stage="${s.id}">✏️</button></div></div>`;
  });
  p.lanes.forEach(l=>{
    html+=`<div class="pm-lanehead"><span class="pm-swatch" style="background:${l.color}"></span><span class="grow">${esc(l.name)}</span><button class="btn small" data-pm-edit-lane="${l.id}">✏️</button></div>`;
    showIdx.forEach(i=>{
      const s=p.stages[i],unl=stageUnlocked(p,i);
      const ns=p.nodes.filter(n=>n.laneId===l.id&&n.stageId===s.id);
      html+=`<div class="pm-cell ${unl?'':'locked'}" style="--lane:${l.color}" data-pm-cell="${l.id}|${s.id}">`;
      html+=ns.map(n=>{
        const d=nodeDone(n),blocked=!depsMet(p,n),pr=nodeProgress(n),lt=linkedTask(n);
        const cls=['pm-node',d?'done':'',!unl?'locked':'',blocked&&!d?'blocked':'',n.required?'required':''].join(' ');
        const meta=[pr?`<span>${pr.val}/${pr.target}</span>`:'',n.required?'<span class="pm-req" title="kötelező a továbblépéshez">⚑</span>':'',lt?'<span title="szokás-feladathoz kötve">🔗</span>':'',n.deps.length?`<span title="függ másik állomástól">⤴${n.deps.length}</span>`:'',n.gift?`<button class="pm-gift ${n.giftOpened?'opened':d?'ready':''}" data-pm-node-gift="${n.id}" title="${n.giftOpened?'Már kibontva':d?'Kibontható!':'Az állomás teljesítésekor nyílik'}">🎁</button>`:''].filter(Boolean).join('');
        return`<div class="${cls}" data-pm-node="${n.id}" data-pm-stage="${s.id}" draggable="true"><button class="pm-dot" data-pm-tick="${n.id}" title="${d?'Visszavonás':'Kész'}">${d?'✓':''}</button><div class="pm-label" data-pm-edit-node="${n.id}">${esc(n.name)}</div>${meta?`<div class="pm-meta">${meta}</div>`:''}${pr&&!lt&&!d?`<button class="btn small" style="margin-top:4px;padding:2px 8px" data-pm-inc="${n.id}">+1</button>`:''}</div>`}).join('');
      html+=`<button class="pm-plus" data-pm-add-node="${l.id}|${s.id}" title="Új állomás ide">+</button></div>`;
    });
  });
  html+=`</div><svg class="pm-deps" id="pmDeps"></svg></div>`;
  html+=`<div class="pm-legend"><span><i></i>nyitott</span><span><i class="done"></i>kész</span><span><i class="req"></i>kötelező a továbblépéshez</span><span><i class="lock"></i>zárt / függőségre vár</span><span>🎁 ajándékcsomag</span><span>⤴ szaggatott vonal: függőség</span></div></div>`;
  html+=`<p class="vow-note" style="margin-top:12px">Egy stáció akkor nyílik, ha az előző ⚑ kötelező állomásai készen vannak. A stáció akkor „kész”, ha minden állomása az – a nem kötelezők csúszhatnak.</p>`;
  return html;
}

function drawDeps(){
  const p=project(),svg=document.getElementById('pmDeps'),wrap=document.getElementById('pmWrap');
  if(!p||!svg||!wrap)return;
  const grid=wrap.querySelector('.pm-grid');
  svg.setAttribute('width',grid.scrollWidth);svg.setAttribute('height',grid.scrollHeight);
  svg.style.width=grid.scrollWidth+'px';svg.style.height=grid.scrollHeight+'px';
  const base=grid.getBoundingClientRect();
  const center=id=>{const el=wrap.querySelector(`[data-pm-tick="${id}"]`);if(!el)return null;const r=el.getBoundingClientRect();return{x:r.left-base.left+r.width/2,y:r.top-base.top+r.height/2}};
  let paths='';
  p.nodes.forEach(n=>n.deps.forEach(did=>{
    const a=center(did),b=center(n.id);if(!a||!b)return;
    const d=p.nodes.find(x=>x.id===did);
    const dx=Math.max(40,(b.x-a.x)/2);
    paths+=`<path class="${d&&nodeDone(d)?'done':''}" d="M${a.x},${a.y} C${a.x+dx},${a.y} ${b.x-dx},${b.y} ${b.x},${b.y}"/>`;
  }));
  svg.innerHTML=paths;
}

/* ---------- modal helpers ---------- */
function modal(title,body,onOpen){
  Y.$('pmapModalTitle').innerHTML=title;
  Y.$('pmapModalBody').innerHTML=body;
  Y.openModal('pmapModal');
  if(onOpen)onOpen();
}
const close=()=>Y.closeModal('pmapModal');
const v=id=>{const el=Y.$(id);return el?el.value.trim():''};
const num=id=>Number(v(id))||0;
function commit(){Y.save();Y.render()}

function taskOptions(selected){
  const s=S();
  const groups=[];
  s.milestones.filter(m=>m.kind==='feladat'&&(m.tasks||[]).length).forEach(m=>{
    const h=s.habits.find(x=>x.id===m.habitId),g=s.taskGroups.find(x=>x.id===m.groupId);
    const owner=h?`${h.emoji||''} ${h.name}`:g?`📁 ${g.name}`:'—';
    const label=`${owner} › ${m.name}`;
    groups.push(`<optgroup label="${esc(label)}">${m.tasks.map(t=>`<option value="${m.id}|${t.id}" ${selected===m.id+'|'+t.id?'selected':''}>${t.completedAt?'✓ ':''}${esc(t.name)}</option>`).join('')}</optgroup>`);
  });
  return`<option value="">— nincs (önálló állomás) —</option>${groups.join('')}`;
}

function projectForm(p){
  modal(p?'Projekt szerkesztése':'Új projekt',`<div class="formgrid"><div class="field"><label>Név</label><input id="pmName" value="${esc(p?p.name:'')}" placeholder="pl. Diplomamunka" required></div><div class="field"><label>Emoji</label><input id="pmEmoji" value="${esc(p?p.emoji:'🗺️')}" maxlength="12"></div><div class="field"><label>Egy fregment ára (Ft)</label><input id="pmFrag" type="number" min="1" step="500" value="${p?p.fragmentPrice:5000}"></div><div class="field"><label>&nbsp;</label><div class="chip" style="padding:11px 12px">ár ÷ fregmentár = darabszám</div></div><div class="field full"><label>Leírás</label><textarea id="pmDesc">${esc(p?p.description:'')}</textarea></div></div><div class="modalactions">${p?'<button class="btn" id="pmDelete">🗑️ Törlés</button>':''}<button class="btn primary" id="pmSave">Mentés</button></div>`,()=>{
    Y.$('pmSave').onclick=()=>{
      const name=v('pmName');if(!name)return Y.toast('Adj nevet a projektnek.');
      if(p){p.name=name;p.emoji=v('pmEmoji')||'🗺️';p.fragmentPrice=Math.max(1,num('pmFrag'));p.description=v('pmDesc')}
      else{const np={id:Y.uid(),name,emoji:v('pmEmoji')||'🗺️',fragmentPrice:Math.max(1,num('pmFrag')),description:v('pmDesc'),createdAt:Y.today(),lanes:[],stages:[],nodes:[],rewards:[],log:[]};S().pmaps.push(np);cur=np.id;Y.setView('pmapDetail')}
      close();commit();
    };
    if(p)Y.$('pmDelete').onclick=()=>deleteProject(p.id);
    setTimeout(()=>Y.$('pmName').focus(),0);
  });
}
function deleteProject(id){
  if(!confirm('Törlöd a projektet minden pályájával, állomásával és ajándékával?'))return;
  const s=S();s.pmaps=s.pmaps.filter(p=>p.id!==id);if(cur===id){cur='';Y.setView('pmaps')}close();commit();
}

function laneForm(p,l){
  const color=l?l.color:LANE_COLORS[p.lanes.length%LANE_COLORS.length];
  modal(l?'Pálya szerkesztése':'Új pálya',`<div class="formgrid"><div class="field"><label>Név</label><input id="pmName" value="${esc(l?l.name:'')}" placeholder="pl. Tanulás"></div><div class="field"><label>Szín</label><input id="pmColor" type="color" value="${color}" style="height:44px;padding:4px;cursor:pointer"></div></div><div class="modalactions">${l?'<button class="btn" id="pmDelete">🗑️ Törlés</button>':''}<button class="btn primary" id="pmSave">Mentés</button></div>`,()=>{
    Y.$('pmSave').onclick=()=>{const name=v('pmName');if(!name)return Y.toast('Adj nevet a pályának.');if(l){l.name=name;l.color=v('pmColor')}else p.lanes.push({id:Y.uid(),name,color:v('pmColor')});close();commit()};
    if(l)Y.$('pmDelete').onclick=()=>{const ns=p.nodes.filter(n=>n.laneId===l.id).length;if(!confirm(ns?`Törlöd a pályát és a rajta lévő ${ns} állomást?`:'Törlöd a pályát?'))return;removeNodes(p,n=>n.laneId===l.id);p.lanes=p.lanes.filter(x=>x.id!==l.id);close();commit()};
    setTimeout(()=>Y.$('pmName').focus(),0);
  });
}

function stageForm(p,s){
  modal(s?'Stáció szerkesztése':'Új stáció',`<div class="formgrid"><div class="field"><label>Név</label><input id="pmName" value="${esc(s?s.name:'')}" placeholder="pl. Alapozás"></div><div class="field"><label>🎁 Ajándék a stáció lezárásakor (fregment)</label><input id="pmGift" type="number" min="0" value="${s?s.gift:0}"><p class="vow-note" style="margin:6px 0 0">0 = nincs csomag. Akkor nyílik, ha a stáció minden állomása kész.</p></div></div><div class="modalactions">${s?'<button class="btn" id="pmDelete">🗑️ Törlés</button>':''}<button class="btn primary" id="pmSave">Mentés</button></div>`,()=>{
    Y.$('pmSave').onclick=()=>{const name=v('pmName');if(!name)return Y.toast('Adj nevet a stációnak.');if(s){s.name=name;s.gift=Math.max(0,num('pmGift'))}else p.stages.push({id:Y.uid(),name,gift:Math.max(0,num('pmGift')),giftOpened:false});close();commit()};
    if(s)Y.$('pmDelete').onclick=()=>{const ns=stageNodes(p,s.id).length;if(!confirm(ns?`Törlöd a stációt és a benne lévő ${ns} állomást?`:'Törlöd a stációt?'))return;removeNodes(p,n=>n.stageId===s.id);p.stages=p.stages.filter(x=>x.id!==s.id);if(focusStage===s.id)focusStage='';close();commit()};
    setTimeout(()=>Y.$('pmName').focus(),0);
  });
}

function removeNodes(p,pred){
  const ids=p.nodes.filter(pred).map(n=>n.id);
  p.nodes=p.nodes.filter(n=>!ids.includes(n.id));
  p.nodes.forEach(n=>n.deps=n.deps.filter(d=>!ids.includes(d)));
}

function nodeForm(p,n,preset={}){
  const laneId=n?n.laneId:preset.laneId||(p.lanes[0]||{}).id,stageId=n?n.stageId:preset.stageId||(p.stages[activeStageIndex(p)]||{}).id;
  const others=p.nodes.filter(x=>!n||x.id!==n.id);
  const depList=others.length?`<div class="pm-checklist">${others.map(o=>{const l=p.lanes.find(x=>x.id===o.laneId),s=p.stages.find(x=>x.id===o.stageId);return`<label><input type="checkbox" data-pm-dep="${o.id}" ${n&&n.deps.includes(o.id)?'checked':''}> <span style="color:${l?l.color:'inherit'}">●</span> ${esc(o.name)} <span class="chip" style="font-size:10px">${esc(l?l.name:'?')} · ${stageIdx(p,o.stageId)+1}. ${esc(s?s.name:'?')}</span></label>`}).join('')}</div>`:'<p class="vow-note">Még nincs másik állomás, amitől függhetne.</p>';
  modal(n?'Állomás szerkesztése':'Új állomás',`<div class="formgrid"><div class="field full"><label>Név</label><input id="pmName" value="${esc(n?n.name:'')}" placeholder="pl. Statisztika – ANOVA"></div><div class="field"><label>Pálya</label><select id="pmLane">${p.lanes.map(l=>`<option value="${l.id}" ${l.id===laneId?'selected':''}>${esc(l.name)}</option>`).join('')}</select></div><div class="field"><label>Stáció</label><select id="pmStage">${p.stages.map((s,i)=>`<option value="${s.id}" ${s.id===stageId?'selected':''}>${i+1}. ${esc(s.name)}</option>`).join('')}</select></div><div class="field full"><label>🔗 Szokás-feladathoz kötés</label><select id="pmRef">${taskOptions(n?n.ref:'')}</select><p class="vow-note" style="margin:6px 0 0">Ha kötöd, a pipa és a részfeladat-számláló a szokás Feladatából jön – ott is kipipálhatod.</p></div><div class="field"><label>Számláló (jelenlegi)</label><input id="pmVal" type="number" min="0" value="${n?n.val:0}"></div><div class="field"><label>Számláló cél (0 = nincs)</label><input id="pmTarget" type="number" min="0" value="${n?n.target:0}" placeholder="pl. 7 téma"></div><div class="field"><label>Kötelező a továbblépéshez?</label><select id="pmReq"><option value="1" ${n&&n.required?'selected':''}>⚑ Igen – zárja a következő stációt</option><option value="0" ${!n||!n.required?'selected':''}>Nem – csúszhat</option></select></div><div class="field"><label>🎁 Ajándék teljesítéskor (fregment)</label><input id="pmGift" type="number" min="0" value="${n?n.gift:0}"></div><div class="field full"><label>⤴ Függ ezektől az állomásoktól</label>${depList}</div></div><div class="modalactions">${n?'<button class="btn" id="pmDelete">🗑️ Törlés</button>':''}<button class="btn primary" id="pmSave">Mentés</button></div>`,()=>{
    Y.$('pmSave').onclick=()=>{
      const name=v('pmName');if(!name)return Y.toast('Adj nevet az állomásnak.');
      const deps=[...document.querySelectorAll('[data-pm-dep]:checked')].map(x=>x.dataset.pmDep);
      const data={name,laneId:v('pmLane'),stageId:v('pmStage'),ref:v('pmRef'),val:Math.max(0,num('pmVal')),target:Math.max(0,num('pmTarget')),required:v('pmReq')==='1',gift:Math.max(0,num('pmGift')),deps};
      if(n)Object.assign(n,data);else p.nodes.push(Object.assign({id:Y.uid(),done:false,doneAt:'',giftOpened:false},data));
      close();commit();
    };
    if(n)Y.$('pmDelete').onclick=()=>{if(!confirm('Törlöd az állomást?'))return;removeNodes(p,x=>x.id===n.id);close();commit()};
    setTimeout(()=>Y.$('pmName').focus(),0);
  });
}

/* ---------- ticking ---------- */
function tick(p,n){
  const si=stageIdx(p,n.stageId);
  if(!stageUnlocked(p,si))return Y.toast('Ez a stáció még zárt – előbb az előző ⚑ kötelező állomásait.');
  const d=nodeDone(n);
  if(!d&&!depsMet(p,n))return Y.toast('Előbb az állomás, amitől függ.');
  const lt=linkedTask(n);
  if(lt){
    if((lt.t.subtasks||[]).length&&!d)return Y.toast('Ennek a feladatnak részfeladatai vannak – a szokásnál pipáld ki őket.');
    Y.toggleTask(lt.m.id,lt.t.id);
    return;
  }
  n.done=!d;n.doneAt=n.done?Y.today():'';
  if(n.done&&n.target>0)n.val=n.target;
  commit();
}
function inc(p,n){n.val=Math.min(n.target,n.val+1);if(n.val>=n.target){n.done=true;n.doneAt=Y.today()}commit()}

/* ---------- drag & drop (reorder within a stage) ---------- */
let dragId='';
function moveNode(p,id,laneId,stageId,beforeId){
  const n=p.nodes.find(x=>x.id===id);if(!n||n.stageId!==stageId)return;
  p.nodes=p.nodes.filter(x=>x.id!==id);
  n.laneId=laneId;
  let idx=-1;
  if(beforeId)idx=p.nodes.findIndex(x=>x.id===beforeId);
  else{const last=p.nodes.map((x,i)=>x.laneId===laneId&&x.stageId===stageId?i:-1).filter(i=>i>=0).pop();idx=last==null?-1:last+1}
  if(idx<0)p.nodes.push(n);else p.nodes.splice(idx,0,n);
  commit();
}
function bindDrag(p){
  const wrap=document.getElementById('pmWrap');if(!wrap)return;
  wrap.querySelectorAll('[data-pm-node]').forEach(el=>{
    el.addEventListener('dragstart',e=>{dragId=el.dataset.pmNode;el.classList.add('pm-dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragId)}catch(err){}});
    el.addEventListener('dragend',()=>{dragId='';wrap.querySelectorAll('.pm-dragging,.pm-dragover,.pm-drop-left,.pm-drop-right').forEach(x=>x.classList.remove('pm-dragging','pm-dragover','pm-drop-left','pm-drop-right'))});
  });
  wrap.querySelectorAll('[data-pm-cell]').forEach(cell=>{
    const [laneId,stageId]=cell.dataset.pmCell.split('|');
    const okStage=()=>{const n=p.nodes.find(x=>x.id===dragId);return n&&n.stageId===stageId};
    cell.addEventListener('dragover',e=>{
      if(!okStage())return;
      e.preventDefault();e.dataTransfer.dropEffect='move';
      cell.classList.add('pm-dragover');
      wrap.querySelectorAll('.pm-drop-left,.pm-drop-right').forEach(x=>x.classList.remove('pm-drop-left','pm-drop-right'));
      const t=e.target.closest('[data-pm-node]');
      if(t&&t.dataset.pmNode!==dragId){const r=t.getBoundingClientRect();t.classList.add(e.clientX<r.left+r.width/2?'pm-drop-left':'pm-drop-right')}
    });
    cell.addEventListener('dragleave',e=>{if(!cell.contains(e.relatedTarget))cell.classList.remove('pm-dragover')});
    cell.addEventListener('drop',e=>{
      if(!okStage())return;
      e.preventDefault();
      const t=e.target.closest('[data-pm-node]');
      let beforeId='';
      if(t&&t.dataset.pmNode!==dragId){
        const r=t.getBoundingClientRect(),left=e.clientX<r.left+r.width/2;
        if(left)beforeId=t.dataset.pmNode;
        else{const sib=[...cell.querySelectorAll('[data-pm-node]')].map(x=>x.dataset.pmNode).filter(id=>id!==dragId);beforeId=sib[sib.indexOf(t.dataset.pmNode)+1]||''}
      }
      moveNode(p,dragId,laneId,stageId,beforeId);
    });
  });
}

/* ---------- gifts & rewards ---------- */
function fragmentsFor(p,price){return Math.max(1,Math.round(price/p.fragmentPrice))}
function draw(p,count){
  const drops=[],unlocks=[];
  for(let i=0;i<count;i++){
    const pool=p.rewards.filter(r=>!r.unlockedAt&&r.collected<r.fragments);
    if(!pool.length)break;
    const r=pool[Math.floor(Math.random()*pool.length)];
    r.collected++;
    drops.push(r);
    if(r.collected>=r.fragments){r.unlockedAt=Y.today();unlocks.push(r)}
  }
  return{drops,unlocks};
}
function openGift(p,count,label){
  if(!p.rewards.some(r=>!r.unlockedAt))return Y.toast('Üres az ajándék-pool – vedd fel előbb, mit szeretnél nyerni.')&&false;
  const{drops,unlocks}=draw(p,count);
  const grouped={};drops.forEach(r=>{grouped[r.id]=grouped[r.id]||{r,n:0};grouped[r.id].n++});
  const lines=Object.values(grouped).map(({r,n})=>`<div class="pm-drop">🧩 ${n}× fregment → <b>${esc(r.name)}</b> <span class="chip">${r.collected}/${r.fragments}</span></div>`).join('');
  const un=unlocks.map(r=>`<div class="pm-drop unlock">✨ Feloldva: ${esc(r.name)}${r.price?` · ${r.price.toLocaleString('hu-HU')} Ft`:''}</div>`).join('');
  p.log.unshift({date:Y.today(),text:`${label}: ${drops.length} fregment${unlocks.length?' · feloldva: '+unlocks.map(r=>r.name).join(', '):''}`});
  p.log=p.log.slice(0,50);
  modal('🎁 Ajándékcsomag',`<p class="vow-note" style="margin:0 0 10px">${esc(label)}</p>${lines||'<div class="pm-drop">A pool kiürült, nem maradt húzható fregment.</div>'}${un}<div class="modalactions"><button class="btn" data-pm-rewards>Ajándékok</button><button class="btn primary" data-close="pmapModal" id="pmOk">Rendben</button></div>`,()=>{Y.$('pmOk').onclick=close;const b=document.querySelector('#pmapModalBody [data-pm-rewards]');if(b)b.onclick=()=>rewardsPanel(p)});
  return true;
}

function rewardsPanel(p){
  const open=p.rewards.filter(r=>!r.unlockedAt),done=p.rewards.filter(r=>r.unlockedAt);
  const row=r=>`<div class="pm-reward ${r.unlockedAt?'unlocked':''}"><div class="grow"><h4>${r.unlockedAt?'✨ ':''}${esc(r.name)}${r.price?` <span class="chip">${r.price.toLocaleString('hu-HU')} Ft</span>`:''}</h4>${r.unlockedAt?`<p class="pm-log">feloldva: ${r.unlockedAt}</p>`:`<div class="pm-frags">${Array.from({length:r.fragments},(_,i)=>`<span class="pm-frag ${i<r.collected?'got':''}"></span>`).join('')}</div><p class="pm-log">${r.collected} / ${r.fragments} fregment</p>`}</div><div class="actions"><button class="btn small" data-pm-edit-reward="${r.id}">✏️</button><button class="btn small" data-pm-del-reward="${r.id}">🗑️</button></div></div>`;
  modal('🎁 Ajándék-pool',`<p class="vow-note" style="margin:0 0 10px">Egy fregment = ${p.fragmentPrice.toLocaleString('hu-HU')} Ft. Az ajándékcsomagok véletlen fregmenteket adnak a még hiányos ajándékokhoz; ha összegyűlt mind, az ajándék feloldódik és kikerül a poolból.</p><div class="modalactions" style="justify-content:flex-start;margin:0 0 8px"><button class="btn primary small" data-pm-new-reward>+ Új ajándék</button></div>${open.length?open.map(row).join(''):'<div class="empty">Még nincs ajándék a poolban.</div>'}${done.length?`<h4 style="margin:16px 0 4px">Feloldott</h4>${done.map(row).join('')}`:''}${p.log.length?`<h4 style="margin:16px 0 4px">Húzások</h4>${p.log.slice(0,8).map(l=>`<p class="pm-log">${l.date} · ${esc(l.text)}</p>`).join('')}`:''}`,()=>{
    const b=Y.$('pmapModalBody');
    b.querySelector('[data-pm-new-reward]').onclick=()=>rewardForm(p,null);
    b.querySelectorAll('[data-pm-edit-reward]').forEach(x=>x.onclick=()=>rewardForm(p,p.rewards.find(r=>r.id===x.dataset.pmEditReward)));
    b.querySelectorAll('[data-pm-del-reward]').forEach(x=>x.onclick=()=>{if(!confirm('Törlöd az ajándékot?'))return;p.rewards=p.rewards.filter(r=>r.id!==x.dataset.pmDelReward);Y.save();rewardsPanel(p)});
  });
}
function rewardForm(p,r){
  modal(r?'Ajándék szerkesztése':'Új ajándék',`<div class="formgrid"><div class="field full"><label>Név</label><input id="pmName" value="${esc(r?r.name:'')}" placeholder="pl. Spirit Island kiegészítő"></div><div class="field"><label>Ár (Ft, opcionális)</label><input id="pmPrice" type="number" min="0" step="100" value="${r?r.price:''}"></div><div class="field"><label>Fregmentek száma</label><input id="pmFrags" type="number" min="1" value="${r?r.fragments:1}"><p class="vow-note" style="margin:6px 0 0">Ár megadásakor automatikusan: ár ÷ ${p.fragmentPrice.toLocaleString('hu-HU')} Ft, kerekítve. Felülírhatod.</p></div></div><div class="modalactions"><button class="btn" id="pmBack">← Pool</button><button class="btn primary" id="pmSave">Mentés</button></div>`,()=>{
    let manual=!!r;
    Y.$('pmPrice').oninput=()=>{if(!manual)Y.$('pmFrags').value=fragmentsFor(p,num('pmPrice'))};
    Y.$('pmFrags').oninput=()=>{manual=true};
    Y.$('pmBack').onclick=()=>rewardsPanel(p);
    Y.$('pmSave').onclick=()=>{
      const name=v('pmName');if(!name)return Y.toast('Adj nevet az ajándéknak.');
      const frags=Math.max(1,num('pmFrags'));
      if(r){r.name=name;r.price=num('pmPrice');r.fragments=frags;r.collected=Math.min(r.collected,frags)}
      else p.rewards.push({id:Y.uid(),name,price:num('pmPrice'),fragments:frags,collected:0,unlockedAt:''});
      Y.save();rewardsPanel(p);
    };
    setTimeout(()=>Y.$('pmName').focus(),0);
  });
}

/* ---------- import / export ---------- */
function exportProject(p){
  const lane=id=>{const l=p.lanes.find(x=>x.id===id);return l?l.name:''};
  const stage=id=>{const s=p.stages.find(x=>x.id===id);return s?s.name:''};
  const node=id=>{const n=p.nodes.find(x=>x.id===id);return n?n.name:''};
  return{
    id:p.id,name:p.name,emoji:p.emoji,description:p.description,fragmentPrice:p.fragmentPrice,
    lanes:p.lanes.map(l=>({id:l.id,name:l.name,color:l.color})),
    stages:p.stages.map(s=>({id:s.id,name:s.name,gift:s.gift,giftOpened:s.giftOpened})),
    nodes:p.nodes.map(n=>({id:n.id,name:n.name,lane:lane(n.laneId),stage:stage(n.stageId),required:n.required,target:n.target,val:n.val,done:nodeDone(n),gift:n.gift,giftOpened:n.giftOpened,deps:n.deps.map(node).filter(Boolean),ref:n.ref||undefined})),
    rewards:p.rewards.map(r=>({id:r.id,name:r.name,price:r.price,fragments:r.fragments,collected:r.collected,unlockedAt:r.unlockedAt}))
  };
}

function parseJsonLoose(text){
  let t=String(text||'').trim();
  const fence=t.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)t=fence[1];
  const a=t.indexOf('{'),b=t.lastIndexOf('}');
  if(a<0||b<0)throw new Error('Nem találok JSON objektumot a szövegben.');
  return JSON.parse(t.slice(a,b+1));
}

function applyImport(raw){
  if(!raw||typeof raw!=='object')throw new Error('A JSON gyökere objektum kell legyen.');
  const name=String(raw.name||'').trim();if(!name)throw new Error('Hiányzik a projekt neve ("name").');
  const s=S();
  const existing=raw.id?s.pmaps.find(p=>p.id===raw.id):null;
  const old=existing||{lanes:[],stages:[],nodes:[],rewards:[],log:[]};
  const p=existing||{id:Y.uid(),createdAt:Y.today(),log:[]};
  p.name=name;p.emoji=String(raw.emoji||p.emoji||'🗺️');p.description=String(raw.description||'');p.fragmentPrice=Math.max(1,Number(raw.fragmentPrice)||p.fragmentPrice||5000);
  const norm=x=>typeof x==='string'?{name:x}:(x||{});
  const byName=(list,n)=>list.find(x=>x.name.trim().toLowerCase()===String(n||'').trim().toLowerCase());
  const keep=(list,item)=>(item.id&&list.find(x=>x.id===item.id))||byName(list,item.name);

  p.lanes=(raw.lanes||[]).map(norm).filter(l=>l.name).map((l,i)=>{const o=keep(old.lanes,l)||{};return{id:o.id||l.id||Y.uid(),name:String(l.name).trim(),color:l.color||o.color||LANE_COLORS[i%LANE_COLORS.length]}});
  p.stages=(raw.stages||[]).map(norm).filter(st=>st.name).map(st=>{const o=keep(old.stages,st)||{};return{id:o.id||st.id||Y.uid(),name:String(st.name).trim(),gift:Math.max(0,Number(st.gift)||0),giftOpened:st.giftOpened!=null?!!st.giftOpened:!!o.giftOpened}});
  if(!p.lanes.length||!p.stages.length)throw new Error('Legalább egy pálya ("lanes") és egy stáció ("stages") kell.');

  const nodesRaw=(raw.nodes||[]).map(norm).filter(n=>n.name);
  const pre=nodesRaw.map(n=>{
    const lane=byName(p.lanes,n.lane)||p.lanes.find(l=>l.id===n.lane)||p.lanes[0];
    const stage=byName(p.stages,n.stage)||p.stages.find(st=>st.id===n.stage)||p.stages[0];
    const o=keep(old.nodes,n)||{};
    return{id:o.id||n.id||Y.uid(),name:String(n.name).trim(),laneId:lane.id,stageId:stage.id,required:n.required!=null?!!n.required:!!o.required,target:Math.max(0,Number(n.target)||0),val:n.val!=null?Math.max(0,Number(n.val)||0):(o.val||0),done:n.done!=null?!!n.done:!!o.done,doneAt:o.doneAt||'',gift:Math.max(0,Number(n.gift)||0),giftOpened:n.giftOpened!=null?!!n.giftOpened:!!o.giftOpened,ref:n.ref!=null?String(n.ref):(o.ref||''),_deps:Array.isArray(n.deps)?n.deps:[]};
  });
  pre.forEach(n=>{if(n.done&&!n.doneAt)n.doneAt=Y.today();if(!n.done)n.doneAt=''});
  p.nodes=pre.map(n=>{const deps=n._deps.map(d=>{const t=byName(pre,d)||pre.find(x=>x.id===d);return t&&t.id!==n.id?t.id:''}).filter(Boolean);delete n._deps;return Object.assign(n,{deps:[...new Set(deps)]})});

  p.rewards=(raw.rewards||[]).map(norm).filter(r=>r.name).map(r=>{const o=keep(old.rewards,r)||{};const frags=Math.max(1,Number(r.fragments)||(Number(r.price)>0?fragmentsFor(p,Number(r.price)):1));return{id:o.id||r.id||Y.uid(),name:String(r.name).trim(),price:Number(r.price)||0,fragments:frags,collected:Math.min(frags,r.collected!=null?Number(r.collected)||0:(o.collected||0)),unlockedAt:r.unlockedAt!=null?String(r.unlockedAt||''):(o.unlockedAt||'')}});
  if(!existing)s.pmaps.push(p);
  return{p,updated:!!existing};
}

function promptText(){
  return `Segíts megtervezni egy "progress map"-et az Yggdrasil appomhoz. A térkép egy PROJEKT, amiben vízszintes PÁLYÁK (lanes – párhuzamos munkaszálak, pl. Ügyintézés, Tanulás, Írás) és függőleges STÁCIÓK (stages – egymást követő szakaszok) vannak. Az ÁLLOMÁSOK (nodes) egy pálya és egy stáció metszetében ülnek. A "required": true állomások zárják a következő stációt (amíg nincsenek kész, a következő stáció zárt); a nem kötelezők csúszhatnak. Egy állomás függhet másik állomásoktól ("deps", névvel hivatkozva, akár másik pályáról). Az ajándékok ("gift", fregmentek száma) állomásra vagy stációra tehetők; a projekt "rewards" poolja ajándékokat tartalmaz, amelyek ár ÷ fragmentPrice fregmentre bomlanak.

Beszéljük meg először a tartalmat (milyen pályák, hány stáció, mik a kötelező lépések, mik függenek mitől), aztán a végén add ki a teljes térképet EGYETLEN JSON kódblokkban, pontosan ebben a formában, magyar nevekkel:

\`\`\`json
{
  "name": "Diplomamunka",
  "emoji": "🎓",
  "description": "egy mondat",
  "fragmentPrice": 5000,
  "lanes": ["Ügyintézés", "Tanulás", "Írás"],
  "stages": [
    {"name": "Alapozás", "gift": 2},
    {"name": "Kutatás", "gift": 3}
  ],
  "nodes": [
    {"name": "Témavezető email", "lane": "Ügyintézés", "stage": "Alapozás", "required": true},
    {"name": "Szakirodalom 10 cikk", "lane": "Tanulás", "stage": "Alapozás", "required": false, "target": 10},
    {"name": "Kísérleti terv", "lane": "Írás", "stage": "Kutatás", "required": true, "deps": ["Témavezető email"], "gift": 1}
  ],
  "rewards": [
    {"name": "Egy este társasjáték", "price": 0},
    {"name": "Új könyv", "price": 10000}
  ]
}
\`\`\`

Szabályok: minden állomás "lane" és "stage" értéke szerepeljen a lanes/stages listában; "deps" csak létező állomásnevekre mutasson; "target" csak akkor, ha számolható cél van (0 vagy elhagyva = nincs); "gift" fregmentszám (elhagyva = nincs ajándék). Ha egy már létező térkép JSON-jét adom (benne "id" mezőkkel), akkor azokat az id-kat tartsd meg a megmaradó elemeknél, hogy az import frissítse a térképet és ne duplikálja.`;
}

function copyText(text){
  if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(text).then(()=>true,()=>false);
  return Promise.resolve(false);
}

function textModal(title,intro,text,filename){
  modal(title,`<p class="vow-note" style="margin:0 0 10px">${intro}</p><textarea id="pmText" style="width:100%;min-height:260px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border-radius:12px;border:1px solid var(--line)" readonly>${esc(text)}</textarea><div class="modalactions"><button class="btn" id="pmDownload">⬇️ Letöltés</button><button class="btn primary" id="pmCopy">📋 Másolás</button></div>`,()=>{
    const ta=Y.$('pmText');
    Y.$('pmCopy').onclick=async()=>{const ok=await copyText(text);if(!ok){ta.focus();ta.select();try{document.execCommand('copy')}catch(e){}}Y.toast('Vágólapra másolva')};
    Y.$('pmDownload').onclick=()=>{const blob=new Blob([text],{type:filename.endsWith('.json')?'application/json':'text/plain'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)};
    ta.onclick=()=>ta.select();
  });
}

function importModal(){
  modal('📥 Térkép importálása',`<p class="vow-note" style="margin:0 0 10px">Illeszd be a Claude által adott JSON-t (a \`\`\`json blokk is mehet egyben), vagy válassz fájlt. Ha a JSON-ban van "id", ami egy meglévő térképé, azt frissíti – a pipák és a begyűjtött fregmentek megmaradnak.</p><textarea id="pmImportText" style="width:100%;min-height:220px;font-family:ui-monospace,monospace;font-size:12px;padding:10px;border-radius:12px;border:1px solid var(--line)" placeholder='{"name": "Diplomamunka", "lanes": [...], "stages": [...], "nodes": [...]}'></textarea><div class="field" style="margin-top:10px"><label>…vagy fájlból</label><input id="pmImportFile" type="file" accept="application/json,.json,.txt"></div><div class="modalactions"><button class="btn" data-pm-prompt>📋 Prompt Claude-nak</button><button class="btn primary" id="pmImportGo">Importálás</button></div>`,()=>{
    const run=text=>{try{const{p,updated}=applyImport(parseJsonLoose(text));close();cur=p.id;focusStage='';Y.setView('pmapDetail');commit();Y.toast(updated?`Frissítve: ${p.name}`:`Importálva: ${p.name} · ${p.nodes.length} állomás`)}catch(e){Y.toast('Hiba: '+(e.message||'érvénytelen JSON'))}};
    Y.$('pmImportGo').onclick=()=>{const t=Y.$('pmImportText').value.trim();if(!t)return Y.toast('Illessz be JSON-t vagy válassz fájlt.');run(t)};
    Y.$('pmImportFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const fr=new FileReader();fr.onload=()=>run(fr.result);fr.readAsText(f)};
    document.querySelector('#pmapModalBody [data-pm-prompt]').onclick=()=>textModal('📋 Prompt Claude-nak','Másold be egy claude.ai projekt utasításai közé (vagy egy beszélgetés elejére). Beszéljétek meg a térképet, a végén Claude kiadja a JSON-t, amit ide importálsz.',promptText(),'yggdrasil-terkep-prompt.txt');
    setTimeout(()=>Y.$('pmImportText').focus(),0);
  });
}

/* ---------- bindings ---------- */
function bind(){
  const q=sel=>document.querySelectorAll(sel);
  q('[data-pm-new-project]').forEach(x=>x.onclick=()=>projectForm(null));
  q('[data-pm-import]').forEach(x=>x.onclick=importModal);
  q('[data-pm-prompt]').forEach(x=>x.onclick=()=>textModal('📋 Prompt Claude-nak','Másold be egy claude.ai projekt utasításai közé (vagy egy beszélgetés elejére). Beszéljétek meg a térképet, a végén Claude kiadja a JSON-t, amit a Térképek oldalon importálsz.',promptText(),'yggdrasil-terkep-prompt.txt'));
  q('[data-pm-export]').forEach(x=>x.onclick=()=>{const p=S().pmaps.find(y=>y.id===x.dataset.pmExport);if(!p)return;textModal(`📤 ${esc(p.name)} – export`,'Ezt add oda Claude-nak, ha a térképet át akarod beszélni/bővíteni. A visszakapott JSON importja frissíti ezt a térképet (az "id" mezők miatt).',JSON.stringify(exportProject(p),null,2),`yggdrasil-terkep-${p.name.replace(/[^\w\-]+/g,'_')}.json`)});
  q('[data-pm-open]').forEach(x=>x.onclick=e=>{if(e.target.closest('[data-pm-edit-project],[data-pm-del-project]'))return;openProject(x.dataset.pmOpen)});
  q('[data-pm-edit-project]').forEach(x=>x.onclick=()=>projectForm(S().pmaps.find(p=>p.id===x.dataset.pmEditProject)));
  q('[data-pm-del-project]').forEach(x=>x.onclick=()=>deleteProject(x.dataset.pmDelProject));
  const p=project();if(!p)return;
  q('[data-pm-rewards]').forEach(x=>x.onclick=()=>rewardsPanel(p));
  q('[data-pm-toggle-single]').forEach(x=>x.onclick=()=>{single=!useSingle();Y.render()});
  q('[data-pm-tab]').forEach(x=>x.onclick=()=>{focusStage=x.dataset.pmTab;if(!useSingle())single=true;Y.render()});
  q('[data-pm-new-lane]').forEach(x=>x.onclick=()=>laneForm(p,null));
  q('[data-pm-edit-lane]').forEach(x=>x.onclick=()=>laneForm(p,p.lanes.find(l=>l.id===x.dataset.pmEditLane)));
  q('[data-pm-new-stage]').forEach(x=>x.onclick=()=>stageForm(p,null));
  q('[data-pm-edit-stage]').forEach(x=>x.onclick=()=>stageForm(p,p.stages.find(s=>s.id===x.dataset.pmEditStage)));
  q('[data-pm-new-node]').forEach(x=>x.onclick=()=>{if(!p.lanes.length||!p.stages.length)return Y.toast('Előbb pálya és stáció kell.');nodeForm(p,null)});
  q('[data-pm-add-node]').forEach(x=>x.onclick=()=>{const[laneId,stageId]=x.dataset.pmAddNode.split('|');nodeForm(p,null,{laneId,stageId})});
  q('[data-pm-edit-node]').forEach(x=>x.onclick=()=>nodeForm(p,p.nodes.find(n=>n.id===x.dataset.pmEditNode)));
  q('[data-pm-tick]').forEach(x=>x.onclick=()=>tick(p,p.nodes.find(n=>n.id===x.dataset.pmTick)));
  q('[data-pm-inc]').forEach(x=>x.onclick=()=>inc(p,p.nodes.find(n=>n.id===x.dataset.pmInc)));
  q('[data-pm-node-gift]').forEach(x=>x.onclick=()=>{const n=p.nodes.find(y=>y.id===x.dataset.pmNodeGift);if(n.giftOpened)return Y.toast('Ezt már kibontottad.');if(!nodeDone(n))return Y.toast('Akkor nyílik, ha az állomás kész.');if(openGift(p,n.gift,'Állomás: '+n.name)){n.giftOpened=true;Y.save()}});
  q('[data-pm-stage-gift]').forEach(x=>x.onclick=()=>{const s=p.stages.find(y=>y.id===x.dataset.pmStageGift),i=stageIdx(p,s.id);if(s.giftOpened)return Y.toast('Ezt már kibontottad.');if(!stageComplete(p,i))return Y.toast('Akkor nyílik, ha a stáció minden állomása kész.');if(openGift(p,s.gift,'Stáció lezárva: '+s.name)){s.giftOpened=true;Y.save()}});
  bindDrag(p);
  requestAnimationFrame(drawDeps);
  if(!resizeBound){resizeBound=true;window.addEventListener('resize',()=>{if(document.getElementById('pmDeps'))drawDeps()})}
}

return{init,migrate,leave,list,detail,bind};
})();
