// Reproduce the report CSV with the same fitted 3D geometry, controller,
// physics engine and CSV exporter as the browser's 20 m study.
import {writeFile} from 'node:fs/promises';
import {loadModelGeometry} from '../tests/model-loader-helper.mjs';
import {vehicleProfile} from '../dist/js/vehicle-profiles.js';
import {createVehicle} from '../dist/js/vehicle.js';
import {adaptRoadsterScene} from '../dist/js/roadster-model.js';
import {disposeVehicle} from '../dist/js/real-vehicle-model.js';
import {prepareAssessmentVehicle} from '../dist/js/assessment-vehicle.js';
import {prepareRocketRetrofit} from '../dist/js/rocket-retrofit.js';
import {configureVehicleFit} from '../dist/js/vehicle-fit.js';
import {roadsterHeightStudySource} from '../dist/js/landing-height-source.js';
import {runLandingHeightStudy} from '../dist/js/landing-height-study.js';
import {heightStudyCSV} from '../dist/js/landing-height-study-ui.js';
import {landingCsvText} from '../dist/js/landing-ui.js';

const profile=vehicleProfile('roadster');
const gltf=await loadModelGeometry(profile);
const vehicle=adaptRoadsterScene(gltf.scene,createVehicle(),gltf.parser);
let source;
try{
  prepareAssessmentVehicle(vehicle);prepareRocketRetrofit(vehicle);configureVehicleFit(vehicle,profile);
  source=roadsterHeightStudySource(vehicle.geometryParams);
}finally{
  disposeVehicle(vehicle);
}
const study=runLandingHeightStudy(source);
await writeFile(new URL('../docs/data/landing-height-v160.csv',import.meta.url),landingCsvText(heightStudyCSV(study)),'utf8');
console.log(JSON.stringify(study,null,2));
