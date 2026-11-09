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
  return {obstacles,cells,large,cellSize};
}

export function queryObstacles(index,x,z,radius=0){
  if(!index)return [];
  const {obstacles,cells,large,cellSize}=index;
  if(obstacles.length<32)return obstacles;
  const found=new Set(large);
  for(let cx=Math.floor((x-radius)/cellSize);cx<=Math.floor((x+radius)/cellSize);cx++)
    for(let cz=Math.floor((z-radius)/cellSize);cz<=Math.floor((z+radius)/cellSize);cz++)
      for(const id of cells.get(cx+','+cz)||[])found.add(id);
  return [...found].sort((a,b)=>a-b).map(i=>obstacles[i]);
}
