/**
 * Educational copy for Roadster Flight Lab.
 * Equations use SI units. The artist's 2020 concept exterior is not an OEM BOM.
 * Simulation parameters and added flight hardware are educational assumptions;
 * historical announcements describe concepts, not verified production hardware.
 */
export const PARTS = {
  body: {
    title: '차체 · 무게중심',
    subtitle: 'BODY & CENTER OF MASS',
    description: '차체에 작용하는 모든 힘의 합이 가속도를 정합니다. 같은 힘이라도 무게중심에서 떨어진 곳에 작용하면 차체를 회전시킵니다. 설정에서 무게중심을 앞으로 옮기면 앞바퀴 하중이 커지고, 관성모멘트를 키우면 같은 토크에 덜 회전합니다. 외형이 같아도 내부의 질량 배치가 다르면 운동은 달라집니다.',
    formula: 'm a = ΣF  ·  τ = r × F',
    variables: 'm 질량 [kg] · a 가속도 [m/s²] · F 힘 [N] · r 무게중심에서 작용점까지의 벡터 [m] · τ 토크 [N·m]',
    assumption: '외형은 metarex.4d의 Tesla Roadster 2020 모델(CC BY 4.0)입니다. 원본 메시의 구분은 아티스트의 표현이며 Tesla의 실제 부품명세나 설계도가 아닙니다. 기본 기체 제외 질량 1,900 kg과 조절 가능한 무게중심·관성은 가정이며 실차 측정값이 아닙니다.',
  },
  cabin: {
    title: '캐빈 · 자세',
    subtitle: 'CABIN & ORIENTATION',
    description: '차량에는 앞으로 가는 방향과 지붕 방향이 있습니다. 차체가 기울면 차체에 붙은 추진기의 힘도 함께 기울어집니다. 화면의 피치·롤·요는 복잡한 3차원 자세를 읽기 쉽게 표시한 값입니다.',
    formula: 'F_world = R(q) F_body  ·  F_vertical = F cos θ',
    variables: 'R(q) 차체에서 지면 좌표계로의 회전 · q 쿼터니언 · θ 추력과 수직선 사이의 각도 [rad]',
    assumption: '내부 적분은 쿼터니언을 사용합니다. 2020 콘셉트 외형·좌석·유리는 아티스트가 제작한 시각 모델입니다. 추가 추진계는 교육용 가정이며 이 콘셉트의 실제 내부 구조를 재현한 설계도가 아닙니다.',
  },
  wheels: {
    title: '타이어 · 접지력',
    subtitle: 'TIRES & TRACTION',
    description: '타이어는 노면을 밀어 차량을 가속하고 방향을 바꿉니다. 가속과 코너링은 같은 접지력을 나눠 사용하므로 동시에 강하게 요구하면 미끄러집니다. 공중에 뜬 바퀴는 노면 힘을 만들 수 없습니다.',
    formula: '√(Fx² + Fz²) ≤ μN  ·  Iw ω̇w = τdrive − τbrake − rw Fx',
    variables: 'Fx 바퀴 전후 힘 [N] · Fz 바퀴 좌우 힘 [N] · μ 마찰계수 · N 수직항력 [N] · Iw 바퀴 관성 [kg·m²]',
    assumption: '안쪽·바깥쪽 앞바퀴가 다른 각도로 꺾이는 Ackermann 조향과 마찰 원·슬립을 사용하는 축소 타이어 모델입니다. 온도·마모·노면 요철·타이어 내부 변형을 모두 재현하지 않습니다.',
  },
  tank: {
    title: '탱크 · 압력과 냉각',
    subtitle: 'FINITE GAS RESERVOIR',
    description: '기체를 내보내면 기체 질량과 차량 질량이 줄어듭니다. 빠른 분사에서는 탱크 안의 기체가 냉각되므로 압력도 함께 떨어집니다. 탱크가 완전히 비기 전에도 추력이 부족해질 수 있습니다.',
    formula: 'PV = m_gas RT  ·  dU/dt = Q̇ − ṁ_out cpT',
    variables: 'P 절대압력 [Pa] · V 체적 [m³] · T 온도 [K] · R 비기체상수 [J/(kg·K)] · U 내부에너지 [J]',
    assumption: '600 L는 이 앱의 교육용 탱크 설정이며 2020 콘셉트의 확정 사양이 아닙니다. 250 kg의 이상 공기와 300 K를 결합해 얻은 35.875 MPa는 계산용 초기 절대압력이며 실측 압력이 아닙니다. 고압 실기체 효과와 벽 열전달은 생략합니다.',
  },
  thrusters: {
    title: '추진기 · 힘과 토크',
    subtitle: 'COLD-GAS THRUSTERS',
    description: '기체가 빠져나가는 반대 방향으로 차량이 밀립니다. 좌우 추진기를 같은 세기로 켜면 회전 효과가 상쇄될 수 있고, 한쪽만 켜면 차체가 회전합니다. 분사량은 잔여 압력과 밸브 개도에 제한됩니다.',
    formula: 'F = ṁve + (pe − pa)Ae  ·  τ = r × F',
    variables: 'ṁ 배출 유량 [kg/s] · ve 상대 배출 속도 [m/s] · pe 출구 절대압력 [Pa] · pa 대기압 [Pa] · Ae 출구 면적 [m²]',
    assumption: '개별 노즐의 수·위치·방향·면적은 힘과 토크를 탐구하기 위한 교육용 가정입니다. 단순 수축 노즐과 유한 밸브 응답을 사용합니다. 이 배치와 비행 성능은 2020 콘셉트의 공개 확정 사양이 아닙니다.',
  },
  suspension: {
    title: '서스펜션 · 감쇠 진동',
    subtitle: 'SPRINGS & DAMPERS',
    description: '착지할 때 스프링은 눌리며 에너지를 저장하고, 댐퍼는 상대 운동을 방해해 진동을 줄입니다. 네 접점에 다른 힘이 생기면 차체가 앞뒤 또는 좌우로 기울어집니다.',
    formula: 'F = kx + c ẋ  ·  m ξ̈ + c ξ̇ + kξ = 0',
    variables: 'x 압축량 [m] · k 스프링 상수 [N/m] · c 감쇠 계수 [N·s/m] · ξ 중력으로 눌린 평형점에서의 변위 [m]',
    assumption: '현재 네 모서리의 유연한 접촉·서스펜션을 차체에 연결하는 축소 모델입니다. 차체 질량과 바퀴의 수직 질량을 따로 적분하는 완전한 1/4 차량 모델과는 다릅니다.',
  },
  wing: {
    title: '윙 · 공기력',
    subtitle: 'AERODYNAMICS',
    description: '차량과 공기의 상대 속도가 커질수록 공기력은 대체로 속도의 제곱에 비례해 커집니다. 윙의 다운포스는 바퀴를 더 누르지만 공기 저항도 늘릴 수 있습니다. 힘의 작용점이 치우치면 토크도 생깁니다.',
    formula: 'D = ½ρCdA v_rel²  ·  L = ½ρClA v_rel²',
    variables: 'ρ 공기 밀도 [kg/m³] · Cd 항력계수 · Cl 양력계수 · A 기준 면적 [m²] · v_rel 공기에 대한 속력 [m/s]',
    assumption: '추가 윙과 계수·공력 작용점은 교육용 가정입니다. 2020 콘셉트의 실제 윙 설계나 풍동 데이터, 전체 유동 해석을 사용한 모델은 아닙니다.',
  },
  battery: {
    title: '모터 · 배터리 · 팬',
    subtitle: 'ELECTRIC POWER',
    description: '모터는 낮은 회전수에서는 토크, 높은 회전수에서는 출력에 제한됩니다. 팬은 차체 밑의 압력을 낮춰 접지력을 높이며 전력을 사용합니다. 팬의 지면 흡착력을 공중 양력으로 바꾸어 계산하지 않습니다.',
    formula: 'P = τω  ·  F_fan ≈ Δp A  ·  P_fan ≈ Δp Q/η',
    variables: 'P 출력 [W] · τ 토크 [N·m] · ω 각속도 [rad/s] · Δp 압력차 [Pa] · Q 체적 유량 [m³/s] · η 효율',
    assumption: '배터리 용량·효율·모터 한계·팬 성능은 교육용 설정입니다. 추가 흡착 팬은 2020 콘셉트의 확인된 부품이 아닙니다. 팬 흡착은 차고에 따라 감소하며, 기체 탱크의 에너지와 별도로 기록합니다.',
  },
};

