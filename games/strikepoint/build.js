// Dropzone quick-build: wall / floor / ramp pieces on a 4 m grid from salvaged alloy. Pieces are real
// colliders (block bullets, LOS and movement), have HP, animate in, and break under fire or blasts.
import { THREE } from '/shared/sd-kit.js';
import { uniform, vec3 } from 'three/tsl';

const G = 4, H = 3.6, T = 0.26, COST = 10;
const HP = { wall: 220, floor: 170, ramp: 170 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

function panelTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#7d8a96'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#4c5762'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 124);
  g.lineWidth = 2; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(0, 64); g.lineTo(128, 64); g.stroke();
  g.fillStyle = '#5e6a75'; for (const [x, y] of [[10, 10], [110, 10], [10, 110], [110, 110], [54, 54], [70, 70]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(6, 6, 52, 52); g.fillRect(70, 70, 52, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Builds {
  constructor(game) {
    this.game = game; this.pieces = []; this.sel = 'wall'; this.tex = panelTex();
    const mat = new THREE.MeshStandardNodeMaterial({ map: this.tex, roughness: 0.55, metalness: 0.35 });
    const geos = { wall: new THREE.BoxGeometry(G, H, T).translate(0, H / 2, 0), floor: new THREE.BoxGeometry(G, T, G).translate(0, T / 2, 0), ramp: new THREE.BoxGeometry(G, T, Math.hypot(G, H)) };
    this.meshes = {}; for (const k of ['wall', 'floor', 'ramp']) { const m = new THREE.InstancedMesh(geos[k], mat, 160); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; for (let i = 0; i < 160; i++) m.setMatrixAt(i, HIDE); m.count = 1; game.scene.add(m); this.meshes[k] = m; }
    this.ghostCol = uniform(new THREE.Color(0.3, 0.7, 1.4));
    const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, opacity: 0.35, depthWrite: false }); gm.colorNode = this.ghostCol;
    this.ghosts = {}; for (const k of ['wall', 'floor', 'ramp']) { const m = new THREE.Mesh(geos[k], gm); m.visible = false; game.scene.add(m); this.ghosts[k] = m; }
    this.geos = geos;
  }
  clear() { for (const p of this.pieces) this.game.world?.remove(p.col); this.pieces = []; this.sync(); for (const g of Object.values(this.ghosts)) g.visible = false; }
  // compute placement for a piece kind from an eye position + yaw (player or bot)
  plan(kind, px, py, pz, yaw) {
    const W = this.game.world; const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const ax = Math.abs(fx) > Math.abs(fz); // dominant facing axis
    const tx = px + fx * (kind === 'wall' ? 1.6 : 2.6), tz = pz + fz * (kind === 'wall' ? 1.6 : 2.6);
    const cx = Math.floor(tx / G) * G + G / 2, cz = Math.floor(tz / G) * G + G / 2;
    const ter = W.terrain(cx, cz); const lvl = Math.max(0, Math.floor((py - ter + 0.6) / H)); const base = ter + lvl * H - (lvl === 0 ? 0.05 : 0);
    if (kind === 'wall') {
      // wall on the cell edge facing the builder
      const ex = ax ? (fx > 0 ? cx - G / 2 : cx + G / 2) : cx, ez = ax ? cz : (fz > 0 ? cz - G / 2 : cz + G / 2);
      return { kind, x: ex, y: base, z: ez, rotY: ax ? Math.PI / 2 : 0, ax };
    }
    if (kind === 'floor') return { kind, x: cx, y: Math.max(base, ter) + (lvl > 0 ? 0 : 0), z: cz, rotY: 0 };
    const dirSign = ax ? Math.sign(fx) : Math.sign(fz);
    return { kind, x: cx, y: base, z: cz, rotY: 0, ax, dir: dirSign };
  }
  key(p) { return `${p.kind}|${p.x.toFixed(1)}|${p.y.toFixed(1)}|${p.z.toFixed(1)}|${p.ax ? 1 : 0}`; }
  canPlace(p) { const k = this.key(p); return !this.pieces.some((q) => q.key === k); }
  place(p, owner) {
    if (!this.canPlace(p) || this.pieces.length >= 450) return null; const W = this.game.world;
    const piece = { ...p, key: this.key(p), hp: HP[p.kind], max: HP[p.kind], grow: 0, owner };
    if (p.kind === 'wall') piece.col = p.ax ? W.add(p.x - T / 2, p.y, p.z - G / 2, p.x + T / 2, p.y + H, p.z + G / 2, 'metal', { piece }) : W.add(p.x - G / 2, p.y, p.z - T / 2, p.x + G / 2, p.y + H, p.z + T / 2, 'metal', { piece });
    else if (p.kind === 'floor') piece.col = W.add(p.x - G / 2, p.y, p.z - G / 2, p.x + G / 2, p.y + T, p.z + G / 2, 'metal', { piece });
    else piece.col = W.add(p.x - G / 2, p.y, p.z - G / 2, p.x + G / 2, p.y + H, p.z + G / 2, 'metal', { kind: 'ramp', axis: p.ax ? 0 : 2, dir: p.dir, piece });
    piece.col.piece = piece;
    this.pieces.push(piece); this.game.audio.ui('build'); this.sync(); return piece;
  }
  damage(piece, dmg) {
    if (!piece || piece.hp <= 0) return; piece.hp -= dmg; piece.flash = 0.1;
    if (piece.hp <= 0) this.breakPiece(piece);
  }
  breakPiece(piece) {
    const g = this.game; g.world.remove(piece.col); this.pieces.splice(this.pieces.indexOf(piece), 1);
    for (let i = 0; i < 10; i++) g.fx.chip(piece.x + (Math.random() - 0.5) * 3, piece.y + Math.random() * 3, piece.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4, 0.12 + Math.random() * 0.15, 0x7d8a96, 2);
    g.fx.puff(piece.x, piece.y + 1.5, piece.z, 0, 0.5, 0, 1.5, 2, 1.2, 0.6, 0.62, 0.66, 0.6); g.audio.ui('break'); this.sync();
  }
  blast(x, y, z, r, dmg) { for (const p of [...this.pieces]) { const d = Math.hypot(p.x - x, p.y + 1.5 - y, p.z - z); if (d < r + 2) this.damage(p, dmg * 1.6 * (1 - d / (r + 2))); } }
  sync() {
    const n = { wall: 0, floor: 0, ramp: 0 };
    for (const p of this.pieces) {
      const m = this.meshes[p.kind]; const i = n[p.kind]++; if (i >= 160) continue; const k = Math.min(1, p.grow);
      if (p.kind === 'ramp') { const ang = Math.atan2(H, G); _e.set(p.ax ? 0 : -ang * p.dir, p.ax ? Math.PI / 2 : 0, 0, 'YXZ'); if (p.ax) _e.set(-ang * p.dir, Math.PI / 2, 0, 'YXZ'); _q.setFromEuler(_e); _p.set(p.x, p.y + H / 2, p.z); }
      else { _q.setFromAxisAngle(_up, p.rotY); _p.set(p.x, p.y, p.z); }
      _m.compose(_p, _q, _s.set(1, 0.2 + 0.8 * k, 1)); m.setMatrixAt(i, _m);
    }
    for (const k of ['wall', 'floor', 'ramp']) { const m = this.meshes[k]; for (let i = n[k]; i < Math.max(1, m.count); i++) m.setMatrixAt(i, HIDE); m.count = Math.max(1, n[k]); m.instanceMatrix.needsUpdate = true; }
  }
  update(dt, inp) {
    const g = this.game; let anim = false;
    for (const p of this.pieces) if (p.grow < 1) { p.grow = Math.min(1, p.grow + dt * 5); anim = true; }
    if (anim) this.sync();
    for (const gh of Object.values(this.ghosts)) gh.visible = false;
    if (!g.buildMode || !g.player.alive) return;
    if (inp.wall) this.sel = 'wall'; if (inp.floor) this.sel = 'floor'; if (inp.ramp) this.sel = 'ramp';
    if (inp.wheel) { const ks = ['wall', 'floor', 'ramp']; this.sel = ks[(ks.indexOf(this.sel) + (inp.wheel > 0 ? 1 : 2)) % 3]; }
    const P = g.player.pos; const plan = this.plan(this.sel, P.x, P.y, P.z, g.player.yaw);
    const gh = this.ghosts[this.sel]; gh.visible = true;
    if (plan.kind === 'ramp') { const ang = Math.atan2(H, G); if (plan.ax) gh.rotation.set(-ang * plan.dir, Math.PI / 2, 0, 'YXZ'); else gh.rotation.set(-ang * plan.dir, 0, 0, 'YXZ'); gh.position.set(plan.x, plan.y + H / 2, plan.z); }
    else { gh.rotation.set(0, plan.rotY, 0); gh.position.set(plan.x, plan.y, plan.z); }
    const ok = this.canPlace(plan) && (g.mats || 0) >= COST; this.ghostCol.value.setRGB(ok ? 0.3 : 1.6, ok ? 0.8 : 0.3, ok ? 1.6 : 0.2);
    g.hud.buildBar(true, this.sel);
    if (inp.fire && !this.fireHeld && ok) { this.place(plan, g.player); g.mats -= COST; g.hud.mats(g.mats); }
    this.fireHeld = inp.fire;
  }
}
const _up = new THREE.Vector3(0, 1, 0);
