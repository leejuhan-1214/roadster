import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {SeoulViewport,createSeoulDrivingMap} from '../dist/js/seoul-driving-map.js';

const bounds={minX:-5120,maxX:5120,minZ:-5120,maxZ:5120};
test('north-up overview contains the full mapped area in both aspect ratios; wheel and pinch preserve anchors',()=>{
  const v=new SeoulViewport(bounds);
  for(const [w,h] of [[980,540],[330,460]]){
    v.resize(w,h);v.fit();
    const [left,top]=v.at(0,0),[right,bottom]=v.at(w,h);
    assert.ok(left<bounds.minX&&top<bounds.minZ&&right>bounds.maxX&&bottom>bounds.maxZ);
    const screen=[w*.35,h*.42],anchor=v.at(...screen);
    v.zoom(3,...screen);
    assert.ok(Math.hypot(...v.at(...screen).map((n,i)=>n-anchor[i]))<1e-7);
    const [x,y]=screen;v.moveAnchor(anchor,x+30,y+15);
    assert.ok(Math.hypot(...v.at(x+30,y+15).map((n,i)=>n-anchor[i]))<1e-7);
    assert.equal(v.mode,'free');
    v.focus(100,-190,'a','place');const stored=[v.x,v.z];v.resize(h,w);assert.deepEqual([v.x,v.z],stored);
    v.zoom(1e10);assert.equal(v.state().canZoomIn,false);v.fit();assert.equal(v.state().canZoomOut,false);
  }
});

function environment(t,recordBase=false){
  let frame=0;const queue=new Map(),baseStrokes=[];
  const old={};
  for(const key of ['requestAnimationFrame','cancelAnimationFrame','devicePixelRatio']){
    old[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  }
  Object.defineProperties(globalThis,{
    requestAnimationFrame:{value:cb=>{queue.set(++frame,cb);return frame;},configurable:true},
    cancelAnimationFrame:{value:id=>queue.delete(id),configurable:true},
    devicePixelRatio:{value:2,configurable:true}
  });
  t.after(()=>{for(const [key,prop]of Object.entries(old)){if(prop)Object.defineProperty(globalThis,key,prop);else delete globalThis[key];}});
  const flush=()=>{const list=[...queue.values()];queue.clear();list.forEach(cb=>cb());};
  function canvas(w,h){
    const labels=[],strokes=[],listeners={},capture=new Set();let path=[];
    const c={width:200,height:150,labels,strokes,
      ownerDocument:{createElement:()=>canvas(1,1)},getBoundingClientRect:()=>({width:w,height:h,left:0,top:0}),
      addEventListener(n,cb){listeners[n]=cb;},removeEventListener(n){delete listeners[n];},
      emit(n,ev={}){listeners[n]?.({pointerId:1,pointerType:'touch',clientX:0,clientY:0,button:0,preventDefault(){},stopPropagation(){},type:n,timeStamp:10,...ev});},
      focus(){},setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);}
    };
    const draw={canvas:c,beginPath(){path=[];},moveTo(x,y){path.push(['M',x,y]);},lineTo(x,y){path.push(['L',x,y]);},
      stroke(){
        if(this.strokeStyle==='#ffb968')strokes.push(path.slice());
        if(recordBase&&['#455b60','#839395'].includes(this.strokeStyle))baseStrokes.push(path.slice());
      },fillText(s){labels.push(s);},measureText(s){return {width:s.length*8};}};
    c.getContext=()=>ctx;
    const ctx=new Proxy(draw,{get:(o,k)=>k in o?o[k]:(()=>{})});
    return c;
  }
  return {canvas,flush,baseStrokes};
}
const data={bounds,water:[[[-5100,-4000],[5100,-4000],[5100,-3000],[-5100,-3000]]],riverLabel:[-2700,-3500],
  islands:[],blocks:[[[-80,-80],[0,-80],[0,0],[-80,0]]],roads:[{kind:'secondary',points:[[-4000,0],[4000,0]]}],
  landmarks:[{id:'station',name:'강남역',x:1700,z:900,kind:'station'},{id:'temple',name:'봉은사',x:3200,z:-1400,kind:'temple'}],
  bridges:[{id:'han',name:'한남대교',label:[1200,-3500],points:[[1200,-4100],[1200,-2900]]}]};

