window.ORATERV=(function(){
'use strict';
let Y=null,editing=false;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
function migrate(s){const o=s.oraterv&&typeof s.oraterv==='object'?s.oraterv:{};o.start=o.start||'';o.weeks=Math.max(1,Math.min(52,Number(o.weeks)||15));o.rows=Array.isArray(o.rows)?o.rows:[];o.rows.forEach(r=>{r.plan=Array.isArray(r.plan)?r.plan.map(x=>Number(x)||0):[];while(r.plan.length<o.weeks)r.plan.push(0);r.plan.length=o.weeks});s.oraterv=o;syncTargets(s)}
// Óraterv rows drive their habit's weekly target: the current week's planned hours
function syncTargets(s){const o=s.oraterv;if(!o||!o.start||!o.rows.length)return;const t=new Date().toLocaleDateString('sv-SE');const n=Math.floor((new Date(t+'T12:00:00')-new Date(o.start+'T12:00:00'))/86400000);const w=n<0?0:Math.min(Math.floor(n/7),o.weeks-1);o.rows.forEach(r=>{const h=(s.habits||[]).find(x=>x.id===r.habitId);if(!h||h.period!=='week'||h.measure!=='minutes'||h.otSync===false)return;const plan=Number(r.plan[w])||0;if(plan>0)h.target=Math.max(5,Math.round(plan*60/5)*5)})}
function shift(iso,d){const x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+d);return x.toLocaleDateString('sv-SE')}
function weekDates(i){const o=S().oraterv;const a=shift(o.start,i*7);return Array.from({length:7},(_,k)=>shift(a,k))}
function currentWeek(){const o=S().oraterv;if(!o.start)return-1;const t=Y.today();const n=Math.floor((new Date(t+'T12:00:00')-new Date(o.start+'T12:00:00'))/86400000);if(n<0)return-1;const w=Math.floor(n/7);return w<o.weeks?w:o.weeks}
// hours actually booked on a habit in a week: minute logs, or completed plan blocks for non-minute habits
function actualMinutes(h,dates){if(!h)return 0;if(h.measure==='minutes')return dates.reduce((s,d)=>s+(Y.getLog(h.id,d)||0),0);return dates.reduce((s,d)=>s+Y.planEntries(d).filter(e=>e.habitId===h.id&&Y.planDone(e)).reduce((a,e)=>a+(Number(e.minutes)||0),0),0)}
const fh=n=>{const v=Math.round(n*10)/10;return(Number.isInteger(v)?v:v.toFixed(1).replace('.',','))}
function cellClass(plan,act,wi,cur){if(!plan)return act?'ot-extra':'ot-none';const r=act/plan;if(wi<cur)return r>=0.95?'ot-ok':r>=0.5?'ot-half':'ot-miss';if(wi===cur)return r>=0.95?'ot-ok':r>0?'ot-run':'ot-cur';return'ot-future'}
function summary(){const o=S().oraterv,cur=currentWeek();if(!o.rows.length||cur<0||cur>=o.weeks)return null;const dates=weekDates(cur);let plan=0,act=0;o.rows.forEach(r=>{const h=S().habits.find(x=>x.id===r.habitId);plan+=r.plan[cur]||0;act+=actualMinutes(h,dates)/60});return{week:cur+1,weeks:o.weeks,plan,act}}
function view(){
  const o=S().oraterv,cur=currentWeek(),hs=S().habits;
  const head=Y.top('📊 Óraterv','Heti órakeret tevékenységenként – a „megvolt” magától töltődik a naplózott időből.',`<button class="btn" data-go="schedule">← Időbeosztás</button><button class="btn ${editing?'primary':''}" id="otEdit">${editing?'✓ Kész':'✏️ Terv szerkesztése'}</button>`);
  if(!o.start)return head+`<div class="card"><h3>Óraterv indítása</h3><div class="catlog-row"><label>1. hét kezdete <input type="date" id="otStart" value="${Y.today()}"></label><label>hetek <input type="number" id="otWeeks" min="1" max="52" value="15" style="width:80px"></label><button class="btn primary small" id="otInit">Indítás</button></div></div>`;
  const wk=Array.from({length:o.weeks},(_,i)=>i);
  const thead=`<tr><th class="ot-name">Tevékenység</th>${wk.map(i=>`<th class="${i===cur?'ot-curcol':''}" title="${weekDates(i)[0]} – ${weekDates(i)[6]}">${i+1}.</th>`).join('')}<th>Σ terv</th><th>Σ megvolt</th></tr>`;
  const tot=wk.map(()=>({p:0,a:0}));
  const rows=o.rows.map(r=>{const h=hs.find(x=>x.id===r.habitId);const parent=h&&h.parentId?hs.find(x=>x.id===h.parentId):null;let sp=0,sa=0;
    const cells=wk.map(i=>{const dates=weekDates(i),plan=r.plan[i]||0,act=i<=cur?actualMinutes(h,dates)/60:0;sp+=plan;sa+=act;tot[i].p+=plan;tot[i].a+=act;
      const inp=editing?`<input type="number" min="0" step="0.5" data-ot-cell="${r.id}|${i}" value="${plan||''}">`:`<b>${plan?fh(plan):'–'}</b>${i<=cur&&(plan||act)?`<small>${fh(act)}</small>`:''}`;
      return`<td class="${cellClass(plan,act,i,cur)} ${i===cur?'ot-curcol':''}" title="${i+1}. hét · terv ${fh(plan)} ó · megvolt ${fh(act)} ó">${inp}</td>`}).join('');
    return`<tr><td class="ot-name"><span>${h?h.emoji||'🌱':'❓'} ${esc(h?h.name:'(törölt szokás)')}</span>${parent?`<small>${parent.emoji||''} ${esc(parent.name)}</small>`:''}${editing?`<button class="btn small" data-ot-del="${r.id}" title="Sor törlése">🗑️</button>`:''}</td>${cells}<td><b>${fh(sp)}</b></td><td><b>${fh(sa)}</b></td></tr>`}).join('');
  const sum=`<tr class="ot-sum"><td class="ot-name">Összesen</td>${wk.map((i)=>`<td class="${i===cur?'ot-curcol':''}"><b>${fh(tot[i].p)}</b>${i<=cur?`<small>${fh(tot[i].a)}</small>`:''}</td>`).join('')}<td><b>${fh(tot.reduce((s,x)=>s+x.p,0))}</b></td><td><b>${fh(tot.reduce((s,x)=>s+x.a,0))}</b></td></tr>`;
  const add=editing?`<div class="catlog-row" style="margin-top:10px"><select id="otAddHabit">${hs.filter(h=>!o.rows.some(r=>r.habitId===h.id)).map(h=>`<option value="${h.id}">${h.parentId?'↳ ':''}${h.emoji||''} ${esc(h.name)}</option>`).join('')}</select><button class="btn small" id="otAdd">+ Sor</button><label style="margin-left:auto">1. hét: <input type="date" id="otStart" value="${o.start}"></label><label>hetek: <input type="number" id="otWeeks" min="1" max="52" value="${o.weeks}" style="width:70px"></label></div>`:'';
  const s=summary();
  const info=s?`<div class="chips" style="margin-bottom:10px"><span class="chip">${s.week}. hét / ${s.weeks} · ${weekDates(cur)[0]} – ${weekDates(cur)[6]}</span><span class="chip">ezen a héten: ${fh(s.act)} / ${fh(s.plan)} ó</span><span class="chip">${s.plan?Math.round(s.act/s.plan*100):0}%</span></div>`:(cur<0?`<div class="chips" style="margin-bottom:10px"><span class="chip">Az óraterv ${o.start}-én indul.</span></div>`:`<div class="chips" style="margin-bottom:10px"><span class="chip">Az óraterv lejárt (${o.weeks} hét).</span></div>`);
  return head+`<div class="card">${info}<div class="ot-wrap"><table class="ot"><thead>${thead}</thead><tbody>${rows}${sum}</tbody></table></div>${add}<p class="vow-note" style="margin:10px 0 0">A heti mérésű szokások célja automatikusan az aktuális hét tervezett órája. Cella: <b>terv</b> óra, alatta a <small>megvolt</small>. Zöld = a heti keret megvolt, sárga = félig, piros = elmaradt; a mostani hét kiemelve. A megvolt a szokásra naplózott percekből (pomodoro, napiterv, kézi beírás) jön.</p></div>`;
}
function bind(){
  const q=s=>document.querySelectorAll(s);
  const ed=document.getElementById('otEdit');if(ed)ed.onclick=()=>{if(editing){commitEdits()}editing=!editing;Y.render()};
  const ini=document.getElementById('otInit');if(ini)ini.onclick=()=>{const o=S().oraterv;o.start=document.getElementById('otStart').value||Y.today();o.weeks=Math.max(1,Number(document.getElementById('otWeeks').value)||15);migrate(S());Y.save();Y.render()};
  const add=document.getElementById('otAdd');if(add)add.onclick=()=>{commitEdits();const hid=document.getElementById('otAddHabit').value;if(!hid)return;S().oraterv.rows.push({id:Y.uid(),habitId:hid,plan:Array(S().oraterv.weeks).fill(0)});Y.save();Y.render()};
  q('[data-ot-del]').forEach(b=>b.onclick=()=>{if(!confirm('Törlöd ezt a sort az óratervből? (A szokás megmarad.)'))return;commitEdits();S().oraterv.rows=S().oraterv.rows.filter(r=>r.id!==b.dataset.otDel);Y.save();Y.render()});
  q('[data-ot-cell]').forEach(i=>i.onchange=()=>{const[rid,w]=i.dataset.otCell.split('|');const r=S().oraterv.rows.find(x=>x.id===rid);if(r){r.plan[Number(w)]=Math.max(0,Number(i.value)||0);Y.save()}});
  const st=document.getElementById('otStart'),wkI=document.getElementById('otWeeks');
  if(st&&editing)st.onchange=()=>{S().oraterv.start=st.value;Y.save();Y.render()};
  if(wkI&&editing)wkI.onchange=()=>{S().oraterv.weeks=Math.max(1,Math.min(52,Number(wkI.value)||15));migrate(S());Y.save();Y.render()};
}
function commitEdits(){document.querySelectorAll('[data-ot-cell]').forEach(i=>{const[rid,w]=i.dataset.otCell.split('|');const r=S().oraterv.rows.find(x=>x.id===rid);if(r)r.plan[Number(w)]=Math.max(0,Number(i.value)||0)});Y.save()}
return{init,migrate,view,bind,summary,currentWeek};
})();
