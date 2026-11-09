// Artist exterior replicas. Reference trims and shared 150 kg conversion are documented in vehicle-specifications.md.
export const EXTRA_VEHICLES = [
  {
    "id": "audi-r8",
    "title": "Audi R8",
    "short": "R8",
    "brand": "Audi",
    "model": "R8 V10",
    "author": "wallon",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/e17e438f076f4427a58d93aa779edaed",
    "url": "../assets/vehicles/audi-r8.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(Circle00[34]_rim|Cylinder00[36]_tire|rear_wheels00[789]_wheel|rear_wheels0(08|10)_calipers)",
      "tireNames": [
        "Cylinder003_tire_0",
        "Cylinder006_tire_0"
      ],
      "brakePattern": "calipers",
      "splitX": -1.7,
      "splitZ": 0.125
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "4.426 m · 축간 2.650 m",
    "length": 4.426,
    "width": 1.94,
    "height": 1.24,
    "wheelbase": 2.65,
    "referenceMass": 1640,
    "rigMass": 150,
    "dryMass": 1790,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "ford-mustang",
    "title": "Ford Mustang Shelby GT500",
    "short": "GT500",
    "brand": "Ford",
    "model": "Mustang Shelby GT500",
    "author": "Jiaxing",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/0eaa7a16796540f29461ddae05ecdeb3",
    "url": "../assets/vehicles/ford-mustang.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^GT500Wheel",
      "tirePattern": "_tire_0",
      "brakePattern": "WheelBrake",
      "splitX": 2.33,
      "splitZ": 0
    },
    "paintMaterials": [
      "carpaint"
    ],
    "reference": "4.813 m · 축간 2.720 m",
    "length": 4.8133,
    "width": 1.94564,
    "height": 1.37922,
    "wheelbase": 2.72034,
    "referenceMass": 1916.43,
    "rigMass": 150,
    "dryMass": 2066.4300000000003,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "lamborghini-aventador-lp700-4",
    "title": "Lamborghini Aventador LP700-4 Roadster (2013)",
    "short": "Aventador",
    "brand": "Lamborghini",
    "model": "Aventador LP700-4 Roadster",
    "author": "_shobh19",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/dbd3e2ccdc2748af957c34310163d848",
    "url": "../assets/vehicles/lamborghini-aventador-lp700-4.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_16",
        "Object_17",
        "Object_18"
      ],
      "tireNames": [
        "Object_17"
      ],
      "brakeNames": [
        "Object_18"
      ],
      "excludeNames": [
        "Object_20",
        "Object_22"
      ],
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "4.780 m · 축간 2.700 m",
    "length": 4.78,
    "width": 2.03,
    "height": 1.136,
    "wheelbase": 2.7,
    "referenceMass": 1625,
    "rigMass": 150,
    "dryMass": 1775,
    "massBasis": "dry"
  },
  {
    "id": "mercedes-benz-amg-gt",
    "title": "Mercedes-AMG GT S (C190)",
    "short": "AMG GT S",
    "brand": "Mercedes-AMG",
    "model": "GT S",
    "author": "Yan Carvalho",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/661dcab94455463784651a3ebc63cfb9",
    "url": "../assets/vehicles/mercedes-benz-amg-gt.glb",
    "yaw": 2.913834682167769,
    "adapter": {
      "wheelNames": [
        "Object_13",
        "Object_14",
        "Object_15",
        "Object_28"
      ],
      "tireNames": [
        "Object_28"
      ],
      "brakeNames": [
        "Object_13"
      ],
      "fixedWheelNames": [
        "Object_14"
      ],
      "wheelDetailNames": [
        "Object_31"
      ],
      "excludeNames": [
        "Object_4"
      ],
      "splitX": 2.18,
      "splitZ": -1.11
    },
    "paintMaterials": [
      "Material.001"
    ],
    "reference": "4.546 m · 축간 2.630 m",
    "length": 4.546,
    "width": 1.939,
    "height": 1.288,
    "wheelbase": 2.63,
    "referenceMass": 1570,
    "rigMass": 150,
    "dryMass": 1720,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "nissan-gt-r",
    "title": "Nissan Skyline GT-R R34",
    "short": "GT-R R34",
    "brand": "Nissan",
    "model": "Skyline GT-R R34",
    "author": "Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/ff8fb2251dfa4bb9979e7022c5a6666c",
    "url": "../assets/vehicles/nissan-gt-r.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_13",
        "Object_14"
      ],
      "tireNames": [
        "Object_13"
      ],
      "splitX": 0.78,
      "splitZ": -1.77
    },
    "paintMaterials": [
      "Material.001"
    ],
    "reference": "4.600 m · 축간 2.665 m",
    "length": 4.6,
    "width": 1.785,
    "height": 1.36,
    "wheelbase": 2.665,
    "referenceMass": 1560,
    "rigMass": 150,
    "dryMass": 1710,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "porsche-911",
    "title": "Porsche 911 (930) Turbo (1975)",
    "short": "911 Turbo",
    "brand": "Porsche",
    "model": "911 (930) Turbo",
    "author": "Lexyc16",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/de1ffd344c41481892511f7fd332c136",
    "url": "../assets/vehicles/porsche-911.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_28",
        "Object_29",
        "Object_30",
        "Object_32",
        "Object_33",
        "Object_34",
        "Object_36",
        "Object_37",
        "Object_38",
        "Object_42",
        "Object_43",
        "Object_44"
      ],
      "tireNames": [
        "Object_30",
        "Object_34",
        "Object_38",
        "Object_44"
      ],
      "splitX": 0.18,
      "splitZ": 1.09
    },
    "paintMaterials": [
      "Material.001"
    ],
    "reference": "4.291 m · 축간 2.272 m",
    "length": 4.291,
    "width": 1.775,
    "height": 1.32,
    "wheelbase": 2.272,
    "referenceMass": 1140,
    "rigMass": 150,
    "dryMass": 1290,
    "massBasis": "manufacturer weight; basis unspecified"
  },
  {
    "id": "toyota-supra-mk",
    "title": "Toyota Supra Mk IV (1994)",
    "short": "Supra Mk IV",
    "brand": "Toyota",
    "model": "Supra Mk IV",
    "author": "Martin Trafas",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/eb9bb1eb41db431cb078088ae1ce45f8",
    "url": "../assets/vehicles/toyota-supra-mk.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "Object_16",
        "Object_17",
        "Object_18",
        "Object_19",
        "Object_20",
        "Object_21"
      ],
      "tireNames": [
        "Object_17"
      ],
      "brakeNames": [
        "Object_16"
      ],
      "splitX": 0,
      "splitZ": 0
    },
    "paintMaterials": [
      "TOYOTA_SUPRA_CAR_PAINT"
    ],
    "reference": "4.520 m · 축간 2.550 m",
    "length": 4.52,
    "width": 1.81,
    "height": 1.275,
    "wheelbase": 2.55,
    "referenceMass": 1490,
    "rigMass": 150,
    "dryMass": 1640,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "tesla-model",
    "title": "Tesla Model 3 (2018)",
    "short": "Model 3",
    "brand": "Tesla",
    "model": "Model 3",
    "author": "Ameer Studio",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/5ef9b845aaf44203b6d04e2c677e444f",
    "url": "../assets/vehicles/tesla-model.glb",
    "yaw": -1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(wheels|hub_)",
      "tireNames": [
        "wheels_wheels3_0",
        "wheels001_wheels3_0"
      ],
      "brakePattern": "wheels0_0|^hub_",
      "splitX": 15.48,
      "splitZ": 0
    },
    "paintMaterials": ["primary"],
    "reference": "4.694 m · 축간 2.875 m",
    "length": 4.694,
    "width": 1.849,
    "height": 1.443,
    "wheelbase": 2.875,
    "referenceMass": 1741,
    "rigMass": 150,
    "dryMass": 1891,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "mazda-miata-mx-5",
    "title": "Mazda MX-5 Miata NA",
    "short": "MX-5 NA",
    "brand": "Mazda",
    "model": "MX-5 Miata NA",
    "author": "Black Snow",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/e074e29ccc3847dca74ed5e9cb92d3e7",
    "url": "../assets/vehicles/mazda-miata-mx-5.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelPattern": "^(RLA_miata_wheel|Object_400[1234]_Scene_-_Root002|amdb11_brakedisc)",
      "tirePattern": "^Object_400[1234]_Scene_-_Root002",
      "brakePattern": "amdb11_(caliper|badging)",
      "splitX": 0.11,
      "splitZ": 0
    },
    "paintMaterials": [
      "RRpbrPaintPrimary"
    ],
    "reference": "3.970 m · 축간 2.265 m",
    "length": 3.97,
    "width": 1.675,
    "height": 1.235,
    "wheelbase": 2.265,
    "referenceMass": 940,
    "rigMass": 150,
    "dryMass": 1090,
    "massBasis": "reference trim; see evidence"
  },
  {
    "id": "tesla-cybertruck",
    "title": "Tesla Cybertruck (2019 concept)",
    "short": "Cybertruck",
    "brand": "Tesla",
    "model": "Cybertruck concept",
    "author": "hashikemu",
    "license": "CC BY 4.0",
    "licenseUrl": "http://creativecommons.org/licenses/by/4.0/",
    "source": "https://sketchfab.com/3d-models/657e71b3e2ad468196668e9c9df708fb",
    "url": "../assets/vehicles/tesla-cybertruck.glb",
    "yaw": 1.5707963267948966,
    "adapter": {
      "wheelNames": [
        "tires_rubber_0"
      ],
      "tireNames": [
        "tires_rubber_0"
      ],
      "excludeNames": [
        "body_LOD1_body_LOD1_0",
        "0"
      ],
      "splitX": 0.11,
      "splitZ": 0
    },
    "paintMaterials": [
      "body"
    ],
    "reference": "2019 콘셉트 · 치수·질량 가정",
    "length": 5.723,
    "width": 2.133,
    "height": 1.85,
    "wheelbase": 3.74,
    "referenceMass": 3000,
    "rigMass": 150,
    "dryMass": 3150,
    "massBasis": "assumed"
  }
];
