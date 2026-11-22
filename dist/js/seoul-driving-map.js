const CORE_ROAD_BOUNDS={minX:-5120,maxX:5120,minZ:-5120,maxZ:5120};
const DEFAULT_BOUNDS={minX:-28672,maxX:16384,minZ:-24576,maxZ:12288};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const colours={outside:'#101c23',land:'#1b2d33',blocks:'#30454a',water:'#15516b',shore:'#427e8d',island:'#38594e',bridge:'#bbe0df',route:'#ffb968',car:'#84f4d6'};
const roadKinds=['local','tertiary','secondary','primary','motorway'];
const pen=['#455b60','#526b70','#688087','#839395','#a1aa9e'];
const weights=[.8,1.1,1.4,1.8,2.2];

export class SeoulViewport {
  constructor(bounds=DEFAULT_BOUNDS){
    this.bounds=bounds;this.width=1;this.height=1;
    this.fit();
  }
  get minScale(){
    const b=this.bounds,pad=Math.min(26,Math.min(this.width,this.height)*.055);
    return Math.min((this.width-pad*2)/(b.maxX-b.minX),(this.height-pad*2)/(b.maxZ-b.minZ));
  }
  get maxScale(){return Math.max(1.8,this.minScale*2);}
  resize(width,height){
    this.width=Math.max(1,width);this.height=Math.max(1,height);
    if(this.mode==='overview')this.fit();
    else this.scale=clamp(this.scale,this.minScale,this.maxScale);
  }
  fit(){
    const b=this.bounds;
    this.x=(b.minX+b.maxX)/2;this.z=(b.minZ+b.maxZ)/2;
    this.scale=this.minScale;this.mode='overview';this.placeId=null;
  }
  focus(x,z,id,mode,span=1150){
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    this.x=x;this.z=z;this.placeId=id;this.mode=mode;
    this.scale=clamp(Math.max(this.minScale*3,Math.min(this.width,this.height)/span),this.minScale,this.maxScale);
  }
  at(px,py){return [this.x+(px-this.width/2)/this.scale,this.z+(py-this.height/2)/this.scale];}
  moveAnchor(point,px,py){
    const b=this.bounds;
    this.x=clamp(point[0]-(px-this.width/2)/this.scale,b.minX,b.maxX);
    this.z=clamp(point[1]-(py-this.height/2)/this.scale,b.minZ,b.maxZ);
    this.mode='free';this.placeId=null;
  }
  zoom(factor,px=this.width/2,py=this.height/2){
    const anchor=this.at(px,py);
    this.scale=clamp(this.scale*factor,this.minScale,this.maxScale);
    this.moveAnchor(anchor,px,py);
  }
  state(){return {x:this.x,z:this.z,scale:this.scale,mode:this.mode,placeId:this.placeId,
    canZoomIn:this.scale<this.maxScale*.9999,canZoomOut:this.scale>this.minScale*1.0001};}
}

function feature(points){
  let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
  for(const [x,z] of points){
    if(x<minX)minX=x;if(x>maxX)maxX=x;if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
  }
  return {points,minX,minZ,maxX,maxZ};
}
function intersects(a,b){return a.maxX>=b.minX&&a.minX<=b.maxX&&a.maxZ>=b.minZ&&a.minZ<=b.maxZ;}

