import {runLandingHeightStudy} from './landing-height-study.js?v=20261122-wheel-repair';

self.onmessage=({data})=>{
  try{
    const study=runLandingHeightStudy(data,progress=>self.postMessage({progress}));
    self.postMessage({study});
  }catch(error){self.postMessage({error:error.message});}
};
