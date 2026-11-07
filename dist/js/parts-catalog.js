// Catalog of the licensed artist asset, not a Tesla engineering bill of materials.
export const ROADSTER_MODEL_SOURCE = 'https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const categoryInfo = {
  exterior: ['외장·패널', 'body', '차체 외부의 패널·그릴·공력 마감을 표현한 원본 형상입니다.'],
  glazing: ['유리 표면', 'cabin', '유리 재질로 표현된 원본 표면입니다. 작은 유리 표면까지 개별 선택할 수 있습니다.'],
  interior: ['실내·좌석', 'cabin', '실내의 원본 형상입니다. 좌우 좌석이나 여러 실내 요소가 한 메시 안에 포함될 수 있습니다.'],
  lighting: ['등화·렌즈', 'body', '등화의 렌즈·발광면·하우징을 표현한 원본 형상입니다. 재질별 표면과 조립 부품은 서로 다릅니다.'],
  wheels: ['바퀴·브레이크', 'wheels', '타이어·휠·브레이크의 원본 시각 형상입니다. 휠과 디스크는 회전하고 캘리퍼는 함께 회전하지 않습니다.'],
  trim: ['세부 마감', 'body', '원본에 포함된 작은 마감 표면입니다. 기능이 명확하지 않은 형상은 원본 번호로 구분합니다.'],
};

// These conservative labels use the original object, material and position.
// They deliberately do not turn generic numbered surfaces into invented OEM parts.
const objectLabels = {
  '005': ['전방 그릴', 'exterior'],
  '007': ['앞유리 표면', 'glazing'],
  '008': ['실내 형상 묶음', 'interior'],
  '009': ['좌석 형상 묶음', 'interior'],
  '010': ['좌석 상부 형상 묶음', 'interior'],
  '011': ['실내 거울 반사면', 'interior'],
  '012': ['실내 거울 하우징', 'interior'],
  '015': ['측면 도장 패널 015', 'exterior'],
  '024': ['전방 하부 스플리터', 'exterior'],
  '025': ['전방 방향지시등 렌즈', 'lighting'],
  '026': ['전방 방향지시등', 'lighting'],
  '029': ['전조등 외부 렌즈', 'lighting'],
  '030': ['전조등 마감 030', 'lighting'],
  '031': ['전조등 마감 031', 'lighting'],
  '032': ['전조등 광원·마감 032', 'lighting'],
  '033': ['전조등 광원·마감 033', 'lighting'],
  '034': ['전조등 마감 034', 'lighting'],
  '035': ['전조등 주 광원', 'lighting'],
  '036': ['전조등 마감 036', 'lighting'],
  '037': ['전조등 내부 렌즈', 'lighting'],
  '038': ['전방 크롬 장식 038', 'trim'],
  '039': ['후방 크롬 장식 039', 'trim'],
  '043': ['후방 하부 디퓨저', 'exterior'],
  '044': ['후면 보조등 렌즈', 'lighting'],
  '045': ['후면 보조등 하우징', 'lighting'],
  '048': ['번호판 조명 렌즈', 'lighting'],
  '049': ['번호판 조명', 'lighting'],
  '050': ['후면 보조등 발광면', 'lighting'],
  '051': ['후방 방향지시등 렌즈', 'lighting'],
  '052': ['후방 방향지시등', 'lighting'],
  '056': ['루프 유리 표면 056', 'glazing'],
  '057': ['루프 유리 표면 057', 'glazing'],
  '058': ['루프 도장 프레임', 'exterior'],
  '060': ['후면 상부 패널 060', 'exterior'],
  '062': ['후면 상부 패널 062', 'exterior'],
  '064': ['후면 중앙 조명', 'lighting'],
  '065': ['후미등 발광면 065', 'lighting'],
  '066': ['후미등 렌즈', 'lighting'],
  '067': ['후미등 마감 067', 'lighting'],
  '068': ['후미등 마감 068', 'lighting'],
  '069': ['후미등 발광면 069', 'lighting'],
  '070': ['검정 외장 형상 묶음 070', 'exterior'],
};