test('expanded map clusters nearby warp stops, supports touch selection, and keeps the minimap clear',t=>{
  const {canvas,flush}=environment(t),large=canvas(550,420),mini=canvas(190,145),changes=[];
  const a={id:'east',x:1300,z:0},b={id:'market',x:1710,z:0};
  const m=createSeoulDrivingMap({miniCanvas:mini,largeCanvas:large,warpPoints:[a,b],onViewChange:s=>changes.push(s)});
  const pose={x:-1700,z:500,yaw:.3,route:[]};
  m.setData(data);m.update(pose);flush();
  assert.ok(!mini.labels.includes('2'));
  m.open();flush();
  assert.ok(large.labels.includes('2'));
  const tap=(point,time)=>{
    const event={clientX:(point.x-m.view.x)*m.view.scale+m.view.width/2,
      clientY:(point.z-m.view.z)*m.view.scale+m.view.height/2,timeStamp:time};
    large.emit('pointerdown',event);large.emit('pointerup',event);flush();
  };
  const scale=m.view.scale;
  tap(a,1000);
  assert.ok(m.view.scale>scale);
  assert.equal(changes.at(-1).warpId,null);
  tap(b,2000);
  assert.equal(changes.at(-1).warpId,b.id);
  assert.deepEqual([m.view.x,m.view.z],[b.x,b.z]);
  large.emit('keydown',{key:'ArrowRight'});flush();
  assert.equal(changes.at(-1).warpId,b.id,'panning preserves a chosen warp');
  m.focusWarp(a.id);flush();
  assert.equal(changes.at(-1).warpId,a.id,'dropdown selection also focuses individual points');
  m.locate();flush();
  assert.equal(changes.at(-1).warpId,null);
  assert.deepEqual([m.view.x,m.view.z],[pose.x,pose.z]);
  m.dispose();
});

test('both maps show river context, route discontinuities and a separate car; opening and landmark jumps preserve pose',t=>{
  const {canvas,flush}=environment(t),mini=canvas(190,145),large=canvas(940,600),changes=[];
  const m=createSeoulDrivingMap({miniCanvas:mini,largeCanvas:large,onViewChange:s=>changes.push(s)});
  const pose={x:0,z:0,yaw:0,route:[[[-70,-10],[-50,-10]],[[50,10],[80,10]]]};
  m.setData(data);m.update(pose);flush();assert.deepEqual([mini.width,mini.height],[380,290]);
  const miniPath=mini.strokes.at(-1);assert.deepEqual(miniPath.map(o=>o[0]),['M','L','M','L']);
  m.open();flush();assert.equal(changes.at(-1).mode,'overview');
  for(const name of ['한강','한남대교','봉은사','강남역'])assert.ok(large.labels.includes(name),name);
  m.focus(3200,-1400,'temple');flush();assert.equal(changes.at(-1).placeId,'temple');
  assert.ok(large.labels.some(l=>l.startsWith('내 차 ')));
  m.close();flush();m.open();flush();assert.equal(changes.at(-1).placeId,'temple');
  m.locate();flush();assert.deepEqual([m.view.x,m.view.z],[0,0]);assert.equal(changes.at(-1).mode,'follow');
  m.update({...pose,x:5,z:-7});flush();assert.deepEqual([m.view.x,m.view.z],[5,-7]);
  m.fit();flush();large.emit('keydown',{key:'ArrowLeft'});assert.equal(changes.at(-1).mode,'free');
  m.setRaceActive(true);const count=mini.strokes.length;m.update(pose);flush();assert.equal(mini.strokes.length,count);
  assert.deepEqual([mini.width,mini.height],[200,150]);
  m.setRaceActive(false);flush();assert.ok(mini.strokes.length>count);
  assert.deepEqual([pose.x,pose.z],[0,0]);m.dispose();
});
test('pinch moves the held geographic point with the midpoint; lifting one finger continues drag without jump',t=>{
  const {canvas,flush}=environment(t),large=canvas(500,400);
  const m=createSeoulDrivingMap({miniCanvas:canvas(150,120),largeCanvas:large});
  m.setData(data);m.update({x:0,z:0,yaw:0,route:[]});m.open();flush();
  const initial=m.view.scale,anchor=m.view.at(200,180);
  large.emit('pointerdown',{pointerId:1,clientX:130,clientY:180});
  large.emit('pointerdown',{pointerId:2,clientX:270,clientY:180});
  large.emit('pointermove',{pointerId:2,clientX:410,clientY:180});flush();
  assert.ok(Math.abs(m.view.scale-initial*2)<1e-9);
  assert.ok(Math.abs(m.view.at(270,180)[0]-anchor[0])<1e-7);
  large.emit('pointerup',{pointerId:2,clientX:410,clientY:180});
  const held=m.view.at(130,180);
  large.emit('pointermove',{pointerId:1,clientX:106,clientY:196});flush();
  assert.ok(Math.abs(m.view.at(106,196)[0]-held[0])<1e-7);
  large.emit('pointercancel',{pointerId:1});m.dispose();
});

