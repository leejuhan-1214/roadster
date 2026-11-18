// Sources establish the axle family only. The public GLBs supply wheel centres,
// not service drawings with bushing locations, motion ratios or spring rates.
const layouts = new Map();
function register(id, front, rear, source, note = '') {
  layouts.set(id, Object.freeze({front, rear, source, note}));
}
const wishbone = 'wishbone';
register('mazda-miata-mx-5', wishbone, wishbone, 'https://www.mazda.com/en/about/history/greatcar/roadster/03/');
register('toyota-supra-mk', wishbone, wishbone, 'https://media.toyota.co.uk/wp-content/uploads/sites/5/pdf/Supra-Gen4-UK-launch-pack-1993.pdf');
register('bmw', 'strut', 'semiTrailing', 'https://bmwtechinfo.bmwgroup.com/tech_training_manual/ST1115%20Chassis%20Dynamics.pdf');
register('alfa-romeo-4c', wishbone, 'strut', 'https://www.media.stellantis.com/uk-en/alfa-romeo/press/alfa-romeo-4c-details-announced');
register('toyota-yaris', 'strut', 'trailingWishbone', 'https://media.toyota.co.uk/wp-content/uploads/sites/5/2021/03/1605890847201029MGRYarisFullRelease.pdf');
register('mclaren-720s', wishbone, wishbone, 'https://cars.mclaren.com/us_en/legacy/720s', '능동 유압 제어는 생략했습니다.');
register('honda-nsx', wishbone, wishbone, 'https://global.honda/jp/news/1990/4900913.html');
register('audi-r8', wishbone, wishbone, 'https://uploads.audi-mediacenter.com/system/production/car_motorizations/336/file_en/95f10728b67dbaf0047a50284095f3da19a1d4bb/eTechnische_Daten_Audi_R8V10_Coupe_RWD_397kW.pdf', 'V10 쿠페 자료를 참고했습니다.');
register('lamborghini-aventador-lp700-4', 'pushrod', 'pushrod', 'https://www.lamborghini.com/en-en/news/lamborghini-aventador-10-innovations-in-10-years');
register('koenigsegg-one', 'pushrod', 'pushrod', 'https://www.koenigsegg.com/technical-specifications-one1', '각 바퀴의 푸시로드를 표시합니다. 차축 중앙의 트리플렉스 장치는 생략했습니다.');
register('roadster', wishbone, wishbone, null, '2020 콘셉트의 서스펜션 도면이 확인되지 않아 스포츠카용 더블 위시본을 예시로 배치했습니다.');
register('tesla-cybertruck', 'airGuide', 'airGuide', 'https://ir.tesla.com/_flysystem/s3/sec/000162828025002993/tsla-20250129-gen.pdf', '양산형의 공기 스프링을 참고한 2019 콘셉트용 예시입니다. 프로토타입의 링크 배치는 미확인입니다.');
const generic = Object.freeze({front:'guided', rear:'guided', source:null, note:'차종별 구조를 확인할 공개 도면이 없어 등가 수직 스프링·댐퍼로 표시합니다.'});
const names = {wishbone:'더블 위시본', strut:'맥퍼슨 스트럿', semiTrailing:'세미 트레일링 암', trailingWishbone:'트레일링 암식 더블 위시본', pushrod:'푸시로드식 더블 위시본', guided:'수직 가이드', airGuide:'공기 스프링'};

export function suspensionLayout(id) {
  return layouts.get(id) || generic;
}

export function suspensionDescription(id) {
  const {front, rear, note} = suspensionLayout(id);
  return [`전륜 ${names[front]} · 후륜 ${names[rear]}.`, note, '바퀴 중심에 맞춰 장착점을 추정한 구조 모형입니다. 착지 계산에는 바퀴별 수직 스프링·감쇠 모델을 사용합니다.'].filter(Boolean).join(' ');
}
