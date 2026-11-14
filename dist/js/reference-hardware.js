import {airDensity} from './air-eos.js?v=20261115-calibrated1';
// Source-backed component reference, not Tesla specifications or a certified retrofit.
// Twelve Luxfer L87A 9 L / 300 barg vessels; operate at 250 barg for the valve rating.
export const HARDWARE_MASS=Object.freeze({cylinders:12*4.8,ancillaries:25,total:12*4.8+25});
export const HARDWARE_PARAMS=Object.freeze({realGas:true,calibratedHardware:true,
 tankVolume:.108,tankPressureMPa:25.101325,initialTemperature:293.15,ambientTemperature:293.15,
 compressorExternalPower:true,compressorPowerKW:7.5,compressorFreeAirLMin:300,
 compressorStages:3,compressorTargetFraction:.99,feedLossCoefficient:0,
 valveKv:2.2,yawValveKv:.6,valveMaxPressureMPa:25.101325,
 valveTau:.065,valveCloseTau:.195,nozzleDischargeCoefficient:1,
 minimumGasOperatingTemperature:263.15,thermalRestartDelta:2,
 liftNozzleArea:Math.PI*.012**2/4,boostNozzleArea:Math.PI*.012**2/4,yawNozzleArea:Math.PI*.006**2/4,
});
export const REFERENCE_AIR_KG=airDensity(HARDWARE_PARAMS.tankPressureMPa*1e6,HARDWARE_PARAMS.initialTemperature)*HARDWARE_PARAMS.tankVolume;
