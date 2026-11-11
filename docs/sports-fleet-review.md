# Sports fleet source review — 2026-11-11

Source catalog: https://github.com/pedrosoandre/carros ; pinned commit 2d18dfd9db96bbf0d9cffa949deaf7f571388cbf. Each asset is its own real vehicle artist model, not a renamed clone. GLB JSON and decoded geometry inspected locally; ten final adapters and their visible city renders were checked; full regression 771 tests and syntax checks pass.

The Sketchfab model API was queried on 2026-11-11. All ten selected records currently report CC Attribution (CC BY 4.0). Preserve uploader attribution, source link, license link, modifications and upstream contributor credits. These are artist replicas; dimensions and driving assumptions must not be presented as OEM CAD or verified vehicle performance.

| Asset | Source title | Author | Bytes | Source |
|---|---|---|---:|---|
| bugatti-chiron | 2023 Bugatti Chiron Profilee | DisneyCars | 2989204 | https://sketchfab.com/3d-models/6da5092ee455446cb050e4c6b4a3ac05 |
| bugatti-veyron | Bugatti Veyron 16.4 Super Sport - Lowpoly | andikapratamaw | 3967440 | https://sketchfab.com/3d-models/0ee4c65face949efa4500deb17c79150 |
| koenigsegg-one | Koenigsegg One:1 | iSteven | 1721852 | https://sketchfab.com/3d-models/none-b4e5a4c5fa5d4d45acd6715d3325254f |
| mclaren-p1 | Mclaren P1 — www.vecarz.com | vecarz | 4407404 | https://sketchfab.com/3d-models/none-adae2edc721e4ce7b31c1d06a581e30a |
| porsche-911-gt3 | Porsche 911 GT3 | ChevroletSS | 1310556 | https://sketchfab.com/3d-models/none-78d5c47ab2554c2592b7e499179a0792 |
| lamborghini-revuelto | Free Lamborghini Revuelto | ALIEEEN | 2955328 | https://sketchfab.com/3d-models/none-cf52245eb68f48daa909c7ad2a8deaa3 |
| honda-nsx | Honda NSX 1990 | Lexyc16 | 3097524 | https://sketchfab.com/3d-models/1cc15628a00a4739a6b6c01128927c8d |
| pagani-huayra | Pagani Huayra [Free] | Black Snow | 2118084 | https://sketchfab.com/3d-models/none-c2d61a9f53a54a229547bb76e4b71e25 |
| lotus-elise | LOTUS ÉLISE | Stéphane Agullo | 4673336 | https://sketchfab.com/3d-models/none-75e9045ac1af4cdbb69318108c81edfd |
| porsche-918-spyder | Porsche 918 Spyder 2015 — www.vecarz.com | vecarz | 4343032 | https://sketchfab.com/3d-models/none-9fb9a088d0704a06ba69a8a6de100f10 |

918 Spyder source chain: vecarz explicitly credits DisneyCars. Original https://sketchfab.com/3d-models/e98b813802aa4658a54953ca8fa0d604 also returned 200 and CC Attribution. Credit both. Saved source snapshots: porsche-918-spyder-source.json and porsche-918-spyder-upstream-source.json, with contributors recorded in retrieved.json.

Rejected candidates:
- koenigsegg-jesko: source description explicitly references game extraction (full metadata snapshot retained).
- ferrari-laferrari and ferrari-f8: current source license is outside the selected CC BY / CC0 eligibility set; catalog label alone was insufficient.
- lamborghini-roger-dubuis: despite catalog name, decoded object is a Roger Dubuis watch, not a drivable Huracan. Do not add it as a car.
- porsche-718-cayman: republisher CC BY conflicts with upstream Ddiaz Design CC BY-NC-SA and upstream description explicitly says based on Asphalt 9 Legends. Do not use. Upstream https://sketchfab.com/3d-models/c599b3aa82eb46f7ba3bb2d22bd9dfc6 .

Technical notes: Lotus contains stage/shadow meshes; remove non-car content before fitting. Forward direction of Lotus is -Z (lamp-avant), rear +Z (lamp-arr). Chiron long axis X. Models with merged wheel meshes require reviewed four-wheel separation and actual rolling axis validation. Do not assume catalog paint labels or generic wheel-name patterns are correct.

Additional provenance review:
- Koenigsegg One:1: iSteven credits @jkazulyblanco. Located original https://sketchfab.com/3d-models/koenigsegg-one1-low-poly-8d253a7f43404113838d72c7fc9cfa94 . API 200, CC Attribution, author jkazulyblanco, description says created in Maya and Substance Painter. Original snapshot koenigsegg-one-upstream-source.json; contributor metadata appended to retrieved.json. Credit both creators.
- Reserve McLaren Senna: author Black Snow; API 200 CC Attribution; empty description; decoded car size2.17 x1.19 x4.64,275meshes.
- Reserve Lamborghini Centenario Roadster: SDC PERFORMANCE; API 200 CC Attribution; source describes Blender model and states interior may differ from real car. Decoded car size2.27 x1.17 x4.98,84meshes. Do not claim OEM interior.
- Reserve Bugatti Bolide is rejected: API CC BY label conflicts with explicit source description stating third-party Facebook/MediaFire sourcing and noncommercial limitation. Do not ship.
Reserve geometry is in analysis-reserves.json; it does not modify analysis.json used by the assigned adapters.
