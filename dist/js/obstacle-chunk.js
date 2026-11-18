import {Vector3} from '../vendor/three.core.js';
import {createObstacleIndex,indexObstacle} from './obstacle-index.js?v=20261118-circuit155';
import {preparePrism} from './city-building-collision.js?v=20261118-study150';

export function prepareObstacle(box,i){
  if(!Array.isArray(box.center)||!Array.isArray(box.size)||box.center.length!==3||box.size.length!==3||
    !box.center.every(Number.isFinite)||!box.size.every(n=>Number.isFinite(n)&&n>0))
    throw new TypeError('Each obstacle needs finite center[3] and positive size[3].');
  const center=new Vector3(...box.center),half=new Vector3(...box.size).multiplyScalar(.5);
  const footprint=box.kind==='prism'||box.footprint?preparePrism(box):null;
  if(footprint){
    let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    for(const [x,z] of footprint){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
    center.x=(x0+x1)/2;center.z=(z0+z1)/2;half.x=(x1-x0)/2;half.z=(z1-z0)/2;
  }
  return {id:box.id??String(i),treeId:box.treeId??null,center,half,footprint,min:center.clone().sub(half),max:center.clone().add(half)};
}

// A work-in-progress index is private to the tile. The simulation publishes
// it atomically only after every footprint and its boundary cells are ready.
export function prepareObstacleChunk(source){
  if(!Array.isArray(source))throw new TypeError('Obstacles must be an array.');
  const obstacles=[],index=createObstacleIndex(obstacles);
  const bounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity};
  return {source,obstacles,index,bounds,get done(){return obstacles.length===source.length;},
    step(limit=64,deadline=Infinity){
      const start=obstacles.length,end=Math.min(source.length,start+limit);
      for(let i=start;i<end;i++){
        const box=prepareObstacle(source[i],i);obstacles.push(box);indexObstacle(index,box,i);
        bounds.minX=Math.min(bounds.minX,box.min.x);bounds.maxX=Math.max(bounds.maxX,box.max.x);
        bounds.minZ=Math.min(bounds.minZ,box.min.z);bounds.maxZ=Math.max(bounds.maxZ,box.max.z);
        if(deadline<Infinity&&((i-start+1)%8===0)&&performance.now()>=deadline)break;
      }
      return obstacles.length===source.length;
    }
  };
}
