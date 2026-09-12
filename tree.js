window.TREE=(function(){
'use strict';
let Y=null;
const BOUNDS=[0,.236,.396,.523,.635,.755,1];
const NAMES=['Mélygyökér','Gyökerek','Törzs és erdő','Törzs és hegyek','Lombkorona','Korona teteje'];
const S=()=>Y.state();

function init(bridge){Y=bridge}
function migrate(s){
  s.treeAwards=s.treeAwards&&typeof s.treeAwards==='object'?s.treeAwards:{};
  s.tree=s.tree||{};
  s.tree.levels=Array.isArray(s.tree.levels)?s.tree.levels.slice(0,6).map(x=>x||''):[];
  while(s.tree.levels.length<6)s.tree.levels.push('');
}

function resolve(key){
  if(!key)return null;
  if(key.startsWith('cat:')){const c=S().categories.find(x=>x.id===key.slice(4));return c?{kind:'cat',c,name:c.name,emoji:c.emoji}:null}
  const h=S().habits.find(x=>x.id===key);return h?{kind:'habit',h,name:h.name,emoji:h.emoji}:null;
}
let calCur=null;
function levels(date){
  const t=date||Y.today();let chain=true;
  return S().tree.levels.map((key,i)=>{
    const r=resolve(key);
    const h=r&&r.kind==='habit'?r.h:null,c=r&&r.kind==='cat'?r.c:null;
    const ct=c?Y.catTargetFor(c,t):0;
    const rest=!!c&&c.period==='custom'&&ct===0;
    const done=h?Y.complete(h,t):c?(rest||(ct>0&&Y.categoryValue(c,t)>=ct)):false;
    const active=done&&chain;
    chain=active;
    return{i,h,c,r,done,active,rest};
  });
}
function activeCount(){return levels().filter(l=>l.active).length}
// daily reward: 4 living levels → D6, 5 → D4, 6 → D2; must be claimed the same day
function dailyTier(){const n=activeCount();return{n,dice:n>=6?2:n>=5?4:n>=4?6:0}}
function pendingToday(){const d=dailyTier(),got=S().treeAwards[Y.today()];return d.dice&&!got?d:null}
let rolling=false;
async function claimToday(){
  const t=Y.today(),d=pendingToday();if(!d||rolling)return false;rolling=true;
  const roll=1+Math.floor(Math.random()*d.dice),won=roll===d.dice;
  await STREAK.animate(d.dice,roll,won);rolling=false;
  S().treeAwards[t]={n:d.n,dice:d.dice,roll,won};
  STREAK.logDice({source:'tree',date:t,levels:d.n,dice:d.dice,roll,won});
  if(won){PMAP.openGift(1,`🌳 Yggdrasil · ${d.n}/6 szint (${t})`,{silent:true});Y.toast('🧩 +1 darabka a zsákba')}
  else Y.toast(`🎲 ${roll} – ma nem jött össze.`);
  Y.save();return true;
}

function stage(lv,cls=''){
  const slices=lv.map(l=>{const top=BOUNDS[5-l.i]*100,bottom=Math.max(0,(1-BOUNDS[6-l.i])*100-(l.i>0?.4:0));return`<img class="tree-slice ${l.active?'on':''}" src="fa-eles.jpg" alt="" style="clip-path:inset(${top}% 0 ${bottom}% 0)">`}).join('');
  const nums=lv.map(l=>`<span class="tree-num ${l.active?'on':l.done?'wait':''}" style="top:${(BOUNDS[5-l.i]+BOUNDS[6-l.i])/2*100}%">${l.i+1}</span>`).join('');
  return`<div class="tree-stage ${cls}"><img class="tree-base" src="fa-halvany.jpg" alt="Yggdrasil" onerror="this.parentNode.classList.add('tree-missing')">${slices}${nums}<div class="tree-missing-msg">Hiányzik a kép: tedd a <b>fa-eles.jpg</b> és <b>fa-halvany.jpg</b> fájlokat az app mappájába.</div></div>`;
}

function progressText(l){
  if(!l.h&&!l.c)return'Nincs szokás vagy kategória rendelve ehhez a szinthez.';
  const t=Y.today();
  if(l.c){
    const c=l.c,tg=Y.catTargetFor(c,t),v=Y.categoryValue(c,t);
    if(l.rest)return l.active?'😌 Ma pihenőnap ennél a kategóriánál – a szint él':'😌 Ma pihenőnap – de az alatta lévő szint még nem él';
    if(!tg)return'⚠️ Ennek a kategóriának nincs célja – állíts be egyet a kategória szerkesztőjében.';
    const per=Y.catPeriodLabel(c),val=`${Y.catFmt(c,v)} / ${Y.catFmt(c,tg)} ${per}`;
    return l.active?`✨ Él · ${val}`:l.done?`✓ Kész · ${val} – de az alatta lévő szint még nem él`:`○ A ${per==='ma'?'mai':per.replace('ezen a ','e ').replace('ebben a ','e ')} cél még hiányzik · ${val}`;
  }
  const h=l.h;
  const per=h.period==='week'?'ezen a héten':h.period==='month'?'ebben a hónapban':'ma';
  let val='';
  if(h.measure!=='check'){const v=Y.periodValue(h,t),tg=Number(h.target)||0;val=`${Math.round(v*10)/10}${tg?` / ${tg}`:''}${h.measure==='minutes'?' perc':h.measure==='count'?' alkalom':h.unit?' '+h.unit:''} ${per}`}
  if(l.active)return`✨ Él${val?' · '+val:''}`;
  if(l.done)return`✓ Kész${val?' · '+val:''} – de az alatta lévő szint még nem él`;
  return`○ A ${per==='ma'?'mai':per.replace('ezen a ','e ').replace('ebben a ','e ')} cél még hiányzik${val?' · '+val:''}`;
}

function habitOptions(selected){
  const hs=S().habits;
  const roots=hs.filter(h=>!h.parentId),kids=id=>hs.filter(h=>h.parentId===id);
  const opt=(h,gy)=>`<option value="${h.id}" ${h.id===selected?'selected':''}>${gy?'↳ ':''}${h.emoji||''} ${Y.esc(h.name)}</option>`;
  const cats=S().categories.map(c=>`<option value="cat:${c.id}" ${'cat:'+c.id===selected?'selected':''}>${c.emoji||'🍃'} ${Y.esc(c.name)}${c.period==='custom'?` · egyéni napi ${Y.catUnit(c)}`:Number(c.target)>0?` · ${Y.catFmt(c,c.target)} / ${c.period==='week'?'hét':c.period==='month'?'hónap':'nap'}`:' · nincs cél'}</option>`).join('');
  return`<option value="">— válassz szokást vagy kategóriát —</option><optgroup label="Szokások">${roots.map(h=>opt(h,false)+kids(h.id).map(c=>opt(c,true)).join('')).join('')}</optgroup>${cats?`<optgroup label="Kategóriák (időszaki cél)">${cats}</optgroup>`:''}`;
}

function calendar(){
  const ma=Y.today(),cur=calCur||new Date(ma+'T12:00:00'),y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1,12),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate();
  const configured=S().tree.levels.some(Boolean);
  let cells='',sum=0,cnt=0;
  for(let i=0;i<offset;i++)cells+='<span></span>';
  for(let d=1;d<=days;d++){
    const dt=new Date(y,m,d,12),iso=dt.toLocaleDateString('sv-SE');
    if(iso>ma||!configured){cells+=`<span class="tc-day future ${iso===ma?'tod':''}">${d}</span>`;continue}
    const n=levels(iso).filter(l=>l.active).length;sum+=n;cnt++;
    cells+=`<span class="tc-day tc-${n} ${iso===ma?'tod':''}" title="${iso} · ${n}/6 szint">${n}</span>`;
  }
  const label=first.toLocaleDateString('hu-HU',{year:'numeric',month:'long'});
  return`<div class="card tree-cal"><div class="tree-cal-head"><button type="button" class="btn small" data-tree-cal="-1" title="Előző hónap">‹</button><b>${label}</b><button type="button" class="btn small" data-tree-cal="1" title="Következő hónap">›</button></div><div class="tc-grid">${['H','K','Sze','Cs','P','Szo','V'].map(w=>`<span class="tc-w">${w}</span>`).join('')}${cells}</div><div class="tc-legend">${[0,1,2,3,4,5,6].map(n=>`<span><i class="tc-${n}"></i>${n}</span>`).join('')}<span class="tc-avg">${cnt?`átlag ${(sum/cnt).toFixed(1)}`:''}</span></div></div>`;
}
function view(){
  const lv=levels(),n=lv.filter(l=>l.active).length;
  const t=Y.today();
  const ticks=l=>{
    if(l.h&&l.h.measure!=='bp'){const st=Y.getStatus(l.h.id,t),full=Y.complete(l.h,t);return`<div class="status-buttons tree-ticks"><button type="button" data-tree-full="${l.h.id}" class="${full?'active-full':''}" title="${full?'Visszavonás':'Mai cél kipipálása'}">✓</button>${Number(l.h.minimumValue)>0?`<button type="button" data-tree-min="${l.h.id}" class="${st==='minimum'?'active-min':''}" title="Minimum verzió (${l.h.minimumValue})">🌱</button>`:''}</div>`}
    if(l.c)return`<div class="status-buttons tree-ticks"><button type="button" data-tree-cat="${l.c.id}" title="Idő könyvelése a kategóriára">⏱ idő</button></div>`;
    return'';
  };
  const rows=[...lv].reverse().map(l=>`<div class="tree-row ${l.active?'active':l.done?'done':''}"><div class="tree-badge">${l.i+1}</div><div class="grow"><div class="tree-row-head"><b>${NAMES[l.i]}</b><span class="chip">${l.active?'él':l.done?'kész, vár':(l.h||l.c)?'hiányzik':'üres'}</span></div><select data-tree-level="${l.i}">${habitOptions(S().tree.levels[l.i])}</select><div class="tree-row-foot"><p class="tree-status">${progressText(l)}</p>${ticks(l)}</div></div></div>`).join('');
  const d=dailyTier(),got=S().treeAwards[Y.today()];
  const reward=got?`<span class="chip">🎲 mai dobás: ${got.roll}/${got.dice}${got.won?' · +1 darabka':' · semmi'}</span>`:d.dice?`<span class="chip" style="background:#fff4d6;color:#8a5a00">🎲 ma D${d.dice} jár – beváltás a 🧩 Darabkáknál</span>`:`<span class="chip">🎲 4 élő szinttől D6, 5-től D4, 6-tól D2 – csak aznap váltható be</span>`;
  return Y.top('🌳 Yggdrasil',`Minden szint egy szokás vagy egy kategória célja. A fa alulról felfelé kel életre: egy szint csak akkor világít, ha a célja teljesült <i>és</i> az alatta lévő szint is él. Ma ${n} / 6 szint él. ${reward}`)+
  `<div class="tree-wrap">${stage(lv)}<div class="tree-right"><div class="card tree-levels">${rows}<p class="vow-note" style="margin:10px 0 0">A sorrend számít: az 1. szint (gyökér) a legfontosabb szokásod legyen – ha az kimarad, az egész fa halvány marad.</p></div>${calendar()}</div></div>`;
}

function homeCard(){
  const lv=levels(),n=lv.filter(l=>l.active).length,set=lv.filter(l=>l.h||l.c).length;
  return`<div class="card tree-home" id="treeHomeCard" data-go="tree"><div class="section" style="margin:0 0 10px"><h3>🌳 Yggdrasil</h3><span class="chip">${n} / 6 szint él</span></div>${stage(lv,'mini')}<p class="tree-status" style="margin:10px 0 0">${set?`${n===6?'A teljes fa él ma. ✨':n?`A fa a ${n}. szintig él.`:'A fa ma még halvány – kezdd a gyökérnél.'}`:'Rendelj szokásokat a szintekhez.'}</p></div>`;
}

function bind(){
  document.querySelectorAll('[data-tree-level]').forEach(sel=>sel.onchange=()=>{S().tree.levels[Number(sel.dataset.treeLevel)]=sel.value;Y.save();Y.render()});
  document.querySelectorAll('[data-tree-full]').forEach(b=>b.onclick=()=>{const h=S().habits.find(x=>x.id===b.dataset.treeFull);if(!h)return;const t=Y.today();if(Y.complete(h,t))Y.clearLog(h.id,t);else Y.setLog(h.id,t,Math.max(1,Number(h.target)||1),'full')});
  document.querySelectorAll('[data-tree-min]').forEach(b=>b.onclick=()=>Y.setMinimum(b.dataset.treeMin,Y.today()));
  document.querySelectorAll('[data-tree-cat]').forEach(b=>b.onclick=()=>Y.openCategoryDetail(b.dataset.treeCat));
  document.querySelectorAll('[data-tree-cal]').forEach(b=>b.onclick=()=>{const cur=calCur||new Date(Y.today()+'T12:00:00');calCur=new Date(cur.getFullYear(),cur.getMonth()+Number(b.dataset.treeCal),1,12);Y.render()});
}

return{init,migrate,view,bind,activeCount,dailyTier,pendingToday,claimToday};
})();
