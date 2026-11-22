import {createSeoulDrivingMap} from './seoul-driving-map.js?v=20261123-seoul-warp';
import {SEOUL_WARP_POINTS} from './seoul-warp-points.js?v=20261123-seoul-warp';

const dataUrl=new URL('../assets/city/seoul/driving-map.json?v=20261119-wide157',import.meta.url);

export function createSeoulMapPanel({beforeOpen,afterClose,onWarp,onClose}){
  const byId=id=>document.getElementById(id);
  const dialog=byId('seoul-map-dialog'),trigger=byId('seoul-map-open');
  const place=byId('seoul-map-place'),fit=byId('seoul-map-fit'),locate=byId('seoul-map-locate');
  const zoomIn=byId('seoul-map-in'),zoomOut=byId('seoul-map-out');
  const status=byId('seoul-map-loading'),retry=byId('seoul-map-retry'),source=byId('seoul-map-source');
  const warpSelect=byId('seoul-map-warp'),warpButton=byId('seoul-map-travel'),warpStatus=byId('seoul-warp-status');
  const warpSites=new Map(SEOUL_WARP_POINTS.map(point=>[point.id,point]));
  const sites=new Map();
  let loading=null,ready=false,racing=false,lastPlace,request=0,busy=false,selectedWarp=null;

  function warpControls(){
    warpSelect.disabled=busy;warpButton.disabled=busy||!selectedWarp;
    warpButton.textContent=busy?'이동 중…':'순간이동';
    dialog.querySelector('.seoul-map-nav').inert=busy;
    dialog.querySelector('.seoul-map-surface').inert=busy;
    dialog.querySelector('.seoul-map-zoom').inert=busy;
  }

  function viewChanged(view){
    fit.setAttribute('aria-pressed',String(view.mode==='overview'));
    locate.setAttribute('aria-pressed',String(view.mode==='follow'));
    zoomIn.disabled=!view.canZoomIn;zoomOut.disabled=!view.canZoomOut;
    const warpChanged=selectedWarp!==view.warpId;
    if(warpChanged){
      selectedWarp=view.warpId;
      warpSelect.value=selectedWarp||'';
      warpStatus.textContent='';
      warpControls();
    }
    const id=view.placeId||'';
    if(lastPlace===id&&!warpChanged)return;
    lastPlace=id;place.value=id;
    source.replaceChildren();
    const site=sites.get(id);
    if(selectedWarp){
      const point=warpSites.get(selectedWarp);
      source.textContent=[point.group,point.roadName].filter(Boolean).join(' · ');
    }else if(site?.url?.startsWith('https://')){
      const a=document.createElement('a');
      a.href=site.url;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=site.name+' 위치 자료';source.append(a);
    }
  }
  const map=createSeoulDrivingMap({miniCanvas:byId('city-map'),largeCanvas:byId('seoul-map-canvas'),warpPoints:SEOUL_WARP_POINTS,onViewChange:viewChanged});
  const warpGroups=new Map();
  const sortedPoints=[...SEOUL_WARP_POINTS].sort((a,b)=>a.group.localeCompare(b.group,'ko')||a.name.localeCompare(b.name,'ko'));
  for(const point of sortedPoints){
    if(!warpGroups.has(point.group)){
      const group=document.createElement('optgroup');group.label=point.group;
      warpGroups.set(point.group,group);warpSelect.append(group);
    }
    warpGroups.get(point.group).append(new Option(point.name,point.id));
  }

  function addGroup(label,entries){
    const group=document.createElement('optgroup');group.label=label;
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'ko'))){
      group.append(new Option(entry.name,entry.id));sites.set(entry.id,entry);
    }
    if(group.children.length)place.append(group);
  }
  function load(){
    if(ready||loading)return loading;
    status.hidden=false;retry.hidden=true;status.firstElementChild.textContent='서울 지도 불러오는 중…';place.disabled=true;
    loading=fetch(dataUrl).then(async response=>{
      if(!response.ok)throw new Error(String(response.status));
      const data=await response.json();
      map.setData(data);
      addGroup('다리',data.bridges.map(b=>({id:b.id,name:b.name,x:b.label[0],z:b.label[1],url:b.source})));
      addGroup('랜드마크',data.landmarks.map(p=>({...p,url:p.source})));
      place.disabled=false;status.hidden=true;ready=true;
    }).catch(()=>{
      status.firstElementChild.textContent='서울 지도 자료를 불러오지 못했어요.';retry.hidden=false;
    }).finally(()=>{loading=null;});
    return loading;
  }
  function open(){
    if(racing||trigger.disabled||dialog.open)return;
    if(!beforeOpen())return;
    dialog.showModal();map.open();load();
  }
  trigger.addEventListener('click',open);
  dialog.addEventListener('close',()=>{
    request++;busy=false;warpStatus.textContent='';warpControls();
    map.close();onClose?.();afterClose();
  });
  warpSelect.addEventListener('change',()=>{
    if(warpSelect.value)map.focusWarp(warpSelect.value);else map.fit();
  });
  warpButton.addEventListener('click',async()=>{
    const destination=warpSites.get(selectedWarp);
    if(!dialog.open||!destination||busy||racing)return;
    const ticket=++request;
    busy=true;warpStatus.textContent='';warpControls();
    try{
      const result=await onWarp(destination.id);
      if(ticket!==request||!dialog.open)return;
      if(result?.ok){map.locate();dialog.close();return;}
      warpStatus.textContent=result?.message||'이동하지 못했어요. 다시 시도해 주세요.';
    }catch{
      if(ticket===request&&dialog.open)warpStatus.textContent='이동하지 못했어요. 다시 시도해 주세요.';
    }finally{
      if(ticket===request){busy=false;warpControls();}
    }
  });
  retry.addEventListener('click',load);
  fit.addEventListener('click',()=>map.fit());locate.addEventListener('click',()=>map.locate());
  zoomIn.addEventListener('click',()=>map.zoomBy(1.5));zoomOut.addEventListener('click',()=>map.zoomBy(1/1.5));
  place.addEventListener('change',()=>{
    const site=sites.get(place.value);
    if(site)map.focus(site.x,site.z,site.id);
    else map.fit();
  });
  // A pinch followed by a pan can suppress the browser's next synthetic click.
  // Resolve a single tap on a toolbar button at touchend, cancelling that click.
  let tap=null;
  dialog.addEventListener('touchstart',event=>{
    const button=event.target.closest('button:not(:disabled)'),finger=event.touches[0];
    tap=button&&event.touches.length===1?{button,x:finger.clientX,y:finger.clientY}:null;
  },{passive:true});
  dialog.addEventListener('touchcancel',()=>{tap=null;},{passive:true});
  dialog.addEventListener('touchmove',event=>{
    const finger=event.touches[0];
    if(tap&&(event.touches.length!==1||Math.hypot(finger.clientX-tap.x,finger.clientY-tap.y)>10))tap=null;
  },{passive:true});
  dialog.addEventListener('touchend',event=>{
    const hit=tap;tap=null;
    if(!hit||event.touches.length||!event.cancelable)return;
    const finger=event.changedTouches[0];
    if(!hit.button.contains(document.elementFromPoint(finger.clientX,finger.clientY)))return;
    event.preventDefault();hit.button.click();
  },{passive:false});
  return {
    load,open,get isOpen(){return dialog.open;},
    close(){if(dialog.open)dialog.close();},
    update(state){map.update(state);},
    setRaceActive(value){
      if(racing===value)return;
      racing=value;trigger.disabled=value;
      if(racing&&dialog.open)dialog.close();
      map.setRaceActive(value);
    }
  };
}
