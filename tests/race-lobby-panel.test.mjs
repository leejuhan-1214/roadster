import test from 'node:test';
import assert from 'node:assert/strict';
import {createRaceLobbyPanel,raceInviteURL,renderRacePlayers} from '../dist/js/race-lobby-panel.js';

function controls(t,search=''){
  const nodes=new Map(),calls=[],modes=[];
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    const n={id,value:'',textContent:'',dataset:{},style:{setProperty(){}},children:[],listeners:{},attributes:{},open:false,
      addEventListener(event,fn){this.listeners[event]=fn;},
      fire(event){return this.listeners[event]?.({target:this,preventDefault(){}});},
      append(...elements){this.children.push(...elements);},
      replaceChildren(...elements){this.children=elements;},
      focus(){},select(){},showModal(){this.open=true;},close(){this.open=false;this.fire('close');},
      setAttribute(key,value){this.attributes[key]=String(value);},
      getContext(){return null;},querySelectorAll(){return modes;}};
    nodes.set(id,n);return n;
  }
  for(const mode of ['solo','host','join']){
    const button=node(mode);button.dataset.raceMode=mode;modes.push(button);
  }
  let count=0,closed=0;
  const doc={getElementById:node,createElement:()=>node('new'+count++)};
  for(const [key,value] of Object.entries({document:doc,location:{search},Option:class{constructor(name,id){this.value=id;this.text=name;}}})){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,value});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else delete globalThis[key];});
  }
  const courses=['a','b'].map((id,i)=>({id,name:'코스 '+id,length:1000*(i+1),laps:2,gates:[{air:true}]}));
  const panel=createRaceLobbyPanel({courses,selectedCourseId:'a',onCourse:v=>calls.push(['course',v]),
    onSolo:v=>{calls.push(['solo',v]);return true;},onHost:v=>calls.push(['host',v]),onJoin:v=>calls.push(['join',v]),
    onStart:()=>calls.push(['start']),onLeave:()=>calls.push(['leave']),beforeOpen:()=>true,afterClose:()=>closed++});
  return {panel,node,calls,get closed(){return closed;}};
}
const later=()=>new Promise(r=>setImmediate(r));

test('solo uses selected circuit and closes on successful entry; invite link keeps only shared race parameters',async t=>{
  const {panel,node,calls}=controls(t);
  panel.open();
  node('race-course-select').value='b';node('race-course-select').fire('change');
  node('race-lobby-form').fire('submit');await later();
  assert.deepEqual(calls,[['course','b'],['solo','b']]);
  assert.equal(panel.isOpen,false);
  assert.equal(raceInviteURL('https://example.com/lab/?debug=1&vehicle=x#help','ABC234'),'https://example.com/lab/?mode=city&room=ABC234');
});

test('invited driver joins only after explicit submit; invalid code leaves the dialog open',async t=>{
  const {node,panel,calls}=controls(t,'?mode=city&room=abc234');
  panel.open();assert.equal(node('race-invite-input').value,'ABC234');
  assert.equal(node('race-lobby-course-field').hidden,true);assert.deepEqual(calls,[]);
  node('race-invite-input').value='O001';node('race-lobby-form').fire('submit');
  assert.match(node('race-lobby-status').textContent,/6자리/);assert.deepEqual(calls,[]);
  node('race-invite-input').value='ABc234';node('race-driver-name').value='초대 손님';
  node('race-lobby-form').fire('submit');await later();
  assert.deepEqual(calls,[['join',{code:'ABC234',name:'초대 손님'}]]);
  assert.equal(panel.isOpen,true);
});

test('only the host with a second participant can start; closing the lobby preserves membership',async t=>{
  const {node,panel,calls}=controls(t);
  panel.open();node('host').fire('click');node('race-lobby-form').fire('submit');await later();
  assert.deepEqual(calls,[['host',{courseId:'a',name:''}]]);
  const host={id:'h',slot:0,name:'방장'},guest={id:'j',slot:1,name:'<재민>'};
  const lobby={phase:'lobby',code:'ABC234',courseId:'b',selfId:'h',isHost:true,players:[host]};
  panel.setState(lobby);assert.equal(node('race-room-start').disabled,true);
  node('race-room-start').fire('click');assert.equal(calls.length,1);
  panel.close();panel.open();assert.equal(calls.length,1);
  panel.setState({...lobby,players:[host,guest]});
  assert.equal(node('race-room-start').disabled,false);assert.equal(node('race-room-players').children[1].children[0].textContent,'<재민>');
  node('race-room-start').fire('click');await later();assert.deepEqual(calls.at(-1),['start']);
  panel.setState({...lobby,selfId:'j',isHost:false,players:[host,guest]});
  assert.equal(node('race-room-start').hidden,true);
  panel.setState({...lobby,phase:'preparing',players:[host,{...guest,ready:true}]});
  assert.match(node('race-lobby-status').textContent,/1 \/ 2명/);
  node('race-room-leave').fire('click');assert.deepEqual(calls.at(-1),['leave']);
  renderRacePlayers(node('results'),{selfId:'j',players:[{...host,disconnected:true},{...guest,finished:true,rank:1,elapsedMs:23120}]},true);
  assert.equal(node('results').children[0].children[1].textContent,'1위 · 0:23.1');
  assert.equal(node('results').children[1].children[1].textContent,'연결 종료');
});
