// Which tree stands where. Plain data and arithmetic only: the tile worker
// imports this without the renderer.
// Street trees follow Gangnam-gu's published mix (2023: ginkgo 31.3 %, London
// plane 27.7 %, zelkova 13.8 % of 23,346 trees); one species per street, as
// avenues are planted. Which street has which species is not surveyed.
export const STREET_SPECIES=[['ginkgo',.31],['plane',.28],['zelkova',.14],['cherry',.10],['metasequoia',.07],['pine',.05],['small',.05]];
export const TREE_HEIGHTS={ginkgo:[9,14],plane:[10,15.5],zelkova:[8.5,13],cherry:[5.5,8.2],metasequoia:[14,22],pine:[7,11.5],small:[5.6,7.2]};
// FNV-1a with a final avalanche, so that names differing in one character land far apart.
const hashText=text=>{
  let n=2166136261;for(const ch of String(text))n=Math.imul(n^ch.charCodeAt(0),16777619);
  n^=n>>>16;n=Math.imul(n,2246822507);n^=n>>>13;n=Math.imul(n,3266489909);n^=n>>>16;
  return (n>>>0)/4294967296;
};
// Wide avenues are lined with the large street trees only; small ornamental
// kinds stand on the lesser streets.
export const AVENUE_SPECIES=[['ginkgo',.40],['plane',.36],['zelkova',.18],['metasequoia',.06]];
const AVENUES=new Set(['motorway','trunk','primary','secondary']);
const choose=(table,v)=>{let sum=0;for(const [name,weight]of table){sum+=weight;if(v<sum)return name;}return table[0][0];};
/** The species planted along a road: the same for every tree on a named street. */
export const speciesForRoad=road=>choose(AVENUES.has(road?.type)?AVENUE_SPECIES:STREET_SPECIES,hashText('tree'+(road?.name||road?.id||'')));
/** Fallback for a tree with no street: neighbours within 160 m share a species. */
export const speciesAt=(x,z)=>choose(STREET_SPECIES,hashText('block'+Math.floor(x/160)+','+Math.floor(z/160)));
/** A stable number in [0,1) for one tree, used for its variant, height and stance. */
export const treeSeed=(x,z)=>hashText('seed'+Math.round(x*4)+','+Math.round(z*4));
