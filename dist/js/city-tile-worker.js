import {buildCityTile,cityTileTransferables} from './city-tile-builder.js?v=20261110-seoul1';
const requests=new Map();let shared={};
self.onmessage=async({data})=>{
 if(data.type==='init'){shared=data.options;return;}
 if(data.type==='cancel'){requests.get(data.id)?.abort();return;}
 const controller=new AbortController();requests.set(data.id,controller);const timeout=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch(data.url,{signal:controller.signal});if(!response.ok)throw new Error('Map HTTP '+response.status);
  const source=await response.json();if(controller.signal.aborted)return;
  const payload=buildCityTile(source,{...shared,...data.options});
  self.postMessage({id:data.id,payload},cityTileTransferables(payload));
 }catch(error){self.postMessage({id:data.id,error:String(error.message||error)});}finally{clearTimeout(timeout);requests.delete(data.id);}
};
