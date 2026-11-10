# 서울 실제 지도 데이터와 타일 재생성

이 지도는 강남역 기준 **동서 10.24 km × 남북 10.24 km** 범위의 OpenStreetMap 도로·건물·수역·공원 데이터를 사용한다. 서울 전체나 무한한 실제 지도가 아니다. 제공 범위 밖을 가상의 도로망이나 건물로 채우지 않는다.

## 출처와 재현 가능성

- 원본: [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors.
- 지역 원본: [BBBike의 공개 서울 GeoJSON 추출본](https://download.bbbike.org/osm/bbbike/Seoul/). 원본 압축 파일·선별 원본의 SHA-256, 출처 주소, HTTP 파일 게시 시각은 `dist/assets/city/seoul/provenance.json`에 저장한다. BBBike는 OSM 도형을 Osmium으로 변환한다.
- 대체 수집: [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)의 공개 읽기 전용 질의 스크립트도 포함한다. 질의문·범위·원본 해시를 기록한다.
- 라이선스: [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). 가공된 JSON 지도도 이 출처와 라이선스를 따른다.
- 공개 서버에 플레이어마다 요청하지 않는다. 수집은 개발 시에만 수행하고, 배포본은 GitHub Pages에 포함한 정적 타일을 읽는다. [공유 Overpass 서버 사용 지침](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)에 따라 작은 범위의 요청을 순차 실행하고 완료 결과를 캐시한다.
- OSM은 공동 편집 지도다. 건물 외곽선과 도로 위치는 실제 지도 기록이지만 누락·수정 지연이 있을 수 있으며, 측량도나 건물 사진 기반 3D 스캔은 아니다.

## 범위와 좌표

원점은 기존 강남역 지도와 동일한 위도 `37.4979`, 경도 `127.0276`이다. 동쪽이 `+x`, 남쪽이 `+z`이며 좌표 단위는 미터다.

```text
x = (경도 - 127.0276) × 111320 × cos(37.4979°)
z = -(위도 - 37.4979) × 111320
```

월드 범위는 두 축 모두 `[-5120, 5120]`이다. 512 m 타일 20 × 20개로 나눈다. 타일 주소 `ix_iz`의 인덱스는 각각 `floor(x / 512)`, `floor(z / 512)`이며 `-10`부터 `9`까지다. 투영 좌표는 센티미터 단위로 반올림한다. 이 지역 투영은 기존 앱의 물리 좌표를 연결하기 위한 근사이며 정밀 측량용 좌표계는 아니다.

## 수집과 가공

공개 GeoJSON 압축 파일을 받은 뒤 저장소에서 다음을 실행한다. 인자는 로컬 `.xz` 파일과 다운로드 HTTP 메타데이터 JSON이다. `xz-decompress`는 개발 도구의 압축 해제 의존성이며 플레이 중에는 사용하지 않는다.

```powershell
npm ci
node scripts/import-seoul-geojson.mjs ../../data/seoul-source/Seoul.osm.geojson.xz ../../data/seoul-source/bbbike-download.json
node scripts/build-seoul-tiles.mjs
node --test tests/seoul-data.test.mjs
```

GeoJSON은 압축을 스트림으로 해제하고 개별 도형을 읽어 필요한 범위만 남긴다. 원본 전체를 브라우저에 전송하지 않는다. HTTP `Last-Modified`는 파일 게시 시각이며 OSM 복제 스냅샷 시각과 같다고 단정하지 않는다. 정확한 스냅샷 시각이 없으면 `sourceTimestamp`는 `null`이고 게시 시각은 별도로 기록한다.

Overpass로 원본을 다시 받고 싶다면 가져오기 대신 `node scripts/fetch-seoul.mjs`를 실행한다. 기본 서버가 응답하지 않을 때는 공식 문서의 대체 공개 서버를 `OSM_OVERPASS_ENDPOINT`로 지정할 수 있다. 원본 저장 위치는 `SEOUL_SOURCE_DIR`로 변경하며 기본 위치는 저장소 밖 `../../data/seoul-source`다. 캐시를 무시하려면 `--force`를 추가한다.

수집 범위는 5.12 km × 5.12 km 사분면 4개로 나눈다. 공개 서버가 큰 요청을 완료하지 못하면 해당 사분면을 2.56 km 단위로 나눠 순차 요청한다. 완료된 구역은 원본과 다운로드 기록을 각각 저장한다. 중간 요청에 실패하면 다시 실행할 때 이미 받은 구역을 재사용한다. 합칠 때 `OSM 요소 유형/ID`로 중복을 제거한다. 서로 다른 구역의 기준 시각은 provenance의 `sourceTimestampRange`와 `sources`에 기록한다.

수집 대상은 차량용 도로, 건물 외곽선, 건물 multipolygon, 물·숲·초지·공원 외곽선이다. multipolygon의 외곽 및 안쪽 링을 연결하고 닫히지 않은 도형은 추측으로 메우지 않고 누락 수를 기록한다. 미지의 도로나 건물 외곽선을 새로 만들지 않는다.

## 파일 형식과 연결 원칙

`manifest.json`은 `origin`, `tileSize`, `bounds`, `bbox`, 출처, 데이터 개수, 각 타일의 상대 URL·바이트 수·SHA-256을 담는다. 타일 파일은 `tiles/ix_iz.json`이다.

각 타일은 다음 배열을 포함한다.

| 필드 | 내용과 타일 경계 처리 |
| --- | --- |
| `roads` | 해당 타일과 교차하는 OSM 도로의 전체 폴리라인. 이웃 타일도 같은 원본 좌표를 사용하고 렌더러가 타일 경계에서 자른다. |
| `buildings` | 도형 중심점이 이 타일에 속하는 건물. 외곽선 전체를 보존하고 한 번만 렌더링한다. |
| `contextBuildings` | 다른 타일 또는 기존 중심 지역이 소유한 건물 외곽선. 나무가 건물 안에 생기지 않도록 검사할 때 사용한다. |
| `water` | 실제 수역 외곽선과 섬 등의 안쪽 링. 큰 한강 도형을 매번 전송하지 않도록 타일 경계에서 미리 자른다. |
| `landuse` | 실제 공원·숲·초지 외곽선. 수역과 같이 타일 경계에서 미리 자른다. |

타일의 `buildingsOwned: true`는 이미 소유권을 정했다는 뜻이다. `points`는 원점 기준 월드 좌표다. `holes`는 빈 안쪽 영역을 나타내는 링 배열이다. 도로는 `bridge`, `tunnel`, `layer`, `surface`, `access`, `motorVehicle`, `lanes`, `width`, `onewayDirection`, `maxspeed`를 보존한다. 지하도와 교량을 지상 사거리로 합쳐서는 안 된다.

BBBike GeoJSON은 원래 OSM ID를 제공하지 않는다. 해당 도형의 `osmId`·`osmType`은 `null`로 두고, `providerFeatureId`에 `bbbike:`와 정규화한 좌표·태그의 SHA-256을 저장한다. `sourceFeatureOrdinal`은 원본 FeatureCollection의 1부터 시작하는 순번이며 `sourceUrl`과 함께 추적에 사용한다. 이 해시는 공급자 도형 식별용이고 OSM ID가 아니다. 도로의 정방향·역방향, 건물 링의 시작점·회전 방향을 정규화해 기존 중심 지도와 센티미터 단위 좌표가 정확히 일치하는 경우에만 알려진 중심 지도의 OSM ID를 유지한다. `identitySource`가 이 일치를 표시한다.

기존 `gangnam.json` 중심 영역에 도형 중심점이 있거나 기존 중심 렌더러의 건물 외곽선과 정확히 일치하는 건물은 새 타일에서 제외한다. 기존 중심 지도에 수록되어 있어도 중심 렌더러가 그리지 않던 외곽 건물은 새 타일에서 소유한다. 도로의 중복 표시는 런타임에서 정확한 중심 영역 경계를 기준으로 제거한다.

미러 서버의 지역 스냅샷이 기존 중심 지도보다 오래될 수 있다. 같은 OSM ID의 도로는 기존 `gangnam.json`의 전체 폴리라인·폭·차로 수를 우선하여 중심 영역 안팎에서 일치시키고, 넓은 지역 자료에 있는 교량·터널·층 메타데이터는 함께 보존한다. 중심 지도에만 있는 도로도 실제 OSM ID와 원래 좌표로 포함한다. `sourceTimestamps`에 지역 자료와 중심 자료의 기준 시각을 따로 기록한다. 이 규칙은 두 자료의 접합부를 유지하기 위한 것으로, 전체 서울 자료가 중심 지도와 같은 날짜라는 뜻이 아니다.

## 실제 정보와 시각화 가정

도로 중심선·건물 외곽선·수역·공원 경계는 OSM 기록이다. 태그에 없는 건물 높이, 창문 배치, 외벽 재질은 렌더러의 가정이며 개별 실제 건물과 일치한다고 주장하지 않는다. 지형 고도, 모든 도로의 종단 경사, 개별 가로수 위치, 건물 내부 및 정밀 교량 구조는 이 원본에 포함되어 있지 않다. 식물의 잎과 수관은 시각화 모델이며 개별 서울 나무를 실측 복제한 것은 아니다.

검증 테스트는 전체 타일의 해시와 연속 범위, 건물 소유권 중복, 출처 ID, 이웃 타일의 도로 원본 일치, 경계 연결, 과도한 단일 타일 크기를 확인한다. 프레임 속도와 GPU 업로드는 별도의 브라우저 실행 검증으로 측정해야 한다.
