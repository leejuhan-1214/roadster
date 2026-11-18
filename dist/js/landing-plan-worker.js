import {measureEconomyPlan} from './landing-economy.js?v=20261118-audit148';

self.onmessage=({data})=>{
  self.postMessage(measureEconomyPlan(data.initial,data.targetSpeed));
};
