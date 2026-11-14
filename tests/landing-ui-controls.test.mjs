import test from 'node:test';
import assert from 'node:assert/strict';
import {LandingUI} from '../dist/js/landing-ui.js';

// Parse the constructor's emitted controls and dispatch their real registered
// callbacks. This small DOM harness needs no browser or additional dependency.
const attributes=text=>Object.fromEntries([...text.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(match=>[match[1],match[2]??true]));
function element(tag='div',attrs={}){
  const listeners=new Map();
  return {tag,...attrs,value:attrs.value??'',disabled:attrs.disabled===true,checked:attrs.checked===true,required:attrs.required===true,hidden:false,open:false,textContent:'',customValidity:'',
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback);},
    emit(type,event={}){for(const callback of listeners.get(type)||[])callback({target:this,preventDefault(){},...event});},
    setCustomValidity(value){this.customValidity=value;},setAttribute(name,value){this[name]=value;},close(){this.open=false;},focus(){},classList:{add(){}}};
}
function container(){
  const node=element(),nodes=new Map();let source='',controls=[];
  Object.defineProperty(node,'innerHTML',{get:()=>source,set(markup){
    source=markup;nodes.clear();controls=[];
    for(const match of markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)){
      const tag=match[1],attrs=attributes(match[2]),child=element(tag,attrs);
      const body=markup.slice(match.index+match[0].length).split('</'+tag+'>')[0];
      child.textContent=body.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();child.source=body;
      if(tag==='select'){
        child.options=[...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(option=>({...attributes(option[1]),textContent:option[2]}));
        child.value=(child.options.find(option=>option.selected)||child.options[0])?.value??'';
      }
      if(attrs.id){assert.ok(!nodes.has(attrs.id),'duplicate generated id '+attrs.id);nodes.set(attrs.id,child);}
      if(['input','select','button'].includes(tag))controls.push(child);
    }
    const form=[...nodes.values()].find(child=>child.tag==='form');
    if(form){
      form.controls=controls;form.elements={namedItem:name=>controls.find(child=>child.name===name)||null};
      form.querySelectorAll=selector=>selector==='input[type="number"]'?controls.filter(child=>child.tag==='input'&&child.type==='number'):controls;
      form.reportValidity=()=>controls.every(child=>child.disabled||(!child.customValidity&&(!child.required||child.value!=='')));
    }
  }});
  node.querySelector=selector=>{
    if(selector==='form')return [...nodes.values()].find(child=>child.tag==='form')||null;
    const [id,descendant]=selector.split(/\s+/),found=nodes.get(id.slice(1));
    if(!found)return null;
    if(!descendant)return found;
    if(!found.source.includes('<'+descendant))return null;
    return found.descendant??=element(descendant);
  };
  return node;
}

test('one visible four-method button dispatches the common callback and the fleet remains twenty runs',()=>{
  const previousDocument=globalThis.document,previousFormData=globalThis.FormData,root=container(),dialogs=[];
  const vehicles=Array.from({length:5},(_,index)=>({id:'vehicle-'+index,short:'차체 '+index,dryMass:1000+index*100}));
  globalThis.document={getElementById:id=>id==='landing-lab'?root:null,createElement:()=>container(),body:{append:dialog=>dialogs.push(dialog)}};
  globalThis.FormData=class{
    constructor(form){this.entries=form.controls.filter(control=>control.name&&!control.disabled&&(control.type!=='checkbox'||control.checked)).map(control=>[control.name,control.value]);}
    get(name){return this.entries.find(entry=>entry[0]===name)?.[1]??null;}
    getAll(name){return this.entries.filter(entry=>entry[0]===name).map(entry=>entry[1]);}
  };
  try{
    const methodCalls=[],fleetCalls=[];let retiredCalls=0;
    const ui=new LandingUI({vehicles,onCompareMethods:options=>methodCalls.push(options),onCompareFleetMethods:options=>fleetCalls.push(options),onCompareEconomy:()=>retiredCalls++});
    const method=ui.form.elements.namedItem('method'),compare=root.querySelector('#landing-methods'),fleet=root.querySelector('#landing-fleet-methods');
    assert.deepEqual(new Set(method.options.map(option=>option.value)),new Set(['free','brake','gentle','eco']));
    assert.equal(method.value,'eco');assert.equal(root.querySelector('#landing-economy'),null);
    assert.match(compare.textContent,/4방식 비교 현재 차체 · 4회/);
    assert.match(fleet.textContent,/전체 5종 × 4방식 20회/);
    assert.equal((root.innerHTML.match(/id="landing-methods"/g)||[]).length,1);
    assert.ok(root.innerHTML.indexOf('id="landing-methods"')<root.innerHTML.indexOf('id="landing-advanced"'),'main comparison stays outside collapsed extra settings');
    assert.doesNotMatch(root.innerHTML,/3방식|15회|절약 효과 비교/);
    compare.emit('click');assert.equal(methodCalls.length,1);assert.equal(retiredCalls,0);
    assert.equal(methodCalls[0].method,'eco');assert.equal(methodCalls[0].brakeHeight,1.5);assert.equal(methodCalls[0].vehicleIds.length,5);
    fleet.emit('click');assert.equal(fleetCalls.length,1);assert.equal(fleetCalls[0].vehicleIds.length,5);
    ui.setBusy(true);compare.emit('click');fleet.emit('click');assert.equal(methodCalls.length,1);assert.equal(fleetCalls.length,1);
    ui.setBusy(false);ui.form.elements.namedItem('height').value='invalid';compare.emit('click');assert.equal(methodCalls.length,1,'invalid settings cannot launch a batch');
    method.value='gentle';root.querySelector('#landing-study-preset').emit('click');
    assert.equal(method.value,'eco');assert.equal(ui.form.elements.namedItem('brakeHeight').disabled,true);
    compare.emit('click');assert.equal(methodCalls.length,2);assert.equal(methodCalls[1].height,3);assert.equal(dialogs.length,1);
  }finally{globalThis.document=previousDocument;globalThis.FormData=previousFormData;}
});
