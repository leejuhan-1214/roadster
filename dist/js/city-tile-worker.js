import {buildCityTile,cityTileTransferables} from './city-tile-builder.js?v=20261118-frameperf1';
import {createRegionalPackLoader} from './city-regional-packs.js?v=20261119-wide157';
const loadRegion=createRegionalPackLoader();
const requests=new Map();let shared={};
self.onmessage=async({data})=>{
 if(data.type==='init'){shared=data.options;return;}
 if(data.type==='cancel'){requests.get(data.id)?.abort();return;}
 const controller=new AbortController();requests.set(data.id,controller);const timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const {signal}=controller;
  let source;
  if(data.url){
   const response=await fetch(data.url,{signal});if(!response.ok)throw new Error('Map HTTP '+response.status);
   source=await response.json();
   if(data.options.pack)source.water=(await loadRegion(data.options.pack,data.options.cell,signal)).water;
  }else{
   source=await loadRegion(data.options.pack,data.options.cell,signal);
  }
  if(controller.signal.aborted)return;
  const payload=buildCityTile(source,{...shared,...data.options});
  self.postMessage({id:data.id,payload},cityTileTransferables(payload));
 }catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}finally{clearTimeout(timeout);requests.delete(data.id);}
};