test('all mapped destinations remain individually identifiable on a narrow screen, including the stacked bridge decks',t=>{
  const {canvas,flush}=environment(t),large=canvas(320,450);
  const map=createSeoulDrivingMap({miniCanvas:canvas(125,101),largeCanvas:large});
  const seoul=JSON.parse(readFileSync(new URL('../dist/assets/city/seoul/driving-map.json',import.meta.url),'utf8'));
  map.setData(seoul);map.update({x:35,z:-16,yaw:0,route:[]});map.open();flush();
  assert.ok(large.labels.includes('한강'));
  for(const place of [...seoul.landmarks,...seoul.bridges]){
    const [x,z]=place.label||[place.x,place.z];large.labels.length=0;
    map.focus(x,z,place.id);flush();
    assert.equal(map.view.placeId,place.id);assert.ok(large.labels.includes(place.name),place.name);
    if(place.group==='banpo-crossing')assert.ok(!large.labels.includes('반포대교·잠수교'));
    if(place.label){
      const [left,top]=map.view.at(0,0),[right,bottom]=map.view.at(map.view.width,map.view.height);
      assert.ok(place.points.every(([px,pz])=>px>left&&px<right&&pz>top&&pz<bottom),place.name+' entire deck');
    }
  }
  map.dispose();
});

test('citywide pan and small zoom steps reuse the regional image; outskirts show the streamed residential streets on arrival',t=>{
  const {canvas,flush,baseStrokes}=environment(t,true),large=canvas(830,550);
  const map=createSeoulDrivingMap({miniCanvas:canvas(138,106),largeCanvas:large});
  const region={minX:-28672,maxX:16384,minZ:-24576,maxZ:12288};
  const outerRoad={type:'residential',points:[[-18011,-9631],[-17942,-9638]]};
  const nextRoad={type:'residential',points:[[-18026,-9622],[-17960,-9610]]};
  const pose={x:-18000,z:-9600,yaw:1,route:[],roads:[outerRoad]};
  map.setData({...data,bounds:region,detailBounds:bounds,roads:[{kind:'primary',points:[[-18005,-9900],[-17321,-9123]]}]});
  const drawn=(x,z)=>baseStrokes.some(path=>path.some(p=>p[0]==='M'&&p[1]===x&&p[2]===z));
  map.update(pose);flush();assert.ok(drawn(...outerRoad.points[0]),'first streamed local road');
  baseStrokes.length=0;map.update({...pose,roads:[outerRoad,nextRoad]});flush();
  assert.ok(drawn(...nextRoad.points[0]),'new streamed tile updates a stationary minimap');
  map.open();flush();
  assert.ok(map.view.at(0,0)[0]<region.minX&&map.view.at(830,550)[1]>region.maxZ);
  baseStrokes.length=0;large.emit('keydown',{key:'ArrowRight'});flush();
  map.zoomBy(1.18);flush();assert.equal(baseStrokes.length,0,'regional base reused while panning and pinching');
  map.focus(-16000,-9600,'outlying-place');flush();
  assert.ok(map.view.at(0,0)[0]<-18005,'selected grounds include the distant approach road');
  map.locate();flush();assert.deepEqual([map.view.x,map.view.z],[pose.x,pose.z]);
  map.dispose();
});