// Index immutable map features once. A moving car looks up nearby geometry
// instead of scanning all of Seoul when its cached street image runs out.
const cellSize=512;
class Layer {
  constructor(features){
    this.all=features;this.cells=new Map();this.visit=0;
    for(const f of features){
      for(let x=Math.floor(f.minX/cellSize);x<=Math.floor(f.maxX/cellSize);x++)
        for(let z=Math.floor(f.minZ/cellSize);z<=Math.floor(f.maxZ/cellSize);z++){
          const key=x+','+z;
          if(!this.cells.has(key))this.cells.set(key,[]);
          this.cells.get(key).push(f);
        }
    }
  }
  each(box,fn){
    const x0=Math.floor(box.minX/cellSize),x1=Math.floor(box.maxX/cellSize);
    const z0=Math.floor(box.minZ/cellSize),z1=Math.floor(box.maxZ/cellSize);
    if((x1-x0+1)*(z1-z0+1)>this.cells.size*.55){
      for(const f of this.all)if(intersects(f,box))fn(f);
      return;
    }
    this.visit++;
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const cell=this.cells.get(x+','+z);if(!cell)continue;
      for(const f of cell){
        if(f.visit===this.visit)continue;
        f.visit=this.visit;if(intersects(f,box))fn(f);
      }
    }
  }
}
function roadGroup(kind=''){
  const type=kind.replace(/_link$/,'');
  if(type==='motorway'||type==='trunk')return 4;
  return Math.max(0,roadKinds.indexOf(type));
}
function contains(f,x,z){
  if(x<f.minX||x>f.maxX||z<f.minZ||z>f.maxZ)return false;
  const points=f.points;let inside=false;
  const crosses=i=>{
    const a=points[i],b=points[i===0?points.length-1:i-1];
    return (a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0];
  };
  if(points.length<120){
    for(let i=0;i<points.length;i++)if(crosses(i))inside=!inside;
    return inside;
  }
  // The Han winds across much of Seoul. A point can be inside its bounding
  // rectangle even when it is kilometres from the river. Only edges crossing
  // the point's latitude can affect the exact point-in-polygon result.
  if(!f.edgeRows){
    f.rowHeight=Math.max(90,(f.maxZ-f.minZ)/160);f.edgeRows=[];
    for(let i=0;i<points.length;i++){
      const a=points[i][1],b=points[i?i-1:points.length-1][1];
      if(a===b)continue;
      const lo=Math.floor((Math.min(a,b)-f.minZ)/f.rowHeight),hi=Math.floor((Math.max(a,b)-f.minZ)/f.rowHeight);
      for(let j=lo;j<=hi;j++)(f.edgeRows[j]||=[]).push(i);
    }
  }
  const row=Math.floor((z-f.minZ)/f.rowHeight);
  for(const i of f.edgeRows[row]||[])if(crosses(i))inside=!inside;
  return inside;
}
function indexMap(data){
  const groups=roadKinds.map(()=>[]);
  for(const road of data.roads||[])if(road.points?.length>1)groups[roadGroup(road.kind)].push(feature(road.points));
  const water=(data.water||[]).map(feature),riverLabels=data.riverLabels||[data.riverLabel].filter(Boolean);
  const mainRiver=water.filter(f=>riverLabels.some(([x,z])=>contains(f,x,z)));
  const bridges=data.bridges||[];
  const places=(data.landmarks||[]).slice();
  for(const bridge of bridges){
    const pt=bridge.label||bridge.points?.[Math.floor(bridge.points.length/2)];
    if(pt)places.push({id:bridge.id,name:bridge.name,x:pt[0],z:pt[1],kind:'bridge',group:bridge.group,priority:bridge.priority});
  }
  return {bounds:data.bounds||DEFAULT_BOUNDS,detailBounds:data.detailBounds||CORE_ROAD_BOUNDS,water,mainRiver,islands:(data.islands||[]).map(feature),
    roads:groups.map(group=>new Layer(group)),blocks:new Layer((data.blocks||[]).map(feature)),bridges:data.bridges||[],
    places,riverLabels};
}
function rectFor(view){
  return {minX:view.x-view.width/(2*view.scale),maxX:view.x+view.width/(2*view.scale),
    minZ:view.z-view.height/(2*view.scale),maxZ:view.z+view.height/(2*view.scale)};
}
function project(view,x,z){
  return [(x-view.x)*view.scale+view.width/2,(z-view.z)*view.scale+view.height/2];
}
function destinationSpan(map,x,z,id){
  const b=map?.detailBounds;
  if(!b)return 1150;
  const bridge=map.bridges.find(bridge=>bridge.id===id);
  if(bridge){
    let reach=0;
    for(const [px,pz] of bridge.points)reach=Math.max(reach,Math.abs(px-x),Math.abs(pz-z));
    return Math.max(1150,reach*2.3);
  }
  if(x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ)return 1150;
  // A campus, park or airport can have its representative point far inside
  // its grounds. Include its mapped approach roads when a driver selects it.
  const radius=3000,box={minX:x-radius,maxX:x+radius,minZ:z-radius,maxZ:z+radius};
  const nearest=[];
  for(const layer of map.roads)layer.each(box,({points})=>{
    let best=Infinity;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
      const t=length?clamp(((x-a[0])*dx+(z-a[1])*dz)/length,0,1):0;
      best=Math.min(best,(a[0]+t*dx-x)**2+(a[1]+t*dz-z)**2);
    }
    if(nearest.length<4||best<nearest[3]){
      nearest.push(best);nearest.sort((a,b)=>a-b);if(nearest.length>4)nearest.pop();
    }
  });
  const distance=Math.sqrt(nearest.at(-1)??radius**2);
  return clamp(3.2*(distance+160),1500,7800);
}
function trace(ctx,points,close=false){
  if(!points?.length)return;
  ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  if(close)ctx.closePath();
}
function usesLocalRoads(map,view,box){
  if(!map)return true;
  if(view.scale>=.7)return true;
  const b=map.detailBounds;
  return view.scale>=.11&&(box.minX<b.minX||box.maxX>b.maxX||box.minZ<b.minZ||box.maxZ>b.maxZ);
}
function drawLocalRoads(ctx,view,map,roads,box){
  if(!roads||!usesLocalRoads(map,view,box))return;
  ctx.beginPath();
  for(const road of roads){
    if(!road.points?.length||map&&roadGroup(road.type)>0)continue;
    let f=roadBoxes.get(road);if(!f){f=feature(road.points);roadBoxes.set(road,f);}
    if(!intersects(box,f))continue;
    if(map){
      const b=map.detailBounds,inCore=f.minX>=b.minX&&f.maxX<=b.maxX&&f.minZ>=b.minZ&&f.maxZ<=b.maxZ;
      if(inCore&&(road.type!=='service'||view.scale<.7))continue;
    }
    trace(ctx,f.points);
  }
  ctx.lineWidth=Math.max(.9/view.scale,3);ctx.strokeStyle=pen[0];ctx.stroke();
}
function drawBase(ctx,view,map,localRoads,locator=false){
  const {width:w,height:h,scale:s}=view,box=rectFor(view),b=map?.bounds||DEFAULT_BOUNDS;
  ctx.fillStyle=colours.outside;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(s,s);ctx.translate(-view.x,-view.z);
  ctx.beginPath();ctx.rect(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);ctx.clip();
  ctx.fillStyle=colours.land;ctx.fillRect(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);
  if(map){
    if(!locator&&s>=.022){
      ctx.beginPath();
      map.blocks.each(box,f=>{if(Math.max(f.maxX-f.minX,f.maxZ-f.minZ)*s>2)trace(ctx,f.points,true);});
      ctx.fillStyle=colours.blocks;ctx.fill();
    }
    ctx.lineJoin='round';ctx.lineCap='round';
    ctx.beginPath();for(const f of map.water)if(intersects(box,f)&&Math.max(f.maxX-f.minX,f.maxZ-f.minZ)*s>1)trace(ctx,f.points,true);
    ctx.fillStyle=colours.water;ctx.fill();ctx.lineWidth=.85/s;ctx.strokeStyle=colours.shore;ctx.stroke();
    ctx.beginPath();for(const f of map.islands)if(intersects(box,f)&&Math.max(f.maxX-f.minX,f.maxZ-f.minZ)*s>1)trace(ctx,f.points,true);
    ctx.fillStyle=colours.island;ctx.fill();
  }
  if(!locator){
    drawLocalRoads(ctx,view,map,localRoads,box);
    if(map)for(let group=0;group<map.roads.length;group++){
      if(group===0&&s<.125||group===1&&s<.058||group===2&&s<.019)continue;
      ctx.beginPath();map.roads[group].each(box,f=>trace(ctx,f.points));
      const weight=weights[group]*clamp(s/.042,.46,1);
      ctx.strokeStyle=pen[group];ctx.lineWidth=Math.max(weight/s,(group+1)*1.8);ctx.stroke();
    }
  }
  if(map){
    ctx.beginPath();for(const bridge of map.bridges)trace(ctx,bridge.points);
    ctx.strokeStyle='#112c39';ctx.lineWidth=(locator||s<.025?1.6:3.5)/s;ctx.stroke();
    ctx.strokeStyle=colours.bridge;ctx.lineWidth=(locator||s<.025?.8:1.45)/s;ctx.stroke();
  }
  ctx.restore();
}
const roadBoxes=new WeakMap();
function canvasLayer(host){
  return (host.ownerDocument||document).createElement('canvas');
}
function frameSize(canvas){
  const bounds=canvas.getBoundingClientRect();
  const width=Math.round(bounds.width),height=Math.round(bounds.height);
  if(!width||!height)return null;
  const ratio=clamp(globalThis.devicePixelRatio||1,1,2);
  const pw=Math.round(width*ratio),ph=Math.round(height*ratio);
  if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;
  return {width,height,ratio};
}
function baseLayer(host,view,cache,map,roads,ratio){
  const {x,z,scale:s,width:w,height:h}=view;
  const margin=48;
  // Stream revisions should only invalidate local maps which display their roads.
  const padded={x,z,scale:s,width:w+2*margin,height:h+2*margin};
  const source=usesLocalRoads(map,padded,rectFor(padded))?roads:null;
  if(!cache.layer||cache.map!==map||cache.roads!==source||cache.width!==w||cache.height!==h||cache.scale!==s||
     cache.ratio!==ratio||Math.abs((x-cache.x)*s)>margin-2||Math.abs((z-cache.z)*s)>margin-2){
    const layer=cache.layer||canvasLayer(host);layer.width=Math.ceil((w+2*margin)*ratio);layer.height=Math.ceil((h+2*margin)*ratio);
    const ctx=layer.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
    drawBase(ctx,padded,map,source);
    Object.assign(cache,{x,z,scale:s,ratio,width:w,height:h,map,roads:source,layer});
  }
  return [(margin+(x-cache.x)*s)*ratio,(margin+(z-cache.z)*s)*ratio];
}
function regionBase(host,ctx,v,map,cache,ratio){
  const b=map.bounds,dx=b.maxX-b.minX,dz=b.maxZ-b.minZ;
  if(v.scale>.034||Math.max(dx,dz)<18000)return false;
  // Keep a complete regional image at the current level of detail. Dragging or
  // pinching around the city mostly copies pixels, even in a high-DPI browser.
  if(cache.map!==map||cache.ratio!==ratio||v.scale>cache.scale*1.55||v.scale<cache.scale/1.55){
    const layer=cache.layer||canvasLayer(host),density=Math.min(ratio,1800/(Math.max(dx,dz)*v.scale));
    const w=dx*v.scale,h=dz*v.scale;
    layer.width=Math.ceil(w*density);layer.height=Math.ceil(h*density);
    const ink=layer.getContext('2d');ink.setTransform(layer.width/w,0,0,layer.height/h,0,0);
    drawBase(ink,{x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,scale:v.scale,width:w,height:h},map,null);
    Object.assign(cache,{layer,map,scale:v.scale,ratio});
  }
  const [px,py]=project(v,b.minX,b.minZ);
  ctx.fillStyle=colours.outside;ctx.fillRect(0,0,v.width,v.height);
  ctx.drawImage(cache.layer,px,py,dx*v.scale,dz*v.scale);
  return true;
}
function plotRoute(ctx,view,route){
  if(!route?.length)return;
  const box=rectFor(view);
  ctx.beginPath();
  for(const part of route){
    if(part.length<2)continue;
    let start=part[0],drawing=false,lastX=0,lastY=0;
    for(let i=1;i<part.length;i++){
      const end=part[i];
      if(Math.max(start[0],end[0])<box.minX||Math.min(start[0],end[0])>box.maxX||
         Math.max(start[1],end[1])<box.minZ||Math.min(start[1],end[1])>box.maxZ){drawing=false;start=end;continue;}
      if(!drawing){[lastX,lastY]=project(view,start[0],start[1]);ctx.moveTo(lastX,lastY);}
      const [px,py]=project(view,end[0],end[1]);
      if(i===part.length-1||(px-lastX)**2+(py-lastY)**2>=1){ctx.lineTo(px,py);lastX=px;lastY=py;}
      drawing=true;start=end;
    }
  }
  ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#171c21';ctx.lineWidth=4.4;ctx.stroke();
  ctx.strokeStyle=colours.route;ctx.lineWidth=2.3;ctx.stroke();
}
function car(ctx,view,vehicle,size=7){
  const [px,py]=project(view,vehicle.x,vehicle.z);
  if(px< -size||py< -size||px>view.width+size||py>view.height+size)return;
  ctx.save();ctx.translate(px,py);ctx.rotate(Math.PI/2-(vehicle.yaw||0));
  ctx.beginPath();ctx.moveTo(0,-size*1.3);ctx.lineTo(size*.82,size);ctx.lineTo(0,size*.55);ctx.lineTo(-size*.82,size);ctx.closePath();
  ctx.fillStyle=colours.car;ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#0b2026';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#e9fff6';ctx.stroke();ctx.restore();
}
function text(ctx,label,x,y,fill,align='left',font='600 11px sans-serif'){
  ctx.font=font;ctx.textAlign=align;ctx.textBaseline='middle';ctx.lineJoin='round';
  ctx.strokeStyle='#14242b';ctx.lineWidth=3;ctx.strokeText(label,x,y);ctx.fillStyle=fill;ctx.fillText(label,x,y);
}
function mapScale(ctx,view){
  const {scale:s,width:w,height:h}=view;
  const target=Math.min(74,w*.28)/s,order=10**Math.floor(Math.log10(target));
  const length=([5,2,1].find(n=>n*order<=target)||1)*order,px=length*s;
  const x=9,y=h-7;
  ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x,y);ctx.lineTo(x+px,y);ctx.lineTo(x+px,y-3);
  ctx.lineWidth=3;ctx.strokeStyle='#17252e';ctx.stroke();ctx.lineWidth=1;ctx.strokeStyle='#d8e6e7';ctx.stroke();
  text(ctx,length>=1000?length/1000+' km':length+' m',x,y-10,'#e0e9e8','left','500 10px sans-serif');
}
function compass(ctx,x,y){
  text(ctx,'N',x,y+6,'#e4eeed','center','bold 10px sans-serif');
  ctx.beginPath();ctx.moveTo(x,y+12);ctx.lineTo(x-2.6,y+19);ctx.lineTo(x,y+17);ctx.lineTo(x+2.6,y+19);ctx.closePath();
  ctx.fillStyle='#cae6e4';ctx.fill();
}
function overlaps(a,b){return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];}
const pointColours={station:'#ecdc96',park:'#afd6a7',temple:'#deb999',sport:'#c4c7dd'};
function riverLabel(ctx,view,map,occupied){
  const w=view.width,h=view.height;
  const candidates=map.riverLabels.map(([x,z])=>project(view,x,z));
  candidates.sort((a,b)=>Math.abs(a[0]-w/2)-Math.abs(b[0]-w/2));
  const tryLabel=(x,y)=>{
    const rect=[x-16,y-8,x+16,y+8];
    if(x<17||x>w-17||y<10||y>h-10||occupied.some(b=>overlaps(b,rect)))return false;
    text(ctx,'한강',x,y,'#aad7e7','center','bold 12px sans-serif');occupied.push(rect);return true;
  };
  for(const [x,y] of candidates)if(tryLabel(x,y))return;
  if(!map.mainRiver.some(f=>intersects(f,rectFor(view))))return;
  // A zoomed bridge can be several screens away from any regional label.
  // Choose a visible position actually on the main channel and off its islands.
  for(const ny of [.42,.64,.23,.82])for(const nx of [.4,.64,.22,.8]){
    const px=w*nx,py=h*ny;
    const x=view.x+(px-w/2)/view.scale,z=view.z+(py-h/2)/view.scale;
    if(map.mainRiver.some(f=>contains(f,x,z))&&!map.islands.some(f=>contains(f,x,z))&&tryLabel(px,py))return;
  }
}
function mapLabels(ctx,view,map,vehicle,compact,reserved=[]){
  if(!map)return [];
  const hits=[],occupied=reserved.slice(),w=view.width,h=view.height;
  const [carX,carY]=project(view,vehicle.x,vehicle.z);
  occupied.push([carX-8,carY-9,carX+8,carY+9],[0,h-24,Math.min(w*.32,77),h]);
  const visible=(px,py)=>px>2&&py>2&&px<w-2&&py<h-2;
  const selectedBridge=map.bridges.find(b=>b.id===view.placeId);
  const box=rectFor(view);
  const places=map.places.filter(p=>p.x>=box.minX&&p.x<=box.maxX&&p.z>=box.minZ&&p.z<=box.maxZ);
  if(selectedBridge){
    ctx.save();ctx.beginPath();
    selectedBridge.points.forEach(([x,z],i)=>{const p=project(view,x,z);if(i)ctx.lineTo(...p);else ctx.moveTo(...p);});
    ctx.lineWidth=3;ctx.strokeStyle='#a6efe5';
    if(selectedBridge.id==='jamsu')ctx.setLineDash([5,4]);
    ctx.stroke();ctx.restore();
  }
  places.sort((a,b)=>Number(b.id===view.placeId)-Number(a.id===view.placeId)||
    (b.priority||0)-(a.priority||0)||
    Number(b.kind==='bridge')-Number(a.kind==='bridge')||(a.x-vehicle.x)**2+(a.z-vehicle.z)**2-((b.x-vehicle.x)**2+(b.z-vehicle.z)**2));
  let riverDrawn=false;
  for(const p of places){
    const stacked=p.group==='banpo-crossing';
    if(stacked&&(selectedBridge?.group===p.group?p.id!==selectedBridge.id:p.id==='jamsu'))continue;
    const label=stacked&&selectedBridge?.group!==p.group?'반포대교·잠수교':p.name;
    if(!riverDrawn&&p.id!==view.placeId){riverLabel(ctx,view,map,occupied);riverDrawn=true;}
    const [x,y]=project(view,p.x,p.z);if(!visible(x,y))continue;
    if(compact&&reserved.some(box=>overlaps([x-3,y-3,x+3,y+3],box)))continue;
    const bridge=p.kind==='bridge',selected=view.placeId===p.id;
    const fill=bridge?'#b0dee2':(pointColours[p.kind]||'#e4ebef');
    if(!bridge&&(selected||!reserved.some(rect=>overlaps([x-3,y-3,x+3,y+3],rect)))){
      ctx.beginPath();ctx.arc(x,y,selected?5:3.1,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();
      ctx.lineWidth=1.5;ctx.strokeStyle='#172a31';ctx.stroke();
    }
    if(selected){ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.lineWidth=1.5;ctx.strokeStyle='#fff4d9';ctx.stroke();}
    const font=selected?'bold 13px sans-serif':compact?'600 10px sans-serif':bridge?'600 11px sans-serif':'600 12px sans-serif';
    ctx.font=font;const width=ctx.measureText(label).width;
    const hit={id:p.id,x:p.x,z:p.z,px:x,py:y};hits.push(hit);
    const besideCar=Math.abs(x-carX)<15&&Math.abs(y-carY)<15;
    const offset=besideCar?16:selected?11:6,above=besideCar?21:13;
    for(const [left,cy] of [[x+offset,y],[x-offset-width,y],[x-width/2,y-above],[x-width/2,y+above]]){
      const rect=[left-2,cy-7,left+width+2,cy+7];
      if(rect[0]<2||rect[2]>w-2||rect[1]<2||rect[3]>h-2||occupied.some(a=>overlaps(a,rect)))continue;
      text(ctx,label,left,cy,fill,'left',font);
      occupied.push(view.scale<.03?[rect[0]-4,rect[1]-2,rect[2]+4,rect[3]+2]:rect);
      hit.rect=rect;break;
    }
  }
  if(!riverDrawn)riverLabel(ctx,view,map,occupied);
  return hits;
}
function miniLocator(ctx,map,vehicle,w,h,cache){
  if(!map)return null;
  const iw=Math.round(clamp(w*.33,39,66)),ih=Math.round(clamp(h*.32,29,47));
  const bx=w-iw-4,by=4,b=map.bounds;
  const s=Math.min((iw-6)/(b.maxX-b.minX),(ih-5)/(b.maxZ-b.minZ));
  const v={x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,width:iw,height:ih,scale:s};
  if(!cache.layer||cache.width!==iw||cache.height!==ih||cache.map!==map){
    const layer=cache.layer||canvasLayer(ctx.canvas);
    layer.width=iw*2;layer.height=ih*2;
    const ink=layer.getContext('2d');ink.setTransform(2,0,0,2,0,0);
    drawBase(ink,v,map,null,true);Object.assign(cache,{layer,width:iw,height:ih,map});
  }
  ctx.save();ctx.translate(bx,by);ctx.drawImage(cache.layer,0,0,iw,ih);ctx.lineWidth=1;ctx.strokeStyle='#7a9aa2';ctx.strokeRect(.5,.5,iw-1,ih-1);
  const [px,py]=project(v,vehicle.x,vehicle.z);
  ctx.beginPath();ctx.arc(px,py,2.7,0,Math.PI*2);ctx.fillStyle=colours.car;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#0a252b';ctx.stroke();
  if(map.riverLabels.length){
    const [rx,ry]=project(v,...map.riverLabels[0]);
    text(ctx,'한강',clamp(rx,8,iw-8),clamp(ry-2,6,ih-6),'#c5e7ee','center','bold 8px sans-serif');
  }
  ctx.restore();
  return [bx,by,bx+iw,by+ih];
}
function portalMarkers(ctx,v,vehicle){
  const gate=vehicle.portals?.nearest?.(vehicle.x,vehicle.z);
  const mark=(g)=>{
    const [px,py]=project(v,g.x,g.z);
    if(px<4||px>v.width-4||py<4||py>v.height-4)return false;
    ctx.beginPath();ctx.moveTo(px,py-4);ctx.lineTo(px+4,py);ctx.lineTo(px,py+4);ctx.lineTo(px-4,py);ctx.closePath();
    ctx.fillStyle='#ffe38b';ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#14242b';ctx.stroke();return true;
  };
  for(const cell of vehicle.cells?.values?.()||[])for(const g of cell.gates||[])if(g.id!==gate?.id)mark(g);
  if(!gate||mark(gate))return;
  const dx=gate.x-v.x,dz=gate.z-v.z,t=Math.max(Math.abs(dx)/(v.width/2-9),Math.abs(dz)/(v.height/2-9));
  if(!t)return;
  ctx.save();ctx.translate(v.width/2+dx/t,v.height/2+dz/t);ctx.rotate(Math.atan2(dz,dx));
  ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-4,-4);ctx.lineTo(-4,4);ctx.closePath();ctx.fillStyle='#ffe38b';ctx.fill();ctx.restore();
}