const materialLabels = {
  rims: '휠 림', mirror: '반사 마감', metalblackrough: '검정 마감',
  brakedisc: '브레이크 디스크', thread: '타이어 트레드', sidewall: '타이어 사이드월',
  calipers: '브레이크 캘리퍼', carmainpaint: '도장 표면', grill: '그릴 표면',
  glassmidtint: '유리 표면', glasstintmax: '유리 표면', glassclear: '투명 렌즈 표면',
  interior: '실내 형상', seats: '좌석 형상', nonlustrousmetal: '금속 마감',
  carbonfibre: '카본 마감', glassamber: '앰버 렌즈', indicatorleft: '왼쪽 발광면',
  indicatorright: '오른쪽 발광면', chrome: '크롬 마감', headlightsaho: '전조등 발광면',
  headlightsmain: '전조등 주 발광면', licenceplatelight: '번호판 발광면',
  glassrearlightsmain: '후미등 발광면', glassrearlightsdho: '후미등 발광면', ior1: '투명 마감',
};
const wheelLabels = ['앞 왼쪽', '앞 오른쪽', '뒤 왼쪽', '뒤 오른쪽'];

export function sourceObjectNumber(name) {
  return String(name || '').match(/roadster[._\s-]?(\d+)/i)?.[1]?.padStart(3, '0') || null;
}

export function createModelCatalogEntry(record) {
  const number = sourceObjectNumber(record.sourceObjectName);
  const material = normalize(record.materialNames[0]);
  const surface = materialLabels[material] || '원본 표면';
  let category, title;
  if (record.wheel >= 0) {
    category = 'wheels';
    title = `${wheelLabels[record.wheel]} ${surface}`;
  } else if (objectLabels[number]) {
    [title, category] = objectLabels[number];
    if (record.objectMeshCount > 1) title += ` · ${surface}`;
  } else if (normalize(record.sourceObjectName) === 'trdefbody') {
    title = '차체 외판 형상 묶음'; category = 'exterior';
  } else {
    category = /headlight|rearlight|indicator|licenceplate/.test(material) ? 'lighting'
      : /interior|seats/.test(material) ? 'interior'
      : /glass/.test(material) ? 'glazing'
      : /carmainpaint|grill/.test(material) ? 'exterior' : 'trim';
    title = `${surface} ${number || String(record.index).padStart(3, '0')}`;
  }
  const [categoryLabel, lessonId, description] = categoryInfo[category];
  return {
    id: `model-${String(record.index).padStart(3, '0')}`,
    title, category, categoryLabel, kind: 'model', lessonId, description,
    sourceName: record.sourceName,
    sourceObjectName: record.sourceObjectName,
    sourceObjectKey: record.sourceObjectKey,
    sourceAncestry: [...record.sourceAncestry],
    materialNames: [...record.materialNames],
    sourceUrl: ROADSTER_MODEL_SOURCE,
    geometryNote: `원본 오브젝트 ${record.sourceObjectName}의 시각 메시입니다. ${record.objectMeshCount > 1 ? `같은 오브젝트의 ${record.objectMeshCount}개 재질 표면은 함께 분해됩니다. ` : ''}아티스트 형상이며 제조사 부품번호·전수 부품목록이 아닙니다. 시뮬레이터의 가정 치수에 맞춰 정렬했습니다.`,
  };
}

