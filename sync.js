window.SYNC=(function(){
'use strict';
const J=x=>JSON.stringify(x===undefined?null:x);
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isIdArr=a=>Array.isArray(a)&&a.length>0&&a.every(x=>isObj(x)&&x.id!=null);
const isObjArr=a=>Array.isArray(a)&&a.length>0&&a.every(isObj);

function merge3(b,l,r,preferLocal){
  const jb=J(b),jl=J(l),jr=J(r);
  if(jl===jr)return l;
  if(jl===jb)return r;
  if(jr===jb)return l;
  if(Array.isArray(l)&&Array.isArray(r)){
    if(isIdArr(l)||isIdArr(r)||isIdArr(b))return mergeIdArrays(Array.isArray(b)?b:[],l,r,preferLocal);
    if(isObjArr(l)||isObjArr(r))return unionArrays(l,r);
    return preferLocal?l:r;
  }
  if(isObj(l)&&isObj(r)){
    const bb=isObj(b)?b:{},out={};
    const keys=new Set([...Object.keys(bb),...Object.keys(l),...Object.keys(r)]);
    for(const k of keys){const v=merge3(bb[k],l[k],r[k],preferLocal);if(v!==undefined)out[k]=v}
    return out;
  }
  return preferLocal?l:r;
}

function mergeIdArrays(b,l,r,preferLocal){
  const mb=new Map(b.filter(isObj).map(x=>[x.id,x])),ml=new Map(l.filter(isObj).map(x=>[x.id,x])),mr=new Map(r.filter(isObj).map(x=>[x.id,x]));
  const order=[...r.map(x=>x&&x.id),...l.map(x=>x&&x.id).filter(id=>!mr.has(id))];
  const seen=new Set(),out=[];
  for(const id of order){
    if(id==null||seen.has(id))continue;seen.add(id);
    const v=merge3(mb.get(id),ml.get(id),mr.get(id),preferLocal);
    if(v!=null)out.push(v);
  }
  return out;
}

function unionArrays(l,r){
  const seen=new Set(r.map(J));
  return r.concat(l.filter(x=>!seen.has(J(x))));
}

function merge(base,local,remote,preferLocal){
  const out=merge3(base||remote||{},local||{},remote||{},!!preferLocal);
  return isObj(out)?out:(local||remote||{});
}

return{merge,merge3};
})();