export const LESSONS = [
  {title:'비행 중 마찰은 어떻게 달라질까요?',tag:'00 · FRICTION',formula:'√(Fx² + Fz²) ≤ μN  ·  D = ½ρCdA v_rel²',body:'노면의 접지 마찰과 공기저항은 서로 다른 힘입니다. 타이어의 전후·횡방향 힘과 구름저항은 합쳐서 μN 한도 안에 있습니다. 바퀴가 공중에 뜨면 접지 마찰은 0이 되지만, 공기저항은 상대 속도에 따라 계속 작용합니다. 왼쪽에서 노면 계수와 공기저항을 바꾸어 가속·제동·착지를 비교할 수 있습니다.'},
  {title:'수평 속도와 수직 속도',tag:'00 · VELOCITY',formula:'v_horizontal = √(vx² + vz²)  ·  v_vertical = vy',body:'수평 속도는 지면 X/Z 방향 속도의 크기이며, 수직 속도는 상승과 하강을 구분하는 Y 방향 성분입니다. 수평 속도는 후진·옆미끄럼에서도 양수입니다. m/s에 3.6을 곱하면 km/h입니다.'},
  {
    title: '질량과 무게는 다릅니다',
    tag: '01 · NEWTON',
    formula: 'm a = ΣF  ·  W = mg',
    body: '질량은 가속되기 어려운 정도이고, 무게는 중력이 만드는 힘입니다. 접촉력·중력·추력·공기력을 같은 좌표계에서 더합니다. 위쪽 추력이 무게보다 크면 위쪽 가속도가 생기지만, 실제 이륙에는 접촉과 자세 조건도 맞아야 합니다.',
  },
  {
    title: '기체는 운동량을 가져갑니다',
    tag: '02 · MOMENTUM',
    formula: 'F = ṁve + (pe − pa)Ae  ·  Δv = veff ln(mi/mf)',
    body: '차가 분사 기체와 반대 방향으로 밀리는 것은 운동량 보존 때문입니다. 로켓 방정식은 외력이 없고 배출 방향·유효 속도가 일정할 때 검산에 씁니다. 매 순간 추력을 적분한 속도에 로켓 방정식의 Δv를 다시 더하지 않습니다.',
  },
  {
    title: '기체가 남아도 뜨지 못할 수 있습니다',
    tag: '03 · THERMODYNAMICS',
    formula: 'PV = mRT  ·  T/T₀ = (m/m₀)^(γ−1)',
    body: '빠른 단열 방출에서는 기체량과 온도가 함께 내려갑니다. 압력이 낮아지면 노즐의 최대 추력도 줄어듭니다. 모든 압력 계산은 절대압력을 사용하며, 게이지압은 대기압을 뺀 값입니다. 고압에서의 이상기체 가정은 실기체 물성으로 다시 확인해야 합니다.',
  },
  {
    title: '추력의 위치가 회전을 만듭니다',
    tag: '04 · ROTATION',
    formula: 'τ = r × F  ·  Iω̇ + ω × Iω = Στ',
    body: '같은 힘도 무게중심에서 멀리 작용할수록 회전 효과가 커집니다. 좌우 대칭 출력의 토크는 상쇄될 수 있습니다. 이 시뮬레이터는 자세를 쿼터니언으로 적분하고, 기체의 관성 변화가 작은 것으로 근사한 고정 관성을 사용합니다.',
  },
  {
    title: '제어기는 없는 힘을 만들 수 없습니다',
    tag: '05 · FEEDBACK',
    formula: 'a_cmd = Kp e + Kd ė  ·  0 ≤ Fi ≤ Fi,max(P,T)',
    body: '목표 높이·자세와 현재 상태의 차이를 줄이도록 추진기를 조절합니다. 오차에 비례하는 P는 복원 작용, 속도 오차에 비례하는 D는 감쇠 작용을 합니다. 밸브 지연, 출력 포화, 배치상 만들 수 없는 토크 때문에 제어가 실패할 수도 있습니다.',
  },
  {
    title: '기울면 수직 추력이 줄어듭니다',
    tag: '06 · FLIGHT',
    formula: 'F_vertical = F cos θ  ·  a_brake = F_vertical/m − g',
    body: '차체를 기울여 이동하면 추력 일부가 수평 방향에 쓰입니다. 같은 출력을 유지하면 고도가 떨어질 수 있습니다. 하강 속력 v를 일정한 순상향 가속도 a로 줄이는 이상적인 최소 거리는 v²/(2a)이며, 실제로는 지연과 가스 여유가 더 필요합니다.',
  },
  {
    title: '접지력은 나누어 사용합니다',
    tag: '07 · TRACTION',
    formula: '√(Fx² + Fz²) ≤ μN  ·  P = τω',
    body: '강하게 가속하면서 급하게 돌면 전후·좌우 힘의 합이 마찰 한계에 도달합니다. 그때 타이어가 미끄러집니다. 모터 출력과 바퀴 회전도 제한되며, 공중의 바퀴에는 접지력을 주지 않습니다. 마찰 원은 실제 타이어를 단순화한 모델입니다.',
  },
  {
    title: '팬과 추진기는 다른 일을 합니다',
    tag: '08 · AIRFLOW',
    formula: 'F_fan ≈ Δp A  ·  F_drag = ½ρCdA v_rel²',
    body: '팬은 바닥과 가까운 공간의 압력을 낮춰 차를 노면 쪽으로 누릅니다. 틈새가 커지면 흡착 효과가 줄어듭니다. 냉가스 추진기는 저장 기체를 내보내 반작용을 얻습니다. 두 힘과 각각의 에너지 소비를 따로 계산해야 합니다.',
  },
  {
    title: '착지는 단진동과 연결됩니다',
    tag: '09 · OSCILLATION',
    formula: 'mξ̈ + cξ̇ + kξ = 0  ·  ωn = √(k/m)',
    body: '착지 충격 뒤 스프링은 차체를 평형 위치로 되돌리고 댐퍼는 흔들림을 줄입니다. 이 식은 중력으로 눌린 평형점 부근에서 접촉이 유지되는 작은 진동의 근사입니다. 바닥침과 바퀴가 다시 뜨는 큰 운동에는 접촉 조건을 따로 적용합니다.',
  },
  {
    title: '검산과 현실 검증은 서로 다릅니다',
    tag: '10 · NUMERICS',
    formula: 'Δt → Δt/2 → Δt/4  ·  U = m cvT',
    body: '화면 갱신과 별개로 작은 고정 시간 간격으로 힘과 운동을 계산합니다. 시간 간격을 줄여 결과가 수렴하는지, 질량·에너지 수지가 맞는지 검사합니다. 이 검사가 통과해도 실제 차량과 같다는 뜻은 아닙니다. 배출 기체와 열 손실을 포함해 에너지를 해석해야 합니다.',
  },
];

