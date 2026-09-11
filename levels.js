window.UILEVEL=(function(){
'use strict';
let Y=null;
function init(bridge){Y=bridge}
const MIN={prio:1,focus:1,tree:1,pmaps:1,pmapDetail:1,settings:1,home:2,schedule:3,dayplan:3,calendar:4,pomodoro:5,activities:6,habits:6,habitDetail:6,categories:6,categoryDetail:6,naplo:6,groups:7,groupDetail:7,events:7,eventDetail:7,routines:8,routineDetail:8,results:9,progress:9,pmapRewards:10};
const DESC={1:'Csak a Prioritások: Fókusz, Yggdrasil, Térképek',2:'+ Kezdőlap',3:'+ Napiterv',4:'+ Naptár',5:'+ Pomodoro',6:'+ Szokások és Kategóriák',7:'+ Feladatok és Események',8:'+ Rutinok',9:'+ Eredmények: Fejlődés',10:'+ Ajándékok – minden funkció'};
function level(){return Math.min(10,Math.max(1,Number(Y.state().level)||10))}
function allowed(v){return level()>=(MIN[v]||1)}
function migrate(s){if(!s.level)s.level=10}
function apply(){
  document.querySelectorAll('[data-view]').forEach(b=>{b.style.display=allowed(b.dataset.view)?'':'none'});
  document.querySelectorAll('#view [data-go]').forEach(el=>{if(!allowed(el.dataset.go))el.style.display='none'});
  const mob=document.getElementById('mobile');
  if(mob){const n=[...mob.querySelectorAll('[data-view]')].filter(b=>b.style.display!=='none').length;mob.style.gridTemplateColumns=`repeat(${Math.max(1,n)},1fr)`}
}
function card(){
  const L=level();
  return`<div class="card"><h3>Szint – mennyit mutasson az app</h3><p class="vow-note" style="margin:0 0 8px">Ha túl sok egyszerre, vedd lejjebb: alacsony szinten csak a Prioritások látszanak, és szintről szintre jönnek vissza a funkciók. Az adatok mind megmaradnak.</p><input type="range" min="1" max="10" value="${L}" id="levelRange" style="width:100%"><div class="section" style="margin:6px 0 0"><b id="levelLabel">${L}. szint</b><span class="chip" id="levelDesc">${DESC[L]}</span></div><div class="level-ladder">${Object.keys(DESC).map(k=>`<span class="${Number(k)<=L?'on':''}"><b>${k}</b> ${DESC[k]}</span>`).join('')}</div></div>`;
}
function bind(){
  apply();
  const r=document.getElementById('levelRange');
  if(r){
    r.oninput=()=>{document.getElementById('levelLabel').textContent=r.value+'. szint';document.getElementById('levelDesc').textContent=DESC[r.value];document.querySelectorAll('.level-ladder span').forEach(sp=>sp.classList.toggle('on',Number(sp.querySelector('b').textContent)<=Number(r.value)))};
    r.onchange=()=>{Y.state().level=Number(r.value);Y.save();Y.render();Y.toast(`${r.value}. szint – ${DESC[r.value]}`)};
  }
}
function homeView(){return allowed('home')?'home':'prio'}
return{init,migrate,allowed,apply,card,bind,homeView,level};
})();
