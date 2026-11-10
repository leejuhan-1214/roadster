/** A held command, never a toggle. Each trial/pause clears both input sources. */
export function bindLandingLiftControls({window,document,button,isReady,onChange}){
  let keyboard=false;
  const pointers=new Set();
  const editable=target=>target?.matches?.('input,textarea,select')||target?.isContentEditable;
  const publish=()=>onChange(keyboard||pointers.size>0);
  const clear=()=>{keyboard=false;pointers.clear();publish();};
  window.addEventListener('keydown',event=>{
    if(event.code!=='Space'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||editable(event.target)||!isReady())return;
    event.preventDefault();keyboard=true;publish();
  });
  window.addEventListener('keyup',event=>{
    if(event.code!=='Space')return;
    if(keyboard)event.preventDefault();keyboard=false;publish();
  });
  window.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',clear);
  document.addEventListener('focusin',event=>{if(editable(event.target))clear();});
  button?.addEventListener('pointerdown',event=>{
    if(event.button!==0||!isReady())return;
    event.preventDefault();button.setPointerCapture(event.pointerId);
    pointers.add(event.pointerId);publish();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])button?.addEventListener(type,event=>{
    pointers.delete(event.pointerId);publish();
  });
  // Suppress the Space-generated button click: this is a momentary actuator.
  button?.addEventListener('click',event=>event.preventDefault());
  return clear;
}
