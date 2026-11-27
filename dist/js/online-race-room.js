// The room owner is the authority for admission, the start clock and the result table.
// Positions are ephemeral. Only the small room roster is sent on reliable state changes.
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomPrefix='seoul-roadster-r1-';
const protocol='roadster-race-v1';
const maxDrivers=4;
const poseKeys=['x','y','z','qx','qy','qz','qw','progress'];
const idleState=message=>({phase:'idle',isHost:false,code:'',courseId:'',selfId:'',players:[],message});
const driverName=value=>String(value||'드라이버').replace(/[\u0000-\u001f<>&]/g,'').trim().slice(0,16)||'드라이버';
const courseIdOK=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);
export const normalizeRoomCode=value=>String(value||'').trim().toUpperCase();
const validCode=code=>code.length===6&&[...code].every(c=>alphabet.includes(c));
const roomCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),byte=>alphabet[byte&31]).join('');
const peerId=code=>roomPrefix+code.toLowerCase();
const player=(id,name,slot)=>({id,name:driverName(name),slot,ready:false,finished:false,disconnected:false,rank:null,elapsedMs:null});
const peerFailure=type=>({
  'peer-unavailable':'방을 찾을 수 없어요. 방 코드와 방장 연결을 확인해 주세요.',
  'unavailable-id':'같은 방 코드가 사용 중이에요. 방을 다시 만들어 주세요.',
  'browser-incompatible':'이 브라우저는 온라인 경주에 필요한 WebRTC를 지원하지 않아요.',
  'network':'신호 서버와 연결이 끊겼어요.',
  'server-error':'신호 서버에 연결하지 못했어요.',
  'socket-error':'신호 서버에 연결하지 못했어요.'
}[type]||'온라인 방에 연결하지 못했어요. 네트워크를 확인해 주세요.');

async function browserPeer(id){
  await import('../vendor/peerjs-1.5.5.min.js');
  return new globalThis.Peer(id,{debug:0});
}

function cleanPose(input){
  if(!input||!poseKeys.every(k=>Number.isFinite(input[k])&&Math.abs(input[k])<=100000))return null;
  const norm=Math.hypot(input.qx,input.qy,input.qz,input.qw);
  if(norm<.5||norm>1.5)return null;
  const data=Object.fromEntries(poseKeys.map(k=>[k,input[k]]));
  for(const key of ['qx','qy','qz','qw'])data[key]/=norm;
  return data;
}

