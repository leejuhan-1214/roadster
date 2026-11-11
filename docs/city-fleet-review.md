# 도시 주행 차종 검토 (v1.30)

원본 카탈로그 532개 중 실제 승용차의 다양한 브랜드·시대·크기를 고려해 92개 후보를 검토하고, 54개 모델을 추가했다. 기존 13개를 포함한 도시 주행 선택지는 67개다. 전체 카탈로그를 무검증으로 복제하지 않았다.

추가 모델 54개의 GLB는 약 68 MB이며 선택한 차량만 불러온다. 원본 파일의 해시, 작성자, 라이선스 API 확인 결과와 방향 판단 근거는 [배포용 출처 기록](../dist/assets/vehicles/city-fleet-provenance.json), 작성자별 표시는 [저작자 표시](../dist/assets/vehicles/CITY_ATTRIBUTION.md)에 있다.

추가 차종의 질량과 축간 거리는 도시 주행을 위한 시뮬레이션 가정이다. 실제 제조사 측정값으로 표시하지 않으며, 다섯 차종 착지 비교에 사용하지 않는다. 실제 메시에서 네 타이어/휠을 분리하고, 중립 축·조향·굴림을 적용한다. 차체 충돌 치수는 가정한 축간 거리에 맞춰 축척한 외형에서 계산한다.

총 27개는 출처 충돌·분리할 수 없는 바퀴·복수 차체 등의 이유로 제외하고, 11개는 추가 검증이 필요하여 보류했다. 카탈로그의 나머지 모델까지 개별 검증했다는 뜻은 아니다.

