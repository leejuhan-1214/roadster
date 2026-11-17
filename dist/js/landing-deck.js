import * as THREE from 'three';

// Flush modular test floor. All visible upper faces share the solver's y=0
// reference. Depth bias resolves the seams and paint without lifting the floor.
export function createLandingDeck(concrete){
  const root=new THREE.Group();
  root.name='landing test deck';
  const faceGeometry=(positions,colors)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    return geometry;
  };
  const batches=[[],[],[]],tints=[[],[],[]];
  function triangle(layer,a,b,c,tint){
    batches[layer].push(a[0],0,a[1],b[0],0,b[1],c[0],0,c[1]);
    const color=new THREE.Color(tint);
    for(let i=0;i<3;i++)tints[layer].push(color.r,color.g,color.b);
  }
  function rectangle(layer,left,near,right,far,color){
    triangle(layer,[left,near],[left,far],[right,far],color);
    triangle(layer,[left,near],[right,far],[right,near],color);
  }
  function fastener(x,z){
    const point=(a,r)=>[x+Math.cos(a)*r,z+Math.sin(a)*r];
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
      // The inner six-sided socket sits inside a brushed metal annulus.
      const holeA=point(Math.floor(i/2)*Math.PI/3,.016);
      const holeB=point(Math.floor((i+1)/2)*Math.PI/3,.016);
      triangle(2,point(a,.040),holeA,point(b,.040),i<6?0xbac4c3:0x84938f);
      if(i%2)triangle(2,point(b,.040),holeA,holeB,0x94a29e);
      if(i%2)triangle(2,[x,z],holeB,holeA,0x34413e);
    }
  }
  rectangle(0,-4,-2.5,4,2.5,0x494f4e);
  const seam=.009;
  for(let x=-4;x<4;x+=2){
    for(let z=-2.5;z<2.5;z+=2.5){
      rectangle(1,x+seam,z+seam,x+2-seam,z+2.5-seam,0xe0e3de);
      for(const dx of [.13,1.87])for(const dz of [.13,2.37])fastener(x+dx,z+dz);
    }
  }
  // Long ticks mark one metre, short ticks half a metre. Leave the contact
  // area clear when looking straight down at the wheels or measuring rebound.
  for(let i=-7;i<=7;i++){
    const x=i*.5,length=i%2?.09:.20;
    for(const side of [-1,1]){
      const end=side*2.40,tip=end-side*length;
      rectangle(2,x-.014,Math.min(end,tip),x+.014,Math.max(end,tip),0xeee1a9);
    }
  }
  const surfaces=[
    new THREE.MeshStandardMaterial({roughness:.94}),
    new THREE.MeshStandardMaterial({map:concrete?.map,bumpMap:concrete?.bumpMap,bumpScale:.0008,roughness:.89}),
    new THREE.MeshStandardMaterial({roughness:.64,metalness:.12}),
  ];
  for(const [index,material] of surfaces.entries()){
    const geometry=faceGeometry(batches[index],tints[index]);
    const uv=[];
    for(let i=0;i<batches[index].length;i+=3)uv.push(batches[index][i]/3,batches[index][i+2]/3);
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    material.vertexColors=true;material.polygonOffset=true;
    material.polygonOffsetFactor=-(index+1);material.polygonOffsetUnits=-2*(index+1);
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=['sealed joints','mechanically anchored panels','flush fasteners and metre graduations'][index];
    mesh.renderOrder=index+1;mesh.receiveShadow=true;
    root.add(mesh);
  }
  return root;
}
