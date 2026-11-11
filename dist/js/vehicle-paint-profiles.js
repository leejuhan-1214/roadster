// Reviewed against shipped glTF material bindings and assembled model geometry.
// An override replaces heuristic profile matches: wheels, chrome and interiors
// must not become body paint merely because they are the largest material group.
// Textured atlases need selective source-hue masking; dedicated body surfaces
// retain texture luminance but replace its baked pigment.
export const PAINT_OVERRIDES = {
  "ferrari-f40": [
    {
      "materials": [
        "material"
      ],
      "mode": "surface"
    }
  ],
  "lamborghini-countach-lp500s": [
    {
      "materials": [
        "CARO"
      ],
      "mode": "surface"
    }
  ],
  "lamborghini-gallardo-lp560": [
    {
      "materials": [
        "gallardo_paint"
      ],
      "mode": "surface"
    }
  ],
  "land-rover-range-rover-velar": [
    {
      "materials": [
        "MeshesrangeRoverVelarobject0001Mtl"
      ],
      "mode": "surface"
    }
  ],
  "nissan-proto": [
    {
      "materials": [
        "Material.001"
      ],
      "mode": "surface"
    }
  ],
  "lamborghini-urus": [
    {
      "materials": [
        "body"
      ],
      "meshPattern": "^yellow_body_0$",
      "mode": "surface"
    }
  ],
  "mini-countryman": [
    {
      "materials": [
        "varnish"
      ],
      "meshPattern": "^countryman-17_exterior_varnish_0$",
      "mode": "surface"
    }
  ],
  "aston-martin-db11": [
    {
      "materials": [
        "amdb11"
      ],
      "mode": "surface"
    }
  ],
  "audi-a3": [
    {
      "materials": [
        "paint"
      ],
      "mode": "surface"
    }
  ],
  "audi-tt": [
    {
      "materials": [
        "varnish"
      ],
      "meshPattern": "^tt_cc15_exterior_varnish_0$",
      "mode": "surface"
    }
  ],
  "dodge-challenger": [
    {
      "materials": [
        "Carosserie"
      ],
      "mode": "surface"
    }
  ],
  "honda-cr-v": [
    {
      "materials": [
        "paintBlue"
      ],
      "mode": "surface"
    }
  ],
  "hyundai-i30": [
    {
      "materials": [
        "paint"
      ],
      "mode": "surface"
    }
  ],
  "peugeot-206": [
    {
      "materials": [
        "body__prim_env_4_spec",
        "NO_BUMPERS__spec"
      ],
      "mode": "surface"
    }
  ],
  "renault-clio": [
    {
      "materials": [
        "Carroserie"
      ],
      "mode": "surface"
    }
  ],
  "renault-duster": [
    {
      "materials": [
        "varnish"
      ],
      "meshPattern": "^duster-11_exterior_varnish_0$",
      "mode": "surface"
    }
  ],
  "toyota-prius": [
    {
      "materials": [
        "Color.002"
      ],
      "mode": "surface"
    }
  ],
  "volkswagen-beetle": [
    {
      "materials": [
        "lambert1"
      ],
      "meshPattern": "^base_lp_lambert1_0$",
      "mode": "atlas",
      "sourceColor": "#68afd4",
      "sourceColors": [
        "#68afd4",
        "#ba6e7e",
        "#9bd7d9"
      ]
    }
  ],
  "hyundai-azera": [
    {
      "materials": [
        "front",
        "front_bum",
        "front_doo",
        "hood",
        "Object11",
        "rear_bump",
        "rear_do38",
        "rear_door",
        "right_doo",
        "roof",
        "tail",
        "trunk"
      ],
      "mode": "surface"
    }
  ],
  "audi-a1": [
    {
      "materials": [
        "bodyh"
      ],
      "mode": "surface"
    }
  ],
  "fiat-uno": [
    {
      "materials": [
        "Scene_-_Root"
      ],
      "meshPattern": "^(chassis\\d*|capo|porta_malas|grade_frontal_cor|tanque)__0$",
      "mode": "surface"
    }
  ],
  "kia-sportage": [
    {
      "materials": [
        "material"
      ],
      "meshPattern": "^CAR_c_0$",
      "mode": "surface"
    }
  ],
  "nissan-sentra": [
    {
      "materials": [
        "wire_008008136_3"
      ],
      "mode": "surface"
    }
  ],
  "land-rover-defender": [
    {
      "materials": [
        "Material.002"
      ],
      "mode": "surface"
    }
  ],
  "toyota-ae86": [
    {
      "materials": [
        "Material.001"
      ],
      "mode": "surface"
    }
  ],
  "chevrolet-camaro": [
    {
      "materials": [
        "Meshpart6Mtl"
      ],
      "mode": "surface"
    }
  ],
  "peugeot-205": [
    {
      "materials": [
        "Vehicle"
      ],
      "meshPattern": "^Body_Vehicle_0$",
      "mode": "surface",
      "uvRects": [
        [
          0.11,
          0.11,
          1,
          1
        ]
      ],
      "sourceColor": "#555555"
    }
  ],
  "mclaren-720s": [
    {
      "materials": [
        "body"
      ],
      "mode": "atlas",
      "sourceColor": "#bf3e16",
      "uvRects": [
        [
          0,
          0,
          0.722,
          0.326
        ],
        [
          0,
          0.326,
          0.455,
          0.595
        ]
      ]
    }
  ],
  "lamborghini-aventador-lp700-4": [
    {
      "materials": [
        "body"
      ],
      "mode": "atlas",
      "sourceColor": "#8794a1",
      "uvRects": [
        [
          0,
          0,
          0.825,
          1
        ]
      ]
    }
  ],
  "tesla-cybertruck": [
    {
      "materials": [
        "body"
      ],
      "mode": "atlas",
      "sourceColor": "#7e7e7e",
      "uvRects": [
        [
          0,
          0,
          1,
          0.54
        ]
      ],
      "maxBrightness": 0.65
    }
  ],
  "toyota-yaris": [
    {
      "materials": [
        "Intbodyunrefunblendbodyunrefunblend1Mtl",
        "Bonnetunrefunblend1Mtl"
      ],
      "mode": "atlas",
      "sourceColor": "#eeeeee",
      "uvRects": [
        [
          0,
          0.42,
          1,
          1
        ]
      ]
    }
  ]
};
