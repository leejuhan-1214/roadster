const koreanBrandNames={
 'Alfa Romeo':'알파 로메오', 'Aston Martin':'애스턴 마틴', Audi:'아우디', BMW:'비엠더블유',
 Bugatti:'부가티', Chevrolet:'쉐보레', Dodge:'닷지', Ferrari:'페라리', Ford:'포드',
 Honda:'혼다', Hyundai:'현대', Jaguar:'재규어', Kia:'기아', Koenigsegg:'코닉세그',
 Lamborghini:'람보르기니', Lotus:'로터스', Maserati:'마세라티', Mazda:'마쓰다 마쯔다', McLaren:'맥라렌',
 'Mercedes-Benz':'메르세데스 벤츠', Nissan:'닛산', Pagani:'파가니', Porsche:'포르쉐',
 Subaru:'스바루', Tesla:'테슬라', Toyota:'토요타 도요타',
};

/** Search the driving fleet without changing the selected vehicle. */
export function searchCityVehicles(vehicles,query=''){
 const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return vehicles.filter(v=>{
   const text=[v.title,v.brand,koreanBrandNames[v.brand],v.model,v.short,v.id,v.newCityRelease?'신규 new':''].join(' ').toLocaleLowerCase();
   return terms.every(term=>text.includes(term));
 });
}
export function vehicleOptionsForMode(mode,vehicles,experiments){return mode==='lab'?experiments:vehicles;}