export const SOURCES = [
  {
    title: 'Tesla Roadster 2020 · metarex.4d의 3D 모델',
    label: 'Exterior model · metarex.4d',
    url: 'https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8',
    kind: '외형 자산 · 2020 콘셉트',
    note: '기본 3D 외형의 원작자 metarex.4d. CC BY 4.0. 좌표 변환·도색·바퀴 애니메이션과 교육용 부품을 추가했습니다. 원본 메시 전체를 탐색해도 Tesla의 전체 실제 부품명세·OEM CAD·실측 물리 데이터가 되는 것은 아닙니다.',
  },
  {
    title: '외형 재사용 라이선스 · Creative Commons BY 4.0',
    label: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    kind: '저작자 표시',
    note: '원본 출처와 저작자, 변경 사실을 표시합니다. 파일 안의 license.txt와 provenance.json에도 출처를 보존했습니다.',
  },
  {
    title: 'Tesla · 2017 Semi & Roadster 공개 행사',
    label: 'Tesla 2017 Unveil',
    url: 'https://www.youtube.com/watch?v=5RRmepp7i5g',
    kind: '당시 콘셉트 발표',
    note: '2020 출시를 예고했던 원래 콘셉트의 공식 발표 영상입니다. 앞 1개·뒤 2개의 모터, AWD, 2+2 좌석, 탈착 루프, 200 kWh 배터리는 당시 발표 구성입니다. 실제 내부 부품의 치수·배치나 이 앱의 비행 성능을 검증하는 자료는 아닙니다.',
  },
  {
    title: 'Tesla · 1세대 Roadster 공개 기술 자료',
    label: 'Roadster 2008–2012 Archive',
    url: 'https://github.com/teslamotors/roadster',
    kind: '다른 세대의 자료 · 구분 참고',
    note: 'Tesla가 공개한 2008–2012 Roadster 개발·진단 자료입니다. 연결된 정비·부품 자료의 2.0·2.5 표기는 1세대의 개정형을 뜻합니다. 이 자료를 2020 콘셉트의 실제 부품명세나 내부 설계로 사용하지 않습니다.',
  },
  {
    title: 'NASA · 로켓 추력 방정식',
    label: 'NASA Thrust',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/',
    kind: '물리식',
    note: '배출 운동량과 노즐 출구 압력 차가 만드는 추력.',
  },
  {
    title: 'NASA · 이상 로켓 방정식',
    label: 'NASA Rocket Equation',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/',
    kind: '검산 기준',
    note: '일정한 유효 배출 속도와 외력이 없는 이상 조건의 속도 변화.',
  },
  {
    title: 'NASA · 압축성 유동과 초크',
    label: 'NASA Mass Flow',
    url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mass-flow-rate-equations/',
    kind: '물리식',
    note: '노즐 목에서 음속에 도달할 때의 유량 제한.',
  },
  {
    title: 'NIST · REFPROP',
    label: 'NIST REFPROP',
    url: 'https://www.nist.gov/srd/refprop',
    kind: '정밀화 참고',
    note: '향후 실기체 물성 검증용 자료. 현재 앱은 REFPROP을 사용하지 않습니다.',
  },
  {
    title: 'Model X Studio · 제작자 검증 문서',
    label: 'Model X Studio',
    url: 'https://github.com/ashemag/model-x-studio/blob/main/VALIDATION.md',
    kind: '인터페이스 참고',
    note: '분해·부품 탐색의 참고 사례. 해당 모델·코드를 이 앱에 복제하지 않았고 차량 동역학의 근거로 사용하지 않습니다.',
  },
  {
    title: 'LLMJunky · 자동차 게임 참고',
    label: 'Driving Reference',
    url: 'https://x.com/LLMJunky/status/2096028790925488452',
    kind: '인터페이스 참고',
    note: '카메라·조작·시각 표현 참고. 아케이드 게임의 운동을 실차 물리로 간주하지 않습니다.',
  },
];
