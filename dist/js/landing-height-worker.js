import {runLandingHeightStudy} from './landing-height-study.js?v=20261123-seoul-warp';

self.onmessage=({data})=>{
  try{
    const study=runLandingHeightStudy(data,progress=>self.postMessage({progress}));
    self.postMessage({study});
  }catch(error){self.postMessage({error:error.message});}
};