| 후보 | 상태 | 판단 근거 |
|---|---|---|
| [alfa-romeo-giulia](https://sketchfab.com/3d-models/3b30a0277a7b45a58496c843e6588212) | excluded | Source scene contains multiple copies/cars (eight tire clusters); no reviewed single-car extraction. |
| [aston-martin-vantage](https://sketchfab.com/3d-models/dbdd5aadc1d64df289f65fc0f6da3c07) | excluded | Uploader describes third-party Facebook/VK/MediaFire sources and conflicting noncommercial-only restrictions. |
| [bmw-g82-m4](https://sketchfab.com/3d-models/none-bdea1df6c22e4efd9b01a52034789fd7) | deferred | Reupload links to another model; upstream license and the complex mixed wheel subparts were not fully validated. |
| [bmw-serie-1](https://sketchfab.com/3d-models/fddf543ea68245309379bf7336aaa7a3) | deferred | Unusual transformed scene extents; no validated level four-wheel rig. |
| [bmw-x1](https://sketchfab.com/3d-models/302b32456b054dbdb5b72a08aca2bb80) | excluded | Only one side tire pair has a dedicated tire mesh; remaining wheels are merged with car-wide materials. |
| [bmw-x7](https://sketchfab.com/3d-models/05fe5fcdec714aa7b23b226c0aec51ad) | excluded | Whole-car material partitions include body and wheels; no safe independent four-wheel extraction. |
| [byd-dolphin](https://sketchfab.com/3d-models/8d30880667524cf3abb9e3e66c5299b5) | excluded | Source says Convert from Skp without original attribution; wheels merged into whole-car textured meshes. |
| [byd-seal](https://sketchfab.com/3d-models/96ec5c34852f4c3090a755d4445f5e98) | excluded | Source says Convert from Skp without original attribution; wheels merged into whole-car textured meshes. |
| [chery-tiggo](https://sketchfab.com/3d-models/b8d34fba89ca45918e851eaab3b5b679) | excluded | Whole-car material partitions include body and wheels; no safe independent four-wheel extraction. |
| [chevrolet-cobalt](https://sketchfab.com/3d-models/02a7e3bcfc294b0fb7168f90bf3aa474) | excluded | Original description explicitly says based on a Need For Speed Edge/Online 3D model. |
| [chevrolet-corvette](https://sketchfab.com/3d-models/507ee2e6d6a34a3db7bf8373c70fecff) | excluded | Original description explicitly says the model is from Forza Motorsport 4. |
| [chevrolet-equinox](https://sketchfab.com/3d-models/ce15ce4fb4e8492fba41e148c9c1ddce) | excluded | Uploader explicitly obtained the base from a third-party download site; original redistribution license not established. |
| [chevrolet-monza](https://sketchfab.com/3d-models/77d99ee2ecaf46738f79a747f6a68d04) | excluded | Only two dedicated wheel assemblies in reviewed geometry; scene also includes large surroundings. |
| [chevrolet-opala](https://sketchfab.com/3d-models/9a54b1a9aa9a4b7b92a2b35dda15297c) | excluded | Source combines multiple transformed cars; not a single validated four-wheel car. |
| [dodge-durango](https://sketchfab.com/3d-models/ff66f958267b479ebe8fd0780277bcba) | deferred | Mixed named materials require further wheel and caliper isolation; no final four-wheel validation. |
| [dodge-viper](https://sketchfab.com/3d-models/b4234b7970fa464faaecaf637acb0912) | deferred | Wheel materials include CSR2 names; upstream origin and complete tire isolation were not validated. |
| [ferrari-288-gto](https://sketchfab.com/3d-models/none-e83da098149746b5a3ba6f1661645b09) | deferred | Initial keyword filter matched the phrase Gran Turismo in the explanation of the GTO name. This is not evidence of game extraction; original license and geometry were not validated for this release. |
| [ferrari-portofino](https://sketchfab.com/3d-models/46631a0db29a437e95f36b45969d572e) | excluded | Single whole-car mesh cannot independently steer and spin the actual four wheels. |
| [fiat-palio](https://sketchfab.com/3d-models/8a3e71d4b4234110b59b09ef663e9448) | deferred | No reviewed separate tire/rim assemblies; vehicle-wide material partitions need additional extraction. |
| [fiat-tipo](https://sketchfab.com/3d-models/7de9eb68ea394345931041ffd6b656a5) | deferred | Diagonal/compound scene extents require additional orientation and assembly work. |
| [ford-ka](https://sketchfab.com/3d-models/d2b74e929d9745ea9d151f8e2b195b17) | excluded | Reviewed source contains one loose wheel at origin rather than four placed wheel assemblies. |
| [hyundai-santa-fe](https://sketchfab.com/3d-models/97dedc4d430b47b7b61333c052a45495) | excluded | Source description explicitly says model is taken from MinibusVietnamSimulator; game extraction provenance conflicts with uploader-only license. |
| [hyundai-veloster](https://sketchfab.com/3d-models/ab41362f67fe4904aaff7e62882b5aec) | excluded | Source description explicitly says model is from Asphalt7; game extraction provenance conflicts with uploader-only license. |
| [kia-carnival](https://sketchfab.com/3d-models/855c464351f244cbaafa8269a5d472df) | excluded | Source description says Imported form Omakss without original license/source link; uncertain third-party redistribution rights. |
| [kia-soul](https://sketchfab.com/3d-models/a29232f2dcba4424a8d62e5bf1474bc1) | excluded | One whole-car textured mesh includes body and tires with no separable reviewed wheel parts; cannot safely provide four independent steering/spin wheels. |
| [mitsubishi-lancer](https://sketchfab.com/3d-models/c3d5dcd8ff724bc88c46760d92fc5188) | excluded | Reupload links to original model whose license is CC BY-NC-SA and description says Based on a Real Racing 3 3D model. |
| [mitsubishi-outlander](https://sketchfab.com/3d-models/bc2dabd5a1454c9f967bdf680102352c) | excluded | Six whole-car textured material partitions, with no reviewed independent wheel assemblies. |
| [mitsubishi-pajero](https://sketchfab.com/3d-models/335c7377813a4ff682a3e5d7a676852a) | deferred | Mixed wheel/spare/scene geometry needs further isolation; no final adapter. |
| [nissan-200sx-silvia](https://sketchfab.com/3d-models/none-f2a917a924734a89a020e7f970e55e7c) | deferred | No final source-specific four-wheel adapter completed. |
| [nissan-march](https://sketchfab.com/3d-models/d59c474d37894f75bd74a7487215cce7) | excluded | Reviewed source contains one loose wheel at origin rather than four placed wheel assemblies. |
| [peugeot-208](https://sketchfab.com/3d-models/3d4a1578573645de9a2915e93b7edcf7) | deferred | Diagonal source pose; no completed neutral wheel extraction/orientation. |
| [peugeot-405](https://sketchfab.com/3d-models/b9b69099434c45bdb3265417dd720752) | excluded | Description prohibits redistributing the model as is, conflicting with the permissive API license field. |
| [suzuki-jimny](https://sketchfab.com/3d-models/64242f24c4bb43158cadafb616a1c979) | excluded | Single whole-car mesh in diagonal pose, with no separable reviewed wheels. |
| [volvo-xc90](https://sketchfab.com/3d-models/7520f0e2faa44b21aad13e553413c566) | excluded | Photogrammetry whole-car material partitions; no independent actual wheel assemblies. |
| [subaru-brz](https://sketchfab.com/3d-models/8fecd93279644ada9111c5bfa2226327) | excluded | About 100 mostly whole-car mixed material meshes; no clean reviewed wheel geometry. |
| [toyota-mr2-w20](https://sketchfab.com/3d-models/none-f66020ee62d741ebb0adc1ba351300db) | deferred | Diagonal display scene; no validated axis/steering adapter in this release. |
| [volkswagen-gol](https://sketchfab.com/3d-models/191d4905f1274cee8539a39a0a672fd9) | excluded | Catalog says Gol but original is Golf Mk1 tuning; BeamNG-style etk800/hatch/chassis material names require upstream verification. |
| [volvo-xc60](https://sketchfab.com/3d-models/c35ef02fd38b48adadc17f117a4a518c) | excluded | Source says Convert from Skp without the original model attribution/license. |

원본 Sketchfab에 CC BY로 표시되어도 설명에 게임 추출·별도 재배포 금지·불명확한 원본을 명시한 후보는 추가하지 않았다. Countach 모델의 바퀴 기여자는 원 제작자가 지목한 Lexyc16으로 별도 표시했고, 정확한 림 모델 링크가 없는 한 BBS LM 모델이라고 단정하지 않는다.
