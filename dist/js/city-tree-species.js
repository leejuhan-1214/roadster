import * as THREE from 'three';
import {TREE_HEIGHTS,speciesAt} from './city-tree-mix.js?v=20261111-species1';

// Street and park trees by species. Each species is grown from its own
// branching rules and every variant from its own seed, so trunks fork, lean
// and fill out differently; foliage is made of leaf sprays cut to the species'
// leaf shape. These are generated models of the species, not surveys of
// individual trees. The scanned Poly Haven tree remains one of the kinds.
// A grove switches detail by the distance to its centre: with 96 m groves a
// tree within 80 m of the camera is always drawn at full detail.
export const SPECIES_LOD_DISTANCES=[0,150,300,620];
export const SPECIES_TILE_SIZE=96;
export const TREE_VARIANTS=5;
const DENSE_GROVE=22;
export const TREE_SEASONS=['summer','autumn'];

const V=(x=0,y=0,z=0)=>[x,y,z];
const add=(a,b,s=1)=>[a[0]+b[0]*s,a[1]+b[1]*s,a[2]+b[2]*s];
const len=a=>Math.hypot(a[0],a[1],a[2]);
const norm=a=>{const l=len(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mix=(a,b,t)=>a+(b-a)*t;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const perpendicular=d=>norm(Math.abs(d[1])<.92?cross(d,[0,1,0]):cross(d,[1,0,0]));
const rotateAbout=(v,axis,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),k=dot(axis,v)*(1-c),w=cross(axis,v);return [v[0]*c+w[0]*s+axis[0]*k,v[1]*c+w[1]*s+axis[1]*k,v[2]*c+w[2]*s+axis[2]*k];};
function mulberry(seed){let a=seed|0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const hashText=text=>{let n=2166136261;for(const ch of String(text))n=Math.imul(n^ch.charCodeAt(0),16777619);return n>>>0;};

// Atlas cells are quarters of the texture: [column, row from the top].
const CELL={ginkgo:[[0,0],[0,3]],plane:[[1,0],[1,3]],zelkova:[[2,0],[2,3]],cherry:[[3,0],[3,3]],metasequoia:[[0,1]],pine:[[1,1]],clump:[[2,1]],furrow:[[0,2]],mottle:[[1,2]],lenticel:[[2,2]],plate:[[3,2]]};
const cellUV=([cx,cy],inset=.004)=>({u0:cx/4+inset,u1:(cx+1)/4-inset,v0:1-(cy+1)/4+inset,v1:1-cy/4-inset});

// Growth habit per species. Lengths are fractions of the model height (10 m).
// angle = tilt of a child away from its parent, at the base and tip of the parent.
export const TREE_SPECIES=Object.freeze({
  ginkgo:{label:'은행나무',latin:'Ginkgo biloba',habit:'excurrent',bole:.26,girth:.024,taper:.86,children:[17,4,2],angle:[[1.15,.62],[.75,.6],[.7,.6]],ratio:[.34,.5,.5],shape:t=>.5+.62*Math.sin(Math.PI*clamp(.16+t*.9,0,1))-.3*t,
    tropism:[.0,.07,.05],wander:[.035,.11,.16],leafStep:.4,leafSize:1.15,spray:1,bark:'furrow',barkColor:[.5,.46,.4],leaf:{summer:[.96,1,.9],autumn:[1,1,.94]},crown:[.2,.36]},
  plane:{label:'양버즘나무',latin:'Platanus × hispanica',habit:'decurrent',bole:.31,girth:.038,taper:.3,children:[5,4,3],angle:[[.62,.5],[.85,.7],[.85,.7]],ratio:[.6,.56,.5],shape:()=>1,
    tropism:[.0,.035,.0],wander:[.03,.13,.2],leafStep:.5,leafSize:1.4,spray:1,bark:'mottle',barkColor:[.93,.92,.86],leaf:{summer:[1,1,1],autumn:[1,.98,.94]},crown:[.36,.4]},
  zelkova:{label:'느티나무',latin:'Zelkova serrata',habit:'decurrent',bole:.24,girth:.031,taper:.22,children:[7,5,3],angle:[[.5,.36],[.62,.5],[.8,.6]],ratio:[.7,.5,.45],shape:()=>1,
    tropism:[.0,.02,-.015],wander:[.03,.1,.19],leafStep:.38,leafSize:1.05,spray:1,bark:'furrow',barkColor:[.55,.53,.5],leaf:{summer:[.94,1,.92],autumn:[1,.96,.9]},crown:[.44,.42]},
  cherry:{label:'왕벚나무',latin:'Prunus × yedoensis',habit:'decurrent',bole:.27,girth:.036,taper:.2,children:[6,4,3],angle:[[.9,.72],[.85,.7],[.9,.7]],ratio:[.5,.55,.5],shape:()=>1,
    tropism:[.0,.0,-.05],wander:[.05,.14,.22],leafStep:.4,leafSize:1.1,spray:1,bark:'lenticel',barkColor:[.42,.33,.3],leaf:{summer:[1,1,1],autumn:[1,.95,.9]},crown:[.58,.38]},
  metasequoia:{label:'메타세쿼이아',latin:'Metasequoia glyptostroboides',habit:'excurrent',bole:.2,girth:.03,taper:.92,children:[34,3,0],angle:[[1.42,1.05],[.8,.7],[.7,.6]],ratio:[.24,.45,.4],shape:t=>1.05-.95*t**.85,
    tropism:[.0,.03,.0],wander:[.012,.06,.1],leafStep:.36,leafSize:1.2,spray:1,bark:'furrow',barkColor:[.6,.4,.3],leaf:{summer:[1,1,1],autumn:[1,.94,.88]},crown:[.15,.4]},
  pine:{label:'소나무',latin:'Pinus densiflora',habit:'pine',bole:.5,girth:.03,taper:.7,children:[10,4,2],angle:[[1.3,.9],[.9,.7],[.8,.6]],ratio:[.29,.52,.5],shape:t=>.75+.5*t,
    tropism:[.0,.05,.09],wander:[.09,.14,.2],leafStep:.42,leafSize:1.15,spray:0,bark:'plate',barkColor:[.72,.46,.36],leaf:{summer:[1,1,1],autumn:[1,1,1]},crown:[.36,.3]},
  small:{label:'소형 활엽수',latin:'Poly Haven Tree Small 02',asset:true,bark:'furrow',barkColor:[.5,.46,.4],leaf:{summer:[1,1,1],autumn:[1,.96,.9]},crown:[.4,.4]},
});
const MODEL_HEIGHT=10;

// ---------------------------------------------------------------------------
// Skeleton: the same seed always grows the same tree.
function growSkeleton(speciesId,seed){
  const spec=TREE_SPECIES[speciesId],rng=mulberry(hashText(speciesId)+seed*7919),H=MODEL_HEIGHT;
  const vary=(base,amount)=>base*(1+(rng()-.5)*2*amount);
  const branches=[],leaves=[],maxLevel=spec.children.findLastIndex(n=>n>0)+1;
  const boleHeight=H*vary(spec.bole,.14),girth=H*vary(spec.girth,.12);
  const lean=[(rng()-.5)*(spec.habit==='pine'?.34:.07),1,(rng()-.5)*(spec.habit==='pine'?.34:.07)];
  const grow=(origin,direction,length,radius,level,azimuthSeed)=>{
    const steps=level===0?(spec.habit==='pine'?9:7):Math.max(2,Math.round(length/(level===1?.85:.6)));
    const points=[{p:origin,r:radius,d:direction}];let p=origin,d=direction;
    const taper=level===0?spec.taper:.9,sway=spec.wander[Math.min(level,2)],lift=spec.tropism[Math.min(level,2)];
    for(let i=1;i<=steps;i++){
      d=norm([d[0]+(rng()-.5)*2*sway,d[1]+(rng()-.5)*sway+lift,d[2]+(rng()-.5)*2*sway]);
      p=add(p,d,length/steps);
      points.push({p,r:Math.max(.008,radius*(1-i/steps*taper)),d});
    }
    branches.push({points,level,length});
    const at=t=>{
      const f=clamp(t,0,1)*steps,i=Math.min(steps-1,Math.floor(f)),u=f-i,a=points[i],b=points[i+1];
      return {p:[mix(a.p[0],b.p[0],u),mix(a.p[1],b.p[1],u),mix(a.p[2],b.p[2],u)],r:mix(a.r,b.r,u),d:b.d};
    };
    if(level<maxLevel){
      const count=Math.max(1,Math.round(vary(spec.children[level],level===0?.12:.3)));
      // Limbs of a spreading tree leave the trunk together near its top; a
      // conifer or ginkgo carries whorls all the way up a single leader.
      const first=level===0?(spec.habit==='decurrent'?.74:spec.habit==='pine'?.56:spec.bole*1.02):.24;
      let azimuth=azimuthSeed;
      for(let k=0;k<count;k++){
        const t=level===0&&spec.habit==='decurrent'?first+(1-first)*(k+.5)/count:first+(1-first)*(k+rng()*.9)/count,node=at(t);
        azimuth+=2.39996+(rng()-.5)*.7;
        const range=spec.angle[Math.min(level,2)],tilt=mix(range[0],range[1],(t-first)/(1-first||1))+(rng()-.5)*.22;
        const side=rotateAbout(perpendicular(node.d),node.d,azimuth),childDirection=norm(add([node.d[0]*Math.cos(tilt),node.d[1]*Math.cos(tilt),node.d[2]*Math.cos(tilt)],side,Math.sin(tilt)));
        const scale=level===0?spec.shape((t-first)/(1-first||1)):1-.35*t;
        const childLength=(level===0?H:length)*spec.ratio[Math.min(level,2)]*scale*vary(1,.2);
        if(childLength<.25)continue;
        grow(node.p,childDirection,childLength,Math.max(.012,node.r*(level===0?(spec.habit==='decurrent'?.62:.36):.55)),level+1,azimuth*1.7);
      }
      // A spreading tree keeps a short central limb so the crown has no hole.
      if(level===0&&spec.habit==='decurrent'){const top=at(1);grow(top.p,norm([top.d[0]+(rng()-.5)*.3,1,top.d[2]+(rng()-.5)*.3]),H*spec.ratio[0]*.8*vary(1,.15),top.r*.7,1,azimuth);}
    }
    // Foliage: sprays along the outer wood, denser toward the tips.
    if(level>=1&&level>=maxLevel-2){
      const from=level===maxLevel?.1:level===maxLevel-1?.4:.72;
      for(let t=from;t<=1;t+=spec.leafStep*.62/Math.max(.4,length)){
        const node=at(t),roll=rng()*Math.PI*2;
        // Sprays leave the twig in pairs to either side, as leaves do on the shoot.
        for(const turn of [0,Math.PI*(.75+rng()*.5)]){
          const out=norm(add(node.d,rotateAbout(perpendicular(node.d),node.d,roll+turn),.75+rng()*.5));
          leaves.push({p:node.p,d:spec.spray?out:norm(add(node.d,out,.35)),size:vary(spec.leafSize,.22),roll:roll+turn,tip:t>.86,order:rng()});
        }
      }
      const tip=at(1);leaves.push({p:tip.p,d:tip.d,size:vary(spec.leafSize,.15)*1.1,roll:rng()*6.28,tip:true,order:0});
    }
  };
  if(spec.habit==='decurrent')grow(V(),norm(lean),boleHeight*1.18,girth,0,rng()*6.28);
  else grow(V(),norm(lean),H*vary(.97,.03),girth,0,rng()*6.28);
  let top=0,reach=0,low=H;
  for(const leaf of leaves){top=Math.max(top,leaf.p[1]+leaf.size*.5);reach=Math.max(reach,Math.hypot(leaf.p[0],leaf.p[2])+leaf.size*.5);low=Math.min(low,leaf.p[1]);}
  for(const b of branches)for(const pt of b.points)top=Math.max(top,pt.p[1]);
  return {speciesId,spec,branches,leaves,height:top,reach,crownBase:low,crownCentre:[0,(low+top)/2,0]};
}

function meshAccumulator(){return {position:[],normal:[],uv:[],color:[],sway:[],index:[]};}
function addTube(out,branch,radial,uvCell,color,ringStep,H){
  const rings=[];for(let i=0;i<branch.points.length;i+=ringStep)rings.push(branch.points[i]);
  if(rings.at(-1)!==branch.points.at(-1))rings.push(branch.points.at(-1));
  const base=out.position.length/3;let side=perpendicular(rings[0].d);
  rings.forEach((ring,k)=>{
    side=norm(cross(cross(ring.d,side),ring.d));const other=cross(ring.d,side);
    const flex=clamp(ring.p[1]/H,0,1)**2*(branch.level?1:.35),shade=.72+.28*clamp(ring.p[1]/H*1.4,0,1);
    for(let j=0;j<=radial;j++){
      const a=j/radial*Math.PI*2,n=[side[0]*Math.cos(a)+other[0]*Math.sin(a),side[1]*Math.cos(a)+other[1]*Math.sin(a),side[2]*Math.cos(a)+other[2]*Math.sin(a)];
      out.position.push(ring.p[0]+n[0]*ring.r,ring.p[1]+n[1]*ring.r,ring.p[2]+n[2]*ring.r);out.normal.push(n[0],n[1],n[2]);
      out.uv.push(mix(uvCell.u0,uvCell.u1,j/radial),k%2?uvCell.v1:uvCell.v0);out.color.push(color[0]*shade,color[1]*shade,color[2]*shade);out.sway.push(flex*.5);
    }
  });
  for(let k=0;k+1<rings.length;k++)for(let j=0;j<radial;j++){
    const a=base+k*(radial+1)+j,b=a+radial+1;out.index.push(a,b,a+1,a+1,b,b+1);
  }
}
function addLeafCard(out,leaf,scale,uvCell,tint,tree){
  const d=leaf.d,size=leaf.size*scale;
  let side=rotateAbout(perpendicular(d),d,leaf.roll);
  // Leaves turn their faces up to the light: keep the blade from standing on edge.
  let face=cross(side,d);if(face[1]<0){side=[-side[0],-side[1],-side[2]];face=cross(side,d);}
  const half=size*.5,base=add(leaf.p,d,-size*.12),tip=add(base,d,size);
  const corners=[add(base,side,-half),add(base,side,half),add(tip,side,half),add(tip,side,-half)];
  const index=out.position.length/3,radial=norm([leaf.p[0]-tree.crownCentre[0],(leaf.p[1]-tree.crownCentre[1])*.8+.3,leaf.p[2]-tree.crownCentre[2]]);
  const n=norm([face[0]*.4+radial[0],face[1]*.4+radial[1]+.35,face[2]*.4+radial[2]]);
  // Leaves deep in the crown receive less sky.
  const depth=clamp(Math.hypot(leaf.p[0],leaf.p[2])/Math.max(.5,tree.reach)*.75+clamp((leaf.p[1]-tree.crownBase)/Math.max(1,tree.height-tree.crownBase),0,1)*.45,0,1),light=(.56+.5*depth)*(.9+leaf.order*.18);
  const flex=clamp(leaf.p[1]/tree.height,0,1)**1.5;
  corners.forEach((c,i)=>{
    out.position.push(c[0],c[1],c[2]);out.normal.push(n[0],n[1],n[2]);
    out.uv.push(i===0||i===3?uvCell.u0:uvCell.u1,i<2?uvCell.v0:uvCell.v1);
    out.color.push(tint[0]*light,tint[1]*light,tint[2]*light);out.sway.push(flex*(i<2?.55:1));
  });
  out.index.push(index,index+1,index+2,index,index+2,index+3);
}
function toGeometry(out){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(out.position,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(out.normal,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(out.uv,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(out.color,3));
  geometry.setAttribute('sway',new THREE.Float32BufferAttribute(out.sway,1));geometry.setIndex(out.index);
  geometry.computeBoundingSphere();geometry.computeBoundingBox();return geometry;
}

/**
 * One tree of a species: near and middle-distance geometry from one skeleton.
 * Deterministic for (species, seed). Units are metres at a 10 m model height.
 */
export function generateTree(speciesId,seed=0){
  const spec=TREE_SPECIES[speciesId];if(!spec||spec.asset)throw new RangeError('No growth rules for tree species '+speciesId);
  const tree=growSkeleton(speciesId,seed),rng=mulberry(hashText(speciesId+'mesh')+seed*31),bark=cellUV(CELL[spec.bark][0]),leafCells=CELL[speciesId].map(c=>cellUV(c));
  const levels=[0,1].map(lod=>{
    const out=meshAccumulator();
    for(const branch of tree.branches){
      if(lod===1&&branch.level>=2)continue;
      const radial=lod===0?[9,6,4,3][Math.min(branch.level,3)]:[5,3,3,3][Math.min(branch.level,3)];
      addTube(out,branch,radial,bark,spec.barkColor,lod===0?1:2,tree.height);
    }
    const barkTriangles=out.index.length/3;let cards=0;
    for(const leaf of tree.leaves){
      // The middle distance keeps about one spray in six, enlarged to hold the crown's outline.
      if(lod===1&&!(leaf.order<.15||leaf.tip&&leaf.order<.3))continue;
      const tone=.9+rng()*.2;
      addLeafCard(out,leaf,lod===0?1:2.3,leafCells[Math.floor(rng()*leafCells.length)],[tone,tone*(.96+rng()*.08),tone*.96],tree);cards++;
    }
    const geometry=toGeometry(out);geometry.userData={leafCards:cards,barkTriangles,triangles:out.index.length/3};
    return geometry;
  });
  return {species:speciesId,seed,height:tree.height,reach:tree.reach,crownBase:tree.crownBase,branchCount:tree.branches.length,leafCount:tree.leaves.length,levels};
}

// Far trees share one small crown; the instance colour and proportions carry the species.
function farTreeGeometry(){
  const out=meshAccumulator(),rng=mulberry(77),cell=cellUV(CELL.clump[0]),bark=cellUV(CELL.furrow[0]);
  addTube(out,{level:0,points:[{p:V(),r:.16,d:[0,1,0]},{p:V(0,4.2,0),r:.1,d:[0,1,0]}]},3,bark,[.45,.4,.36],1,10);
  const tree={crownCentre:[0,6.4,0],reach:3.4,height:10,crownBase:3.2};
  for(let i=0;i<11;i++){
    const a=i*2.39996,h=3.4+rng()*5.4,r=(1-Math.abs(h-6.2)/4.2)*2.4*(.5+rng()*.6);
    addLeafCard(out,{p:[Math.cos(a)*r,h,Math.sin(a)*r],d:norm([Math.cos(a)*.5,.75,Math.sin(a)*.5]),size:3.3+rng()*1.2,roll:rng()*6.28,order:rng(),tip:false},1,cell,[1,1,1],tree);
  }
  return toGeometry(out);
}
// Average foliage colour of each species, for the shared far crown.
const FAR_TINT={summer:{ginkgo:[.6,.76,.3],plane:[.4,.6,.26],zelkova:[.3,.52,.22],cherry:[.34,.58,.26],metasequoia:[.42,.62,.3],pine:[.2,.38,.24],small:[.36,.56,.24]},
  autumn:{ginkgo:[.95,.8,.22],plane:[.74,.6,.26],zelkova:[.8,.46,.18],cherry:[.82,.34,.2],metasequoia:[.72,.42,.16],pine:[.2,.38,.24],small:[.7,.58,.24]}};
const FAR_SHAPE={ginkgo:[.78,1],plane:[1.12,1],zelkova:[1.3,1],cherry:[1.5,1],metasequoia:[.56,1],pine:[.95,1],small:[1.15,1]};

// ---------------------------------------------------------------------------
// Leaf and bark atlas, drawn once per season.
const PALETTE={summer:{ginkgo:['#93b83a','#a8c94c','#7fa62f'],plane:['#5d8f2c','#6fa135','#4c7c26'],zelkova:['#47792a','#568a30','#3a6924'],cherry:['#4f8a34','#5f9a3c','#42762c'],metasequoia:['#6c9a3a','#7dab45','#5c8a32'],pine:['#2c5a37','#35683f','#244b2f'],clump:['#c9d6b0','#b8c79c','#dbe6c6']},
  autumn:{ginkgo:['#f0cc34','#f7de52','#e3b526'],plane:['#c9a043','#b1843a','#8f9a3a'],zelkova:['#d07a2a','#c25a26','#e09a33'],cherry:['#cf4a2c','#e07a2f','#b83a2a'],metasequoia:['#b9651f','#cc7d2c','#a25218'],pine:['#2c5a37','#35683f','#244b2f'],clump:['#c9d6b0','#b8c79c','#dbe6c6']}};
const LEAF_SHAPES={
  ginkgo(ctx,l){ // fan with a central notch on a long petiole
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-l*.34);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-l*.32);ctx.quadraticCurveTo(-l*.62,-l*.56,-l*.5,-l*.98);ctx.quadraticCurveTo(-l*.2,-l*1.08,-l*.03,-l*.94);ctx.lineTo(0,-l*.74);ctx.lineTo(l*.03,-l*.94);ctx.quadraticCurveTo(l*.2,-l*1.08,l*.5,-l*.98);ctx.quadraticCurveTo(l*.62,-l*.56,0,-l*.32);ctx.fill();
  },
  plane(ctx,l){ // five pointed lobes
    const pts=[[0,-.12],[-.2,-.3],[-.62,-.3],[-.4,-.52],[-.56,-.86],[-.24,-.74],[0,-1.05],[.24,-.74],[.56,-.86],[.4,-.52],[.62,-.3],[.2,-.3]];
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-l*.14);ctx.stroke();ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x*l,y*l):ctx.moveTo(x*l,y*l));ctx.closePath();ctx.fill();
  },
  zelkova(ctx,l){ // narrow oval with a saw-toothed margin
    ctx.beginPath();ctx.moveTo(0,0);const teeth=9;
    for(let i=1;i<=teeth;i++){const t=i/teeth,w=Math.sin(Math.PI*t**.8)*l*.22;ctx.lineTo(-w*.82,-l*(t-.06));ctx.lineTo(-w,-l*t);}
    for(let i=teeth-1;i>=0;i--){const t=i/teeth,w=Math.sin(Math.PI*t**.8)*l*.22;ctx.lineTo(w,-l*t);ctx.lineTo(w*.82,-l*(t+.05));}
    ctx.closePath();ctx.fill();
  },
  cherry(ctx,l){ // broad ellipse drawn out to a tip
    ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-l*.38,-l*.2,-l*.34,-l*.72,0,-l);ctx.bezierCurveTo(l*.34,-l*.72,l*.38,-l*.2,0,0);ctx.fill();
  },
};
// One atlas cell: a branchlet with side shoots, each carrying its leaves in
// two ranks. The denser the branchlet, the fuller a crown reads from the street.
function drawShoot(ctx,species,colors,rng,length,leafLength,count){
  ctx.strokeStyle='#5c4a34';ctx.lineWidth=Math.max(1,length*.018);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-length);ctx.stroke();
  for(let i=0;i<count;i++){
    const t=(i+.8)/count,side=i%2?1:-1,last=i===count-1;
    ctx.save();ctx.translate(0,-length*t);ctx.rotate(last?(rng()-.5)*.4:side*(.8+rng()*.45));
    ctx.fillStyle=colors[Math.floor(rng()*colors.length)];ctx.strokeStyle='#6a5a36';ctx.lineWidth=Math.max(.6,leafLength*.03);
    const l=leafLength*(.78+rng()*.4);LEAF_SHAPES[species](ctx,l);
    // Midrib, a shade darker than the blade.
    ctx.strokeStyle='rgba(40,50,20,.3)';ctx.lineWidth=Math.max(.5,leafLength*.025);ctx.beginPath();ctx.moveTo(0,-l*.14);ctx.lineTo(0,-l*.82);ctx.stroke();
    ctx.restore();
  }
}
function drawSpray(ctx,species,colors,rng,size){
  const stem=size*.92;ctx.lineCap='round';
  ctx.strokeStyle=species==='pine'?'#5a4636':'#5c4a34';ctx.lineWidth=size*.016;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(size*.03,-stem*.5,0,-stem*.9);ctx.stroke();
  if(species==='clump'){
    // Neutral foliage mass for distant crowns; the instance colour supplies the species.
    for(let i=0;i<120;i++){
      const y=-size*(.06+rng()*.88),x=(rng()-.5)*size*.92*Math.sin(Math.PI*clamp(-y/size,.05,.95))**.7;
      ctx.fillStyle=colors[Math.floor(rng()*colors.length)];ctx.beginPath();ctx.ellipse(x,y,size*(.05+rng()*.06),size*(.035+rng()*.045),rng()*3,0,6.3);ctx.fill();
    }
    return;
  }
  if(species==='pine'){
    // Needle tufts at the ends of short side shoots.
    for(let i=0;i<9;i++){
      const t=.22+.78*i/8,side=i===8?0:(i%2?1:-1),reach=size*(.3-.16*t)*side,y=-stem*t,x=reach;
      ctx.strokeStyle='#5a4636';ctx.lineWidth=size*.01;ctx.beginPath();ctx.moveTo(0,y+size*.06);ctx.lineTo(x,y);ctx.stroke();
      for(let n=0;n<52;n++){const a=-Math.PI/2+(rng()-.5)*2.9,l=size*(.13+rng()*.1);ctx.strokeStyle=colors[Math.floor(rng()*colors.length)];ctx.lineWidth=size*.0075;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);ctx.stroke();}
    }
    return;
  }
  if(species==='metasequoia'){
    // Flat feathery shoots: a rachis with paired linear leaflets.
    for(let k=0;k<9;k++){
      const t=.16+.8*k/8,side=k===8?0:(k%2?1:-1),angle=side*(.85+rng()*.3),length=size*(.4-.2*t);
      ctx.save();ctx.translate(0,-stem*t);ctx.rotate(angle);ctx.strokeStyle='#6a5236';ctx.lineWidth=size*.008;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-length);ctx.stroke();
      for(let n=1;n<17;n++){const u=n/17,w=size*.07*Math.sin(Math.PI*(.1+.85*u));ctx.strokeStyle=colors[Math.floor(rng()*colors.length)];ctx.lineWidth=size*.012;ctx.beginPath();ctx.moveTo(-w,-length*u-w*.3);ctx.lineTo(0,-length*u);ctx.lineTo(w,-length*u-w*.3);ctx.stroke();}
      ctx.restore();
    }
    return;
  }
  // Broadleaves: leaves on the leader and on side shoots to both sides.
  const big=species==='plane',shoots=big?5:7,leafLength=size*(big?.2:species==='ginkgo'?.135:.14),perShoot=big?3:5;
  for(let k=0;k<shoots;k++){
    const t=.14+.62*k/(shoots-1),side=k%2?1:-1,length=size*(.42-.2*t)*(.85+rng()*.3);
    ctx.save();ctx.translate(0,-stem*t);ctx.rotate(side*(.72+rng()*.35));drawShoot(ctx,species,colors,rng,length,leafLength,perShoot);ctx.restore();
  }
  ctx.save();ctx.translate(0,-stem*.58);drawShoot(ctx,species,colors,rng,stem*.36,leafLength,big?4:6);ctx.restore();
}
function drawBark(ctx,kind,rng,size){
  const wrap=draw=>{for(const dx of [-size,0,size]){ctx.save();ctx.translate(dx,0);draw();ctx.restore();}};
  if(kind==='mottle'){
    // London plane sheds bark in plates, leaving cream, olive and grey patches.
    ctx.fillStyle='#cfcab4';ctx.fillRect(0,0,size,size);
    for(let i=0;i<46;i++){const x=rng()*size,y=rng()*size,w=14+rng()*40,h=20+rng()*60,color=['#e9e4cf','#a8a47f','#8d8a72','#d8d2b8','#b9b596'][Math.floor(rng()*5)],turn=rng()*3;wrap(()=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,w,h,turn,0,6.3);ctx.fill();});}
    return;
  }
  const base=kind==='lenticel'?'#a89c98':kind==='plate'?'#c9b8ad':'#b9b2a6';ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  if(kind==='lenticel'){
    for(let i=0;i<120;i++){const x=rng()*size,y=rng()*size,w=10+rng()*34;wrap(()=>{ctx.strokeStyle=rng()<.5?'#d8cfc8':'#6f625e';ctx.lineWidth=1.5+rng()*2.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+(rng()-.5)*3);ctx.stroke();});}
    return;
  }
  const count=kind==='plate'?22:60;
  for(let i=0;i<count;i++){
    const x=rng()*size,width=kind==='plate'?5+rng()*5:2+rng()*5,shade=kind==='plate'?'#4d3a33':rng()<.6?'#6d665c':'#8d867a';
    const path=[];let px=x;for(let y=-8;y<=size+8;y+=16){px+=(rng()-.5)*(kind==='plate'?26:9);path.push([px,y]);}
    wrap(()=>{ctx.strokeStyle=shade;ctx.lineWidth=width;ctx.beginPath();path.forEach(([qx,qy],k)=>k?ctx.lineTo(qx,qy):ctx.moveTo(qx,qy));ctx.stroke();});
  }
  if(kind==='plate')for(let i=0;i<30;i++){const y=rng()*size,x=rng()*size,w=20+rng()*50;wrap(()=>{ctx.strokeStyle='#58423a';ctx.lineWidth=3+rng()*3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y+(rng()-.5)*8);ctx.stroke();});}
}
export function createTreeAtlas(season='summer',size=1024){
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),cell=size/4,colors=PALETTE[season]||PALETTE.summer;
  for(const [name,cells]of Object.entries(CELL))cells.forEach(([cx,cy],variant)=>{
    const rng=mulberry(hashText(name)+variant*101);
    ctx.save();ctx.beginPath();ctx.rect(cx*cell,cy*cell,cell,cell);ctx.clip();
    if(colors[name]){ctx.translate(cx*cell+cell/2,cy*cell+cell*.985);drawSpray(ctx,name,colors[name],rng,cell);}
    else{ctx.translate(cx*cell,cy*cell);drawBark(ctx,name,rng,cell);}
    ctx.restore();
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.name='tree leaf and bark atlas · '+season;
  return texture;
}

/**
 * Shared tree resources: one atlas material, lazily grown variants, the far
 * crown and the optional scanned Poly Haven tree used as the 'small' species.
 */
export function createTreeLibrary({asset=null,season='summer',wind=null}={}){
  // The scanned tree's wind clock is shared, so every tree answers the same breeze and pauses with the simulation.
  wind??={time:{value:0},strength:{value:1},direction:{value:new THREE.Vector2(1,.4).normalize()}};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0,envMapIntensity:.45,side:THREE.DoubleSide,alphaTest:.3,alphaToCoverage:true});
  material.name='generated tree bark and leaves';
  // Leaves and thin wood lean with the breeze and flutter; trunks stay put.
  const sway=target=>{
    target.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{uTreeTime:wind.time,uTreeStrength:wind.strength,uTreeDirection:wind.direction});
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float sway;\nuniform float uTreeTime;\nuniform float uTreeStrength;\nuniform vec2 uTreeDirection;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\n#ifdef USE_INSTANCING\nvec3 treeAt=(instanceMatrix*vec4(transformed,1.0)).xyz;\n#else\nvec3 treeAt=transformed;\n#endif\nfloat gust=uTreeTime*1.25+treeAt.x*.31+treeAt.z*.23;\nfloat lean=sway*uTreeStrength;\ntransformed.x+=lean*(uTreeDirection.x*(.035+sin(gust)*.05)+sin(gust*2.7+treeAt.y*1.3)*.02);\ntransformed.z+=lean*(uTreeDirection.y*(.035+cos(gust*.9)*.045)+sin(gust*3.1+treeAt.x)*.018);\ntransformed.y+=lean*sin(gust*2.2+treeAt.z)*.012;');
    };
    target.customProgramCacheKey=()=>'roadster-species-wind-1';return target;
  };
  sway(material);
  let atlas=createTreeAtlas(season);if(atlas){material.map=atlas;}
  // The shadow silhouette uses the same leaf cut-outs and the same movement.
  const depthMaterial=sway(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:atlas,alphaTest:.3,side:THREE.DoubleSide}));
  const variants=new Map(),farCrowns=new Set();let far=null,currentSeason=season;
  const library={
    material,depthMaterial,wind,asset,farCrowns,get season(){return currentSeason;},get atlas(){return atlas;},
    hasSpecies:id=>!!TREE_SPECIES[id]&&(!TREE_SPECIES[id].asset||!!asset),
    resolve:id=>TREE_SPECIES[id]&&(!TREE_SPECIES[id].asset||asset)?id:'cherry',
    /** levels[lod] = [{geometry, material}], plus the height the instance is scaled from. */
    variant(speciesId,index=0){
      const id=library.resolve(speciesId),key=id+':'+(TREE_SPECIES[id].asset?0:index);
      let variant=variants.get(key);
      if(!variant){
        if(TREE_SPECIES[id].asset)variant={species:id,index:0,height:asset.height,levels:asset.levels,scanned:true};
        else{const tree=generateTree(id,index);variant={species:id,index,height:tree.height,reach:tree.reach,leafCount:tree.leafCount,levels:tree.levels.map(geometry=>[{geometry,material,depthMaterial}])};}
        variants.set(key,variant);
      }
      return variant;
    },
    get farGeometry(){return far??=farTreeGeometry();},
    /** Grow every variant now (about 0.2 s) so that none is grown while driving. */
    warm(){for(const id of Object.keys(TREE_SPECIES))for(let index=0;index<(TREE_SPECIES[id].asset?1:TREE_VARIANTS);index++)library.variant(id,index);return library.farGeometry&&library;},
    farTint:id=>(FAR_TINT[currentSeason]||FAR_TINT.summer)[library.resolve(id)]||FAR_TINT.summer.small,
    setSeason(next){
      if(!TREE_SEASONS.includes(next)||next===currentSeason)return false;
      currentSeason=next;const replacement=createTreeAtlas(next);
      if(replacement){atlas?.dispose();atlas=replacement;material.map=atlas;depthMaterial.map=atlas;material.needsUpdate=true;depthMaterial.needsUpdate=true;}
      // Distant crowns carry their species colour per instance.
      const color=new THREE.Color();
      for(const mesh of farCrowns){mesh.userData.items.forEach((p,i)=>{const tint=library.farTint(p.species),light=.86+((p.seed*17.3)%1)*.24;mesh.setColorAt(i,color.setRGB(tint[0]*light,tint[1]*light,tint[2]*light));});if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
      return true;
    },
    update(time){wind.time.value=time;},
    get variantCount(){return variants.size;},
    dispose(){
      for(const variant of variants.values())if(!variant.scanned)for(const level of variant.levels)for(const part of level)part.geometry.dispose();
      variants.clear();farCrowns.clear();far?.dispose();far=null;atlas?.dispose();material.dispose();depthMaterial.dispose();
    },
  };
  return library;
}

