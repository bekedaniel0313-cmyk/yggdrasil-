window.FOCUS=(function(){
'use strict';
let Y=null,calCur=null;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
function migrate(s){s.focus=s.focus&&typeof s.focus==='object'?s.focus:{key:''};if(s.focus.key==null)s.focus.key=''}

function resolve(){
  const k=S().focus.key;if(!k)return null;
  if(k.startsWith('cat:')){const c=S().categories.find(x=>x.id===k.slice(4));return c?{kind:'cat',c,name:c.name,emoji:c.emoji||'🍃'}:null}
  const h=S().habits.find(x=>x.id===k);return h?{kind:'habit',h,name:h.name,emoji:h.emoji||'🌱'}:null;
}
// true = done, false = missed, null = rest day (no goal that day)
function doneOn(r,date){
  if(r.kind==='habit'){if(r.h.createdAt&&date<r.h.createdAt)return null;return Y.complete(r.h,date)}
  const tg=Y.catTargetFor(r.c,date);if(!tg)return null;return Y.categoryValue(r.c,date)>=tg;
}
function streak(r){
  const t=Y.today();let n=0,d=new Date(t+'T12:00:00'),guard=0;
  while(guard++<730){
    const iso=d.toLocaleDateString('sv-SE'),s=doneOn(r,iso);
    if(s===true)n++;
    else if(s===false){if(iso!==t)break}      // today may still come; an earlier miss ends the run
    d.setDate(d.getDate()-1);
  }
  return n;
}
function valueText(r,date){
  if(r.kind==='cat'){const tg=Y.catTargetFor(r.c,date),v=Y.categoryValue(r.c,date);return tg?`${Y.catFmt(r.c,v)} / ${Y.catFmt(r.c,tg)}`:`${Y.catFmt(r.c,v)} · ma pihenőnap`}
  const h=r.h,v=Y.periodValue(h,date);
  if(h.measure==='check')return Y.complete(h,date)?'kész':'még nem';
  const unit=h.measure==='minutes'?'perc':h.measure==='count'?'alkalom':(h.unit||'');
  return `${Math.round(v*10)/10} / ${h.target} ${unit}`;
}
function summary(){
  const r=resolve();if(!r)return null;
  const t=Y.today();
  return{name:`${r.emoji} ${r.name}`,streak:streak(r),today:valueText(r,t),done:doneOn(r,t)===true};
}

function options(sel){
  const s=S();
  const hs=s.habits.filter(h=>!h.parentId).map(h=>`<option value="${h.id}" ${sel===h.id?'selected':''}>${h.emoji||''} ${esc(h.name)}</option>`).join('');
  const cs=s.categories.map(c=>`<option value="cat:${c.id}" ${sel==='cat:'+c.id?'selected':''}>${c.emoji||'🍃'} ${esc(c.name)}${Number(c.target)>0||c.period==='custom'?'':' · nincs cél'}</option>`).join('');
  return`<option value="">— válassz —</option><optgroup label="Kategóriák">${cs}</optgroup><optgroup label="Szokások">${hs}</optgroup>`;
}
function calendar(r){
  const ma=Y.today(),cur=calCur||new Date(ma+'T12:00:00'),y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1,12),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate();
  let cells='',done=0,cnt=0;
  for(let i=0;i<offset;i++)cells+='<span></span>';
  for(let d=1;d<=days;d++){
    const iso=new Date(y,m,d,12).toLocaleDateString('sv-SE');
    if(iso>ma){cells+=`<span class="tc-day future">${d}</span>`;continue}
    const s=doneOn(r,iso);if(s!==null)cnt++;if(s)done++;
    cells+=`<span class="tc-day ${s===true?'tc-6':s===false?'tc-2':'tc-0'} ${iso===ma?'tod':''}" title="${iso} · ${s===true?'kész':s===false?'kimaradt':'pihenő'}">${d}</span>`;
  }
  return`<div class="card"><div class="tree-cal-head"><button type="button" class="btn small" data-focus-cal="-1">‹</button><b>${first.toLocaleDateString('hu-HU',{year:'numeric',month:'long'})}</b><button type="button" class="btn small" data-focus-cal="1">›</button></div><div class="tc-grid">${['H','K','Sze','Cs','P','Szo','V'].map(w=>`<span class="tc-w">${w}</span>`).join('')}${cells}</div><p class="vow-note" style="margin:10px 0 0">${cnt?`${done} / ${cnt} nap teljesítve ebben a hónapban`:''}</p></div>`;
}
function entry(r){
  const t=Y.today();
  if(r.kind==='cat')return CATLOG.card(r.c);
  const h=r.h;
  if(h.measure==='check')return`<div class="card"><h3>Ma</h3><button class="btn primary" data-focus-check="${h.id}">${Y.complete(h,t)?'✓ Kész – visszavonás':'Kész'}</button></div>`;
  if(h.measure==='count')return`<div class="card"><h3>Ma</h3><div class="actions"><button class="btn primary" data-focus-inc="${h.id}|1">+1 alkalom</button><button class="btn" data-focus-inc="${h.id}|-1">−1</button></div></div>`;
  return`<div class="card"><h3>Mennyit töltöttem vele ma?</h3><div class="catlog-row"><input type="number" min="0" step="any" id="focusAmount" placeholder="pl. 1.5" inputmode="decimal"><select id="focusUnit">${h.measure==='minutes'?'<option value="60">óra</option><option value="1">perc</option>':`<option value="1">${esc(h.unit||'egység')}</option>`}</select><button class="btn primary small" data-focus-add="${h.id}">Hozzáadás</button></div></div>`;
}
function view(){
  const r=resolve();
  const head=Y.top('🎯 Fókusz','Egy tevékenység, amire most figyelsz: naptár, sorozat, és a mai idő beírása.',`<button class="btn" data-go="prio">← Prioritások</button>`);
  const picker=`<div class="card"><label class="field" style="display:block"><span style="font-size:13px;color:var(--muted);font-weight:800">Tevékenység</span><select id="focusPick" style="width:100%;margin-top:6px">${options(S().focus.key)}</select></label></div>`;
  if(!r)return head+picker+'<div class="card empty">Válassz egy kategóriát vagy szokást.</div>';
  const st=streak(r),t=Y.today(),d=doneOn(r,t);
  const stats=`<div class="card"><h2 style="margin:0 0 6px">${r.emoji} ${esc(r.name)}</h2><div class="chips"><span class="chip">🔥 sorozat: ${st} nap</span><span class="chip">ma: ${valueText(r,t)}</span><span class="chip">${d===true?'✅ mai cél kész':d===false?'○ a mai cél még hiányzik':'😌 ma pihenőnap'}</span></div></div>`;
  return head+picker+`<div class="grid g2">${stats}${entry(r)}${calendar(r)}</div>`;
}
function bind(){
  const pick=document.getElementById('focusPick');
  if(pick)pick.onchange=()=>{S().focus.key=pick.value;calCur=null;Y.save();Y.render()};
  document.querySelectorAll('[data-focus-cal]').forEach(b=>b.onclick=()=>{const cur=calCur||new Date(Y.today()+'T12:00:00');calCur=new Date(cur.getFullYear(),cur.getMonth()+Number(b.dataset.focusCal),1,12);Y.render()});
  document.querySelectorAll('[data-focus-check]').forEach(b=>b.onclick=()=>{const h=S().habits.find(x=>x.id===b.dataset.focusCheck);if(!h)return;const t=Y.today();if(Y.complete(h,t))Y.clearLog(h.id,t);else Y.setLog(h.id,t,Math.max(1,Number(h.target)||1))});
  document.querySelectorAll('[data-focus-inc]').forEach(b=>b.onclick=()=>{const[id,d]=b.dataset.focusInc.split('|');const t=Y.today(),nv=Math.max(0,Y.getLog(id,t)+Number(d));if(nv>0)Y.setLog(id,t,nv);else Y.clearLog(id,t)});
  document.querySelectorAll('[data-focus-add]').forEach(b=>b.onclick=()=>{const a=Number(document.getElementById('focusAmount').value)||0,u=Number(document.getElementById('focusUnit').value)||1,v=Math.round(a*u*10)/10;if(!v)return Y.toast('Írd be a mennyiséget.');const t=Y.today();Y.setLog(b.dataset.focusAdd,t,Y.getLog(b.dataset.focusAdd,t)+v);Y.toast(`+${v} könyvelve`)});
}
return{init,migrate,view,bind,summary};
})();