// Cluster by screen distance so nearby stops separate naturally as the driver zooms.
function warpMarkers(ctx,view,points,selectedId){
  const hits=[];
  for(const point of points){
    const [px,py]=project(view,point.x,point.z);
    if(px<4||py<4||px>view.width-4||py>view.height-4)continue;
    const selected=point.id===selectedId;
    const neighbor=selected?null:hits.find(h=>!h.selected&&Math.hypot(px-h.px,py-h.py)<29);
    if(neighbor){neighbor.count++;continue;}
    hits.push({warp:point,px,py,selected,count:1});
  }
  // A selected pin stays visible above its neighbors, including at overview scale.
  hits.sort((a,b)=>Number(a.selected)-Number(b.selected));
  for(const hit of hits){
    const {px,py,selected,count}=hit,r=selected||count>1?10:7;
    hit.rect=[px-r-3,py-r-3,px+r+3,py+r+3];
    ctx.beginPath();ctx.arc(px,py,r,0,Math.PI*2);
    ctx.fillStyle=selected?'#f4e8ff':'#49385e';ctx.fill();
    ctx.lineWidth=selected?2.5:1.6;ctx.strokeStyle=selected?'#b994ef':'#e2c7ff';ctx.stroke();
    if(count>1){
      ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='#ffffff';ctx.fillText(String(count),px,py+.5);
    }else{
      ctx.beginPath();ctx.moveTo(px,py-4);ctx.lineTo(px+3.5,py);ctx.lineTo(px,py+4);ctx.lineTo(px-3.5,py);ctx.closePath();
      ctx.fillStyle=selected?'#55396e':'#eedeff';ctx.fill();
    }
  }
  return hits.reverse();
}

