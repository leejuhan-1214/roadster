import {DataTexture,RGBAFormat,LinearFilter,LinearMipmapLinearFilter,RepeatWrapping,SRGBColorSpace,NoColorSpace} from 'three';

// One UV unit in both city builders represents a 3.2 m bay and 3.4 m storey.
// Sixteen bays share two mipmapped textures and the existing footprint mesh.
// R in the linear texture stores relief, G roughness and B metalness.
export function facadeMaps(curtain,anisotropy=1){
  const bay=48,span=4,size=bay*span;
  const albedo=new Uint8Array(size*size*4),finish=new Uint8Array(albedo.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x%bay,v=y%bay,column=Math.floor(x/bay),floor=Math.floor(y/bay);
    const pane=column*2+Number(u>=bay/2);
    const seed=(pane*47+floor*67+pane*floor*31)%101;
    const grit=((Math.imul(x+11,17391)^Math.imul(y+31,8779))>>>1)%11-5;
    const jamb=curtain?1:5,sill=curtain?8:9,head=curtain?46:41;
    const lightEdge=u===jamb||v===sill;
    const frame=u>=jamb&&u<bay-jamb&&v>=sill&&v<=head;
    const edge=Math.min(u-jamb,bay-jamb-1-u,v-sill,head-v);
    let r,g,b,depth,rough,metal;
    if(frame&&edge>0&&u!==23&&u!==24){
      // Roller blinds and the dark interior behind each pane affect the colour,
      // while the outer pane retains its continuous dielectric reflection.
      const blind=seed%5<3&&v>head-3-seed%21;
      const tint=(v-sill)*.40+seed*.21-(edge===1?10:0);
      if(blind){
        const fold=v%3===0?-6:2;
        r=116+tint+fold;g=126+tint+fold;b=126+tint+fold;
      }else{
        r=41+tint;g=62+tint;b=74+tint;
      }
      depth=104;rough=curtain?45:57;metal=0;
    }else if(frame){
      const shade=lightEdge?153:edge===0?76:109;
      r=shade;g=shade+5;b=shade+7;depth=203;rough=109;metal=165;
    }else if(curtain){
      const horizontal=v===0||v===7,vertical=u===0||u===47;
      const shade=horizontal?110:vertical?78:66+floor*2;
      r=shade;g=shade+11;b=shade+17;depth=horizontal||vertical?209:146;
      rough=horizontal||vertical?118:85;metal=horizontal||vertical?160:6;
    }else{
      const joint=v===2||(u===1&&v>2);
      const shade=(joint?132:180)+grit+(floor+column)%3*4;
      r=shade+3;g=shade+2;b=shade;depth=joint?139:183+grit;rough=222+grit;metal=0;
    }
    const i=(y*size+x)*4;
    albedo[i]=r;albedo[i+1]=g;albedo[i+2]=b;albedo[i+3]=255;
    finish[i]=depth;finish[i+1]=rough;finish[i+2]=metal;finish[i+3]=255;
  }
  function texture(data,colorSpace,label){
    const map=new DataTexture(data,size,size,RGBAFormat);
    map.name=(curtain?'Curtain wall ':'Masonry ')+label;
    map.wrapS=map.wrapT=RepeatWrapping;map.repeat.set(1/span,1/span);map.colorSpace=colorSpace;
    map.magFilter=LinearFilter;map.minFilter=LinearMipmapLinearFilter;map.generateMipmaps=true;
    map.anisotropy=anisotropy;map.needsUpdate=true;return map;
  }
  return {color:texture(albedo,SRGBColorSpace,'bays and blinds'),finish:texture(finish,NoColorSpace,'relief and surface finish')};
}
