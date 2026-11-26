// Emberwake — billboard pixel sprites ("HD-2D"): lit like the world (Lambert + a sprite floor so they never go
// muddy), a soft contact blob, frame animation via per-actor UV uniforms, hit-flash / tint / fade uniforms.
import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, uv, vec2, vec3, vec4, float, mix } from 'three/tsl';
import { paintHumanSheet, paintCritterSheet, paintMonsterSheet, HUMAN_FRAMES, HUMAN_COLS, HUMAN_ROWS, FW, FH, MONSTER_SIZE } from './pixel.js';

export const PX = 1 / 24; // world units per sprite pixel
const sheets = new Map();
function sheetTex(key, paint) {
  if (!sheets.has(key)) { const cv = paint(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; sheets.set(key, { tex: t, cv }); }
  return sheets.get(key);
}
export const spriteLight = uniform(0.4); // emissive floor for sprites (raised in dark maps)
let blobMat = null;
function blob() {
  if (!blobMat) {
    blobMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    blobMat.colorNode = Fn(() => { const d = uv().sub(0.5).length().mul(2); const a = float(1).sub(d).clamp(0, 1).pow(1.4).mul(0.42); return vec4(0.05, 0.03, 0.06, a); })();
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat); m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}

export class Actor {
  // kind: 'human' (cast look) | 'monster' (enemy sprite id)
  constructor({ look = null, monster = null, scale = 1, key }) {
    this.kind = monster ? 'monster' : 'human';
    let S, cols, rows, fw, fh;
    if (monster) { S = MONSTER_SIZE[monster] || 64; const sh = sheetTex('m:' + monster, () => paintMonsterSheet(monster)); this.sheet = sh; cols = 4; rows = 1; fw = S; fh = S; }
    else { const sh = sheetTex('h:' + key, () => (look.kind ? paintCritterSheet(look) : paintHumanSheet(look))); this.sheet = sh; cols = HUMAN_COLS; rows = HUMAN_ROWS; fw = FW; fh = FH; }
    this.cols = cols; this.rows = rows; this.fw = fw; this.fh = fh;
    const w = fw * PX * scale * (look?.scale || 1), h = fh * PX * scale * (look?.scale || 1);
    this.w = w; this.h = h;
    const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
    this.uFrame = uniform(new THREE.Vector4(0, 0, 1 / cols, 1 / rows)); this.uFlip = uniform(0); this.uFlash = uniform(0); this.uTint = uniform(new THREE.Color(1, 1, 1)); this.uAlpha = uniform(1);
    const tex = this.sheet.tex;
    const m = new THREE.MeshLambertNodeMaterial({ transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
    const fu = Fn(() => { const u = uv(); const ux = mix(u.x, float(1).sub(u.x), this.uFlip); return vec2(this.uFrame.x.add(ux.mul(this.uFrame.z)), this.uFrame.y.add(u.y.mul(this.uFrame.w))); });
    const samp = texture(tex, fu());
    m.colorNode = Fn(() => vec4(mix(samp.rgb.mul(this.uTint), vec3(1, 1, 1), this.uFlash), samp.a.mul(this.uAlpha)))();
    m.emissiveNode = Fn(() => mix(samp.rgb.mul(this.uTint).mul(spriteLight), vec3(1.4, 1.3, 1.2), this.uFlash))();
    this.mat = m;
    this.mesh = new THREE.Mesh(geo, m); this.mesh.receiveShadow = false; this.mesh.castShadow = false;
    this.group = new THREE.Group(); this.group.add(this.mesh);
    this.shadow = blob(); this.shadow.scale.set(w * (monster ? 0.75 : 0.62), w * (monster ? 0.32 : 0.3), 1); this.shadow.position.y = 0.03; this.group.add(this.shadow);
    this.dir = 'down'; this.walkT = 0; this.moving = false; this.frame = 0; this.pose = null; this.bob = 0;
    this.setFrame(0);
  }
  setFrame(i, flip = false) {
    this.frame = i; const c = i % this.cols, r = Math.floor(i / this.cols);
    this.uFrame.value.set(c / this.cols, 1 - (r + 1) / this.rows, 1 / this.cols, 1 / this.rows); this.uFlip.value = flip ? 1 : 0;
  }
  // field animation: 4-frame walk cycle by facing (left = mirrored side)
  animate(dt) {
    if (this.kind === 'monster') { this.walkT += dt * (this.moving ? 6 : 2.5); this.setFrame(Math.floor(this.walkT) % 2, this.dir === 'right'); return; }
    if (this.pose != null) { this.setFrame(HUMAN_FRAMES[this.pose], this.poseFlip); return; }
    if (this.moving) this.walkT += dt * 8; else this.walkT = 0;
    const k = this.moving ? Math.floor(this.walkT) % 4 : 0;
    const d = this.dir === 'left' || this.dir === 'right' ? 'side' : this.dir;
    this.setFrame(HUMAN_FRAMES[d][k], this.dir === 'right');
  }
  face(dir) { this.dir = dir; }
  tilt(pitch) { this.mesh.rotation.x = -pitch * 0.55; }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
export function portraitURL(look, paint) { const cv = paint(look); return cv.toDataURL(); }
