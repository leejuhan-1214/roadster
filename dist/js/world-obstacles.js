// Shared dimensions for visible solids and static collision, in metres.
const box=(id,center,size,color='#637b82',label='BARRIER')=>({id,center,size,color,label});
export const FACILITY_SOLIDS=[
 box('hangar',[-30,4,-38],[40,8,15]),box('hangar-roof',[-30,8.1,-38],[41,.45,16]),
 box('tower-base',[-60,6.5,-70],[5,13,5]),box('tower-cabin',[-60,13,-70],[11,3.2,8]),
 ...Array.from({length:60},(_,i)=>box('boundary-'+i,[-75+i*4,.4,-23],[2.3,.8,.45])),
 ...Array.from({length:12},(_,i)=>box('lamp-'+i,[-40+i*20,3,21],[.16,6,.16])),
];
export const SANDBOX={id:'sandbox',checkpoints:[],obstacles:[
 box('impact-wall',[9,1.05,0],[.8,2.1,6],'#ba7650','IMPACT WALL'),
 box('offset-block',[17,.65,-6],[3,1.3,2.4],'#cc9958','SLALOM'),
 box('landing-platform',[23,.65,5],[7,1.3,5],'#537f87','LANDING PAD'),
 box('clearance-left',[34,2.5,-4],[.7,5,.7],'#5b9099','CLEARANCE'),
 box('clearance-right',[34,2.5,4],[.7,5,.7],'#5b9099','CLEARANCE'),
 box('clearance-top',[34,5,0],[.7,.5,8.7],'#6ba5af','OVERHEAD'),
]};
export function experimentObstacles(kind='sandbox'){
 return [...FACILITY_SOLIDS,...(kind==='sandbox'?SANDBOX.obstacles:[])];
}
