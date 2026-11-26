// Thrown frag/smoke grenades: bouncing physics against the collision world, cook timers, explosions with
// LOS-scaled damage, smoke clouds that block AI vision. One instanced mesh for all live grenades.
import { THREE } from '/shared/sd-kit.js';
import { GRENADES } from './config.js';

const HIDE = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Grenades {
  constructor(game) {
    this.game = game; this.list = [];
    const geo = new THREE.SphereGeometry(0.045, 10, 8).scale(1, 1.25, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardNodeMaterial({ color: 0x3d4a32, roughness: 0.6, metalness: 0.3 }), 24);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3).fill(1), 3);
    for (let i = 0; i < 24; i++) this.mesh.setMatrixAt(i, HIDE); this.mesh.frustumCulled = false; this.mesh.castShadow = true; game.scene.add(this.mesh);
    this.smokes = game.world.smokes;
  }
  throw(kind, x, y, z, vx, vy, vz, owner, fuse) {
    const G = GRENADES[kind]; this.list.push({ kind, x, y, z, vx, vy, vz, owner, fuse: fuse ?? G.fuse, rx: 0, rz: 0, beep: 0, rest: false });
    this.game.audio?.whoosh();
  }
  update(dt) {
    const g = this.game, W = g.world; let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const gr = this.list[i]; gr.fuse -= dt;
      if (!gr.rest) {
        gr.vy -= 20 * (g.cfg.gravity ?? 1) * dt;
        const sp = Math.hypot(gr.vx, gr.vy, gr.vz), step = sp * dt;
        if (step > 1e-4) {
          const h = W.ray(gr.x, gr.y, gr.z, gr.vx / sp, gr.vy / sp, gr.vz / sp, step + 0.05);
          if (h) {
            gr.x = h.x + h.nx * 0.05; gr.y = h.y + h.ny * 0.05; gr.z = h.z + h.nz * 0.05;
            const dot = gr.vx * h.nx + gr.vy * h.ny + gr.vz * h.nz; gr.vx -= 1.6 * dot * h.nx; gr.vy -= 1.6 * dot * h.ny; gr.vz -= 1.6 * dot * h.nz;
            gr.vx *= 0.55; gr.vy *= 0.45; gr.vz *= 0.55;
            if (sp > 2) g.audio?.grenadeBounce(gr.x, gr.y, gr.z);
            if (h.ny > 0.7 && Math.hypot(gr.vx, gr.vy, gr.vz) < 1.0) { gr.rest = true; gr.vx = gr.vy = gr.vz = 0; }
          } else { gr.x += gr.vx * dt; gr.y += gr.vy * dt; gr.z += gr.vz * dt; }
        }
        gr.rx += dt * 9; gr.rz += dt * 6;
      }
      if (gr.kind === 'frag') { gr.beep -= dt; if (gr.beep <= 0 && gr.fuse < 2.2) { gr.beep = gr.fuse < 1 ? 0.15 : 0.4; g.audio?.beep(gr.x, gr.y, gr.z, 2200); g.fx.glow(gr.x, gr.y + 0.06, gr.z, 0.25, 0.08, 3, 0.4, 0.2); } }
      if (gr.fuse <= 0) {
        this.list.splice(i, 1);
        if (gr.kind === 'frag') g.explode(gr.x, gr.y, gr.z, { radius: GRENADES.frag.radius, dmg: GRENADES.frag.dmg, owner: gr.owner });
        else this.popSmoke(gr.x, gr.y, gr.z);
        continue;
      }
      _q.setFromEuler(_e.set(gr.rx, 0, gr.rz)); _m.compose(_p.set(gr.x, gr.y + 0.04, gr.z), _q, _s);
      this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, gr.kind === 'frag' ? _c1 : _c2); n++;
    }
    for (let i = n; i < Math.max(n + 1, this.lastN || 0); i++) this.mesh.setMatrixAt(i, HIDE);
    this.lastN = n; this.mesh.count = Math.max(1, n); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
    // smoke clouds: grow, emit, fade
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t += dt;
      s.r = Math.min(GRENADES.smoke.radius, s.t * 2.4) * (s.t > s.dur - 3 ? Math.max(0, (s.dur - s.t) / 3) : 1);
      s.emit -= dt; if (s.emit <= 0 && s.t < s.dur - 2) { s.emit = 0.16; g.fx.smokeBurst(s.x, s.y + 0.6, s.z, Math.max(1.2, s.r * 1.1)); }
      if (s.t > s.dur) this.smokes.splice(i, 1);
    }
  }
  popSmoke(x, y, z) { this.smokes.push({ x, y: y + 1.2, z, r: 0, t: 0, dur: GRENADES.smoke.duration, emit: 0 }); this.game.audio?.smoke(x, y, z); }
  // nearest live frag to (x,z) within r → for HUD danger indicator
  danger(x, z, r = 9) { let best = null, bd = r; for (const g of this.list) { if (g.kind !== 'frag') continue; const d = Math.hypot(g.x - x, g.z - z); if (d < bd) { bd = d; best = g; } } return best; }
  clear() { this.list.length = 0; this.smokes.length = 0; }
}
const _c1 = new THREE.Color(0x3d4a32), _c2 = new THREE.Color(0x7a7f86);