// Offsets are local translations of the existing mesh parents. Mesh geometry is
// left untouched: progress zero restores every original vertex exactly.
export function modelObjectExplosion(record, center, category) {
  const number = Number(sourceObjectNumber(record.sourceObjectName) || 0);
  const side = record.wheel >= 0 ? (record.wheel % 2 ? 1 : -1) : Math.sign(center[2]);
  if (record.wheel >= 0) {
    const names = record.objectMaterialNames.map(normalize).join(' ');
    if (record.brake) return { offset: [-.18, .18, side * .22], stage: [.42, .9] };
    if (/thread|sidewall/.test(names)) return { offset: [0, 0, side * .95], stage: [.26, .72] };
    if (/brakedisc/.test(names)) return { offset: [0, 0, side * .16], stage: [.45, .94] };
    return { offset: [0, 0, side * .5], stage: [.34, .82] };
  }
  const forward = Math.sign(center[0]) || 1;
  const lane = number % 5;
  if (category === 'lighting') return {
    offset: [forward * (.35 + (number % 7) * .14), .08 + lane * .09, side * .18], stage: [.38, .94],
  };
  if (category === 'glazing') return {
    offset: [center[0] * .14, .38 + lane * .12, side * .3], stage: [.3, .87],
  };
  if (category === 'interior') return {
    offset: [center[0] * .12, .2 + lane * .16, side * .4], stage: [.48, .98],
  };
  if (normalize(record.sourceObjectName) === 'trdefbody') return { offset: [0, .18, 0], stage: [.28, .72] };
  return {
    offset: [forward * (.16 + (number % 4) * .16), .12 + lane * .13, side * .35], stage: [.36, .96],
  };
}

const hypothesisInfo = {
  'drive-front':['앞 모터·감속기·차동장치 · 가정 장치','앞 모터 하나가 감속기와 차동장치를 통해 두 앞바퀴에 토크를 전달하는 기능 도식입니다.',[.48,.94]],
  'drive-rear-left':['뒤 왼쪽 모터·감속기 · 가정 장치','독립된 뒤 왼쪽 모터의 회전자·감속기·반축입니다. 형상과 배치는 교육용 가정입니다.',[.48,.94]],
  'drive-rear-right':['뒤 오른쪽 모터·감속기 · 가정 장치','독립된 뒤 오른쪽 모터의 회전자·감속기·반축입니다. 형상과 배치는 교육용 가정입니다.',[.48,.94]],
  'power-electronics':['인버터·고전압 배선 · 가정 장치','배터리 전력을 세 모터에 공급하고 제동 회생 에너지를 배터리로 돌리는 기능 도식입니다.',[.44,.9]],
  tank: ['기체 탱크 · 가정 장치', '900 L 설정의 두 압축기체 탱크·차단밸브·분배기·배관 도식입니다. 실차 패키징 검증은 아닙니다. 원본 Roadster 메시에는 포함되어 있지 않습니다.', [.38, .78]],
  battery: ['배터리 · 가정 장치', '에너지 흐름 설명을 위해 추가한 배터리 트레이와 모듈 배치입니다. Tesla 실차 내부 배치 자료가 아닙니다.', [.47, .88]],
  suspension: ['서스펜션 · 가정 장치', '스프링·댐퍼와 접촉 원리를 설명하는 추가 형상입니다. 실제 차량의 전체 서스펜션 부품을 재현하지 않습니다.', [.56, .96]],
  thrusters: ['추진기·팬 · 가정 장치', '비행과 접지력 실험을 위한 추가 노즐·팬 형상입니다. 실제 Roadster 부품이나 확인된 장착 위치가 아닙니다.', [.66, 1]],
  wing: ['능동 윙 · 가정 장치', '다운포스 변화를 보여 주기 위해 추가한 가정 윙입니다. 원본 외형 모델과 별도인 교육용 형상입니다.', [.24, .65]],
};

export function createHypothesisCatalogEntry(id) {
  const [title, description] = hypothesisInfo[id];
  return {
    id, title, category: 'hypothesis', categoryLabel: '교육용 가정 장치', kind: 'hypothesis', lessonId: id,
    description, sourceName: `createVehicle/${id}`, sourceObjectName: id, sourceAncestry: ['createVehicle'],
    materialNames: [], sourceUrl: '', geometryNote: '프로젝트에서 생성한 설명용 형상이며 Tesla의 공개 실차 부품 자료에서 가져온 메시가 아닙니다.',
  };
}

export function hypothesisExplosionStage(id) {
  return [...hypothesisInfo[id][2]];
}