export class OnlineRaceRoom {
  constructor({onState=()=>{},onPrepare=()=>{},onStart=()=>{},onPose=()=>{},onFinish=()=>{},
    createPeer=browserPeer,now=()=>Date.now()}={}){
    Object.assign(this,{onState,onPrepare,onStart,onPose,onFinish,createPeer,now});
    this.state=idleState('');
    this.links=new Map();
    this.epoch=0;
  }
  update(changes){
    this.state={...this.state,...changes};
    this.onState(this.state);
  }
  host({courseId,name}){
    if(!courseIdOK(courseId))return Promise.reject(new Error('경기장을 먼저 선택해 주세요.'));
    return this.openRoom({code:roomCode(),name,courseId,isHost:true});
  }
  join({code,name}){
    code=normalizeRoomCode(code);
    if(!validCode(code))return Promise.reject(new Error('방 코드 여섯 글자를 확인해 주세요.'));
    return this.openRoom({code,name,courseId:'',isHost:false});
  }
  openRoom({code,name,courseId,isHost}){
    this.leave();
    const epoch=this.epoch,id=isHost?peerId(code):roomPrefix+'p-'+crypto.randomUUID();
    this.ready=new Set();this.nextPoseAt=0;this.lastInboundPose=new Map();this.startAt=0;
    this.clockOffset=0;this.bestRTT=Infinity;this.ownFinishSent=false;
    this.update({phase:'connecting',isHost,code,courseId,selfId:id,message:''});
    const connection=new Promise((resolve,reject)=>{this.pending={resolve,reject};});
    this.connectionTimer=setTimeout(()=>this.leave('방 연결 시간이 초과됐어요. 방 코드와 네트워크를 확인해 주세요.'),22000);
    Promise.resolve().then(()=>this.createPeer(id)).then(peer=>{
      if(this.epoch!==epoch){peer.destroy();return;}
      this.peer=peer;
      const current=fn=>(...args)=>{if(this.epoch===epoch)fn(...args);};
      peer.on('open',current(()=>{
        if(this.state.phase!=='connecting'){
          if(this.state.phase==='lobby')this.update({message:''});
          return;
        }
        if(isHost){
          this.update({phase:'lobby',players:[player(id,name,0)]});
          this.connected();
        }else{
          const link=peer.connect(peerId(code),{label:protocol,serialization:'json',reliable:true,
            metadata:{protocol,name:driverName(name)}});
          this.linkEvents(link,epoch);
        }
      }));
      peer.on('connection',current(link=>{
        if(!isHost){link.close();return;}
        this.linkEvents(link,epoch);
      }));
      peer.on('error',current(error=>{
        if(this.state.phase==='connecting'||error.type==='browser-incompatible')this.leave(peerFailure(error.type));
        else if(isHost&&this.state.phase==='lobby')this.update({message:peerFailure(error.type)});
      }));
      peer.on('close',current(()=>this.leave('온라인 방 연결이 종료됐어요.')));
      peer.on('disconnected',current(()=>{
        if(this.state.phase==='connecting'){this.leave(peerFailure('network'));return;}
        if(this.state.phase==='lobby')this.update({message:'신호 서버에 다시 연결하는 중이에요.'});
        if(!peer.destroyed&&peer.disconnected){try{peer.reconnect();}catch{/* Existing data channels still work. */}}
      }));
    }).catch(error=>{if(epoch===this.epoch)this.leave(peerFailure(error.type));});
    return connection;
  }
  connected(){
    clearTimeout(this.connectionTimer);
    this.pending?.resolve(this.state);this.pending=null;
  }
  linkEvents(link,epoch){
    const id=link.peer;
    const current=()=>epoch===this.epoch;
    link.on('open',()=>{
      if(!current()){link.close();return;}
      if(this.state.isHost){
        const {phase,players}=this.state;
        const reason=phase!=='lobby'?'이미 경주가 시작됐어요.':players.length>=maxDrivers?'방 인원이 가득 찼어요.':
          link.label!==protocol||link.metadata?.protocol!==protocol||this.links.has(id)?'같은 버전의 도시 주행에서 접속해 주세요.':'';
        if(reason){link.send({t:'reject',reason});setTimeout(()=>link.close(),450);return;}
        const slot=[0,1,2,3].find(s=>!players.some(p=>p.slot===s));
        this.links.set(id,link);
        this.update({players:[...players,player(id,link.metadata.name,slot)],message:''});
        this.broadcastRoster();
      }else{
        this.links.set(id,link);
        link.send({t:'ping',sentAt:this.now()});
      }
    });
    link.on('data',msg=>{
      if(!current()||this.links.get(id)!==link||!msg||typeof msg!=='object')return;
      if(this.state.isHost)this.fromGuest(id,msg);else this.fromHost(msg);
    });
    const dropped=()=>{
      if(!current()||this.links.get(id)!==link)return;
      this.links.delete(id);
      if(!this.state.isHost){this.leave('방장이 방을 나갔거나 연결이 끊겼어요.');return;}
      this.dropGuest(id);
    };
    link.on('close',dropped);link.on('error',dropped);
  }
  broadcast(msg,except=null){
    for(const [id,link] of this.links)if(id!==except&&link.open)link.send(msg);
  }
  broadcastRoster(){
    const {players,courseId,phase}=this.state;
    this.broadcast({t:'roster',players,courseId,phase});
  }
  self(){
    return this.state.players.find(p=>p.id===this.state.selfId);
  }
  context(){
    return {courseId:this.state.courseId,slot:this.self()?.slot,players:this.state.players};
  }
  dropGuest(id){
    const {phase,players}=this.state;
    if(phase==='lobby'){
      this.update({players:players.filter(p=>p.id!==id)});this.broadcastRoster();return;
    }
    this.update({players:players.map(p=>p.id===id?{...p,disconnected:true}:p)});
    this.broadcastRoster();
    if(phase==='preparing'){
      if(this.links.size===0)this.leave('상대가 나가서 경주 준비가 끝났어요.');
      else this.startWhenReady();
    }
    if(phase==='racing')this.checkResults();
  }
  fromGuest(id,msg){
    if(msg.t==='ping'&&Number.isFinite(msg.sentAt)){
      this.links.get(id)?.send({t:'pong',sentAt:msg.sentAt,hostAt:this.now()});
    }else if(msg.t==='ready'&&this.state.phase==='preparing'){
      this.setReady(id);
    }else if(msg.t==='finish'&&this.state.phase==='racing'){
      this.recordFinish(id,msg.elapsedMs);
    }else if(msg.t==='pose'&&this.state.phase==='racing'){
      const now=this.now();
      if(now-(this.lastInboundPose.get(id)??-Infinity)<30)return;
      const pose=this.deliverPose(id,msg.pose);
      if(pose){this.lastInboundPose.set(id,now);this.broadcastPose(id,pose);}
    }
  }
  fromHost(msg){
    if(msg.t==='reject'){this.leave(String(msg.reason||'입장할 수 없어요.').slice(0,100));return;}
    if(msg.t==='pong'){
      const now=this.now(),rtt=now-msg.sentAt;
      if(Number.isFinite(rtt)&&Number.isFinite(msg.hostAt)&&rtt>=0&&rtt<this.bestRTT){
        this.bestRTT=rtt;this.clockOffset=msg.hostAt-(now+msg.sentAt)/2;
      }
      return;
    }
    if(msg.t==='roster'){
      if(!courseIdOK(msg.courseId)||!Array.isArray(msg.players)||msg.players.length<1||msg.players.length>maxDrivers)return;
      const players=msg.players.map(p=>p&&typeof p.id==='string'&&Number.isInteger(p.slot)&&p.slot>=0&&p.slot<maxDrivers?
        {...player(p.id, p.name,p.slot),ready:p.ready===true,finished:p.finished===true,disconnected:p.disconnected===true,
          elapsedMs:Number.isFinite(p.elapsedMs)?p.elapsedMs:null,rank:Number.isInteger(p.rank)?p.rank:null}:null);
      if(players.some(p=>!p)||!players.some(p=>p.id===this.state.selfId))return;
      const entering=this.state.phase==='connecting';
      this.update({players,courseId:msg.courseId,phase:entering?'lobby':this.state.phase,message:''});
      if(entering)this.connected();
    }else if(msg.t==='prepare'&&this.state.phase==='lobby'){
      this.prepare();
    }else if(msg.t==='start'&&this.state.phase==='preparing'&&Number.isFinite(msg.startAt)){
      this.begin(msg.startAt-this.clockOffset);
    }else if(msg.t==='pose'&&this.state.phase==='racing'){
      this.deliverPose(msg.id,msg.pose);
    }else if(msg.t==='finish'&&(this.state.phase==='racing'||this.state.phase==='finished')){
      const p=this.state.players.find(p=>p.id===msg.id);
      if(p?.finished)this.onFinish({...p});
    }else if(msg.t==='complete'&&this.state.phase==='racing'){
      this.update({phase:'finished'});
    }
  }
  start(){
    if(!this.state.isHost||this.state.phase!=='lobby'||this.state.players.length<2)return false;
    this.broadcast({t:'prepare'});this.prepare();return true;
  }
  async prepare(){
    const epoch=this.epoch;
    this.update({phase:'preparing',message:''});
    this.preparationTimer=setTimeout(()=>this.leave('경기장 준비 시간이 초과됐어요. 방을 다시 열어 주세요.'),90000);
    try{
      await this.onPrepare(this.context());
      if(this.epoch!==epoch||this.state.phase!=='preparing')return;
      if(this.state.isHost)this.setReady(this.state.selfId);
      else{
        this.broadcast({t:'ping',sentAt:this.now()});
        this.broadcast({t:'ready'});
      }
    }catch{
      if(epoch===this.epoch)this.leave('경기장을 불러오지 못했어요. 방을 다시 열어 주세요.');
    }
  }
  setReady(id){
    if(this.ready.has(id))return;
    this.ready.add(id);
    this.update({players:this.state.players.map(p=>p.id===id?{...p,ready:true}:p)});
    this.broadcastRoster();this.startWhenReady();
  }
  startWhenReady(){
    if(this.state.phase!=='preparing'||!this.state.players.filter(p=>!p.disconnected).every(p=>this.ready.has(p.id)))return;
    const startAt=this.now()+3000;
    this.broadcast({t:'start',startAt});this.begin(startAt);
  }
  begin(startAt){
    clearTimeout(this.preparationTimer);this.startAt=startAt;
    this.update({phase:'racing'});
    this.onStart({...this.context(),startAt});
  }
  deliverPose(id,input){
    const p=this.state.players.find(p=>p.id===id);
    if(!p||p.disconnected||id===this.state.selfId)return;
    const pose=cleanPose(input);
    if(pose)this.onPose({id,slot:p.slot,name:p.name,...pose});
    return pose;
  }
  sendPose(input){
    const now=this.now();
    if(this.state.phase!=='racing'||now<this.nextPoseAt)return;
    const pose=cleanPose(input);
    if(!pose)return;
    this.nextPoseAt=now+80;
    this.broadcastPose(this.state.selfId,pose);
  }
  broadcastPose(id,pose){
    // Drop transient updates if a slow link already has data queued. Reliable
    // roster and finish messages keep their place even on slow connections.
    const msg={t:'pose',id,pose};
    for(const [recipient,link] of this.links)
      if(recipient!==id&&link.open&&!(link.dataChannel?.bufferedAmount>16384))link.send(msg);
  }
  finish(){
    if(this.state.phase!=='racing'||this.ownFinishSent||this.now()<this.startAt)return false;
    this.ownFinishSent=true;
    const elapsedMs=Math.round(this.now()-this.startAt);
    if(this.state.isHost)this.recordFinish(this.state.selfId,elapsedMs);
    else this.broadcast({t:'finish',elapsedMs});
    return true;
  }
  recordFinish(id,elapsedMs){
    const p=this.state.players.find(p=>p.id===id);
    if(!p||p.finished||p.disconnected||!Number.isFinite(elapsedMs)||elapsedMs<0||this.now()<this.startAt)return;
    elapsedMs=Math.round(Math.min(elapsedMs,this.now()-this.startAt));
    const players=this.state.players.map(driver=>driver.id===id?{...driver,finished:true,elapsedMs}:driver);
    const sorted=players.filter(p=>p.finished).sort((a,b)=>a.elapsedMs-b.elapsedMs||a.slot-b.slot);
    const ranked=players.map(p=>p.finished?{...p,rank:sorted.findIndex(d=>d.id===p.id)+1}:p);
    this.update({players:ranked});this.broadcastRoster();
    this.onFinish({...ranked.find(p=>p.id===id)});
    this.broadcast({t:'finish',id});
    this.checkResults();
  }
  checkResults(){
    if(this.state.players.every(p=>p.finished||p.disconnected)){
      this.update({phase:'finished'});this.broadcast({t:'complete'});
    }
  }
  leave(message=''){
    ++this.epoch;
    clearTimeout(this.connectionTimer);clearTimeout(this.preparationTimer);
    this.pending?.reject(new Error(message||'방 연결을 취소했어요.'));this.pending=null;
    for(const link of this.links.values())link.close();
    this.links.clear();this.peer?.destroy();this.peer=null;
    if(this.state.phase!=='idle'||message)this.update(idleState(message));
  }
}
