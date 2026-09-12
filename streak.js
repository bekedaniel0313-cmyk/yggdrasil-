window.STREAK=(function(){
'use strict';
let Y=null,rolling=null;
function init(bridge){Y=bridge}
const S=()=>Y.state();
const esc=s=>Y.esc(s);
// konzisztencia-mérföldkövek: napok → jutalom (dice = kockadobás, csak a maximum ad darabkát; fixed = biztos darabka)
const TIERS=[
  {days:3,dice:6},{days:7,dice:4},{days:14,dice:2},{days:28,fixed:1},
  {days:60,fixed:1,dice:2},{days:90,fixed:2},{days:180,fixed:3},{days:365,fixed:5}
];
function migrate(s){s.streakAwards=s.streakAwards&&typeof s.streakAwards==='object'?s.streakAwards:{}}
function shift(iso,d){const x=new Date(iso+'T12:00:00');x.setDate(x.getDate()+d);return x.toLocaleDateString('sv-SE')}

// Consecutive completed periods, oldest first, as {days,start}; the last one is the
// current run (today may still be pending, so an incomplete today does not end it).
// Week/month habits count whole periods × their length.
function runs(h){
  const t=Y.today(),out=[];
  if(h.period==='day'){
    const from=h.createdAt&&h.createdAt<t?h.createdAt:shift(t,-800);
    let cur=null,d=from;
    for(let guard=0;d<=t&&guard<900;guard++,d=shift(d,1)){
      if(Y.complete(h,d)){if(!cur)cur={days:0,start:d};cur.days++}
      else if(d!==t){if(cur){out.push(cur);cur=null}}
    }
    if(cur)out.push(cur);
    const last=out[out.length-1];
    // the run is only "current" if it reaches yesterday or today
    if(!last||(last.start&&shift(last.start,last.days-1)<shift(t,-1)))out.push({days:0,start:''});
    return out;
  }
  const per=Y.periodsUntilToday(h),len=h.period==='week'?7:30;
  let cur=null;
  per.forEach((p,i)=>{
    if(Y.complete(h,p)){if(!cur)cur={days:0,start:p};cur.days+=len}
    else if(i!==per.length-1){if(cur){out.push(cur);cur=null}}
  });
  if(cur)out.push(cur);else out.push({days:0,start:''});
  return out;
}
function streak(h){const r=runs(h);const c=r[r.length-1];return{days:c.days,start:c.start}}

// per tier: held (✓ – the tier stands), lost (✗ – a later run ended short of it),
// restart (the current run reached it again after a break while it was held)
function tierState(h,tier){
  const r=runs(h),cur=r[r.length-1],prev=r.slice(0,-1);
  let held=false,lost=false,restarts=0;
  prev.forEach(x=>{if(x.days>=tier.days){if(held)restarts++;held=true;lost=false}else if(held){held=false;lost=true}});
  const reachedNow=cur.days>=tier.days;
  const restartNow=reachedNow&&held;
  if(reachedNow){held=true;lost=false}
  return{held,lost,restartNow,reachedNow,cur};
}
function key(h,tier,st,kind){return`${h.id}|${tier.days}|${st.start}${kind==='restart'?'|r':''}`}
function pending(h){
  const out=[];
  TIERS.forEach(t=>{const ts=tierState(h,t);if(!ts.reachedNow)return;if(!S().streakAwards[key(h,t,ts.cur,'')])out.push({t,kind:''});if(ts.restartNow&&!S().streakAwards[key(h,t,ts.cur,'restart')])out.push({t,kind:'restart'})});
  return out;
}
function pendingCount(){return S().habits.reduce((n,h)=>n+pending(h).length,0)}

function tierLabel(t){return t.fixed?`${t.fixed} darabka${t.dice?` + D${t.dice}`:''}`:`D${t.dice}`}
function gotChip(got){return`<span class="chip">${got.roll?`🎲 ${got.roll}/${got.dice} ${got.won?'· +1 darabka':'· semmi'}`:''}${got.fixed?` 🎁 +${got.fixed}`:''}</span>`}
function claimBtn(h,t,kind){return`<button class="btn primary small" data-streak-claim="${h.id}|${t.days}|${kind}">${kind?'🔁 ':''}${t.fixed?`🎁 +${t.fixed} darabka`:''}${t.dice?` 🎲 D${t.dice}`:''}</button>`}
function card(h){
  const st=streak(h),aw=S().streakAwards;
  const rows=TIERS.map(t=>{
    const ts=tierState(h,t),k=key(h,t,ts.cur,''),kr=key(h,t,ts.cur,'restart'),got=aw[k],gotR=aw[kr];
    const mark=ts.held?'<span class="streak-mark ok" title="Áll: a legutóbbi teljes sorozat elérte">✓</span>':ts.lost?'<span class="streak-mark bad" title="Elveszett: egy későbbi sorozat nem érte el – újrakezdéssel visszaszerezhető">✗</span>':'<span class="streak-mark"></span>';
    let right='';
    if(got)right+=gotChip(got);else if(ts.reachedNow)right+=claimBtn(h,t,'');else right+=`<span class="chip" style="opacity:.6">${tierLabel(t)}</span>`;
    if(ts.restartNow)right+=gotR?`<span class="chip" title="Újrakezdés">🔁 ${gotR.roll?`${gotR.roll}/${gotR.dice}${gotR.won?' +1':''}`:''}${gotR.fixed?` +${gotR.fixed}`:''}</span>`:claimBtn(h,t,'restart');
    return`<div class="streak-tier ${ts.reachedNow?'reached':''} ${got?'got':''}"><span class="streak-days">${t.days>=365?'1 év':t.days+' nap'}</span>${mark}<span class="grow streak-bar"><i style="width:${Math.min(100,Math.round(st.days/t.days*100))}%"></i></span>${right}</div>`;
  }).join('');
  return`<div class="section" style="margin:0 0 8px"><p class="cal-edit-hint" style="margin:0">🔥 Konzisztens</p><span class="chip">${st.days} nap${st.start?` · ${st.start} óta`:''}</span></div><div class="streak-tiers">${rows}</div><div id="dice" class="dice" style="display:none"></div><p class="vow-note" style="margin:8px 0 16px">A kockás fokozatoknál csak a legnagyobb dobás ad darabkát; minden fokozat egyszer váltható be sorozatonként. ✓ = a fokozat áll, ✗ = egy kihagyás utáni rövid sorozat elvesztette. <b>Újrakezdés</b> (🔁): ha egy álló fokozatot kihagyás után újra elérsz, ugyanaz a jutalom jár még egyszer – de ha a következő sorozat nem éri el, a pipa elvész.</p>`;
}

async function claim(h,tier,kind){
  if(rolling)return;
  const ts=tierState(h,tier),k=key(h,tier,ts.cur,kind),aw=S().streakAwards;
  if(aw[k]||!ts.reachedNow||(kind&&!ts.restartNow))return;
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
  const label=`${h.emoji||''} ${h.name} · ${tier.days>=365?'1 éves':tier.days+' napos'} konzisztencia${kind?' – újrakezdés':''}`;
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
  document.querySelectorAll('[data-streak-claim]').forEach(b=>b.onclick=()=>{const[hid,days,kind]=b.dataset.streakClaim.split('|');const h=S().habits.find(x=>x.id===hid),t=TIERS.find(x=>x.days===Number(days));if(h&&t)claim(h,t,kind||'')});
}
return{init,migrate,card,bind,streak,runs,tierState,pending,pendingCount,TIERS};
})();
