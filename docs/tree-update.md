# 실제 나무·나뭇잎 표현 갱신 (2026-11-10)

## 확인한 자료

- [Poly Haven Tree Small 02](https://polyhaven.com/a/tree_small_02): Rico Cilliers가 제공하는 4.6 m 크기 나무 모델. 줄기·가지와 잎의 diffuse, alpha, normal 등 개별 재질 자료를 제공합니다.
- [Poly Haven 라이선스](https://polyhaven.com/license): CC0 1.0으로 공개된 자산입니다. 원본과 변환 파일의 출처·해시는 dist/assets/trees/provenance.json에 보존합니다.
- shader 변경은 이 저장소에 설치된 Three.js 0.180.0의 ShaderLib.standard / ShaderLib.depth / ShaderChunk.begin_vertex 및 WebGLProgram 인스턴싱 선언을 확인하여 적용했습니다.

## 이번 변경

기존 웹용 나무는 구·원뿔 덩어리가 아닌 실제 공개 나무의 줄기·가지 형상과 알파 마스크 나뭇잎을 사용합니다. 가까운 단계에는 원래 잎 방향과 UV에 맞춘 잎 카드 4,400개가 포함됩니다. 이번에는 이전 웹 버전에서 빠졌던 원본 1K OpenGL 잎 노멀맵을 복원했습니다. 잎맥과 굴곡이 빛에 반응하며, 밝기 사진만 붙인 평면처럼 보이는 정도를 줄입니다. 노멀 강도는0.55, 잎 거칠기는0.72로 설정했습니다. 원본 노멀맵의 바이트는 변경하지 않고 출처 SHA-256과 동일함을 확인했습니다.

나무마다 위치에서 정한 작은 색상 차이를 적용하여 같은 모델을 반복 배치한 느낌을 줄였습니다. 개별 나무의 크기와 방향은 기존 배치 값을 유지합니다. 수종이나 정확한 가로수 위치를 강남 현장과 일치한다고 주장하지 않습니다. 원본은 Poly Haven에서 소개하는 burkea africana / wild syringa 계열 모델이며 강남 가로수 수종 조사 자료가 아닙니다.

공유 GPU uniform으로 줄기 상부와 가지가 천천히 흔들리고 나뭇잎에는 더 짧은 주기의 움직임을 추가했습니다. 변위는 높이의 제곱에 비례하므로 뿌리는 지면에 고정됩니다. 나무 위치로 위상을 달리해 전체 나무가 동시에 같은 방향으로 흔들리지 않습니다. 바람 방향은 각 인스턴스의 회전된 좌표로 변환합니다. 이는 시각적 흔들림이며 실제 나무 탄성·공기력 모델은 아닙니다.

잎 그림자에도 같은 알파 마스크와 동일한 변위를 적용합니다. visible mesh만 흔들리고 그림자는 고정되는 불일치를 피했습니다. 바람이 없는 입력에서는 변위가0이며, 시뮬레이션 시각이 멈추면 흔들림도 멈춥니다. 입력 바람의 강도가 매우 커도 표현 강도는2.5배로 제한합니다.

## 렌더링과 수명 관리

- 96 m 타일 안에서 InstancedMesh를 사용합니다.
- 가까운 LOD는 약11,678삼각형, 중간 LOD는약3,287삼각형으로 기존 형상 예산을 유지합니다.
- LOD 전환 거리는0/85/280m이고 원거리에는 나뭇잎 geometry를 제출하지 않습니다.
- 원본 노멀맵 포함 런타임 자산은3,490,644bytes입니다.
- 프레임마다 vertex buffer를 다시 만들지 않고 시간·강도·방향 uniform만 갱신합니다.
- configureTreeWindMaterial은 표면과 그림자 재질에 같은 shader 변위를 삽입합니다.
- updateTreeWind(asset,timeSeconds,windX=1.4,windZ=.6)를 한 공유자산에 한 번 갱신하면 모든 인스턴스에 적용됩니다.
- part.geometry, part.material, part.depthMaterial은 공유 자원입니다. 스트리밍 구역을 버릴 때 이 공유 자원은 dispose하지 않습니다. 전체 나무 자산 종료 시 표면 material.dispose 이벤트가 관련 depth material도 정리합니다.
- 바람으로 이동한 꼭짓점이 화면 가장자리에서 갑자기 사라지지 않도록 geometry bounding sphere 반지름에0.25m 여유를 둡니다.

## 검증

node --test tests/city-trees.test.mjs (4개 통과), node --check dist/js/city-trees.js 통과. 원본·런타임 해시, 잎 노멀맵 연결, 카드 수·LOD 예산, 공유 uniform, 무풍/잘못된 값 처리, 표면·그림자의 동일 변위, 나무 바닥 고정 수식, 인스턴싱·먼 거리 LOD를 검사합니다. 최종 통합 브라우저에서는 console shader 오류가 없는지, 가까이에서 잎 윤곽·노멀 조명이 보이는지와 일시정지 시 흔들림 정지를 확인해야 합니다.
