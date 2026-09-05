window.TREE=(function(){
'use strict';
let Y=null;
const BOUNDS=[0,.236,.396,.523,.635,.755,1];
const NAMES=['Mélygyökér','Gyökerek','Törzs és erdő','Törzs és hegyek','Lombkorona','Korona teteje'];
const S=()=>Y.state();

function init(bridge){Y=bridge}
function migrate(s){
  s.tree=s.tree||{};
  s.tree.levels=Array.isArray(s.tree.levels)?s.tree.levels.slice(0,6).map(x=>x||''):[];
  while(s.tree.levels.length<6)s.tree.levels.push('');
}

function levels(){
  const t=Y.today();let chain=true;
  return S().tree.levels.map((hid,i)=>{
    const h=hid?S().habits.find(x=>x.id===hid)||null:null;
    const done=!!h&&Y.complete(h,t);
    const active=done&&chain;
    chain=active;
    return{i,h,done,active};
  });
}
function activeCount(){return levels().filter(l=>l.active).length}

function stage(lv,cls=''){
  const slices=lv.map(l=>{const top=BOUNDS[5-l.i]*100,bottom=Math.max(0,(1-BOUNDS[6-l.i])*100-(l.i>0?.4:0));return`<img class="tree-slice ${l.active?'on':''}" src="fa-eles.jpg" alt="" style="clip-path:inset(${top}% 0 ${bottom}% 0)">`}).join('');
  const nums=lv.map(l=>`<span class="tree-num ${l.active?'on':l.done?'wait':''}" style="top:${(BOUNDS[5-l.i]+BOUNDS[6-l.i])/2*100}%">${l.i+1}</span>`).join('');
  return`<div class="tree-stage ${cls}"><img class="tree-base" src="fa-halvany.jpg" alt="Yggdrasil" onerror="this.parentNode.classList.add('tree-missing')">${slices}${nums}<div class="tree-missing-msg">Hiányzik a kép: tedd a <b>fa-eles.jpg</b> és <b>fa-halvany.jpg</b> fájlokat az app mappájába.</div></div>`;
}

function progressText(l){
  if(!l.h)return'Nincs szokás rendelve ehhez a szinthez.';
  const h=l.h,t=Y.today();
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
  return`<option value="">— válassz szokást —</option>${roots.map(h=>opt(h,false)+kids(h.id).map(c=>opt(c,true)).join('')).join('')}`;
}

function view(){
  const lv=levels(),n=lv.filter(l=>l.active).length;
  const rows=[...lv].reverse().map(l=>`<div class="tree-row ${l.active?'active':l.done?'done':''}"><div class="tree-badge">${l.i+1}</div><div class="grow"><div class="tree-row-head"><b>${NAMES[l.i]}</b><span class="chip">${l.active?'él':l.done?'kész, vár':l.h?'hiányzik':'üres'}</span></div><select data-tree-level="${l.i}">${habitOptions(S().tree.levels[l.i])}</select><p class="tree-status">${progressText(l)}</p></div></div>`).join('');
  return Y.top('🌳 Yggdrasil',`Minden szint egy szokás. A fa alulról felfelé kel életre: egy szint csak akkor világít, ha a célja teljesült <i>és</i> az alatta lévő szint is él. Ma ${n} / 6 szint él.`)+
  `<div class="tree-wrap">${stage(lv)}<div class="card tree-levels">${rows}<p class="vow-note" style="margin:10px 0 0">A sorrend számít: az 1. szint (gyökér) a legfontosabb szokásod legyen – ha az kimarad, az egész fa halvány marad.</p></div></div>`;
}

function homeCard(){
  const lv=levels(),n=lv.filter(l=>l.active).length,set=lv.filter(l=>l.h).length;
  return`<div class="card tree-home" id="treeHomeCard" data-go="tree"><div class="section" style="margin:0 0 10px"><h3>🌳 Yggdrasil</h3><span class="chip">${n} / 6 szint él</span></div>${stage(lv,'mini')}<p class="tree-status" style="margin:10px 0 0">${set?`${n===6?'A teljes fa él ma. ✨':n?`A fa a ${n}. szintig él.`:'A fa ma még halvány – kezdd a gyökérnél.'}`:'Rendelj szokásokat a szintekhez.'}</p></div>`;
}

function bind(){
  document.querySelectorAll('[data-tree-level]').forEach(sel=>sel.onchange=()=>{S().tree.levels[Number(sel.dataset.treeLevel)]=sel.value;Y.save();Y.render()});
  if(Y.view()==='home'){
    const grid=document.querySelector('#view .grid.g2');
    if(grid&&!document.getElementById('treeHomeCard')){grid.insertAdjacentHTML('afterbegin',homeCard());const c=document.getElementById('treeHomeCard');c.onclick=()=>Y.go('tree')}
  }
}

return{init,migrate,view,homeCard,bind,activeCount};
})();
