/* FocusGate bridge (FocusGate = the focus lock on the PC).
 *
 * 1. Publishes the activities a Pomodoro is usually run on as
 *    <html data-fg-topics='[{"key":"habit|<id>","label":"..."}]'>. FocusGate's
 *    browser extension reads that attribute; this page sends nothing anywhere.
 *    Only minute-measured habits and activities Pomodoros were already run on
 *    are listed, so the rest of the habit list stays private.
 * 2. Starts a Pomodoro from a link:
 *    ?fgpomo=<base64url of JSON {plan, sel:{type,id}, topic, minutes}>
 *    FocusGate opens that link when a focus session begins.
 */
window.FGSTART=(function(){
'use strict';
let Y=null;
const S=()=>Y.state();
function plain(label){return String(label||'').replace(/^[^\p{L}\p{N}]+/u,'').trim()}
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}

function topics(){
  const cands=Y.pomoCandidates(),by=new Map(cands.map(c=>[c.type+'|'+c.id,c])),keys=[];
  (S().pomoLog||[]).slice().reverse().forEach(e=>{const k=e.type+'|'+e.refId;if(by.has(k)&&!keys.includes(k))keys.push(k)});
  (S().habits||[]).forEach(h=>{const k='habit|'+h.id;if(h.measure==='minutes'&&by.has(k)&&!keys.includes(k))keys.push(k)});
  return keys.slice(0,40).map(k=>({key:k,label:plain(by.get(k).label)}));
}
function publish(){try{document.documentElement.dataset.fgTopics=JSON.stringify(topics())}catch(e){}}

function readLink(){
  const m=/[?&]fgpomo=([^&#]+)/.exec(location.search);if(!m)return null;
  try{
    const b=m[1].replace(/-/g,'+').replace(/_/g,'/'),bin=atob(b+'='.repeat((4-b.length%4)%4));
    const req=JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));
    return req&&typeof req==='object'?req:null;
  }catch(e){return null}
}

function pick(req){
  const cands=Y.pomoCandidates();
  if(req.sel){const c=cands.find(x=>x.type===req.sel.type&&x.id===req.sel.id);if(c)return c}
  const t=norm(req.topic);if(!t)return null;
  let best=null,score=0;
  cands.forEach(c=>{const l=norm(plain(c.label));if(!l)return;const s=l===t?100:(l.startsWith(t)||t.startsWith(l))?70:(l.includes(t)||t.includes(l))?50:0;if(s>score){score=s;best=c}});
  return best;
}

function start(req){
  if(S().pomo){Y.go('pomodoro');Y.render();Y.toast('🍅 Már fut egy pomodoro – a FocusGate nem indított újat.');return}
  const plan=String(req.plan||'').slice(0,1500),c=pick(req);
  Y.pomoDraft().plan=plan;
  Y.go('pomodoro');Y.render();
  const pl=document.getElementById('pomoPlan');if(pl)pl.value=plan;
  if(c){
    Y.pomoStart({type:c.type,id:c.id},Math.max(0,Math.ceil((Number(req.minutes)||0)/30)));
    setTimeout(()=>Y.toast(`🍅 FocusGate: pomodoro indult – ${plain(c.label)}`),300);
  }else{
    Y.toast('🍅 FocusGate: a tervedet beírtam – válaszd ki hozzá a tevékenységet.');
  }
  // A browser only plays sound after a click or key press on the page: arm the chimes on the first one.
  const arm=()=>{try{Y.pomoSchedule()}catch(e){}};
  addEventListener('pointerdown',arm,{once:true});addEventListener('keydown',arm,{once:true});
}

function init(bridge){
  Y=bridge;
  const req=readLink();
  if(req){try{history.replaceState(history.state,'',location.pathname+location.hash)}catch(e){}}   // a reload must not start it again
  setTimeout(publish,500);setInterval(publish,30000);
  if(req)setTimeout(()=>{try{start(req)}catch(e){console.warn('fgstart',e)}publish()},1500);   // after the first sync pull has settled
}
return{init};
})();
