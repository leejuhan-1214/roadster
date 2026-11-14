/* Coefficients adapted from CoolProp7.2.0.
MIT License

Copyright (c) 2012-2018 Ian H. Bell and other CoolProp developers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
/** Dry-air Helmholtz EOS, Lemmon et al. (2000), DOI 10.1063/1.1285884.
 * Coefficients: CoolProp 7.2.0 Air.json (MIT), see docs/v143-air-calibration.md.
 * This small evaluator uses the gas/supercritical branch only. Application
 * operation is limited to >=233.15 K; it is not a liquid-air model.
 */
export const REAL_AIR_R=287.0491267875601;
const TR=132.6312, RHOR=302.622436442;
const N=[0.118160747229,0.713116392079,-1.61824192067,0.0714140178971,-0.0865421396646,0.134211176704,0.0112626704218,-0.0420533228842,0.0349008431982,0.000164957183186,-0.101365037912,-0.17381369097,-0.0472103183731,-0.0122523554253,-0.146629609713,-0.0316055879821,0.000233594806142,0.0148287891978,-0.00938782884667], D=[1,1,1,2,3,3,4,4,4,6,1,3,5,6,1,3,11,1,3], T=[0,0.33,1.01,0,0,0.15,0,0.2,0.35,1.35,1.6,0.8,0.95,1.25,3.6,6,3.25,3.5,15], L=[0,0,0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,3,3];

export function airState(rho,temp){
 if(!(rho>0)||!(temp>=150&&temp<=1500))throw new RangeError('Air EOS requires density > 0 and 150 <= temperature <= 1500 K');
 const d=rho/RHOR,tau=TR/temp;
 let rd=0,rdd=0,rt=0,rtt=0,rdt=0;
 for(let i=0;i<N.length;i++){
  const li=L[i],di=D[i],ti=T[i],dl=li?d**li:0;
  const f=N[i]*d**di*tau**ti*(li?Math.exp(-dl):1),ad=di-li*dl;
  rd+=f*ad/d;rdd+=f*(ad*ad-ad-li*li*dl)/(d*d);
  rt+=f*ti/tau;rtt+=f*ti*(ti-1)/(tau*tau);rdt+=f*ad*ti/(d*tau);
 }
 const pN=[6.057194e-8,-2.10274769e-5,-.000158860716,-13.841928076,17.275266575,-.00019536342];
 const pT=[-3,-2,-1,0,1,1.5];
 let ot=2.490888032/tau+3.31112445645577,ott=-2.490888032/(tau*tau);
 for(let i=0;i<pN.length;i++){const ti=pT[i],f=pN[i]*tau**ti;ot+=f*ti/tau;ott+=f*ti*(ti-1)/(tau*tau);}
 for(const [n,a] of [[.791309509,25.36365],[.212236768,16.90741]]){
  const em=Math.exp(-a*tau),den=1-em;ot+=n*a*em/den;ott-=n*a*a*em/(den*den);
 }
 // n*ln(c+exp(a*tau)); inverse exponential avoids overflow.
 const n=-.197938904,a=87.31279,c=2/3,em=Math.exp(-a*tau),den=1+c*em;
 ot+=n*a/den;ott+=n*a*a*c*em/(den*den);
 const z=1+d*rd,pressure=rho*REAL_AIR_R*temp*z;
 const u=REAL_AIR_R*temp*tau*(ot+rt),cv=-REAL_AIR_R*tau*tau*(ott+rtt);
 const dpdrho=REAL_AIR_R*temp*(1+2*d*rd+d*d*rdd);
 const cp=cv+REAL_AIR_R*(1+d*rd-d*tau*rdt)**2/(1+2*d*rd+d*d*rdd);
 return {pressure,u,h:u+pressure/rho,cv,cp,z,dpdrho};
}
export function airDensity(pressure,temp){
 if(!(pressure>0))return 0;
 let lo=1e-10,hi=1300,rho=Math.max(lo,Math.min(hi,pressure/(REAL_AIR_R*temp)));
 for(let i=0;i<32;i++){
  const s=airState(rho,temp),err=s.pressure-pressure;
  if(Math.abs(err)<Math.max(.001,pressure*1e-10))return rho;
  if(err>0)hi=rho;else lo=rho;
  const step=rho-err/s.dpdrho;rho=Number.isFinite(step)&&step>lo&&step<hi?step:(lo+hi)/2;
 }
 return rho;
}
export function airTemperature(rho,u,guess=293.15){
 let lo=150,hi=1500,temp=Math.min(hi,Math.max(lo,guess));
 for(let i=0;i<32;i++){
  const s=airState(rho,temp),err=s.u-u;
  if(Math.abs(err)<1e-8)return temp;
  if(err>0)hi=temp;else lo=temp;
  const step=temp-err/s.cv;temp=Number.isFinite(step)&&step>lo&&step<hi?step:(lo+hi)/2;
 }
 const error=Math.abs(airState(rho,temp).u-u);
 if(error>.01)throw new RangeError('Air internal energy is outside the gas-model temperature domain');
 return temp;
}
