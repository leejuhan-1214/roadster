/** Search the driving fleet without changing the selected vehicle. */
export function searchCityVehicles(vehicles,query=''){
 const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return vehicles.filter(v=>{const text=[v.title,v.brand,v.model,v.short,v.id].join(' ').toLocaleLowerCase();return terms.every(term=>text.includes(term));});
}
export function vehicleOptionsForMode(mode,vehicles,experiments){return mode==='lab'?experiments:vehicles;}
