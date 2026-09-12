window.HUBS=(function(){
'use strict';
let Y=null;
function init(bridge){Y=bridge}
const card=(go,icon,title,text,label,value)=>`<div class="card hero" data-go="${go}"><div class="hero-icon">${icon}</div><h3>${title}</h3><p>${text}</p><div class="metric"><span>${label}</span><strong>${value}</strong></div></div>`;

function prio(){
  const s=Y.state(),alive=TREE.activeCount(),maps=s.pmaps.length;
  const open=s.pmaps.reduce((n,p)=>n+p.nodes.filter(x=>!x.done&&!x.ref).length,0);
  const f=window.FOCUS?FOCUS.summary():null;
  const focus=card('focus','🎯','Fókusz',f?`${f.name} · ma: ${f.today}${f.done?' ✅':''}`:'Egy tevékenység, amire most figyelsz: naptár, sorozat, napi idő.','Sorozat',f?`${f.streak} nap`:'—');
  return Y.top('Prioritások','Ami igazán számít: a fókuszod, az életfád és a hosszú távú útjaid.')+`<div class="grid g3">${focus}${card('tree','🌳','Yggdrasil','Hat szint, hat szokás vagy kategória – a fa alulról felfelé kel életre.','Ma él',`${alive} / 6`)}${card('pmaps','🗺️','Térképek','Projektek párhuzamos pályákkal, stációkkal és ajándékcsomagokkal.','Projekt · nyitott állomás',`${maps} · ${open}`)}</div>`;
}

function results(){
  const s=Y.state(),kesz=s.milestones.filter(m=>m.completedAt).length,fogadalom=s.vows.length;
  const R=s.rewards||[],unlocked=R.filter(r=>r.unlockedAt).length,frag=R.filter(r=>!r.unlockedAt).reduce((n,r)=>n+r.collected,0);
  return Y.top('Eredmények','Amit elértél, és amit kiérdemeltél.')+`<div class="grid g3">${card('progress','🏆','Fejlődés','Mérföldkövek, teljesítmények, fogadalmak és XP-szintek.','Kész mérföldkő · fogadalom',`${kesz} · ${fogadalom}`)}${card('pmapRewards','🎁','Ajándékok','A közös ajándék-pool: mozaikok, darabkák, feloldott jutalmak.','Feloldva · bontatlan darabka',`${unlocked} / ${R.length} · ${PMAP.unopened()}`)}</div>`;
}

return{init,prio,results};
})();
