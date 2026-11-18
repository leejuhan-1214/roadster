// Horizontal contact between a simulated player and a moving AI car.
// Positive yaw points the local car nose (+X) towards world -Z.
export function resolveRivalContact(sim, rival, dt) {
  const {pos, vel, q} = sim.state;
  if (pos.y - sim.restHeight > 1.4) return;
  const dx = pos.x - rival.x, dz = pos.z - rival.z;
  if (Math.abs(dx) > 7 || Math.abs(dz) > 7) return;
  const yaw = Math.atan2(2 * (q.w * q.y - q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
  const pf = [Math.cos(yaw), -Math.sin(yaw)], pr = [-pf[1], pf[0]];
  const rf = [Math.cos(rival.heading), -Math.sin(rival.heading)], rr = [-rf[1], rf[0]];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1];
  let depth = Infinity, nx = 0, nz = 0;
  for (const axis of [pf, pr, rf, rr]) {
    const car = Math.abs(dot(pf,axis))*sim.params.bodyLength/2 + Math.abs(dot(pr,axis))*sim.params.bodyWidth/2;
    const other = Math.abs(dot(rf,axis))*2.18 + Math.abs(dot(rr,axis))*.99;
    const distance = dx*axis[0] + dz*axis[1];
    const overlap = car + other - Math.abs(distance);
    if (overlap <= 0) return;
    if (overlap < depth) {
      depth = overlap;
      const sign = distance < 0 ? -1 : 1;
      nx = sign*axis[0]; nz = sign*axis[1];
    }
  }
  const normalSpeed = (vel.x - rival.speed*rf[0])*nx + (vel.z - rival.speed*rf[1])*nz;
  // AI follows a prescribed racing line; match the approaching normal velocity
  // while retaining the player's tangential velocity along the other car.
  if (normalSpeed < 0) { vel.x -= nx*normalSpeed; vel.z -= nz*normalSpeed; }
  const correction = Math.min(depth, 8*dt);
  pos.x += nx*correction; pos.z += nz*correction;
}
