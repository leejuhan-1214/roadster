// City-driving replicas. Rounded class assumptions; excluded from the five-car landing cohort.
// Sources, license snapshots and runtime adaptations: assets/vehicles/city-fleet-provenance.json.
export const CITY_VEHICLES = [
  {
    "id": "nissan-versa",
    "title": "Nissan Versa 1.8 SL (2010)",
    "short": "Versa",
    "brand": "Nissan",
    "model": "[FREE] Nissan Versa 1.8 SL 2010",
    "cityOnly": true,
    "author": "Velrifea",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/3745e5e9b3ef4bacb1a9476b5f15c2c6",
    "url": "../assets/vehicles/nissan-versa.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Plane069_Material022_0",
        "Plane064_Material022_0",
        "Plane066_Material022_0",
        "Plane068_Material022_0",
        "Plane047_Material037_0",
        "Plane065_Material037_0",
        "Plane067_Material037_0",
        "Plane070_Material037_0"
      ],
      "tireNames": [
        "Plane069_Material022_0",
        "Plane064_Material022_0",
        "Plane066_Material022_0",
        "Plane068_Material022_0"
      ],
      "splitX": -0.004434622950853839,
      "splitZ": 8.673617379884035e-19
    },
    "paintMaterials": [
      "Material.003"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.4123,
    "width": 2.0083,
    "height": 1.6588,
    "wheelbase": 2.6,
    "referenceMass": 1200,
    "rigMass": 150,
    "dryMass": 1350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "volkswagen-beetle",
    "title": "1963 Volkswagen Beetle",
    "short": "Beetle",
    "brand": "Volkswagen",
    "model": "1963 Volkswagen Beetle",
    "cityOnly": true,
    "author": "aleksey.matveenko",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-f03e5ba5e81b4562958645fe27565f3a",
    "url": "../assets/vehicles/volkswagen-beetle.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^wheel_lp[1-4]_",
      "tirePattern": "^wheel_lp[1-4]_",
      "splitX": 1.981302284810937,
      "splitZ": 0.01312637329105848
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.3539,
    "width": 1.5642,
    "height": 1.9462,
    "wheelbase": 2.4,
    "referenceMass": 900,
    "rigMass": 150,
    "dryMass": 1050,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "nissan-silvia-s13",
    "title": "1992 Nissan Silvia S13",
    "short": "Silvia S13",
    "brand": "Nissan",
    "model": "1992 Nissan Silvia S13",
    "cityOnly": true,
    "author": "bagged_ls",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-6fa8f1948f954e3b980b5e96f203815a",
    "url": "../assets/vehicles/nissan-silvia-s13.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_47",
        "Object_49",
        "Object_50",
        "Object_51",
        "Object_53",
        "Object_54",
        "Object_55",
        "Object_57",
        "Object_59",
        "Object_61",
        "Object_64",
        "Object_66",
        "Object_67",
        "Object_68",
        "Object_70",
        "Object_71",
        "Object_72",
        "Object_74",
        "Object_76",
        "Object_78",
        "Object_81",
        "Object_83",
        "Object_84",
        "Object_85",
        "Object_87",
        "Object_88",
        "Object_89",
        "Object_91",
        "Object_93",
        "Object_95",
        "Object_98",
        "Object_100",
        "Object_101",
        "Object_102",
        "Object_104",
        "Object_105",
        "Object_106",
        "Object_108",
        "Object_110",
        "Object_112"
      ],
      "tireNames": [
        "Object_61",
        "Object_78",
        "Object_95",
        "Object_112"
      ],
      "brakeNames": [
        "Object_47",
        "Object_64",
        "Object_81",
        "Object_98"
      ],
      "splitX": -0.05975981668844299,
      "splitZ": -6.938893903907228e-18
    },
    "paintMaterials": [
      "CarPaint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5885,
    "width": 1.8926,
    "height": 1.2763,
    "wheelbase": 2.475,
    "referenceMass": 1200,
    "rigMass": 150,
    "dryMass": 1350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "volvo-v40",
    "title": "1995 Volvo V40 Touring",
    "short": "V40",
    "brand": "Volvo",
    "model": "1995 Volvo V40 Touring",
    "cityOnly": true,
    "author": "tonielpro520",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/6e53093cad6b462ca3fd5366c8743c67",
    "url": "../assets/vehicles/volvo-v40.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_2",
        "Object_5"
      ],
      "tireNames": [
        "Object_5"
      ],
      "splitX": 1.51012510061264,
      "splitZ": -0.5419420003890996
    },
    "paintMaterials": [
      "DimGray"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5557,
    "width": 1.8877,
    "height": 1.4319,
    "wheelbase": 2.55,
    "referenceMass": 1300,
    "rigMass": 150,
    "dryMass": 1450,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "nissan-tiida",
    "title": "2011 Nissan Tiida Hatchback",
    "short": "Tiida",
    "brand": "Nissan",
    "model": "2011 Nissan Tiida Hatchback",
    "cityOnly": true,
    "author": "Jean Wally's™",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/c5967683515b415583e871b290c6f5b8",
    "url": "../assets/vehicles/nissan-tiida.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_11",
        "Object_23",
        "Object_26",
        "Object_41"
      ],
      "tireNames": [
        "Object_11"
      ],
      "brakeNames": [
        "Object_26"
      ],
      "splitX": 0.0005468749877763912,
      "splitZ": 1.0842021724855044e-19
    },
    "paintMaterials": [
      "carpaint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.3872,
    "width": 1.9496,
    "height": 1.5939,
    "wheelbase": 2.6,
    "referenceMass": 1200,
    "rigMass": 150,
    "dryMass": 1350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "toyota-yaris",
    "title": "2020 Toyota GR Yaris",
    "short": "Yaris",
    "brand": "Toyota",
    "model": "2020 Toyota GR Yaris",
    "cityOnly": true,
    "author": "DisneyCars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/44cb958908b94aa5aad0d856994f35a3",
    "url": "../assets/vehicles/toyota-yaris.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_9"
      ],
      "tireNames": [
        "Object_9"
      ],
      "splitX": 38.33475017547606,
      "splitZ": -74.98061767306811
    },
    "paintMaterials": [
      "Intbodyunrefunblendbodyunrefunblend1Mtl"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2043,
    "width": 1.9774,
    "height": 1.4254,
    "wheelbase": 2.56,
    "referenceMass": 1300,
    "rigMass": 150,
    "dryMass": 1450,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "alfa-romeo-4c",
    "title": "Alfa Romeo 4C",
    "short": "4C",
    "brand": "Alfa Romeo",
    "model": "4C",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/93da1386a94744c5bd8a676a09f9d4e9",
    "url": "../assets/vehicles/alfa-romeo-4c.glb",
    "yaw": 0,
    "adapter": {
      "wheelNames": [
        "Object_3",
        "Object_6",
        "Object_13",
        "Object_14",
        "Object_15",
        "Object_16"
      ],
      "tireNames": [
        "Object_14",
        "Object_15"
      ],
      "brakeNames": [
        "Object_3"
      ],
      "fixedWheelNames": [
        "Object_13"
      ],
      "splitX": -0.000059485435485839844,
      "splitZ": 0
    },
    "paintMaterials": [
      "CAR_BODY_PAINT"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.1432,
    "width": 2.0659,
    "height": 1.2124,
    "wheelbase": 2.4,
    "referenceMass": 1000,
    "rigMass": 150,
    "dryMass": 1150,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "aston-martin-db11",
    "title": "Aston Martin DB11",
    "short": "DB11",
    "brand": "Aston Martin",
    "model": "DB11",
    "cityOnly": true,
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/0ce56f01b1ff40b3a4e36bc56873dbc7",
    "url": "../assets/vehicles/aston-martin-db11.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^amdb11_wheel_03",
      "tirePattern": "^amdb11_wheel_03.*black_ext",
      "splitX": -0.18310202004554044,
      "splitZ": 0.000468015660315374
    },
    "paintMaterials": [
      "amdb11_grey"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.7868,
    "width": 2.1438,
    "height": 1.2201,
    "wheelbase": 2.8,
    "referenceMass": 1800,
    "rigMass": 150,
    "dryMass": 1950,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "audi-a1",
    "title": "Audi A1 Clubsport Quattro",
    "short": "A1",
    "brand": "Audi",
    "model": "A1 Clubsport Quattro",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/3f582a018306464ea501aaaec29efd2c",
    "url": "../assets/vehicles/audi-a1.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Material2_8",
        "Material2_9",
        "Material3_18",
        "Material3_19"
      ],
      "tireNames": [
        "Material2_8"
      ],
      "splitX": -80.93055737018585,
      "splitZ": -39.65064156055452
    },
    "paintMaterials": [
      "body1"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.1751,
    "width": 1.9544,
    "height": 1.452,
    "wheelbase": 2.5,
    "referenceMass": 1250,
    "rigMass": 150,
    "dryMass": 1400,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "audi-a3",
    "title": "Audi A3 3.2 Quattro 8P",
    "short": "A3",
    "brand": "Audi",
    "model": "A3 3.2 Quattro 8P",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/070e6a27527a433baae83f55a40df536",
    "url": "../assets/vehicles/audi-a3.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_51",
        "Object_52",
        "Object_53",
        "Object_54"
      ],
      "tireNames": [
        "Object_53"
      ],
      "splitX": -0.06705999374389604,
      "splitZ": -2.3592239273284576e-16
    },
    "paintMaterials": [
      "Material__392"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.337,
    "width": 1.9667,
    "height": 1.4248,
    "wheelbase": 2.6,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "audi-q3",
    "title": "Audi Q3 Sportback",
    "short": "Q3",
    "brand": "Audi",
    "model": "Q3 Sportback",
    "cityOnly": true,
    "author": "3DCars4U",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/a0159b9bee094c2d8f9b9d5694c94f45",
    "url": "../assets/vehicles/audi-q3.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelPattern": "^desirefxme_008_",
      "tirePattern": "^desirefxme_008_Rubber_Rough",
      "brakePattern": "^desirefxme_008_Red_Light",
      "splitX": 0.07505475000168937,
      "splitZ": -0.01380414695913034
    },
    "paintMaterials": [
      "Carpaint_Pearl_Orange"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5901,
    "width": 2.0437,
    "height": 1.5965,
    "wheelbase": 2.7,
    "referenceMass": 1650,
    "rigMass": 150,
    "dryMass": 1800,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "audi-q7",
    "title": "Audi Q7 (2015)",
    "short": "Q7",
    "brand": "Audi",
    "model": "Q7 (2015)",
    "cityOnly": true,
    "author": "razor24",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/65917c52e0b24f1289126128600ed7aa",
    "url": "../assets/vehicles/audi-q7.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^q7-15_(FR|BR|BL|FL)_wheel",
      "tirePattern": "^q7-15_(FR|BR|BL|FL)_wheel_wheel_rubber",
      "brakePattern": "^q7-15_(FR|BR|BL|FL)_wheel_brakes",
      "splitX": 14.149681046119921,
      "splitZ": 0.0542831420898473
    },
    "paintMaterials": [
      "varnish"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.1669,
    "width": 2.2499,
    "height": 1.7518,
    "wheelbase": 3,
    "referenceMass": 2100,
    "rigMass": 150,
    "dryMass": 2250,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "audi-tt",
    "title": "Audi TT Convertible (2015)",
    "short": "TT",
    "brand": "Audi",
    "model": "TT Convertible (2015)",
    "cityOnly": true,
    "author": "razor24",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/80cc29628e1b407d8e14d5ae0710f6fe",
    "url": "../assets/vehicles/audi-tt.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^tt_cc15_(FR|BR|BL|FL)_wheel",
      "tirePattern": "^tt_cc15_(FR|BR|BL|FL)_wheel_wheel_rubber",
      "brakePattern": "^tt_cc15_(FR|BR|BL|FL)_wheel_brakes",
      "splitX": -7.291961750395728,
      "splitZ": -8.881784197001252e-16
    },
    "paintMaterials": [
      "metal"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2619,
    "width": 1.9764,
    "height": 1.3237,
    "wheelbase": 2.5,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "bmw-320i",
    "title": "BMW 320i E90",
    "short": "320i",
    "brand": "BMW",
    "model": "320i E90",
    "cityOnly": true,
    "author": "rifdanzz",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/28f0bc2f0083417a8e521150529034d6",
    "url": "../assets/vehicles/bmw-320i.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^Circle00[2345]_",
      "tirePattern": "^Circle00[2345]_Material001",
      "splitX": -12.329359060600297,
      "splitZ": -1.7763568394002505e-15
    },
    "paintMaterials": [
      "material_0"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.8001,
    "width": 2.0278,
    "height": 1.4379,
    "wheelbase": 2.8,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "bmw-e34",
    "title": "BMW 5 Series E34",
    "short": "E34",
    "brand": "BMW",
    "model": "5 Series E34",
    "cityOnly": true,
    "author": "Myedsu",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/ffe1a3a1bcb34e0bb80f1aa41c9edb46",
    "url": "../assets/vehicles/bmw-e34.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(wheel|brake)_(FL|FR|RL|RR)",
      "tirePattern": "^wheel_(FL|FR|RL|RR)_tire",
      "brakePattern": "^brake_(FL|FR|RL|RR)_disk_brake_tr",
      "splitX": -0.12297525969079248,
      "splitZ": -0.012290686094223985
    },
    "paintMaterials": [
      "body_paint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.0046,
    "width": 1.8769,
    "height": 1.4183,
    "wheelbase": 2.8,
    "referenceMass": 1550,
    "rigMass": 150,
    "dryMass": 1700,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD",
    "contributors": [
      {
        "author": "Lexyc16",
        "title": "BBS LM",
        "source": "https://sketchfab.com/3d-models/bbs-lm-93fbcf56ebab4be99f00b8b1246b6010",
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/"
      }
    ]
  },
  {
    "id": "bmw-e39",
    "title": "BMW 5 Series E39",
    "short": "E39",
    "brand": "BMW",
    "model": "5 Series E39",
    "cityOnly": true,
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-531a5a93da5d493d9918eb36f011c20d",
    "url": "../assets/vehicles/bmw-e39.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^Object_(3900[1345]|400[1234]|2400[1234])_",
      "tirePattern": "^Object_3900[1345]_tire",
      "brakePattern": "texture_2_suports",
      "splitX": -0.013137767403910594,
      "splitZ": -0.0027846693370192615
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.0321,
    "width": 2.0106,
    "height": 1.4396,
    "wheelbase": 2.85,
    "referenceMass": 1600,
    "rigMass": 150,
    "dryMass": 1750,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "bmw-x6",
    "title": "BMW X6 M Competition",
    "short": "X6",
    "brand": "BMW",
    "model": "X6 M Competition",
    "cityOnly": true,
    "author": "SharkyStudios",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/dbc45a151624413aac9a378b570ddd02",
    "url": "../assets/vehicles/bmw-x6.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelPattern": "^Cube00[2345]_",
      "tirePattern": "^Cube00[2345]_Material006",
      "splitX": -0.008875474687011336,
      "splitZ": -6.303284097029794
    },
    "paintMaterials": [
      "Material.001"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.1261,
    "width": 2.256,
    "height": 1.7592,
    "wheelbase": 3,
    "referenceMass": 2200,
    "rigMass": 150,
    "dryMass": 2350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "chevrolet-camaro",
    "title": "Chevrolet Camaro (1970)",
    "short": "Camaro",
    "brand": "Chevrolet",
    "model": "Camaro (1970)",
    "cityOnly": true,
    "author": "DisneyCars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/789b0af67d994306b967facf75ab2e01",
    "url": "../assets/vehicles/chevrolet-camaro.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_8",
        "Object_9",
        "Object_10",
        "Object_11"
      ],
      "tireNames": [
        "Object_9",
        "Object_10"
      ],
      "splitX": -56.32829856872557,
      "splitZ": -53.328775914663375
    },
    "paintMaterials": [
      "Meshpart1Mtl"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.7417,
    "width": 1.9179,
    "height": 1.3322,
    "wheelbase": 2.75,
    "referenceMass": 1550,
    "rigMass": 150,
    "dryMass": 1700,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "chevrolet-onix",
    "title": "Chevrolet Onix",
    "short": "Onix",
    "brand": "Chevrolet",
    "model": "Onix",
    "cityOnly": true,
    "author": "uzb_rx7",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/bfd798c2695847b28ab681d42abc7056",
    "url": "../assets/vehicles/chevrolet-onix.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^wheel(00[123])?_wheel",
      "tireNames": [
        "wheel_wheel2_0",
        "wheel001_wheel006_0",
        "wheel002_wheel010_0",
        "wheel003_wheel014_0"
      ],
      "splitX": -0.023009791331103147,
      "splitZ": -0.0002034115558311421
    },
    "paintMaterials": [
      "primary"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6813,
    "width": 2.0619,
    "height": 1.7053,
    "wheelbase": 2.6,
    "referenceMass": 1150,
    "rigMass": 150,
    "dryMass": 1300,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "chrysler-pt-cruiser",
    "title": "Chrysler PT Cruiser",
    "short": "PT Cruiser",
    "brand": "Chrysler",
    "model": "PT Cruiser",
    "cityOnly": true,
    "author": "Doz3",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/c1852ad519a84f638665e4b535db643e",
    "url": "../assets/vehicles/chrysler-pt-cruiser.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_10",
        "Object_11"
      ],
      "tireNames": [
        "Object_11"
      ],
      "splitX": 0.2824287414550781,
      "splitZ": 0.021763563156127874
    },
    "paintMaterials": [
      "Paint1Mtl.001"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.192,
    "width": 1.8511,
    "height": 1.61,
    "wheelbase": 2.6,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "dodge-challenger",
    "title": "Dodge Challenger SRT",
    "short": "Challenger",
    "brand": "Dodge",
    "model": "Challenger SRT",
    "cityOnly": true,
    "author": "SDC PERFORMANCE™️",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/38a1fd572beb433fa2d26d8c1070c8fa",
    "url": "../assets/vehicles/dodge-challenger.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_41",
        "Object_42",
        "Object_43",
        "Object_44",
        "Object_45",
        "Object_46",
        "Object_47"
      ],
      "tireNames": [
        "Object_42"
      ],
      "brakeNames": [
        "Object_44"
      ],
      "splitX": -3.0542051332460574e-8,
      "splitZ": -6.617444900424222e-24
    },
    "paintMaterials": [
      "visse.001"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.1379,
    "width": 2.1342,
    "height": 1.4164,
    "wheelbase": 2.95,
    "referenceMass": 1850,
    "rigMass": 150,
    "dryMass": 2000,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "ferrari-f40",
    "title": "Ferrari F40",
    "short": "F40",
    "brand": "Ferrari",
    "model": "F40",
    "cityOnly": true,
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-52a66c41cfcd4f999fb1b1c49bf24d70",
    "url": "../assets/vehicles/ferrari-f40.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_11",
        "Object_30",
        "Object_31",
        "Object_37",
        "Object_38",
        "Object_39",
        "Object_40"
      ],
      "tireNames": [
        "Object_37",
        "Object_38",
        "Object_39",
        "Object_40"
      ],
      "brakeNames": [
        "Object_11"
      ],
      "splitX": 0.10885906219482422,
      "splitZ": -0.00024002790451048417
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.572,
    "width": 2.0495,
    "height": 1.1371,
    "wheelbase": 2.45,
    "referenceMass": 1250,
    "rigMass": 150,
    "dryMass": 1400,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "fiat-uno",
    "title": "Fiat Uno Turbo i.e.",
    "short": "Uno",
    "brand": "Fiat",
    "model": "Uno Turbo i.e.",
    "cityOnly": true,
    "author": "subishi",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/f5e38b26c0af4ef2ab2f4c4b2e5aad5c",
    "url": "../assets/vehicles/fiat-uno.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(aros?_dianteiro|aro_traseiros|parafusos_(dianteiro|traseiros)|pneus_)",
      "tirePattern": "^pneus_",
      "splitX": 0.2841459489086773,
      "splitZ": 0.000011533498506521855
    },
    "paintMaterials": [
      "Scene_-_Root"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.8272,
    "width": 1.7899,
    "height": 1.4336,
    "wheelbase": 2.35,
    "referenceMass": 950,
    "rigMass": 150,
    "dryMass": 1100,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "ford-escort",
    "title": "Ford Escort XR3",
    "short": "Escort",
    "brand": "Ford",
    "model": "Escort XR3",
    "cityOnly": true,
    "author": "Ezo",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/69eb711566834234b5dfbde3c6d4ee0a",
    "url": "../assets/vehicles/ford-escort.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_55",
        "Object_56",
        "Object_57",
        "Object_59",
        "Object_60",
        "Object_61"
      ],
      "tireNames": [
        "Object_56",
        "Object_60"
      ],
      "splitX": -0.026110347419832532,
      "splitZ": 0.0001003628535709497
    },
    "paintMaterials": [
      "material"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2739,
    "width": 1.8645,
    "height": 1.5282,
    "wheelbase": 2.4,
    "referenceMass": 1100,
    "rigMass": 150,
    "dryMass": 1250,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "ford-fiesta",
    "title": "Ford Fiesta",
    "short": "Fiesta",
    "brand": "Ford",
    "model": "Fiesta",
    "cityOnly": true,
    "author": "シRuletăシ",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/f3a9d5d1fc9142d297f8d3c4d9b91431",
    "url": "../assets/vehicles/ford-fiesta.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "WHEEL_teker005_0",
        "FR_teker0_0",
        "RL_teker006_0",
        "wheel_teker004_0"
      ],
      "tireNames": [
        "WHEEL_teker005_0",
        "FR_teker0_0",
        "RL_teker006_0",
        "wheel_teker004_0"
      ],
      "splitX": 0.2162891083118077,
      "splitZ": -0.014927143195727383
    },
    "paintMaterials": [
      "primary"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2124,
    "width": 1.948,
    "height": 1.4854,
    "wheelbase": 2.5,
    "referenceMass": 1200,
    "rigMass": 150,
    "dryMass": 1350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "ford-focus",
    "title": "Ford Focus Sedan",
    "short": "Focus",
    "brand": "Ford",
    "model": "Focus Sedan",
    "cityOnly": true,
    "author": "Luquita",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/ed2e9355b8a64e6a8700973df1a5b8f0",
    "url": "../assets/vehicles/ford-focus.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(TIRE_|WHEEL_|RIMLO)",
      "tirePattern": "^TIRE_",
      "splitX": -1.0598377997439455e-7,
      "splitZ": -8.957402541920346e-8
    },
    "paintMaterials": [
      "bluteal"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.4869,
    "width": 1.9733,
    "height": 1.5234,
    "wheelbase": 2.6,
    "referenceMass": 1350,
    "rigMass": 150,
    "dryMass": 1500,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "honda-city",
    "title": "Honda City (2017)",
    "short": "City",
    "brand": "Honda",
    "model": "City (2017)",
    "cityOnly": true,
    "author": "dewa",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/75671276d4da476294202a5dc050a99e",
    "url": "../assets/vehicles/honda-city.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "tyre_ban_Material_0"
      ],
      "tireNames": [
        "tyre_ban_Material_0"
      ],
      "excludeNames": [
        "shadow_shadow_1Material_0"
      ],
      "splitX": -1.7455539151912944,
      "splitZ": 0.18125720082150543
    },
    "paintMaterials": [
      "Body"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.4109,
    "width": 1.812,
    "height": 1.4434,
    "wheelbase": 2.6,
    "referenceMass": 1150,
    "rigMass": 150,
    "dryMass": 1300,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "honda-civic",
    "title": "Honda Civic EG6 (1991)",
    "short": "Civic",
    "brand": "Honda",
    "model": "Civic EG6 (1991)",
    "cityOnly": true,
    "author": "rifdanzz",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/f81da34570b145deb463fa091604d251",
    "url": "../assets/vehicles/honda-civic.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Circle_Material005_0",
        "Circle_velg_0",
        "Circle001_Material005_0",
        "Circle001_velg_0",
        "Circle002_Material005_0",
        "Circle002_velg_0",
        "Circle003_Material005_0",
        "Circle003_velg_0"
      ],
      "tireNames": [
        "Circle_Material005_0",
        "Circle001_Material005_0",
        "Circle002_Material005_0",
        "Circle003_Material005_0"
      ],
      "splitX": -3.4683271015972537,
      "splitZ": -0.6575931310653691
    },
    "paintMaterials": [
      "Car_Paint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.1551,
    "width": 1.7949,
    "height": 1.3231,
    "wheelbase": 2.57,
    "referenceMass": 1050,
    "rigMass": 150,
    "dryMass": 1200,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "honda-cr-v",
    "title": "Honda CR-V (2025)",
    "short": "CR-V",
    "brand": "Honda",
    "model": "CR-V (2025)",
    "cityOnly": true,
    "author": "Palma123 JAAT",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/91c6673859444597bf006a0ef8570005",
    "url": "../assets/vehicles/honda-cr-v.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "rim001_Material005_0",
        "turbo-type_chromeRimTurbo_0",
        "turbo-type007_blackRim_0",
        "tyre001_Tyre001_0",
        "tyre002_Tyre003_0",
        "tyre003_Tyre004_0"
      ],
      "tireNames": [
        "tyre001_Tyre001_0"
      ],
      "brakeNames": [
        "tyre003_Tyre004_0"
      ],
      "splitX": -0.00172694227985426,
      "splitZ": 0.00002495222669196529
    },
    "paintMaterials": [
      "blackRim"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6519,
    "width": 2.0372,
    "height": 1.6771,
    "wheelbase": 2.7,
    "referenceMass": 1750,
    "rigMass": 150,
    "dryMass": 1900,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "hyundai-azera",
    "title": "Hyundai Azera (2009)",
    "short": "Azera",
    "brand": "Hyundai",
    "model": "Azera (2009)",
    "cityOnly": true,
    "author": "Nieve5677",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/711b67ea05f9441a863dce4badaca660",
    "url": "../assets/vehicles/hyundai-azera.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_5",
        "Object_6",
        "Object_7",
        "Object_8",
        "Object_9",
        "Object_10",
        "Object_11",
        "Object_12",
        "Object_72",
        "Object_73",
        "Object_74",
        "Object_75",
        "Object_76",
        "Object_77",
        "Object_78",
        "Object_79"
      ],
      "tireNames": [
        "Object_76",
        "Object_77",
        "Object_78",
        "Object_79"
      ],
      "brakeNames": [
        "Object_7",
        "Object_8",
        "Object_11",
        "Object_12"
      ],
      "splitX": 5.917596552134555,
      "splitZ": 0.18413203416987134
    },
    "paintMaterials": [
      "tail"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.2124,
    "width": 2.1698,
    "height": 1.5275,
    "wheelbase": 2.845,
    "referenceMass": 1650,
    "rigMass": 150,
    "dryMass": 1800,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "hyundai-i30",
    "title": "Hyundai i30 FD (2011)",
    "short": "i30",
    "brand": "Hyundai",
    "model": "i30 FD (2011)",
    "cityOnly": true,
    "author": "D3NK",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/036a13aefc3f48c5ba996aa2361b429e",
    "url": "../assets/vehicles/hyundai-i30.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Material3_45",
        "Material3_46",
        "Material2_19",
        "Material2_20",
        "Material3_49"
      ],
      "tireNames": [
        "Material3_45",
        "Material3_46"
      ],
      "splitX": 962237.3437499995,
      "splitZ": 2806631.6283088746
    },
    "paintMaterials": [
      "black_1"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5264,
    "width": 1.9403,
    "height": 1.4403,
    "wheelbase": 2.65,
    "referenceMass": 1350,
    "rigMass": 150,
    "dryMass": 1500,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "hyundai-tucson",
    "title": "Hyundai Tucson (2015)",
    "short": "Tucson",
    "brand": "Hyundai",
    "model": "Tucson (2015)",
    "cityOnly": true,
    "author": "razor24",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/7674a3bd168a451daf73fc0a33d39589",
    "url": "../assets/vehicles/hyundai-tucson.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^tucson-15_(FR|BR|BL|FL)_wheel",
      "tirePattern": "^tucson-15_(FR|BR|BL|FL)_wheel_wheel_rubber",
      "brakePattern": "^tucson-15_(FR|BR|BL|FL)_wheel_brakes",
      "splitX": 0.37670674046428587,
      "splitZ": 5.551115123125783e-17
    },
    "paintMaterials": [
      "varnish"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6827,
    "width": 2.1005,
    "height": 1.6772,
    "wheelbase": 2.7,
    "referenceMass": 1650,
    "rigMass": 150,
    "dryMass": 1800,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "kia-picanto",
    "title": "Kia Picanto Morning GT-Line",
    "short": "Picanto",
    "brand": "Kia",
    "model": "Picanto Morning GT-Line",
    "cityOnly": true,
    "author": "Nieve5677",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/b4fd928f3e814ef29900c706bccc344d",
    "url": "../assets/vehicles/kia-picanto.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_11",
        "Object_12",
        "Object_13",
        "Object_37",
        "Object_38",
        "Object_39",
        "Object_40",
        "Object_41",
        "Object_42"
      ],
      "tireNames": [
        "Object_42"
      ],
      "brakeNames": [
        "Object_13"
      ],
      "splitX": -2.056747568771243,
      "splitZ": -1.0867352721499302
    },
    "paintMaterials": [
      "2021_Kia_Picanto_GT-Line_Titanium_Grey"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.7557,
    "width": 1.9039,
    "height": 1.4966,
    "wheelbase": 2.4,
    "referenceMass": 1050,
    "rigMass": 150,
    "dryMass": 1200,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "kia-sportage",
    "title": "Kia Sportage",
    "short": "Sportage",
    "brand": "Kia",
    "model": "Sportage",
    "cityOnly": true,
    "author": "xnova360",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/212016fe1b8b47fda3d0c30e1a22af2f",
    "url": "../assets/vehicles/kia-sportage.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelNames": [
        "CAR_Bestune_B70_mat_74_0",
        "CAR_Bestune_B70_mat_74_0_1"
      ],
      "tireNames": [
        "CAR_Bestune_B70_mat_74_0",
        "CAR_Bestune_B70_mat_74_0_1"
      ],
      "splitX": 0.06818488955616651,
      "splitZ": 0.08716313193741022
    },
    "paintMaterials": [
      "Bestune_B70_mat_74"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5576,
    "width": 2.1233,
    "height": 1.6327,
    "wheelbase": 2.67,
    "referenceMass": 1650,
    "rigMass": 150,
    "dryMass": 1800,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "lamborghini-countach-lp500s",
    "title": "Lamborghini Countach LP500S",
    "short": "Countach Lp500s",
    "brand": "Lamborghini",
    "model": "Countach LP500S",
    "cityOnly": true,
    "author": "SDC PERFORMANCE™️ / rims: Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-32e9ee8d129e4c2992e1753b4fc3094c",
    "url": "../assets/vehicles/lamborghini-countach-lp500s.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_26",
        "Object_27",
        "Object_28",
        "Object_29",
        "Object_30"
      ],
      "tireNames": [
        "Object_29"
      ],
      "splitX": -0.10020268535709587,
      "splitZ": 1.3877787807814457e-17
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2567,
    "width": 1.9514,
    "height": 1.0655,
    "wheelbase": 2.45,
    "referenceMass": 1490,
    "rigMass": 150,
    "dryMass": 1640,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD",
    "contributors": [
      {
        "author": "Lexyc16",
        "title": "Wheel rims",
        "source": "https://sketchfab.com/Lexyc16",
        "note": "The Countach publisher names Lexyc16 as the rim contributor but does not identify a particular rim asset; this is an author profile link, not an asserted original rim model link."
      }
    ]
  },
  {
    "id": "lamborghini-gallardo-lp560",
    "title": "Lamborghini Gallardo LP560",
    "short": "Gallardo Lp560",
    "brand": "Lamborghini",
    "model": "Gallardo LP560",
    "cityOnly": true,
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-86691e28bae34cffa896b148c895e58d",
    "url": "../assets/vehicles/lamborghini-gallardo-lp560.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "gallardo_wheel_02a_19x11_gallardo_wheel_01a_0",
        "3_Wheel_Scene_-_Root001_0",
        "3_Wheel_amdb11_brake001_0",
        "3_Wheel_amdb11_misc_chrome001_0",
        "3_Wheel_amdb11_misc001_0",
        "3_Wheel_amdb11_caliper001_0",
        "gallardo_wheel_02a_19x11001_gallardo_wheel_01a_0",
        "3_Wheel001_Scene_-_Root001_0",
        "3_Wheel001_amdb11_brake001_0",
        "3_Wheel001_amdb11_misc_chrome001_0",
        "3_Wheel001_amdb11_misc001_0",
        "3_Wheel001_amdb11_caliper001_0",
        "gallardo_wheel_02a_19x11002_gallardo_wheel_01a_0",
        "3_Wheel002_Scene_-_Root001_0",
        "3_Wheel002_amdb11_brake001_0",
        "3_Wheel002_amdb11_misc_chrome001_0",
        "3_Wheel002_amdb11_misc001_0",
        "3_Wheel002_amdb11_caliper001_0",
        "gallardo_wheel_02a_19x11003_gallardo_wheel_01a_0",
        "3_Wheel003_Scene_-_Root001_0",
        "3_Wheel003_amdb11_brake001_0",
        "3_Wheel003_amdb11_misc_chrome001_0",
        "3_Wheel003_amdb11_misc001_0",
        "3_Wheel003_amdb11_caliper001_0"
      ],
      "tireNames": [
        "3_Wheel_Scene_-_Root001_0",
        "3_Wheel001_Scene_-_Root001_0",
        "3_Wheel002_Scene_-_Root001_0",
        "3_Wheel003_Scene_-_Root001_0"
      ],
      "brakeNames": [
        "3_Wheel_amdb11_caliper001_0",
        "3_Wheel001_amdb11_caliper001_0",
        "3_Wheel002_amdb11_caliper001_0",
        "3_Wheel003_amdb11_caliper001_0"
      ],
      "splitX": 0.09221880161108853,
      "splitZ": 1.3877787807814457e-17
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.8961,
    "width": 2.1825,
    "height": 1.1415,
    "wheelbase": 2.56,
    "referenceMass": 1550,
    "rigMass": 150,
    "dryMass": 1700,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "lamborghini-urus",
    "title": "Lamborghini Urus (2018)",
    "short": "Urus",
    "brand": "Lamborghini",
    "model": "Urus (2018)",
    "cityOnly": true,
    "author": "Kai Xiang",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-32964087f5d24c3e90482724ddfc2fef",
    "url": "../assets/vehicles/lamborghini-urus.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "wheel_wheellight_0",
        "wheel001_wheellight_0",
        "wheel002_wheellight_0",
        "wheel003_wheellight_0"
      ],
      "tireNames": [
        "wheel_wheellight_0",
        "wheel001_wheellight_0",
        "wheel002_wheellight_0",
        "wheel003_wheellight_0"
      ],
      "splitX": -31.286094665527344,
      "splitZ": 0.004417419433597303
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.1269,
    "width": 2.2476,
    "height": 1.6428,
    "wheelbase": 3.003,
    "referenceMass": 2200,
    "rigMass": 150,
    "dryMass": 2350,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "land-rover-defender",
    "title": "Land Rover Defender 90",
    "short": "Defender",
    "brand": "Land Rover",
    "model": "Defender 90",
    "cityOnly": true,
    "author": "kekomag",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/88e5f30687ec4d508cebafa876e014d6",
    "url": "../assets/vehicles/land-rover-defender.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_66",
        "Object_67",
        "Object_68",
        "Object_70",
        "Object_71",
        "Object_72",
        "Object_74",
        "Object_75",
        "Object_76",
        "Object_78",
        "Object_79",
        "Object_80"
      ],
      "tireNames": [
        "Object_68",
        "Object_72",
        "Object_76",
        "Object_80"
      ],
      "splitX": 0.2619034534524811,
      "splitZ": 4.842757701873779
    },
    "paintMaterials": [
      "Material"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.8251,
    "width": 1.7896,
    "height": 1.9176,
    "wheelbase": 2.36,
    "referenceMass": 1900,
    "rigMass": 150,
    "dryMass": 2050,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "land-rover-range-rover-velar",
    "title": "Land Rover Range Rover Velar",
    "short": "Range Rover Velar",
    "brand": "Land Rover",
    "model": "Range Rover Velar",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/494c03e056674423a8ca2e2af0c01eef",
    "url": "../assets/vehicles/land-rover-range-rover-velar.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_12"
      ],
      "tireNames": [
        "Object_12"
      ],
      "splitX": 0.3934898376464808,
      "splitZ": -18.561399936676025
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 5.0732,
    "width": 2.0523,
    "height": 1.6616,
    "wheelbase": 2.874,
    "referenceMass": 1900,
    "rigMass": 150,
    "dryMass": 2050,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "mclaren-720s",
    "title": "McLaren 720S",
    "short": "720S",
    "brand": "McLaren",
    "model": "720S",
    "cityOnly": true,
    "author": "_shobh19",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/f7bece69400f4640a4a3be746b44998b",
    "url": "../assets/vehicles/mclaren-720s.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelPattern": "^(tyres|brake_dics)",
      "tirePattern": "^tyres.*_tyres_",
      "brakePattern": "^brake_dics",
      "splitX": 0.00003379583283225074,
      "splitZ": 7.739791985095638e-8
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.8511,
    "width": 2.1773,
    "height": 1.2055,
    "wheelbase": 2.7,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "mini-countryman",
    "title": "MINI Countryman (2017)",
    "short": "Countryman",
    "brand": "Mini",
    "model": "Countryman (2017)",
    "cityOnly": true,
    "author": "razor24",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/8d5fd459a54d4a529c2be4c7ac444b01",
    "url": "../assets/vehicles/mini-countryman.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^countryman-17_(FR|BR|BL|FL)_wheel",
      "tirePattern": "^countryman-17_(FR|BR|BL|FL)_wheel_wheel_rubber",
      "brakePattern": "^countryman-17_(FR|BR|BL|FL)_wheel_brakes",
      "splitX": 0.10863519094725405,
      "splitZ": 1.3877787807814457e-17
    },
    "paintMaterials": [
      "metal"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.3694,
    "width": 1.9934,
    "height": 1.6017,
    "wheelbase": 2.7,
    "referenceMass": 1550,
    "rigMass": 150,
    "dryMass": 1700,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "nissan-sentra",
    "title": "Nissan Sentra",
    "short": "Sentra",
    "brand": "Nissan",
    "model": "Sentra",
    "cityOnly": true,
    "author": "Davidson",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/4e261bd2d93a438ebdabf8cc6b41cf58",
    "url": "../assets/vehicles/nissan-sentra.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelNames": [
        "mmGroup114_wire_028089177_#1_0",
        "mmGroup115_wire_028089177_#1_0",
        "mmGroup119_wire_028089177_#1_0",
        "mmGroup123_wire_028089177_#1_0",
        "mmGroup124_wire_028089177_#1_0",
        "mmGroup127_wire_028089177_#1_0",
        "mmGroup128_wire_028089177_#1_0",
        "mmGroup132_wire_028089177_#1_0",
        "mmGroup133_wire_028089177_#1_0",
        "mmGroup137_wire_028089177_#1_0",
        "mmGroup141_wire_028089177_#1_0",
        "mmGroup142_wire_028089177_#1_0",
        "mmGroup146_wire_028089177_#1_0",
        "mmGroup086_sentra_wheel_test_default_#1_0",
        "mmGroup074_sentra_wheel_test_default_#2_0",
        "mmGroup168_sentra_wheel_test_default_#3_0",
        "mmGroup169_sentra_wheel_test_default_#4_0",
        "mmGroup170_sentra_wheel_test_default_#5_0",
        "mmGroup171_sentra_wheel_test_default_#6_0",
        "mmGroup172_sentra_wheel_test_default_#7_0",
        "mmGroup190_sentra_wheel_test_default_#8_0",
        "mmGroup191_sentra_wheel_test_default_#9_0",
        "mmGroup192_sentra_wheel_test_default_#10_0",
        "mmGroup193_sentra_wheel_test_default_#11_0",
        "mmGroup194_sentra_wheel_test_default_#12_0",
        "mmGroup195_sentra_wheel_test_default_#13_0",
        "mmGroup196_sentra_wheel_test_default_#14_0",
        "mmGroup197_sentra_wheel_test_default_#15_0",
        "mmGroup198_sentra_wheel_test_default_#16_0",
        "mmGroup199_sentra_wheel_test_default_#17_0",
        "mmGroup200_sentra_wheel_test_default_#18_0",
        "mmGroup201_sentra_wheel_test_default_#19_0",
        "mmGroup202_sentra_wheel_test_default_#20_0",
        "mmGroup203_sentra_wheel_test_default_#21_0",
        "mmGroup211_sentra_wheel_test_default_#22_0",
        "mmGroup212_sentra_wheel_test_default_#23_0",
        "mmGroup213_sentra_wheel_test_default_#24_0",
        "mmGroup214_sentra_wheel_test_default_#25_0",
        "mmGroup215_sentra_wheel_test_default_#26_0",
        "mmGroup216_sentra_wheel_test_default_#27_0",
        "mmGroup217_sentra_wheel_test_default_#28_0"
      ],
      "tireNames": [
        "mmGroup115_wire_028089177_#1_0",
        "mmGroup124_wire_028089177_#1_0",
        "mmGroup133_wire_028089177_#1_0",
        "mmGroup142_wire_028089177_#1_0"
      ],
      "splitX": -0.000010354291073211286,
      "splitZ": -2.3841857910156377e-7
    },
    "paintMaterials": [
      "wire_143224087_2"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.7748,
    "width": 2.0572,
    "height": 1.4895,
    "wheelbase": 2.7,
    "referenceMass": 1350,
    "rigMass": 150,
    "dryMass": 1500,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "nissan-proto",
    "title": "Nissan Z Proto (2021)",
    "short": "Proto",
    "brand": "Nissan",
    "model": "Z Proto (2021)",
    "cityOnly": true,
    "author": "Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-db9a5f7ae9d84a0fb01cac96afe3e69c",
    "url": "../assets/vehicles/nissan-proto.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_8",
        "Object_9",
        "Object_11"
      ],
      "tireNames": [
        "Object_11"
      ],
      "brakeNames": [
        "Object_8"
      ],
      "splitX": 0.00834095478057862,
      "splitZ": -0.05760997533798218
    },
    "paintMaterials": [],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2286,
    "width": 1.9184,
    "height": 1.3198,
    "wheelbase": 2.55,
    "referenceMass": 1550,
    "rigMass": 150,
    "dryMass": 1700,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "peugeot-206",
    "title": "Peugeot 206",
    "short": "206",
    "brand": "Peugeot",
    "model": "206",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/44ac8a85939f4e3089649d4712275886",
    "url": "../assets/vehicles/peugeot-206.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_224",
        "Object_226",
        "Object_228",
        "Object_230",
        "Object_232",
        "Object_235",
        "Object_237",
        "Object_239",
        "Object_241",
        "Object_243",
        "Object_246",
        "Object_248",
        "Object_250",
        "Object_252",
        "Object_254",
        "Object_257",
        "Object_259",
        "Object_261",
        "Object_263",
        "Object_265"
      ],
      "tireNames": [
        "Object_226",
        "Object_232",
        "Object_237",
        "Object_243",
        "Object_248",
        "Object_254",
        "Object_259",
        "Object_265"
      ],
      "splitX": 0.0839083931259682,
      "splitZ": 0.003904816313526363
    },
    "paintMaterials": [
      "Matte__FF828282__env_15_spec"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.9763,
    "width": 1.9149,
    "height": 1.4182,
    "wheelbase": 2.44,
    "referenceMass": 1100,
    "rigMass": 150,
    "dryMass": 1250,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "renault-clio",
    "title": "Renault Clio Williams",
    "short": "Clio",
    "brand": "Renault",
    "model": "Clio Williams",
    "cityOnly": true,
    "author": "Mona x Supercars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/1dad7e4438c74f3b8bac1ab72acd78ed",
    "url": "../assets/vehicles/renault-clio.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_8",
        "Object_11",
        "Object_14"
      ],
      "tireNames": [
        "Object_8"
      ],
      "splitX": 0.021519686257362336,
      "splitZ": 2.2888183082506175e-7
    },
    "paintMaterials": [
      "jante"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.8055,
    "width": 1.8371,
    "height": 1.555,
    "wheelbase": 2.47,
    "referenceMass": 1000,
    "rigMass": 150,
    "dryMass": 1150,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "renault-duster",
    "title": "Renault Duster (2011)",
    "short": "Duster",
    "brand": "Renault",
    "model": "Duster (2011)",
    "cityOnly": true,
    "author": "razor24",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/30bc2e09de66426bb67be72c95fa2476",
    "url": "../assets/vehicles/renault-duster.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^duster-11_(FR|BR|BL|FL)_wheel",
      "tirePattern": "^duster-11_(FR|BR|BL|FL)_wheel_wheel_rubber",
      "brakePattern": "^duster-11_(FR|BR|BL|FL)_wheel_brakes",
      "splitX": 9.682621423169635,
      "splitZ": 1.7763568394002505e-15
    },
    "paintMaterials": [
      "metal"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2908,
    "width": 1.9837,
    "height": 1.6659,
    "wheelbase": 2.65,
    "referenceMass": 1400,
    "rigMass": 150,
    "dryMass": 1550,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "subaru-forester",
    "title": "Subaru Forester 2009",
    "short": "Forester",
    "brand": "Subaru",
    "model": "Forester 2009",
    "cityOnly": true,
    "author": "Nieve5677",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/925112ae29514dcf89ccf2fc7020338e",
    "url": "../assets/vehicles/subaru-forester.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelNames": [
        "Object_42",
        "Object_55"
      ],
      "tireNames": [
        "Object_42"
      ],
      "wheelDetailNames": [
        "Object_51"
      ],
      "splitX": -3.7850579023361206,
      "splitZ": 1.062489053496392
    },
    "paintMaterials": [
      "Body_Color"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.599,
    "width": 2.1277,
    "height": 1.7695,
    "wheelbase": 2.62,
    "referenceMass": 1500,
    "rigMass": 150,
    "dryMass": 1650,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "subaru-impreza",
    "title": "Subaru Impreza WRX STi 2004 Custom",
    "short": "Impreza",
    "brand": "Subaru",
    "model": "Impreza WRX STi 2004 Custom",
    "cityOnly": true,
    "author": "MAC ULT ARTS",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/08296bc950364621b6174a3078bb19e0",
    "url": "../assets/vehicles/subaru-impreza.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(Tire|Rim)[0-9]*_",
      "tirePattern": "^Tire[0-9]*_",
      "splitX": 0.1701463182951548,
      "splitZ": 2.7755575615628914e-17
    },
    "paintMaterials": [
      "Car_Paint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6772,
    "width": 2.0406,
    "height": 1.4537,
    "wheelbase": 2.525,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "toyota-camry",
    "title": "Toyota Camry 40",
    "short": "Camry",
    "brand": "Toyota",
    "model": "Camry 40",
    "cityOnly": true,
    "author": "Ford mondeo",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/560c174d073f4a10bb153ded41ada8c9",
    "url": "../assets/vehicles/toyota-camry.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Toyota_Camry_3D_model_Mold-Tech-8017_0",
        "Toyota_Camry_3D_model_CAMRY_rin_0",
        "Toyota_Camry_3D_model_disk_0"
      ],
      "tireNames": [
        "Toyota_Camry_3D_model_Mold-Tech-8017_0"
      ],
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "CAMRY"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.9035,
    "width": 2.0373,
    "height": 1.4663,
    "wheelbase": 2.775,
    "referenceMass": 1500,
    "rigMass": 150,
    "dryMass": 1650,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "toyota-corolla",
    "title": "Toyota Corolla (KE80)",
    "short": "Corolla",
    "brand": "Toyota",
    "model": "Corolla (KE80)",
    "cityOnly": true,
    "author": "PHAC",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/2b30faa611e64177a94a69098d27d1fb",
    "url": "../assets/vehicles/toyota-corolla.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_16",
        "Object_17",
        "Object_19",
        "Object_20",
        "Object_22",
        "Object_23",
        "Object_25",
        "Object_26"
      ],
      "tireNames": [
        "Object_17",
        "Object_20",
        "Object_23",
        "Object_26"
      ],
      "splitX": -0.10353171825408934,
      "splitZ": -2.7755575615628914e-17
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.2998,
    "width": 1.7934,
    "height": 1.2687,
    "wheelbase": 2.43,
    "referenceMass": 1000,
    "rigMass": 150,
    "dryMass": 1150,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "toyota-ae86",
    "title": "Toyota Corolla AE86 Trueno",
    "short": "Corolla AE86",
    "brand": "Toyota",
    "model": "Corolla AE86 Trueno",
    "cityOnly": true,
    "author": "Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/fe02fba6302e450ea8424591493341ea",
    "url": "../assets/vehicles/toyota-ae86.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_14",
        "Object_15",
        "Object_16",
        "Object_18",
        "Object_19",
        "Object_20",
        "Object_22",
        "Object_23",
        "Object_24",
        "Object_26",
        "Object_27",
        "Object_28"
      ],
      "tireNames": [
        "Object_15",
        "Object_19",
        "Object_23",
        "Object_27"
      ],
      "splitX": -0.3642174947071908,
      "splitZ": -0.035142201930284556
    },
    "paintMaterials": [
      "Material.002"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.3166,
    "width": 1.8447,
    "height": 1.2548,
    "wheelbase": 2.4,
    "referenceMass": 1000,
    "rigMass": 150,
    "dryMass": 1150,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "toyota-prius",
    "title": "Toyota Prius 2012",
    "short": "Prius",
    "brand": "Toyota",
    "model": "Prius 2012",
    "cityOnly": true,
    "author": "Doz3",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/04eaf6b288cc466785365b7d985e3b29",
    "url": "../assets/vehicles/toyota-prius.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_23",
        "Object_24"
      ],
      "tireNames": [
        "Object_24"
      ],
      "splitX": 1.5063953399658185,
      "splitZ": 0.26447606086730935
    },
    "paintMaterials": [
      "Fwiperay95s41Mtl.002"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5075,
    "width": 1.9983,
    "height": 1.6214,
    "wheelbase": 2.7,
    "referenceMass": 1400,
    "rigMass": 150,
    "dryMass": 1550,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "peugeot-205",
    "title": "Peugeot 205",
    "short": "205",
    "brand": "Peugeot",
    "model": "Vehicle - Peugeot 205",
    "cityOnly": true,
    "author": "Thcyrax",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/527949cddab34ea4b3b334b9a137d1be",
    "url": "../assets/vehicles/peugeot-205.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(FLW|FRW|RLW|RRW)_",
      "tirePattern": "^(FLW|FRW|RLW|RRW)_",
      "splitX": 0.02462959693913003,
      "splitZ": 3.469446951953614e-18
    },
    "paintMaterials": [
      "Vehicle"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 3.6357,
    "width": 1.8547,
    "height": 1.3707,
    "wheelbase": 2.42,
    "referenceMass": 900,
    "rigMass": 150,
    "dryMass": 1050,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "volvo-v60",
    "title": "Volvo V60 Polestar (2013)",
    "short": "V60",
    "brand": "Volvo",
    "model": "V60 Polestar (2013)",
    "cityOnly": true,
    "author": "Myedsu",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/504ce39150fe49c7979f702d5f0f8580",
    "url": "../assets/vehicles/volvo-v60.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^wheel_(FL|RL)[0-9]*_",
      "tirePattern": "^wheel_(FL|RL)[0-9]*_wheel_tire_",
      "brakePattern": "^wheel_(FL|RL)[0-9]*_disk_brake_tr_",
      "splitX": 0.0069602290348886875,
      "splitZ": -1.734723475976807e-18
    },
    "paintMaterials": [
      "body_paint"
    ],
    "reference": "도시 전용 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6886,
    "width": 2.078,
    "height": 1.4877,
    "wheelbase": 2.776,
    "referenceMass": 1750,
    "rigMass": 150,
    "dryMass": 1900,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "bugatti-chiron",
    "title": "Bugatti Chiron Profilée (2023)",
    "short": "Chiron Profilée",
    "brand": "Bugatti",
    "model": "Chiron Profilée (2023)",
    "cityOnly": true,
    "category": "sports",
    "author": "DisneyCars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/6da5092ee455446cb050e4c6b4a3ac05",
    "url": "../assets/vehicles/bugatti-chiron.glb",
    "yaw": 3.141592653589793,
    "adapter": {
      "wheelNames": [
        "Object_9",
        "Object_45",
        "Object_46",
        "Object_47",
        "Object_48"
      ],
      "tireNames": [
        "Object_45"
      ],
      "splitX": 67.01725,
      "splitZ": -3.39673
    },
    "paintMaterials": [
      "Meshpart70Mtl"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.6841,
    "width": 2.1866,
    "height": 1.1949,
    "wheelbase": 2.71,
    "referenceMass": 1950,
    "rigMass": 150,
    "dryMass": 2100,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "bugatti-veyron",
    "title": "Bugatti Veyron 16.4 Super Sport",
    "short": "Veyron Super Sport",
    "brand": "Bugatti",
    "model": "Veyron 16.4 Super Sport",
    "cityOnly": true,
    "category": "sports",
    "author": "andikapratamaw",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/0ee4c65face949efa4500deb17c79150",
    "url": "../assets/vehicles/bugatti-veyron.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_12",
        "Object_13",
        "Object_14",
        "Object_15",
        "Object_17",
        "Object_18",
        "Object_19",
        "Object_20",
        "Object_22",
        "Object_23",
        "Object_24",
        "Object_25",
        "Object_27",
        "Object_28",
        "Object_29",
        "Object_30"
      ],
      "tireNames": [
        "Object_15",
        "Object_20",
        "Object_25",
        "Object_30"
      ],
      "brakeNames": [
        "Object_12",
        "Object_17",
        "Object_22",
        "Object_27"
      ],
      "splitX": -0.082,
      "splitZ": 0.01
    },
    "paintMaterials": [
      "M_Metalic_Orange"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5374,
    "width": 1.9776,
    "height": 1.2275,
    "wheelbase": 2.71,
    "referenceMass": 1850,
    "rigMass": 150,
    "dryMass": 2000,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "koenigsegg-one",
    "title": "Koenigsegg One:1",
    "short": "One:1",
    "brand": "Koenigsegg",
    "model": "One:1",
    "cityOnly": true,
    "category": "sports",
    "author": "iSteven / jkazulyblanco",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-b4e5a4c5fa5d4d45acd6715d3325254f",
    "url": "../assets/vehicles/koenigsegg-one.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(wheel|cal)",
      "tirePattern": "^wheel.*_Material014_0",
      "brakePattern": "^cal",
      "splitX": -0.07,
      "splitZ": 0
    },
    "paintMaterials": [
      "material_17"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5613,
    "width": 2.2023,
    "height": 1.1763,
    "wheelbase": 2.66,
    "referenceMass": 1400,
    "rigMass": 150,
    "dryMass": 1550,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "mclaren-p1",
    "title": "McLaren P1",
    "short": "P1",
    "brand": "McLaren",
    "model": "P1",
    "cityOnly": true,
    "category": "sports",
    "author": "vecarz",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-adae2edc721e4ce7b31c1d06a581e30a",
    "url": "../assets/vehicles/mclaren-p1.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(Rim_|Tyre_|Brake_Disk_|g_Susp_Hub_)",
      "tirePattern": "^Tyre_",
      "brakePattern": "^g_Susp_Hub_.*Brake_Caliper",
      "fixedWheelPattern": "^g_Susp_Hub_",
      "splitX": -0.059,
      "splitZ": 0
    },
    "paintMaterials": [
      "Carpaint"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.8524,
    "width": 2.1446,
    "height": 1.1832,
    "wheelbase": 2.67,
    "referenceMass": 1500,
    "rigMass": 150,
    "dryMass": 1650,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "lamborghini-revuelto",
    "title": "Lamborghini Revuelto",
    "short": "Revuelto",
    "brand": "Lamborghini",
    "model": "Revuelto",
    "cityOnly": true,
    "category": "sports",
    "author": "ALIEEEN",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-cf52245eb68f48daa909c7ad2a8deaa3",
    "url": "../assets/vehicles/lamborghini-revuelto.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^Wheel_(FR|FL|BR|BL)",
      "tirePattern": "^Wheel_(FR|FL|BR|BL)_Tire_0",
      "brakePattern": "^Wheel_(FR|FL|BR|BL)_Caliper_0",
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "Body"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 5.0262,
    "width": 2.1985,
    "height": 1.1873,
    "wheelbase": 2.8,
    "referenceMass": 1800,
    "rigMass": 150,
    "dryMass": 1950,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "honda-nsx",
    "title": "Honda NSX (1990)",
    "short": "NSX NA1",
    "brand": "Honda",
    "model": "NSX (1990)",
    "cityOnly": true,
    "category": "sports",
    "author": "Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/1cc15628a00a4739a6b6c01128927c8d",
    "url": "../assets/vehicles/honda-nsx.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Circle001_9",
        "Circle002_19",
        "Circle003_20",
        "Circle004_21"
      ],
      "tireNames": [
        "Object_17",
        "Object_41",
        "Object_46",
        "Object_51"
      ],
      "splitX": 0.89,
      "splitZ": 0
    },
    "paintMaterials": [
      "Material.003"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.473,
    "width": 1.9546,
    "height": 1.1609,
    "wheelbase": 2.53,
    "referenceMass": 1350,
    "rigMass": 150,
    "dryMass": 1500,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "pagani-huayra",
    "title": "Pagani Huayra",
    "short": "Huayra",
    "brand": "Pagani",
    "model": "Huayra",
    "cityOnly": true,
    "category": "sports",
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-c2d61a9f53a54a229547bb76e4b71e25",
    "url": "../assets/vehicles/pagani-huayra.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_46",
        "Object_48",
        "Object_49",
        "Object_50",
        "Object_51",
        "Object_52",
        "Object_53",
        "Object_56",
        "Object_57",
        "Object_58",
        "Object_62"
      ],
      "tireNames": [
        "Object_50",
        "Object_51",
        "Object_52",
        "Object_53"
      ],
      "brakeNames": [
        "Object_48",
        "Object_49"
      ],
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "PAG_HUAYRA_PAINT",
      "PAG_HUAYRA_PAINT_2"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 5.0323,
    "width": 2.3056,
    "height": 1.1679,
    "wheelbase": 2.8,
    "referenceMass": 1400,
    "rigMass": 150,
    "dryMass": 1550,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "porsche-918-spyder",
    "title": "Porsche 918 Spyder",
    "short": "918 Spyder",
    "brand": "Porsche",
    "model": "918 Spyder",
    "cityOnly": true,
    "category": "sports",
    "author": "vecarz / DisneyCars",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-9fb9a088d0704a06ba69a8a6de100f10",
    "url": "../assets/vehicles/porsche-918-spyder.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_950",
        "Object_953",
        "Object_956",
        "Object_959",
        "Object_962",
        "Object_965",
        "Object_969",
        "Object_972",
        "Object_975",
        "Object_978",
        "Object_981",
        "Object_984",
        "Object_988",
        "Object_991",
        "Object_994",
        "Object_997",
        "Object_1000",
        "Object_1003",
        "Object_1007",
        "Object_1010",
        "Object_1013",
        "Object_1016",
        "Object_1019",
        "Object_1022",
        "Object_1026",
        "Object_1030",
        "Object_1034",
        "Object_1038"
      ],
      "tireNames": [
        "Object_950",
        "Object_969",
        "Object_988",
        "Object_1007"
      ],
      "brakeNames": [
        "Object_953",
        "Object_956",
        "Object_972",
        "Object_975",
        "Object_991",
        "Object_994",
        "Object_1010",
        "Object_1013"
      ],
      "splitX": 0.29,
      "splitZ": 0
    },
    "paintMaterials": [
      "Body_Paint_-_GT_Silver_Metalic"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.82,
    "width": 2.0539,
    "height": 1.1789,
    "wheelbase": 2.73,
    "referenceMass": 1700,
    "rigMass": 150,
    "dryMass": 1850,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "porsche-911-gt3",
    "title": "Porsche 911 GT3",
    "short": "911 GT3",
    "brand": "Porsche",
    "model": "911 GT3",
    "cityOnly": true,
    "category": "sports",
    "author": "ChevroletSS",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-78d5c47ab2554c2592b7e499179a0792",
    "url": "../assets/vehicles/porsche-911-gt3.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "Tyre|GEO_rim_|Wheel_Hub_|g_Brake_Caliper|A_DISC_",
      "tirePattern": "EXT_Tyre",
      "brakePattern": "g_Brake_Caliper",
      "fixedWheelPattern": "Wheel_Hub_",
      "excludeNames": [
        "Object_20"
      ],
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "EXT_Carpaint.004"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 4.5489,
    "width": 1.9784,
    "height": 1.3007,
    "wheelbase": 2.45,
    "referenceMass": 1450,
    "rigMass": 150,
    "dryMass": 1600,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  },
  {
    "id": "lotus-elise",
    "title": "Lotus Elise",
    "short": "Elise",
    "brand": "Lotus",
    "model": "Elise",
    "cityOnly": true,
    "category": "sports",
    "author": "Stéphane Agullo",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/none-75e9045ac1af4cdbb69318108c81edfd",
    "url": "../assets/vehicles/lotus-elise.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^LOTUS-def3Layer(2|16|17|18)_",
      "tireNames": [
        "LOTUS-def3Layer2_CARblack_0",
        "LOTUS-def3Layer16_CARblack_0",
        "LOTUS-def3Layer17_CARblack_0",
        "LOTUS-def3Layer18_CARblack_0"
      ],
      "excludePattern": "^SOL01_|SHADE|NANA-",
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "CAR.carros"
    ],
    "reference": "도시 스포츠카 · 치수/질량은 시뮬레이션 가정",
    "length": 3.7658,
    "width": 1.8875,
    "height": 1.2643,
    "wheelbase": 2.3,
    "referenceMass": 900,
    "rigMass": 150,
    "dryMass": 1050,
    "massBasis": "City simulation class assumption, not a published or measured manufacturer mass; shared conversion rig +150 kg",
    "dimensionBasis": "Wheelbase is a rounded simulation assumption; exterior/collision dimensions are measured from the artist mesh after proportional scaling, not OEM CAD"
  }
];