const tintOf=(seed,season)=>{const light=.84+((seed*17.3)%1)*.26,warm=((seed*29.7)%1)-.5;return [light*(1+warm*.1),light,light*(1-warm*(season==='autumn'?.16:.1))];};

// Share geometry/textures inside local tiles, rather than one map-wide bound.
// THREE.LOD updates from the camera, so distant groves stop submitting leaves.
// Each placement {x,z,rotation,species,seed} takes a height from its species' range.
export function createSpeciesGroves(library,placements,{tileSize=SPECIES_TILE_SIZE}={}){
  const root=new THREE.Group();root.name='street and park trees by species';
  if(!library||!placements.length)return root;
  const season=library.season;
  placements=placements.map(p=>{
    const seed=p.seed??Math.abs((Math.sin(p.x*12.9898+p.z*78.233)*43758.5453)%1),species=library.resolve(p.species||speciesAt(p.x,p.z)),range=TREE_HEIGHTS[species];
    return {...p,seed,species,height:range[0]+(range[1]-range[0])*((seed*7.31)%1)};
  });
  const tiles=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),tilt=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),axis=new THREE.Vector3(),position=new THREE.Vector3(),scale=new THREE.Vector3(),color=new THREE.Color();
  for(const p of placements){const key=Math.floor(p.x/tileSize)+','+Math.floor(p.z/tileSize);if(!tiles.has(key))tiles.set(key,[]);tiles.get(key).push(p);}
  let instanced=0;
  for(const [key,items]of tiles){
    const [tx,tz]=key.split(',').map(Number),cx=(tx+.5)*tileSize,cz=(tz+.5)*tileSize,lod=new THREE.LOD();
    lod.name='tree grove '+key;lod.position.set(cx,0,cz);
    // Two variants of each species alternate inside a grove; neighbouring groves draw other pairs.
    const groups=new Map(),pair=hashText(key);
    for(const p of items){
      const seed=p.seed,species=p.species;
      const index=TREE_SPECIES[species]?.asset?0:(pair+hashText(species)+(seed<.5?0:1+(pair>>3)%(TREE_VARIANTS-1)))%TREE_VARIANTS;
      const variant=library.variant(species,index),id=variant.species+':'+variant.index;
      if(!groups.has(id))groups.set(id,{variant,items:[]});groups.get(id).items.push({p,seed});
    }
    const compose=(p,seed,variant,wide)=>{
      const s=p.height/variant.height,spread=variant.scanned?1:.9+((seed*11.3)%1)*.22;
      position.set(p.x-cx,.006,p.z-cz);q.setFromAxisAngle(up,p.rotation||0);
      if(!variant.scanned){const a=seed*43.1;axis.set(Math.cos(a),0,Math.sin(a));tilt.setFromAxisAngle(axis,((seed*5.7)%1)*.055);q.premultiply(tilt);}
      scale.set(s*spread*(wide?.[0]||1),s*(wide?.[1]||1),s*spread*(wide?.[0]||1));matrix.compose(position,q,scale);return matrix;
    };
    // In closed woodland single trees are not told apart: such a grove draws the
    // middle-distance mesh up close and small crowns from the middle distance on.
    const dense=items.length>DENSE_GROVE;
    for(const level of dense?[0]:[0,1]){
      const group=new THREE.Group();group.name='tree LOD '+level;
      for(const {variant,items:trees}of groups.values()){
        for(const [index,part]of variant.levels[Math.min(dense?1:level,variant.levels.length-1)].entries()){
          const mesh=new THREE.InstancedMesh(part.geometry,part.material,trees.length);mesh.name='tree LOD '+level+' '+variant.species+' '+variant.index+' part '+index;
          if(part.depthMaterial)mesh.customDepthMaterial=part.depthMaterial;
          trees.forEach(({p,seed},i)=>{mesh.setMatrixAt(i,compose(p,seed,variant));const t=tintOf(seed,season);mesh.setColorAt(i,color.setRGB(t[0],t[1],t[2]));});
          mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();mesh.castShadow=level===0;mesh.receiveShadow=true;group.add(mesh);instanced+=trees.length;
        }
      }
      lod.addLevel(group,SPECIES_LOD_DISTANCES[level],.12);
    }
    // Beyond the middle distance a whole grove is a single draw of small crowns.
    const farGroup=new THREE.Group();farGroup.name='tree LOD 2';
    {
      const mesh=new THREE.InstancedMesh(library.farGeometry,library.material,items.length);mesh.name='tree LOD 2 far crowns';
      items.forEach((p,i)=>{
        const tint=library.farTint(p.species),light=.86+((p.seed*17.3)%1)*.24;
        mesh.setMatrixAt(i,compose(p,p.seed,{height:10,scanned:false},FAR_SHAPE[p.species]));mesh.setColorAt(i,color.setRGB(tint[0]*light,tint[1]*light,tint[2]*light));
      });
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
      // Registered so a season change can recolour it; released with the grove.
      mesh.userData.items=items;library.farCrowns.add(mesh);mesh.addEventListener('dispose',()=>library.farCrowns.delete(mesh));farGroup.add(mesh);
    }
    lod.addLevel(farGroup,SPECIES_LOD_DISTANCES[dense?1:2],.12);
    lod.addLevel(new THREE.Group(),SPECIES_LOD_DISTANCES[3],.12);root.add(lod);
  }
  root.userData.treeCount=placements.length;root.userData.tileCount=tiles.size;root.userData.instances=instanced;
  return root;
}
