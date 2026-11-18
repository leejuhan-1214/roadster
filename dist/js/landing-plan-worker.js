import {measureEconomyPlan} from './landing-economy.js?v=20261118-study150';

self.onmessage=({data})=>{
  self.postMessage(measureEconomyPlan(data.initial,data.targetSpeed));
};
