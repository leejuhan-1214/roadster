// Static X/Z broad phase. Keep original ordering so contact resolution agrees
// with the unindexed solver, including overlaps at grid boundaries.
export function createObstacleIndex(obstacles,cellSize=32){
  const cells=new Map(),large=[];
  obstacles.forEach((box,index)=>{
    const minX=Math.floor(box.min.x/cellSize),maxX=Math.floor(box.max.x/cellSize);
    const minZ=Math.floor(box.min.z/cellSize),maxZ=Math.floor(box.max.z/cellSize);
    if((maxX-minX+1)*(maxZ-minZ+1)>4096){large.push(index);return;}
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
      const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(index);
    }
  });
  return {obstacles,cells,large,cellSize,recent:[]};
}

export function queryObstacles(index,x,z,radius=0){
  if(!index)return [];
  const {obstacles,cells,large,cellSize,recent}=index;
  if(obstacles.length<32)return obstacles;
  const x0=Math.floor((x-radius)/cellSize),x1=Math.floor((x+radius)/cellSize);
  const z0=Math.floor((z-radius)/cellSize),z1=Math.floor((z+radius)/cellSize);
  // One immutable index per loaded chunk. The four wheels and chassis query
  // the same few cell ranges several hundred times before crossing a boundary.
  for(const previous of recent){
    if(previous.x0===x0&&previous.x1===x1&&previous.z0===z0&&previous.z1===z1)return previous.result;
  }
  const found=new Set(large);
  for(let cx=x0;cx<=x1;cx++)
    for(let cz=z0;cz<=z1;cz++)
      for(const id of cells.get(cx+','+cz)||[])found.add(id);
  const result=[...found].sort((a,b)=>a-b).map(i=>obstacles[i]);
  if(recent.length===8)recent.shift();
  recent.push({x0,x1,z0,z1,result});
  return result;
}