export function createSeoulDrivingMap({miniCanvas,largeCanvas,warpPoints=[],onViewChange=()=>{}}){
  const view=new SeoulViewport(),miniCache={},largeCache={},locatorCache={},regionCache={};
  const originalMini={width:miniCanvas.width,height:miniCanvas.height};
  let dataset=null,map=null,vehicle=null,large=false,racing=false,frame=null,active=true,hits=[];
  let lastVehicle=null,lastTap=null,drag=null,warpId=null;
  const pointers=new Map(),listeners=[];
  const schedule=()=>{
    if(!active||racing||frame!==null)return;
    frame=requestAnimationFrame(()=>{frame=null;render();});
  };
  function notify(){onViewChange({...view.state(),warpId});}
  function change(){hits=[];lastVehicle=null;notify();schedule();}
  function viewSize(){
    const size=frameSize(largeCanvas);
    if(size&&(view.width!==size.width||view.height!==size.height)){
      view.resize(size.width,size.height);notify();
    }
    return size;
  }
  function paint(canvas,v,cache,ratio,compact){
    const ctx=canvas.getContext('2d'),w=v.width,h=v.height;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    if(compact||!map||!regionBase(canvas,ctx,v,map,regionCache,ratio)){
      const [sx,sy]=baseLayer(canvas,v,cache,map,vehicle.roads,ratio);
      ctx.drawImage(cache.layer,sx,sy,w*ratio,h*ratio,0,0,w,h);
    }
    plotRoute(ctx,v,vehicle.route);
    const reserved=[[0,0,24,28]];
    if(compact){
      portalMarkers(ctx,v,vehicle);
      const locator=miniLocator(ctx,map,vehicle,w,h,locatorCache);
      if(locator)reserved.push(locator);
    }
    const warps=compact?[]:warpMarkers(ctx,v,warpPoints,warpId);
    const labels=mapLabels(ctx,v,map,vehicle,compact,reserved.concat(warps.map(hit=>hit.rect)));
    car(ctx,v,vehicle,compact?5.5:8);mapScale(ctx,v);compass(ctx,12,4);
    if(!compact){
      hits=[...warps,...labels];
      const [px,py]=project(v,vehicle.x,vehicle.z);
      if(px<0||px>w||py<0||py>h){
        const dx=px-w/2,dy=py-h/2;
        const edge=Math.min((w/2-52)/Math.max(1,Math.abs(dx)),(h/2-24)/Math.max(1,Math.abs(dy)));
        const cx=w/2+dx*edge,cy=h/2+dy*edge;
        const d=Math.hypot(vehicle.x-v.x,vehicle.z-v.z),label='내 차 '+(d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m');
        const rect=[cx-43,cy-10,cx+43,cy+10];
        ctx.fillStyle='#101e25';ctx.fillRect(rect[0],rect[1],86,20);
        ctx.strokeStyle='#70b5a9';ctx.lineWidth=1;ctx.strokeRect(rect[0],rect[1],86,20);
        text(ctx,label,cx,cy,colours.car,'center','600 11px sans-serif');hits.unshift({rect,locate:true});
      }
    }
  }
  function render(){
    if(!vehicle||racing||!active)return;
    if(large){
      const size=viewSize();if(!size)return;
      if(view.mode==='follow'){view.x=vehicle.x;view.z=vehicle.z;}
      paint(largeCanvas,view,largeCache,size.ratio,false);
    }else{
      const size=frameSize(miniCanvas);if(!size)return;
      // Preserve a useful radius on narrow phones. The locator gives a
      // second, regional position while this street map follows the car.
      const local={...size,x:vehicle.x,z:vehicle.z,scale:Math.min(size.width,size.height)/470};
      paint(miniCanvas,local,miniCache,size.ratio,true);
    }
  }
  function fit(){warpId=null;view.fit();change();}
  function locate(){if(vehicle){warpId=null;view.focus(vehicle.x,vehicle.z,null,'follow');change();}}
  function focus(x,z,id=null){warpId=null;view.focus(x,z,id,'place',destinationSpan(map,x,z,id));change();}
  function focusWarp(id){
    const point=warpPoints.find(point=>point.id===id);
    if(!point)return;
    warpId=id;view.focus(point.x,point.z,null,'warp',1150);change();
  }
  function zoomBy(factor,px,py){
    if(!Number.isFinite(factor)||factor<=0)return;
    view.zoom(factor,px,py);change();
  }
  function panBy(dx,dy){
    const cx=view.width/2,cy=view.height/2;
    view.moveAnchor(view.at(cx,cy),cx+dx,cy+dy);change();
  }
  function localPoint(e){
    const r=largeCanvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];
  }
  function startGesture(){
    const values=[...pointers.values()];
    if(!values.length){drag=null;return;}
    const [a,b]=values;
    if(!b){drag={anchor:view.at(...a),start:a.slice(),moved:false};return;}
    const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
    drag={anchor:view.at(x,y),distance:Math.max(1,Math.hypot(b[0]-a[0],b[1]-a[1])),scale:view.scale,moved:true};
  }
  function pointerDown(e){
    if(!large||e.button!==0||pointers.size>=2)return;
    e.preventDefault();largeCanvas.focus({preventScroll:true});largeCanvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,localPoint(e));startGesture();
  }
  function pointerMove(e){
    if(!large||!drag||!pointers.has(e.pointerId))return;
    const p=localPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size===2){
      const [a,b]=pointers.values(),distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
      view.scale=clamp(drag.scale*distance/drag.distance,view.minScale,view.maxScale);
      view.moveAnchor(drag.anchor,(a[0]+b[0])/2,(a[1]+b[1])/2);
    }else{
      if(!drag.moved&&Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])<3)return;
      view.moveAnchor(drag.anchor,...p);
    }
    drag.moved=true;e.preventDefault();change();
  }
  function pointerEnd(e){
    if(!pointers.has(e.pointerId))return;
    const tap=e.type==='pointerup'&&!drag?.moved&&pointers.size===1;
    const p=localPoint(e),wasPinch=pointers.size===2;
    pointers.delete(e.pointerId);
    if(largeCanvas.hasPointerCapture?.(e.pointerId))largeCanvas.releasePointerCapture(e.pointerId);
    startGesture();
    if(wasPinch&&drag){drag.moved=true;lastTap=null;}
    if(!tap)return;
    const now=e.timeStamp;
    if(lastTap&&now-lastTap.time<340&&Math.hypot(p[0]-lastTap.x,p[1]-lastTap.y)<18){
      lastTap=null;zoomBy(2,...p);return;
    }
    lastTap={x:p[0],y:p[1],time:now};
    const label=hits.find(h=>h.rect&&p[0]>=h.rect[0]&&p[0]<=h.rect[2]&&p[1]>=h.rect[1]&&p[1]<=h.rect[3]);
    let target=label;
    if(!target){
      let nearest=e.pointerType==='touch'?15:9;
      for(const h of hits){const d=Math.hypot(h.px-p[0],h.py-p[1]);if(d<nearest){target=h;nearest=d;}}
    }
    if(target?.locate)locate();
    else if(target?.count>1){
      const anchor=view.at(target.px,target.py);
      view.zoom(2.8,target.px,target.py);view.moveAnchor(anchor,view.width/2,view.height/2);
      warpId=null;lastTap=null;change();
    }else if(target?.warp)focusWarp(target.warp.id);
    else if(target)focus(target.x,target.z,target.id);
  }
  function keyDown(e){
    if(!large||e.altKey||e.ctrlKey||e.metaKey)return;
    const dx=view.width*.2,dy=view.height*.2;
    switch(e.key){
    case 'ArrowUp':panBy(0,dy);break;case 'ArrowDown':panBy(0,-dy);break;
    case 'ArrowLeft':panBy(dx,0);break;case 'ArrowRight':panBy(-dx,0);break;
    case '+':case '=':zoomBy(1.5);break;case '-':zoomBy(1/1.5);break;
    case 'Home':fit();break;default:return;
    }
    e.preventDefault();e.stopPropagation();
  }
  function listen(type,fn,options){
    largeCanvas.addEventListener(type,fn,options);listeners.push([type,fn,options]);
  }
  listen('pointerdown',pointerDown);listen('pointermove',pointerMove);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(type,pointerEnd);
  listen('wheel',e=>{
    if(!large)return;
    e.preventDefault();
    const unit=e.deltaMode===1?16:e.deltaMode===2?view.height:1;
    zoomBy(Math.exp(-clamp(e.deltaY*unit,-400,400)*.0025),...localPoint(e));
  },{passive:false});
  listen('keydown',keyDown);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  observer?.observe(miniCanvas);observer?.observe(largeCanvas);
  function setData(data){
    if(dataset===data)return;
    dataset=data;map=data?indexMap(data):null;view.bounds=map?.bounds||DEFAULT_BOUNDS;
    if(view.mode==='overview')view.fit();
    change();
  }
  function update(next){
    if(!next||!Number.isFinite(next.x)||!Number.isFinite(next.z))return;
    vehicle=next;if(racing)return;
    const n=next.route?.length||0,len=n?next.route[n-1].length:0;
    if(lastVehicle&&Math.abs(next.x-lastVehicle.x)<.04&&Math.abs(next.z-lastVehicle.z)<.04&&
       Math.abs(next.yaw-lastVehicle.yaw)<.001&&lastVehicle.roads===next.roads&&lastVehicle.n===n&&
       lastVehicle.len===len&&lastVehicle.routeRevision===next.routeRevision&&lastVehicle.gates===next.cells?.size)return;
    lastVehicle={x:next.x,z:next.z,yaw:next.yaw,roads:next.roads,n,len,routeRevision:next.routeRevision,gates:next.cells?.size};
    schedule();
  }
  function cancelGesture(){
    for(const id of [...pointers.keys()]){
      pointers.delete(id);
      if(largeCanvas.hasPointerCapture?.(id))largeCanvas.releasePointerCapture(id);
    }
    drag=null;lastTap=null;
  }
  function close(){cancelGesture();large=false;lastVehicle=null;schedule();}
  function setRaceActive(value){
    if(racing===!!value)return;
    racing=!!value;
    if(racing){
      close();miniCanvas.width=originalMini.width;miniCanvas.height=originalMini.height;
    }else{lastVehicle=null;schedule();}
  }
  return {view,setData,update,fit,focus,focusWarp,locate,zoomBy,resize:schedule,setRaceActive,
    open(){if(racing)return;large=true;viewSize();change();},close,
    dispose(){
      active=false;if(frame!==null)cancelAnimationFrame(frame);
      observer?.disconnect();cancelGesture();
      for(const [type,fn,options]of listeners)largeCanvas.removeEventListener(type,fn,options);
    }};
}
