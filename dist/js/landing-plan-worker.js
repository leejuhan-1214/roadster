import {measureEconomyPlan} from './landing-economy.js?v=20261120-basemass';

self.onmessage=({data})=>{
  self.postMessage(measureEconomyPlan(data.initial,data.targetSpeed));
};
