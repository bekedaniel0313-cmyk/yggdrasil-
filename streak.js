window.STREAK=(function(){
'use strict';
let Y=null,rolling=null;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
// zsinór-mérföldkövek: napok → jutalom (dice = kockadobás, csak a maximum ad darabkát; fix = biztos darabka)
const TIERS=[
  {days:3,dice:6},{days:7,dice:4},{days:14,dice:2},{days:28,fixed:1},
  {days:60,fixed:1,dice:2},{days:90,fixed:2},{days:180,fixed:3},{days:365,fixed:5}
];
function migrate(s){s.streakAwards=s.streakAwards&&typeof s.streakAwards==='object'?s.streakAwards:{}}

// days in a row (period habits count whole periods × their length), today may still be pending
function streak(h){
  const t=Y.today();
  if(h.period==='day'){
    let n=0,d=new Date(t+'T12:00:00'),guard=0;
    while(guard++<800){
      const iso=d.toLocaleDateString('sv-SE');
      if(h.createdAt&&iso<h.createdAt)break;
      if(Y.complete(h,iso))n++;else if(iso!==t)break;
      d.setDate(d.getDate()-1);
    }
    return{days:n,start:n?shift(t,-(n-1)):''};
  }
  const per=Y.periodsUntilToday(h).slice().reverse(),len=h.period==='week'?7:30;
  let n=0;
  for(let i=0;i<per.length;i++){if(Y.complete(h,per[i]))n++;else if(i!==0)break}
  return{days:n*len,start:n?per[Math.min(n-1,per.length-1)]:''};
}
function shift(iso,d){const x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+d);return x.toLocaleDateString('sv-SE')}
function key(h,tier,st){return`${h.id}|${tier.days}|${st.start}`}
function pending(h){const st=streak(h);if(!st.days)return[];return TIERS.filter(t=>st.days>=t.days&&!S().streakAwards[key(h,t,st)])}
function pendingCount(){return S().habits.reduce((n,h)=>n+pending(h).length,0)}

function tierLabel(t){return t.fixed?`${t.fixed} darabka${t.dice?` + D${t.dice}`:''}`:`D${t.dice}`}
function card(h){
  const st=streak(h),aw=S().streakAwards;
  const rows=TIERS.map(t=>{
    const reached=st.days>=t.days,k=key(h,t,st),got=aw[k];
    let right='';
    if(got)right=`<span class="chip">${got.roll?`🎲 ${got.roll}/${got.dice} ${got.won?'· +1 darabka':'· semmi'}`:''}${got.fixed?` 🎁 +${got.fixed}`:''}</span>`;
    else if(reached)right=`<button class="btn primary small" data-streak-claim="${h.id}|${t.days}">${t.fixed?`🎁 +${t.fixed} darabka`:''}${t.dice?` 🎲 D${t.dice}`:''}</button>`;
    else right=`<span class="chip" style="opacity:.6">${tierLabel(t)}</span>`;
    return`<div class="streak-tier ${reached?'reached':''} ${got?'got':''}"><span class="streak-days">${t.days>=365?'1 év':t.days+' nap'}</span><span class="grow streak-bar"><i style="width:${Math.min(100,Math.round(st.days/t.days*100))}%"></i></span>${right}</div>`;
  }).join('');
  return`<div class="section" style="margin:0 0 8px"><p class="cal-edit-hint" style="margin:0">🔥 Zsinór-mérföldkövek</p><span class="chip">${st.days} nap${st.start?` · ${st.start} óta`:''}</span></div><div class="streak-tiers">${rows}</div><div id="dice" class="dice" style="display:none"></div><p class="vow-note" style="margin:8px 0 16px">A kockás fokozatoknál csak a legnagyobb dobás ad darabkát. Minden fokozat egyszer váltható be zsinóronként – ha megszakad, újra elölről.</p>`;
}

async function claim(h,tier){
  if(rolling)return;
  const st=streak(h),k=key(h,tier,st),aw=S().streakAwards;
  if(aw[k]||st.days<tier.days)return;
  let count=tier.fixed||0,rec={date:Y.today(),fixed:tier.fixed||0};
  if(tier.dice){
    rolling=true;
    const roll=1+Math.floor(Math.random()*tier.dice),won=roll===tier.dice;
    await animate(tier.dice,roll,won);
    rolling=false;
    rec.dice=tier.dice;rec.roll=roll;rec.won=won;
    if(won)count++;
  }
  aw[k]=rec;
  const label=`${h.emoji||''} ${h.name} · ${tier.days} napos zsinór`;
  if(count){
    const ok=PMAP.openGift(count,label);
    if(!ok)Y.toast('Darabka járt volna, de üres az ajándék-pool – vegyél fel ajándékot az Eredmények alatt.');
  } else Y.toast(`🎲 ${rec.roll} – most nem jött össze. A ${tier.days} napos fokozat elkönyvelve.`);
  Y.save();Y.render();
}
function animate(sides,roll,won){
  const el=document.getElementById('dice');if(!el)return Promise.resolve();
  el.style.display='flex';el.className='dice rolling';
  return new Promise(res=>{
    let i=0;const iv=setInterval(()=>{el.textContent=1+Math.floor(Math.random()*sides);el.style.transform=`rotate(${(i%2?1:-1)*(20+Math.random()*30)}deg) scale(${.9+Math.random()*.3})`;i++},70);
    setTimeout(()=>{clearInterval(iv);el.textContent=roll;el.style.transform='';el.className='dice '+(won?'win':'lose');setTimeout(res,won?1100:800)},1100);
  });
}
function bind(){
  document.querySelectorAll('[data-streak-claim]').forEach(b=>b.onclick=()=>{const[hid,days]=b.dataset.streakClaim.split('|');const h=S().habits.find(x=>x.id===hid),t=TIERS.find(x=>x.days===Number(days));if(h&&t)claim(h,t)});
}
return{init,migrate,card,bind,streak,pending,pendingCount,TIERS};
})();
