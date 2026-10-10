window.ORATERV=(function(){
'use strict';
let Y=null,editing=false;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
function migrate(s){const o=s.oraterv&&typeof s.oraterv==='object'?s.oraterv:{};o.start=o.start||'';o.weeks=Math.max(1,Math.min(52,Number(o.weeks)||15));o.rows=Array.isArray(o.rows)?o.rows:[];o.rows.forEach(r=>{r.extra=Array.isArray(r.extra)?r.extra.filter(x=>x&&x.habitId):[];r.plan=Array.isArray(r.plan)?r.plan.map(x=>Number(x)||0):[];while(r.plan.length<o.weeks)r.plan.push(0);r.plan.length=o.weeks});s.oraterv=o;syncTargets(s)}
// Óraterv rows drive their habit's weekly target: the current week's planned hours
function syncTargets(s){const o=s.oraterv;if(!o||!o.start||!o.rows.length)return;const t=new Date(Date.now()-(window.DAY_START_MIN||0)*60000).toLocaleDateString('sv-SE');const n=Math.floor((new Date(t+'T12:00:00')-new Date(o.start+'T12:00:00'))/86400000);const w=n<0?0:Math.min(Math.floor(n/7),o.weeks-1);o.rows.forEach(r=>{const h=(s.habits||[]).find(x=>x.id===r.habitId);if(!h||h.period!=='week'||h.measure!=='minutes'||h.otSync===false)return;const plan=Number(r.plan[w])||0;if(plan>0)h.target=Math.max(5,Math.round(plan*60/5)*5)})}
function shift(iso,d){const x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+d);return x.toLocaleDateString('sv-SE')}
function weekDates(i){const o=S().oraterv;const a=shift(o.start,i*7);return Array.from({length:7},(_,k)=>shift(a,k))}
function currentWeek(){const o=S().oraterv;if(!o.start)return-1;const t=Y.today();const n=Math.floor((new Date(t+'T12:00:00')-new Date(o.start+'T12:00:00'))/86400000);if(n<0)return-1;const w=Math.floor(n/7);return w<o.weeks?w:o.weeks}
// hours actually booked on a habit in a week: minute logs, or completed plan blocks for non-minute habits
function rowMinutes(r,h,dates){let m=actualMinutes(h,dates);(r.extra||[]).forEach(x=>{const eh=S().habits.find(y=>y.id===x.habitId);if(!eh)return;m+=actualMinutes(eh,dates.filter(d=>!x.from||d>=x.from))});return m}
function actualMinutes(h,dates){if(!h)return 0;if(h.measure==='minutes')return dates.reduce((s,d)=>s+(Y.habitMinutesOn?Y.habitMinutesOn(h,d):(Y.getLog(h.id,d)||0)),0);return dates.reduce((s,d)=>s+Y.planEntries(d).filter(e=>e.habitId===h.id&&Y.planDone(e)).reduce((a,e)=>a+(Number(e.minutes)||0),0),0)}
const fh=n=>{const v=Math.round(n*10)/10;return(Number.isInteger(v)?v:v.toFixed(1).replace('.',','))}
function cellClass(plan,act,wi,cur){if(!plan)return act?'ot-extra':'ot-none';const r=act/plan;if(wi<cur)return r>=0.95?'ot-ok':r>=0.5?'ot-half':'ot-miss';if(wi===cur)return r>=0.95?'ot-ok':r>0?'ot-run':'ot-cur';return'ot-future'}
function summary(){const o=S().oraterv,cur=currentWeek();if(!o.rows.length||cur<0||cur>=o.weeks)return null;const dates=weekDates(cur);let plan=0,act=0;o.rows.forEach(r=>{const h=S().habits.find(x=>x.id===r.habitId);plan+=r.plan[cur]||0;act+=rowMinutes(r,h,dates)/60});return{week:cur+1,weeks:o.weeks,plan,act}}
let mode=(()=>{try{return localStorage.getItem('yggdrasil_otmode')||'all'}catch(e){return'all'}})(),wkCur=null;
// one week as cards: plan vs actual per subject, with the seven days underneath
function weekView(o,cur,hs){
  const wi=Math.max(0,Math.min(o.weeks-1,wkCur==null?Math.max(0,Math.min(cur,o.weeks-1)):wkCur)),dates=weekDates(wi),DN=['H','K','Sze','Cs','P','Szo','V'],t=Y.today();
  let tp=0,ta=0;
  const rows=o.rows.map(r=>{const h=hs.find(x=>x.id===r.habitId);const parent=h&&h.parentId?hs.find(x=>x.id===h.parentId):null;const plan=r.plan[wi]||0,days=dates.map(d=>d<=t?rowMinutes(r,h,[d]):0),act=days.reduce((a,b)=>a+b,0)/60;tp+=plan;ta+=act;const cls=cellClass(plan,act,wi,cur),pct=plan?Math.min(100,Math.round(act/plan*100)):0,rest=Math.max(0,plan-act);
    return`<div class="ot-wrow ${cls}"><div class="ot-whead"><span class="ot-wname">${h?h.emoji||'🌱':'❓'} ${esc(h?h.name:'(törölt szokás)')}${parent?` <small>· ${esc(parent.name)}</small>`:''}${(r.extra||[]).map(x=>{const eh=hs.find(y=>y.id===x.habitId);return eh?` <small>+ ${eh.emoji||''} ${esc(eh.name)}</small>`:''}).join('')}</span><span class="ot-wnum">${editing?`<input type="number" min="0" step="0.5" data-ot-cell="${r.id}|${wi}" value="${plan||''}" style="width:64px"> ó terv`:`<b>${fh(act)}</b> / ${fh(plan)} ó${plan&&wi<=cur?` · ${rest?`még ${fh(rest)} ó`:'megvan ✓'}`:''}`}</span></div>${plan?`<div class="bar ot-wbar"><i style="width:${pct}%"></i></div>`:''}<div class="ot-wdays">${dates.map((d,k)=>`<span class="${d===t?'tod':''} ${d>t?'future':''}" title="${d}">${DN[k]}<b>${days[k]?fh(days[k]/60):'–'}</b></span>`).join('')}</div></div>`}).join('');
  const nav=`<div class="chips" style="margin-bottom:10px;align-items:center"><button type="button" class="btn small" data-ot-week="-1" ${wi<=0?'disabled':''}>‹</button><span class="chip">${wi+1}. hét / ${o.weeks} · ${dates[0]} – ${dates[6]}${wi===cur?' · most':''}</span><button type="button" class="btn small" data-ot-week="1" ${wi>=o.weeks-1?'disabled':''}>›</button>${wi!==cur&&cur>=0&&cur<o.weeks?'<button type="button" class="btn small" data-ot-week="now">Mai hét</button>':''}<span class="chip">összesen: ${fh(ta)} / ${fh(tp)} ó${tp?` · ${Math.round(ta/tp*100)}%`:''}</span></div>`;
  return nav+`<div class="ot-week">${rows||'<div class="empty" style="padding:14px">Még nincs sor az óratervben.</div>'}</div>`;
}
function view(){
  const o=S().oraterv,cur=currentWeek(),hs=S().habits;
  const head=Y.top('📊 Óraterv','Heti órakeret tevékenységenként – a „megvolt” magától töltődik a naplózott időből.',`<button class="btn" data-go="schedule">← Időbeosztás</button>${o.start?`<button class="btn" id="otMode" title="Váltás a teljes táblázat és az egy hét nézet között">${mode==='week'?`📊 Mind a ${o.weeks} hét`:'📅 Heti nézet'}</button>`:''}<button class="btn ${editing?'primary':''}" id="otEdit">${editing?'✓ Kész':'✏️ Terv szerkesztése'}</button>`);
  if(!o.start)return head+`<div class="card"><h3>Óraterv indítása</h3><div class="catlog-row"><label>1. hét kezdete <input type="date" id="otStart" value="${Y.today()}"></label><label>hetek <input type="number" id="otWeeks" min="1" max="52" value="15" style="width:80px"></label><button class="btn primary small" id="otInit">Indítás</button></div></div>`;
  const wk=Array.from({length:o.weeks},(_,i)=>i);
  const thead=`<tr><th class="ot-name">Tevékenység</th>${wk.map(i=>`<th class="${i===cur?'ot-curcol':''}" title="${weekDates(i)[0]} – ${weekDates(i)[6]}">${i+1}.</th>`).join('')}<th>Σ terv</th><th>Σ megvolt</th></tr>`;
  const tot=wk.map(()=>({p:0,a:0}));
  const rows=o.rows.map(r=>{const h=hs.find(x=>x.id===r.habitId);const parent=h&&h.parentId?hs.find(x=>x.id===h.parentId):null;let sp=0,sa=0;
    const cells=wk.map(i=>{const dates=weekDates(i),plan=r.plan[i]||0,act=i<=cur?rowMinutes(r,h,dates)/60:0;sp+=plan;sa+=act;tot[i].p+=plan;tot[i].a+=act;
      const inp=editing?`<input type="number" min="0" step="0.5" data-ot-cell="${r.id}|${i}" value="${plan||''}">`:`<b>${plan?fh(plan):'–'}</b>${i<=cur&&(plan||act)?`<small>${fh(act)}</small>`:''}`;
      return`<td class="${cellClass(plan,act,i,cur)} ${i===cur?'ot-curcol':''}" title="${i+1}. hét · terv ${fh(plan)} ó · megvolt ${fh(act)} ó">${inp}</td>`}).join('');
    return`<tr><td class="ot-name"><span>${h?h.emoji||'🌱':'❓'} ${esc(h?h.name:'(törölt szokás)')}</span>${parent?`<small>${parent.emoji||''} ${esc(parent.name)}</small>`:''}${(r.extra||[]).map(x=>{const eh=hs.find(y=>y.id===x.habitId);return eh?`<small class="ot-extra-h" title="beszámít ${x.from||'kezdettől'}">+ ${eh.emoji||''} ${esc(eh.name)}${editing?` <button class="btn small" data-ot-xdel="${r.id}|${x.habitId}" title="Levétel">✕</button>`:''}</small>`:''}).join('')}${editing?`<button class="btn small" data-ot-del="${r.id}" title="Sor törlése">🗑️</button><select class="ot-xadd" data-ot-xadd="${r.id}" title="Másik szokás perceit is beszámítja ebbe a sorba"><option value="">+ beszámít…</option>${hs.filter(x=>x.measure==='minutes'&&x.id!==r.habitId&&!(r.extra||[]).some(e=>e.habitId===x.id)).map(x=>`<option value="${x.id}">${x.parentId?'↳ ':''}${x.emoji||''} ${esc(x.name)}</option>`).join('')}</select>`:''}</td>${cells}<td><b>${fh(sp)}</b></td><td><b>${fh(sa)}</b></td></tr>`}).join('');
  const sum=`<tr class="ot-sum"><td class="ot-name">Összesen</td>${wk.map((i)=>`<td class="${i===cur?'ot-curcol':''}"><b>${fh(tot[i].p)}</b>${i<=cur?`<small>${fh(tot[i].a)}</small>`:''}</td>`).join('')}<td><b>${fh(tot.reduce((s,x)=>s+x.p,0))}</b></td><td><b>${fh(tot.reduce((s,x)=>s+x.a,0))}</b></td></tr>`;
  const add=editing?`<div class="catlog-row" style="margin-top:10px"><select id="otAddHabit">${hs.filter(h=>!o.rows.some(r=>r.habitId===h.id)).map(h=>`<option value="${h.id}">${h.parentId?'↳ ':''}${h.emoji||''} ${esc(h.name)}</option>`).join('')}</select><button class="btn small" id="otAdd">+ Sor</button><label style="margin-left:auto">1. hét: <input type="date" id="otStart" value="${o.start}"></label><label>hetek: <input type="number" id="otWeeks" min="1" max="52" value="${o.weeks}" style="width:70px"></label></div>`:'';
  const s=summary();
  const info=s?`<div class="chips" style="margin-bottom:10px"><span class="chip">${s.week}. hét / ${s.weeks} · ${weekDates(cur)[0]} – ${weekDates(cur)[6]}</span><span class="chip">ezen a héten: ${fh(s.act)} / ${fh(s.plan)} ó</span><span class="chip">${s.plan?Math.round(s.act/s.plan*100):0}%</span></div>`:(cur<0?`<div class="chips" style="margin-bottom:10px"><span class="chip">Az óraterv ${o.start}-én indul.</span></div>`:`<div class="chips" style="margin-bottom:10px"><span class="chip">Az óraterv lejárt (${o.weeks} hét).</span></div>`);
  const body=mode==='week'?weekView(o,cur,hs):`${info}<div class="ot-wrap"><table class="ot"><thead>${thead}</thead><tbody>${rows}${sum}</tbody></table></div>`;
  return head+`<div class="card">${body}${add}<p class="vow-note" style="margin:10px 0 0">A heti mérésű szokások célja automatikusan az aktuális hét tervezett órája. Cella: <b>terv</b> óra, alatta a <small>megvolt</small>. Zöld = a heti keret megvolt, sárga = félig, piros = elmaradt; a mostani hét kiemelve. A megvolt a szokásra naplózott percekből (pomodoro, napiterv, kézi beírás) jön.</p></div>`;
}
function bind(){
  const q=s=>document.querySelectorAll(s);
  const ed=document.getElementById('otEdit');if(ed)ed.onclick=()=>{if(editing){commitEdits()}editing=!editing;Y.render()};
  const md=document.getElementById('otMode');if(md)md.onclick=()=>{if(editing)commitEdits();mode=mode==='week'?'all':'week';try{localStorage.setItem('yggdrasil_otmode',mode)}catch(e){}Y.render()};
  q('[data-ot-week]').forEach(b=>b.onclick=()=>{if(editing)commitEdits();const o=S().oraterv,cur=currentWeek(),base=wkCur==null?Math.max(0,Math.min(cur,o.weeks-1)):wkCur;wkCur=b.dataset.otWeek==='now'?null:Math.max(0,Math.min(o.weeks-1,base+Number(b.dataset.otWeek)));Y.render()});
  const ini=document.getElementById('otInit');if(ini)ini.onclick=()=>{const o=S().oraterv;o.start=document.getElementById('otStart').value||Y.today();o.weeks=Math.max(1,Number(document.getElementById('otWeeks').value)||15);migrate(S());Y.save();Y.render()};
  const add=document.getElementById('otAdd');if(add)add.onclick=()=>{commitEdits();const hid=document.getElementById('otAddHabit').value;if(!hid)return;S().oraterv.rows.push({id:Y.uid(),habitId:hid,plan:Array(S().oraterv.weeks).fill(0)});Y.save();Y.render()};
  q('[data-ot-xadd]').forEach(s=>s.onchange=()=>{if(!s.value)return;commitEdits();const r=S().oraterv.rows.find(x=>x.id===s.dataset.otXadd);const from=prompt('Mettől számítson bele? (ÉÉÉÉ-HH-NN, üres = kezdettől)',Y.today());if(from===null){Y.render();return}r.extra=(r.extra||[]).concat({habitId:s.value,from:/^\d{4}-\d{2}-\d{2}$/.test((from||'').trim())?from.trim():''});Y.save();Y.render()});
  q('[data-ot-xdel]').forEach(b=>b.onclick=()=>{const[rid,hid]=b.dataset.otXdel.split('|');commitEdits();const r=S().oraterv.rows.find(x=>x.id===rid);if(r)r.extra=(r.extra||[]).filter(x=>x.habitId!==hid);Y.save();Y.render()});
  q('[data-ot-del]').forEach(b=>b.onclick=()=>{if(!confirm('Törlöd ezt a sort az óratervből? (A szokás megmarad.)'))return;commitEdits();S().oraterv.rows=S().oraterv.rows.filter(r=>r.id!==b.dataset.otDel);Y.save();Y.render()});
  q('[data-ot-cell]').forEach(i=>i.onchange=()=>{const[rid,w]=i.dataset.otCell.split('|');const r=S().oraterv.rows.find(x=>x.id===rid);if(r){r.plan[Number(w)]=Math.max(0,Number(i.value)||0);Y.save()}});
  const st=document.getElementById('otStart'),wkI=document.getElementById('otWeeks');
  if(st&&editing)st.onchange=()=>{S().oraterv.start=st.value;Y.save();Y.render()};
  if(wkI&&editing)wkI.onchange=()=>{S().oraterv.weeks=Math.max(1,Math.min(52,Number(wkI.value)||15));migrate(S());Y.save();Y.render()};
}
function commitEdits(){document.querySelectorAll('[data-ot-cell]').forEach(i=>{const[rid,w]=i.dataset.otCell.split('|');const r=S().oraterv.rows.find(x=>x.id===rid);if(r)r.plan[Number(w)]=Math.max(0,Number(i.value)||0)});Y.save()}
return{init,migrate,view,bind,summary,currentWeek};
})();
