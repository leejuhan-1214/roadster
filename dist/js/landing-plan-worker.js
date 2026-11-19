import {measureEconomyPlan} from './landing-economy.js?v=20261119-height160';

self.onmessage=({data})=>{
  self.postMessage(measureEconomyPlan(data.initial,data.targetSpeed));
};
