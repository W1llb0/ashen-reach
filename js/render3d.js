// 3D-вид на three.js: модели героев и врагов с анимациями, свет, тени, bloom,
// инстансинг пуль и частиц. Логика игры остаётся в game.js (2D-координаты в пикселях).
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { assets } from './assets.js';
import { groundTile } from './sprites.js';
import { input } from './input.js';
import { ARENA } from './game.js';
import { charById } from './characters.js';
import { KITS } from './heroes.js';
import { WEAPON_FAMS, ARMOR_FAMS } from './forge.js';
import { clamp } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const U = 32; // пикселей логики на единицу мира
const AU = ARENA / U;
const TAU = Math.PI * 2;
const PITCH = (52 * Math.PI) / 180;
const FOV = 36;

// ---------- Внешний вид героев и врагов ----------
export const HERO_VIS = {
  spark: { model: 'Barbarian', h: 1.7, wear: ['Barbarian_Hat', 'Barbarian_Cape'], attack: 'Throw', ability: '2H_Melee_Attack_Spin', pose: '2H_Melee_Idle' },
  vega: { model: 'Rogue_Hooded', h: 1.65, wear: ['Rogue_Cape'], attack: '2H_Ranged_Shooting', ability: 'Dodge_Forward', pose: 'Idle' },
  chronos: { model: 'Mage', h: 1.75, wear: ['Mage_Hat', 'Mage_Cape'], attack: 'Spellcasting', ability: 'Spellcast_Raise', pose: 'Idle' },
  bastion: { model: 'Knight', h: 1.75, wear: ['Knight_Helmet', 'Knight_Cape'], attack: '1H_Melee_Attack_Chop', ability: 'Blocking', pose: 'Idle' },
  morra: { model: 'Rogue', h: 1.6, wear: ['Rogue_Cape'], attack: 'Spellcast_Shoot', ability: 'Spellcast_Summon', pose: 'Idle' },
};

// внешний вид героя с выбранным оружием в руках
export function heroVis(id, weaponId) {
  const v = HERO_VIS[id];
  const ch = charById(id);
  const w = ch.weapons.find((x) => x.id === weaponId) || ch.weapons[0];
  return { ...v, show: [...v.wear, ...w.mesh] };
}

const SKEL = { spawn: 'Spawn_Ground_Skeletons', death: 'Death_A', hit: 'Hit_A' };
const FLY = { run: 'Fast_Flying', idle: 'Flying_Idle', death: 'Death', hit: 'HitReact' };
const ENEMY_VIS = {
  drone: { model: 'Skeleton_Minion', h: 1.3, run: 'Running_C', idle: 'Idle', ...SKEL },
  mite: { model: 'GhostSkull', h: 0.95, fly: 0.6, ...FLY },
  gunner: { model: 'Skeleton_Rogue', h: 1.35, run: 'Running_A', idle: 'Idle_Combat', attack: '1H_Ranged_Shooting', ...SKEL },
  dasher: { model: 'BlueDemon', h: 1.35, run: 'Run', idle: 'Idle', attack: 'Punch', death: 'Death', hit: 'HitReact' },
  bomber: { model: 'Ghost', h: 1.3, fly: 0.45, ...FLY },
  spinner: { model: 'Skeleton_Mage', h: 1.4, run: 'Walking_A', idle: 'Spellcasting', attack: 'Spellcasting', ...SKEL },
  splitter: { model: 'Goleling', h: 1.5, fly: 0.3, ...FLY },
  shard: { model: 'Goleling', h: 0.8, fly: 0.25, ...FLY },
  artillery: { model: 'Skeleton_Rogue', h: 1.35, run: 'Running_A', idle: 'Idle_Combat', attack: 'Throw', attackIdle: true, tint: '#ff7020', ...SKEL },
  shaman: { model: 'Tribal', h: 1.35, fly: 0.5, tint: '#30ff80', ...FLY },
  brute: { model: 'Orc', h: 1.9, run: 'Walk', idle: 'Idle', attack: 'Bite_Front', death: 'Death', hit: 'HitRecieve' },
  summoner: { model: 'Skeleton_Mage', h: 1.5, run: 'Walking_A', idle: 'Spellcast_Summon', attack: 'Spellcast_Summon', attackIdle: true, tint: '#8040ff', ...SKEL },
  blinker: { model: 'Hywirl', h: 1.25, fly: 0.5, tint: '#ff40d0', ...FLY },
  sentinel: { model: 'Yeti', h: 2.3, run: 'Walk', idle: 'Idle', attack: 'Bite_Front', death: 'Death', hit: 'HitRecieve' },
  crystal: { prim: 'crystal', h: 1.8 },
};
const BOSS_VIS = {
  warlord: { model: 'Skeleton_Warrior', h: 3.8, run: 'Walking_A', idle: 'Idle_Combat', attack: '2H_Melee_Attack_Spin', death: 'Death_A', hit: 'Hit_A', tint: '#2a70ff' },
  frostgiant: { model: 'Yeti', h: 4.3, run: 'Walk', idle: 'Idle', attack: 'Bite_Front', death: 'Death', hit: 'HitRecieve', tint: '#50b0ff' },
  dragon: { model: 'DragonEvolved', h: 5.8, fly: 1.5, attack: 'Punch', ...FLY },
  abyss: { model: 'Demon', h: 5, fly: 1.2, attack: 'Headbutt', ...FLY },
  lich: { model: 'Skeleton_Mage', h: 4.8, run: 'Walking_A', idle: 'Spellcasting', attack: 'Spellcast_Summon', death: 'Death_A', hit: 'Hit_A', tint: '#8a40ff' },
};

// Неанимированный «юнит» из примитивов (кристаллы души)
class PrimUnit {
  constructor(key) {
    this.key = key;
    this.root = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color: '#7af0ff', emissive: '#30c0ff', emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.92 });
    const g = new THREE.OctahedronGeometry(0.5, 0);
    g.scale(1, 2.2, 1);
    this.model = new THREE.Mesh(g, this.mat);
    this.model.castShadow = true;
    this.model.position.y = 1.2;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.3, 6), new THREE.MeshStandardMaterial({ color: '#3a3448', roughness: 0.9 }));
    base.position.y = 0.15;
    this.root.add(this.model, base);
    this.mixer = { update: () => {} };
    this.emis = '';
    this.yaw = 0;
  }
  setScale() {}
  play() {
    return true;
  }
  stop() {}
  setEmissive(hex, k) {
    this.mat.emissiveIntensity = hex === '#ffffff' ? 3 : 1.2;
  }
}

// ---------- Вспомогательное ----------
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size, draw, h = size, additive = false) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, size, h);
  if (additive) {
    // яркость переносим в RGB, альфу делаем 1: края спрайта не «светятся» под bloom
    const img = ctx.getImageData(0, 0, size, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      d[i] = d[i] * a;
      d[i + 1] = d[i + 1] * a;
      d[i + 2] = d[i + 2] * a;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

const TEX = {};
function makeTextures() {
  const radial = (stops) => (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  };
  TEX.orb = canvasTex(128, radial([[0, 1], [0.12, 0.9], [0.35, 0.32], [0.65, 0.08], [1, 0]]), 128, true);
  TEX.core = canvasTex(64, radial([[0, 1], [0.45, 1], [0.7, 0.35], [1, 0]]), 64, true);
  TEX.streak = canvasTex(
    128,
    (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.92, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      x.globalCompositeOperation = 'destination-in';
      const v = x.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(0.5, 'rgba(0,0,0,1)');
      v.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = v;
      x.fillRect(0, 0, w, h);
    },
    32,
    true
  );
  TEX.disc = canvasTex(128, radial([[0, 0.45], [0.8, 0.6], [0.93, 1], [1, 0]]), 128, true);
  TEX.rect = canvasTex(
    64,
    (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.15, 'rgba(255,255,255,1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.85, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    },
    64,
    true
  );
  const slashTex = (half) =>
    canvasTex(
      256,
      (x, sz) => {
        const c = sz / 2;
        const steps = 64;
        for (let i = 0; i < steps; i++) {
          const f = i / steps;
          const a0 = -half + f * 2 * half, a1 = a0 + (2 * half) / steps + 0.012;
          const al = Math.pow(f, 1.5) * (1 - Math.pow(Math.max(0, f - 0.92) / 0.08, 2));
          const gr = x.createRadialGradient(c, c, c * 0.5, c, c, c * 0.98);
          gr.addColorStop(0, 'rgba(255,255,255,0)');
          gr.addColorStop(0.5, `rgba(255,255,255,${al})`);
          gr.addColorStop(0.72, `rgba(255,255,255,${al * 0.45})`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = gr;
          x.beginPath();
          x.moveTo(c, c);
          x.arc(c, c, c * 0.98, a0, a1);
          x.closePath();
          x.fill();
        }
      },
      256,
      true
    );
  TEX.slashWide = slashTex(1.25);
  TEX.slashNarrow = slashTex(0.6);
  TEX.ring = canvasTex(256, radial([[0, 0], [0.74, 0], [0.86, 1], [0.93, 0.25], [1, 0]]), 256, true);
  TEX.shadow = canvasTex(64, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.7)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  });
  // ритуальный круг: кольца, «волчьи зубы», руны
  TEX.rune = canvasTex(512, (x, s) => {
    const c = s / 2;
    x.strokeStyle = '#fff';
    x.fillStyle = '#fff';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(c, c, c * 0.95, 0, TAU);
    x.stroke();
    x.lineWidth = 2;
    x.beginPath();
    x.arc(c, c, c * 0.82, 0, TAU);
    x.stroke();
    x.beginPath();
    x.arc(c, c, c * 0.5, 0, TAU);
    x.stroke();
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU, a2 = ((i + 0.5) / 36) * TAU;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * c * 0.82, c + Math.sin(a) * c * 0.82);
      x.lineTo(c + Math.cos(a2) * c * 0.94, c + Math.sin(a2) * c * 0.94);
      x.lineTo(c + Math.cos(a + TAU / 36) * c * 0.82, c + Math.sin(a + TAU / 36) * c * 0.82);
      x.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const px = c + Math.cos(a) * c * 0.66, py = c + Math.sin(a) * c * 0.66;
      x.save();
      x.translate(px, py);
      x.rotate(a);
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(-10, -14);
      x.lineTo(0, 14);
      x.lineTo(10, -14);
      x.moveTo(-6, 0);
      x.lineTo(6, 0);
      x.stroke();
      x.restore();
    }
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      x.lineTo(c + Math.cos(a) * c * 0.48, c + Math.sin(a) * c * 0.48);
    }
    x.closePath();
    x.stroke();
  }, 512, true);
}

// Инстансированный слой плоских «спрайтов» на плоскости XZ
class FXLayer {
  constructor(tex, max, { blending = THREE.AdditiveBlending, depthTest = false, order = 10, color = null } = {}) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending, depthWrite: false, depthTest, toneMapped: false, fog: false });
    if (color) mat.color.set(color);
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.count = 0;
    this.max = max;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  // rot — угол в плоскости XZ (0 = вдоль +X), sx — длина вдоль направления, sz — ширина
  add(x, y, z, sx, sz, rot, r, g, b) {
    if (this.n >= this.max) return;
    const e = this.mesh.instanceMatrix.array, o = this.n * 16;
    const c = Math.cos(rot), s = Math.sin(rot);
    e[o] = c * sx; e[o + 1] = 0; e[o + 2] = s * sx; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = 1; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = -s * sz; e[o + 9] = 0; e[o + 10] = c * sz; e[o + 11] = 0;
    e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
    const ca = this.mesh.instanceColor.array, k = this.n * 3;
    ca[k] = r; ca[k + 1] = g; ca[k + 2] = b;
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// Персонаж: клон модели со своим миксером анимаций и материалами
export class Unit {
  constructor(key, vis, shadow = false) {
    const m = assets.models[key];
    this.key = key;
    this.root = new THREE.Group();
    this.model = skClone(m.scene);
    this.root.add(this.model);
    this.height = m.height;
    this.minY = m.minY;
    this.mats = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) {
        // отсечение по камере с запасом на анимацию
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        o.boundingSphere = o.geometry.boundingSphere.clone();
        o.boundingSphere.radius *= 2.2;
        o.frustumCulled = true;
      }
      if (vis.show && !o.isSkinnedMesh && !vis.show.includes(o.name)) {
        o.visible = false;
        return;
      }
      o.material = o.material.clone();
      o.castShadow = shadow;
      o.receiveShadow = false;
      this.mats.push(o.material);
    });
    this.mixer = new THREE.AnimationMixer(this.model);
    this.clips = m.clips;
    this.actions = {};
    this.cur = null;
    this.curName = '';
    this.emis = '';
    this.yaw = 0;
  }
  setScale(h) {
    this.model.scale.setScalar(h / this.height);
    this.model.position.y = -this.minY * (h / this.height);
  }
  play(name, { fade = 0.18, once = false, speed = 1 } = {}) {
    const clip = this.clips[name];
    if (!clip) return false;
    let a = this.actions[name];
    if (!a) a = this.actions[name] = this.mixer.clipAction(clip);
    a.timeScale = speed;
    if (this.curName === name) return true;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.setEffectiveWeight(1);
    if (this.cur) {
      this.cur.fadeOut(fade);
      a.fadeIn(fade);
    }
    a.play();
    this.cur = a;
    this.curName = name;
    return true;
  }
  stop() {
    this.mixer.stopAllAction();
    this.cur = null;
    this.curName = '';
  }
  setEmissive(hex, k) {
    const key = hex + k;
    if (this.emis === key) return;
    this.emis = key;
    for (const m of this.mats) {
      m.emissive.set(hex);
      m.emissiveIntensity = k;
    }
  }
}

// Спрайты, повёрнутые к камере лобби (плоскость XY)
class BillboardLayer {
  constructor(tex, max, order = 8) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.max = max;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  add(x, y, z, sx, sy, r, g, b) {
    if (this.n >= this.max) return;
    const e = this.mesh.instanceMatrix.array, o = this.n * 16;
    e.fill(0, o, o + 16);
    e[o] = sx; e[o + 5] = sy; e[o + 10] = 1; e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
    const c = this.mesh.instanceColor.array, k = this.n * 3;
    c[k] = r; c[k + 1] = g; c[k + 2] = b;
    this.n++;
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// ---------- Лобби лавки: ночной лагерь, костёр, костяной меняла ----------
class ShopLobby {
  constructor(view) {
    this.view = view;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color('#050307');
    s.fog = new THREE.FogExp2('#070409', 0.075);
    this.cam = new THREE.PerspectiveCamera(36, view.w / view.h, 0.1, 80);
    s.add(new THREE.HemisphereLight('#4a4a6a', '#2a1010', 0.55));
    const moon = new THREE.DirectionalLight('#7a88c8', 0.8);
    moon.position.set(-6, 10, 4);
    s.add(moon);
    this.fire = new THREE.PointLight('#ff7a30', 34, 14, 1.4);
    this.fire.position.set(0, 1.0, 0.7);
    this.fire.castShadow = true;
    this.fire.shadow.mapSize.set(512, 512);
    this.fire.shadow.bias = -0.004;
    s.add(this.fire);
    this.lamp = new THREE.PointLight('#9a60ff', 9, 7, 1.5);
    this.lamp.position.set(3.4, 2.3, -0.4);
    s.add(this.lamp);

    const tex = new THREE.CanvasTexture(groundTile(512));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(22, 48), new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(1.25, 1.05, 1), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);

    // кострище: кольцо камней и брёвна
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.9, flatShading: true });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), stoneMat);
      st.position.set(Math.cos(a) * 0.7, 0.08, 0.7 + Math.sin(a) * 0.7);
      st.scale.set(1.2, 0.7, 1);
      st.rotation.set(a, a * 2, 0);
      st.castShadow = true;
      s.add(st);
    }
    const logMat = new THREE.MeshStandardMaterial({ color: '#3a2216', roughness: 0.9, emissive: '#ff3a10', emissiveIntensity: 0.25 });
    for (let i = 0; i < 4; i++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 7), logMat);
      lg.position.set(0, 0.18, 0.7);
      lg.rotation.set(1.1, (i / 4) * Math.PI, 0);
      s.add(lg);
    }
    // окружение
    const P = (name, x, z, sc, rot = 0, y = 0) => {
      const src = assets.decor[name];
      if (!src) return null;
      const o = src.clone();
      o.position.set(x, y, z);
      o.scale.setScalar(sc);
      o.rotation.y = rot;
      o.traverse((c) => c.isMesh && ((c.castShadow = true), (c.receiveShadow = true)));
      s.add(o);
      return o;
    };
    P('tree_dead_large', -5.6, -3.2, 2.3, 0.6);
    P('tree_dead_medium', 6.4, -4.2, 2.1, 2.2);
    P('tree_dead_small', -4.2, -5.8, 1.9, 1.3);
    P('pillar', -6.6, 0.8, 1.4, 0.3);
    P('pillar', 7, 1.6, 1.4, 0.8);
    P('gravestone', -3.4, -3.1, 1.25, 0.2);
    P('grave_A', -2.1, -4.3, 1.2, -0.3);
    P('gravemarker_B', 4.8, -2.6, 1.2, 0.5);
    P('fence_broken', -5, -1.2, 1.3, 1.2);
    // прилавок менялы
    P('shrine_candles', 2.7, 1.25, 0.85, -0.4);
    P('candle_triple', 3.6, 1.55, 1.1, 0.4);
    P('skull_candle', 1.55, 2.0, 0.7, -0.6);
    P('lantern_standing', 4.1, -0.4, 1.45, 0.2);
    P('post_skull', 1.2, -1.4, 1.35, 0.4);
    P('gravestone', 0.6, -3.6, 1.3, 0.1);
    P('gravemarker_A', 2.4, -3.2, 1.2, -0.4);
    P('ribcage', -4.2, -1.2, 1.1, 1.1);
    P('skull', 5.6, 0.2, 1.1, -0.7);
    P('bone_A', -3.6, 0.2, 1.1, 2.1);
    this.glowSpots = [
      { x: 3.6, y: 0.55, z: 1.55, s: 0.7 }, { x: 1.55, y: 0.4, z: 2.0, s: 0.5 },
      { x: 4.1, y: 2.05, z: -0.4, s: 1.6 }, { x: 2.7, y: 0.6, z: 1.25, s: 0.8 },
    ];

    // торговец
    this.merchant = new Unit('Skeleton_Rogue', {}, true);
    this.merchant.setScale(2);
    this.merchant.root.position.set(2.8, 0, 0.25);
    this.merchant.root.rotation.y = -0.65;
    this.merchant.setEmissive('#5a2aa0', 0.12);
    this.merchant.play('Idle_B', { fade: 0 });
    s.add(this.merchant.root);
    this.mAnimT = 0;

    // товары парят над прилавком
    this.wareMeshes = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ toneMapped: false }));
      s.add(m);
      this.wareMeshes.push(m);
    }
    this.flames = new BillboardLayer(TEX.orb, 160, 8);
    this.glow = new BillboardLayer(TEX.orb, 24, 7);
    s.add(this.flames.mesh, this.glow.mesh);
    this.parts = [];
    this.t = 0;
    this.offers = [];
  }

  ensure(g) {
    const id = g.player.char.id + ':' + g.player.weapon.id;
    if (this.heroId !== id) {
      if (this.hero) this.scene.remove(this.hero.root);
      const vis = heroVis(g.player.char.id, g.player.weapon.id);
      const u = new Unit(vis.model, vis, true);
      u.setScale(vis.h);
      u.root.position.set(-1.5, 0, 1.5);
      u.root.rotation.y = Math.atan2(1.5, -0.8);
      u.play('Sit_Floor_Idle', { fade: 0 });
      this.scene.add(u.root);
      this.hero = u;
      this.heroId = id;
    }
    this.offers = g.shopOffers || [];
  }

  event(type) {
    const anim = { buy: 'Cheer', reroll: 'Spellcast_Summon', poor: 'Taunt', greet: 'Interact' }[type];
    if (!anim) return;
    this.merchant.play(anim, { once: true, fade: 0.15 });
    this.mAnimT = type === 'buy' ? 1.5 : 1.3;
  }

  frame(dt) {
    const t = (this.t += dt);
    if (this.mAnimT > 0) {
      this.mAnimT -= dt;
      if (this.mAnimT <= 0) this.merchant.play('Idle_B', { fade: 0.3 });
    }
    this.merchant.mixer.update(dt);
    if (this.hero) this.hero.mixer.update(dt);
    const fl = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.05 + Math.sin(t * 5.3) * 0.06;
    this.fire.intensity = 34 * fl;
    this.lamp.intensity = 8 + Math.sin(t * 3) * 1.2;
    // огонь
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU, r = Math.random() * 0.32;
      this.parts.push({ x: Math.cos(a) * r, y: 0.2, z: 0.7 + Math.sin(a) * r * 0.6, vy: 0.9 + Math.random() * 1.2, vx: (Math.random() - 0.5) * 0.2, life: 0.5 + Math.random() * 0.6, max: 0, s: 0.45 + Math.random() * 0.4, ember: Math.random() < 0.05 });
    }
    const L = this.flames;
    L.begin();
    let j = 0;
    for (const q of this.parts) {
      if (!q.max) q.max = q.life;
      q.life -= dt;
      if (q.life <= 0) continue;
      q.y += q.vy * dt * (q.ember ? 1.8 : 1);
      q.x += q.vx * dt + Math.sin(t * 6 + q.z * 10) * dt * 0.15;
      const k = q.life / q.max;
      if (q.ember) L.add(q.x, q.y, q.z, 0.08, 0.08, 2.5, 1.2, 0.4);
      else {
        const sz = q.s * (0.35 + k * 0.75);
        L.add(q.x, q.y, q.z, sz, sz * 1.3, 1.0 * k + 0.3, (0.18 + 0.6 * k * k) * 0.9, 0.08 * k * k);
      }
      this.parts[j++] = q;
    }
    this.parts.length = j;
    L.end();
    // свечи, фонарь, жар углей и товары
    const G = this.glow;
    G.begin();
    for (const w of this.glowSpots) {
      const f = 0.85 + Math.sin(t * 7 + w.x * 3) * 0.12;
      G.add(w.x, w.y, w.z, w.s * f, w.s * f, 1.3 * f, 0.55 * f, 0.2 * f);
    }
    G.add(0, 0.25, 0.7, 2.2, 1.0, 0.9, 0.3, 0.08);
    for (let i = 0; i < 6; i++) {
      const m = this.wareMeshes[i];
      const it = this.offers[i];
      m.visible = !!it && !it.sold;
      if (!m.visible) continue;
      const x = 1.75 + i * 0.4, y = 1.3 + Math.sin(t * 2 + i) * 0.07, z = 1.45;
      m.position.set(x, y, z);
      m.rotation.y = t * 1.5 + i;
      const c = this.view.col(it.kind === 'forge' ? (FAM_COLORS[it.fam] || '#ffc94a') : TIER_COLORS[it.tier]);
      m.material.color.setRGB(c.r * 1.6, c.g * 1.6, c.b * 1.6);
      G.add(x, y, z, 0.7, 0.7, c.r, c.g, c.b);
    }
    G.end();
    // кадр подстраивается под пропорции экрана: костёр, герой и меняла всегда в кадре
    const sw = Math.sin(t * 0.25);
    const half = Math.tan((this.cam.fov * Math.PI) / 360);
    const dist = Math.max(7, 4.4 / (half * this.cam.aspect));
    this.cam.position.set(0.7 + sw * 0.3, 1.0 + dist * 0.34, 0.8 + dist);
    this.cam.lookAt(0.7, 0.9, 0.6);
    // сдвигаем картинку вверх: снизу экрана — прилавок интерфейса
    const W = this.view.w, Hh = this.view.h;
    this.cam.setViewOffset(W, Hh, 0, Hh * 0.2, W, Hh);
    this.scene.fog.density = (0.06 * 8) / dist;
  }

  headScreen() {
    const p = this.merchant.root.position;
    const v = this.view.tmpV.set(p.x, 2.35, p.z).project(this.cam);
    return [((v.x + 1) / 2) * this.view.w, ((1 - v.y) / 2) * this.view.h];
  }
}
const TIER_COLORS = { 1: '#c9b48e', 2: '#5aaee8', 3: '#b582ff', 4: '#ffc94a' };
const FAM_COLORS = Object.fromEntries([...Object.entries(WEAPON_FAMS), ...Object.entries(ARMOR_FAMS)].map(([k, f]) => [k, f.color]));

// ---------- Вид ----------
export class View3D {
  constructor(canvas, overlay) {
    makeTextures();
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.55;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#07050a');
    scene.fog = new THREE.FogExp2('#0b070c', 0.019);
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
    this.target = new THREE.Vector3(AU / 2, 0, AU / 2);

    // свет: холодная луна, небо/земля, тёплый факел героя
    scene.add(new THREE.HemisphereLight('#7a7f9e', '#4a2422', 1.15));
    const moon = (this.moon = new THREE.DirectionalLight('#a9b6e6', 1.9));
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 120;
    moon.shadow.bias = -0.0008;
    moon.shadow.normalBias = 0.03;
    scene.add(moon, moon.target);
    this.heroLight = new THREE.PointLight('#ffb060', 14, 18, 1.4);
    scene.add(this.heroLight);

    this.overlay = overlay;
    this.octx = overlay.getContext('2d');
    this.pools = {};
    this.live = new Set();
    this.dying = [];
    this.hero = null;
    this.heroVis = null;
    this.time = 0;
    this.colors = new Map();
    this.pickMeshes = new Map();
    this.tmpV = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
    this.filterOn = false;

    this.buildWorld();
    this.buildFX();
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.3, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lobby) {
      this.lobby.cam.aspect = w / h;
      this.lobby.cam.updateProjectionMatrix();
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.overlay.width = Math.round(w * dpr);
    this.overlay.height = Math.round(h * dpr);
  }

  col(hex) {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  // ---------- Мир ----------
  buildWorld() {
    const scene = this.scene;
    const R = rng(1337);
    // земля
    const gTex = new THREE.CanvasTexture(groundTile(512));
    gTex.colorSpace = THREE.SRGBColorSpace;
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping;
    const G = AU + 90;
    gTex.repeat.set(G / 7, G / 7);
    gTex.anisotropy = 8;
    // крупные пятна света и тени поверх мелкой текстуры — убирают повторяемость
    const macro = canvasTex(256, (x, s) => {
      x.fillStyle = '#fff';
      x.fillRect(0, 0, s, s);
      const RR = rng(77);
      for (let i = 0; i < 90; i++) {
        const px = RR() * s, py = RR() * s, r = 10 + RR() * 50, a = 0.08 + RR() * 0.22;
        for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
          const gr = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
          gr.addColorStop(0, `rgba(0,0,0,${a})`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = gr;
          x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
        }
      }
    });
    macro.wrapS = macro.wrapT = THREE.RepeatWrapping;
    macro.repeat.set(G / 45, G / 45);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(G, G), new THREE.MeshStandardMaterial({ map: gTex, aoMap: macro, aoMapIntensity: 1, color: new THREE.Color(1.45, 1.22, 1.18), roughness: 0.97, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(AU / 2, 0, AU / 2);
    ground.receiveShadow = true;
    scene.add(ground);
    // за пределами арены — тьма
    const darkMat = new THREE.MeshBasicMaterial({ color: '#040205', transparent: true, opacity: 0.8, depthWrite: false });
    const band = (x, z, w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), darkMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
      scene.add(m);
    };
    band(AU / 2, -22.5, AU + 90, 45);
    band(AU / 2, AU + 22.5, AU + 90, 45);
    band(-22.5, AU / 2, 45, AU);
    band(AU + 22.5, AU / 2, 45, AU);

    this.grassTime = { value: 0 };
    this.buildRocks(R);
    this.buildDecor(R);
    this.buildBorder();
  }

  buildGrass(R) {
    const pos = [], colArr = [];
    const base = new THREE.Color('#4a5230'), tip = new THREE.Color('#a8a060');
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI + R() * 0.3;
      const c = Math.cos(a), s = Math.sin(a);
      const w = 0.028, h = 0.2 + R() * 0.16, lean = (R() - 0.5) * 0.16;
      const p = [[-w, 0], [w, 0], [lean, h]];
      for (const [px, py] of p) {
        pos.push(px * c, py, px * s);
        const t = py > 0 ? tip : base;
        colArr.push(t.r, t.g, t.b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
    this.grassTime = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 wp0 = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed.x += sin(uTime * 1.6 + wp0.x * 0.7 + wp0.z * 0.5) * position.y * 0.35;
          transformed.z += cos(uTime * 1.2 + wp0.x * 0.4) * position.y * 0.18;
        #endif`
      );
    };
    const N = 9000;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const d = this.dummy;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // кучкуется пятнами
      const cx = R() * AU, cz = R() * AU;
      d.position.set(cx, 0, cz);
      d.rotation.set(0, R() * TAU, 0);
      const s = 0.7 + R() * 1.4;
      d.scale.set(s, s * (0.7 + R() * 0.8), s);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      c.setHSL(0.14 + R() * 0.06, 0.25 + R() * 0.2, 0.55 + R() * 0.3);
      inst.setColorAt(i, c);
    }
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    this.scene.add(inst);
  }

  buildRocks(R) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#5a5448', roughness: 0.92, flatShading: true });
    const N = 420;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const d = this.dummy;
    for (let i = 0; i < N; i++) {
      d.position.set(R() * AU, 0, R() * AU);
      d.rotation.set(R() * 3, R() * 3, R() * 3);
      const s = 0.06 + Math.pow(R(), 4) * 0.32;
      d.scale.set(s * (1 + R() * 0.6), s * (0.45 + R() * 0.4), s * (1 + R() * 0.6));
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    }
    inst.receiveShadow = true;
    inst.castShadow = true;
    this.scene.add(inst);
  }

  place(name, x, z, s = 1, rot = 0) {
    const src = assets.decor[name];
    if (!src) return null;
    const o = src.clone();
    o.position.set(x, 0, z);
    o.scale.setScalar(s);
    o.rotation.y = rot;
    o.updateMatrixWorld(true);
    o.traverse((c) => (c.matrixAutoUpdate = false));
    this.scene.add(o);
    return o;
  }

  buildDecor(R) {
    this.glows = []; // статичные огоньки: свечи, фонари
    const C = AU / 2;
    const free = (x, z, r = 9) => (x - C) ** 2 + (z - C) ** 2 > r * r && x > 3 && z > 3 && x < AU - 3 && z < AU - 3;
    const rpos = () => {
      for (let i = 0; i < 20; i++) {
        const x = R() * AU, z = R() * AU;
        if (free(x, z)) return [x, z];
      }
      return [3, 3];
    };
    const graves = ['gravestone', 'grave_A', 'grave_A_destroyed', 'gravemarker_A', 'gravemarker_B'];
    // древние погосты
    for (let k = 0; k < 18; k++) {
      const [x, z] = rpos();
      const n = 4 + Math.floor(R() * 5);
      for (let i = 0; i < n; i++) {
        const a = R() * TAU, d = 1 + R() * 3.4;
        this.place(graves[Math.floor(R() * graves.length)], x + Math.cos(a) * d, z + Math.sin(a) * d, 0.9 + R() * 0.35, R() * TAU);
      }
      const cand = R() < 0.5 ? 'candle_triple' : 'skull_candle';
      const ca = R() * TAU;
      const cx = x + Math.cos(ca) * 1.5, cz = z + Math.sin(ca) * 1.5;
      this.place(cand, cx, cz, 1.4, R() * TAU);
      this.glows.push({ x: cx, y: 0.7, z: cz, s: 1.6, c: this.col('#ffb050'), ph: R() * 10 });
      if (R() < 0.6) {
        const la = R() * TAU;
        const lx = x + Math.cos(la) * 4.2, lz = z + Math.sin(la) * 4.2;
        this.place('lantern_standing', lx, lz, 1.25, R() * TAU);
        this.glows.push({ x: lx, y: 1.8, z: lz, s: 3.2, c: this.col('#ffa040'), ph: R() * 10 });
      }
      if (R() < 0.4) this.place('post_skull', x + 3.5, z - 2.5, 1.1, R() * TAU);
    }
    // древние каменные кольца со святилищами (плоские — сквозь них не нужно «проходить»)
    for (let k = 0; k < 7; k++) {
      const [x, z] = rpos();
      const r = 4 + R() * 2;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        if (R() < 0.18) continue; // часть камней обрушилась
        this.place(R() < 0.75 ? 'pillar' : 'fence_pillar_broken', x + Math.cos(a) * r, z + Math.sin(a) * r, 0.8 + R() * 0.3, a);
      }
      this.place('shrine_candles', x, z, 1.2, R() * TAU);
      this.glows.push({ x, y: 0.9, z, s: 2.4, c: this.col('#ff7a40'), ph: R() * 10 });
      this.ritualRings = this.ritualRings || [];
      this.ritualRings.push({ x, z, r: r * 2 });
    }
    // мёртвые деревья
    const trees = ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small'];
    for (let k = 0; k < 45; k++) {
      const [x, z] = rpos();
      this.place(trees[Math.floor(R() * 3)], x, z, 1.1 + R() * 0.8, R() * TAU);
    }
    // кости
    const bones = ['bone_A', 'ribcage', 'skull'];
    for (let k = 0; k < 60; k++) {
      const [x, z] = rpos();
      this.place(bones[Math.floor(R() * 3)], x, z, 1 + R() * 0.6, R() * TAU);
    }
    this.glowLayer = new FXLayer(TEX.orb, this.glows.length + 4, { depthTest: true, order: 5 });
    this.scene.add(this.glowLayer.mesh);
  }

  buildBorder() {
    // каменные столбы по краю арены и золотая черта
    const src = assets.decor.pillar;
    let geo = null, mat = null;
    src.traverse((o) => {
      if (o.isMesh && !geo) {
        geo = o.geometry;
        mat = o.material;
      }
    });
    if (geo) {
      const step = 3.4;
      const per = Math.floor(AU / step);
      const inst = new THREE.InstancedMesh(geo, mat, per * 4);
      const d = this.dummy;
      let i = 0;
      for (let side = 0; side < 4; side++)
        for (let k = 0; k < per; k++) {
          const t = k * step + step / 2;
          const x = side === 0 ? t : side === 1 ? AU : side === 2 ? AU - t : 0;
          const z = side === 0 ? 0 : side === 1 ? t : side === 2 ? AU : AU - t;
          d.position.set(x, 0, z);
          d.rotation.set(0, (side * Math.PI) / 2, 0);
          d.scale.setScalar(1.2 + (k % 3 === 0 ? 0.4 : 0));
          d.updateMatrix();
          inst.setMatrixAt(i++, d.matrix);
        }
      inst.castShadow = true;
      inst.receiveShadow = true;
      this.scene.add(inst);
    }
    const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3040').multiplyScalar(1.6), toneMapped: false });
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), lineMat);
      m.position.set(x, 0.03, z);
      this.scene.add(m);
    };
    mk(AU, 0.12, AU / 2, 0.6);
    mk(AU, 0.12, AU / 2, AU - 0.6);
    mk(0.12, AU, 0.6, AU / 2);
    mk(0.12, AU, AU - 0.6, AU / 2);
  }

  // ---------- Эффекты ----------
  buildFX() {
    const s = this.scene;
    this.fx = {
      shadow: new FXLayer(TEX.shadow, 700, { blending: THREE.NormalBlending, depthTest: true, order: 2 }),
      ground: new FXLayer(TEX.orb, 900, { depthTest: true, order: 3 }),
      groundRing: new FXLayer(TEX.ring, 300, { depthTest: true, order: 3 }),
      rune: new FXLayer(TEX.rune, 24, { depthTest: true, order: 3 }),
      pGlow: new FXLayer(TEX.orb, 1500, { order: 20 }),
      pCore: new FXLayer(TEX.core, 1500, { order: 21 }),
      streak: new FXLayer(TEX.streak, 2400, { order: 22 }),
      part: new FXLayer(TEX.orb, 2600, { order: 23 }),
      ring: new FXLayer(TEX.ring, 300, { order: 24 }),
      bGlow: new FXLayer(TEX.orb, 700, { order: 30 }),
      bCore: new FXLayer(TEX.core, 700, { order: 31 }),
      slash: new FXLayer(TEX.slashWide, 80, { order: 26 }),
      slashN: new FXLayer(TEX.slashNarrow, 60, { order: 26 }),
      zoneFill: new FXLayer(TEX.disc, 120, { depthTest: true, order: 4 }),
      zoneRing: new FXLayer(TEX.ring, 120, { depthTest: true, order: 4 }),
      zoneRect: new FXLayer(TEX.rect, 120, { depthTest: true, order: 4 }),
    };
    for (const l of Object.values(this.fx)) s.add(l.mesh);
    this.cones = [];
    // 3D-сегменты для молний и столпов света
    this.beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }), 1400);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1400 * 3), 3);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 27;
    this.beams.count = 0;
    s.add(this.beams);
    // настоящие стрелы: древко, наконечник, оперение
    const shaft = new THREE.CylinderGeometry(0.022, 0.022, 0.8, 5).rotateZ(-Math.PI / 2);
    const head = new THREE.ConeGeometry(0.06, 0.2, 6).rotateZ(-Math.PI / 2).translate(0.48, 0, 0);
    const f1 = new THREE.PlaneGeometry(0.2, 0.09).translate(-0.33, 0.045, 0);
    const f2 = new THREE.PlaneGeometry(0.2, 0.09).rotateX(Math.PI / 2).translate(-0.33, 0, 0.045);
    for (const gg of [shaft, head, f1, f2]) gg.deleteAttribute('uv');
    const arrowGeo = mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed(), f1.toNonIndexed(), f2.toNonIndexed()]);
    this.arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.4, emissive: '#403020', emissiveIntensity: 0.6, side: THREE.DoubleSide }), 700);
    this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(700 * 3), 3);
    this.arrows.frustumCulled = false;
    this.arrows.count = 0;
    s.add(this.arrows);
    // грозовая туча Альдерона
    this.cloud = new THREE.Group();
    const cMat = new THREE.MeshStandardMaterial({ color: '#2a2438', roughness: 1, emissive: '#6a70ff', emissiveIntensity: 0, transparent: true, opacity: 0.9 });
    this.cloudMat = cMat;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + Math.random() * 0.5, 1), cMat);
      m.position.set(Math.cos(i) * 1.1, Math.sin(i * 2.3) * 0.25, Math.sin(i) * 0.8);
      m.scale.set(1.3, 0.7, 1);
      this.cloud.add(m);
    }
    this.cloud.visible = false;
    s.add(this.cloud);
    this.tmpQ = new THREE.Quaternion();
    this.UP = new THREE.Vector3(0, 1, 0);
    this.XA = new THREE.Vector3(1, 0, 0);
    this.tmpD = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(1, 28, -0.5, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
      m.userData.arc = 0.5;
      m.visible = false;
      m.renderOrder = 4;
      s.add(m);
      this.cones.push(m);
    }
    // самоцветы опыта
    this.gemMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), 450);
    this.gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gemMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(450 * 3).fill(1), 3);
    this.gemMesh.frustumCulled = false;
    this.gemMesh.count = 0;
    s.add(this.gemMesh);
    // кружащие кинжалы
    const blade = new THREE.ConeGeometry(0.07, 0.62, 4);
    blade.rotateZ(-Math.PI / 2);
    blade.translate(0.31, 0, 0);
    const guard = new THREE.BoxGeometry(0.06, 0.05, 0.26);
    const hilt = new THREE.BoxGeometry(0.2, 0.05, 0.05);
    hilt.translate(-0.1, 0, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#e8eef8', metalness: 0.9, roughness: 0.25, emissive: '#6a7aa0', emissiveIntensity: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#d8a640', metalness: 0.8, roughness: 0.35, emissive: '#6a4410', emissiveIntensity: 0.5 });
    this.daggers = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(blade, bladeMat), new THREE.Mesh(guard, goldMat), new THREE.Mesh(hilt, goldMat));
      g.visible = false;
      s.add(g);
      this.daggers.push(g);
    }
    // соколы-спутники
    const body = new THREE.ConeGeometry(0.1, 0.45, 5);
    body.rotateZ(-Math.PI / 2);
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0.05, 0, 0, -0.15, 0, 0.55, -0.2, 0, 0.05], 3));
    wing.computeVertexNormals();
    const fMat = new THREE.MeshStandardMaterial({ color: '#8a5a2a', roughness: 0.7, side: THREE.DoubleSide, emissive: '#ffb050', emissiveIntensity: 0.25 });
    this.falcons = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const wl = new THREE.Mesh(wing, fMat), wr = new THREE.Mesh(wing, fMat);
      wr.scale.z = -1;
      g.add(new THREE.Mesh(body, fMat), wl, wr);
      g.userData = { wl, wr };
      g.visible = false;
      s.add(g);
      this.falcons.push(g);
    }
  }

  // ---------- Сброс / герой ----------
  reset() {
    if (this.allyUnits) {
      for (const a of this.allyUnits) if (a._u) this.release(a._u);
      this.allyUnits.clear();
    }
    for (const e of this.live) this.release(e._u);
    for (const d of this.dying) this.release(d.u);
    this.live.clear();
    this.dying.length = 0;
    for (const m of this.pickMeshes.values()) this.scene.remove(m);
    this.pickMeshes.clear();
  }

  setHero(id, weaponId) {
    if (this.hero) {
      this.scene.remove(this.hero.root);
      this.hero.stop();
    }
    const vis = heroVis(id, weaponId);
    const u = new Unit(vis.model, vis, true);
    u.setScale(vis.h);
    u.play('Idle');
    this.scene.add(u.root);
    this.hero = u;
    this.heroVis = vis;
    this.heroChar = charById(id);
    this.heroLight.color.set(this.heroChar.color2);
  }

  prewarm() {
    const want = { Skeleton_Minion: 36, GhostSkull: 16, Skeleton_Rogue: 12, BlueDemon: 10, Ghost: 8, Skeleton_Mage: 6, Goleling: 8, Yeti: 4 };
    for (const [k, n] of Object.entries(want)) {
      const pool = (this.pools[k] = this.pools[k] || []);
      for (let i = 0; i < n; i++) pool.push(new Unit(k, {}));
    }
  }

  acquire(key, shadow, prim) {
    const pool = (this.pools[key] = this.pools[key] || []);
    const u = pool.pop() || (prim ? new PrimUnit(key) : new Unit(key, {}, shadow));
    u.root.visible = true;
    u.root.position.y = 0;
    u.emis = '';
    return u;
  }

  release(u) {
    if (!u) return;
    u.stop();
    this.scene.remove(u.root);
    (this.pools[u.key] = this.pools[u.key] || []).push(u);
  }

  // ---------- Кадр ----------
  lobbyEvent(type) {
    if (this.lobby) this.lobby.event(type);
  }

  renderLobby(g, dt) {
    if (!this.lobby) this.lobby = new ShopLobby(this);
    const L = this.lobby;
    L.ensure(g);
    L.frame(dt);
    if (this.filterOn) {
      this.filterOn = false;
      this.renderer.domElement.style.filter = '';
    }
    this.bloom.strength = 0.5;
    this.renderPass.scene = L.scene;
    this.renderPass.camera = L.cam;
    this.composer.render();
    this.renderPass.scene = this.scene;
    this.renderPass.camera = this.camera;
    this.octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.octx.clearRect(0, 0, this.w, this.h);
    const bubble = document.getElementById('shopBubble');
    if (bubble) {
      // реплика у головы торговца, но никогда не наезжает на прилавок с товаром
      const [sx, sy] = L.headScreen();
      const counter = document.querySelector('#screen-shop .counter');
      const top = document.querySelector('#screen-shop .lobby-top');
      const bh = bubble.offsetHeight || 80;
      const minY = (top ? top.getBoundingClientRect().bottom : 90) + bh / 2 + 8;
      const maxY = (counter ? counter.getBoundingClientRect().top : this.h) - bh / 2 - 14;
      bubble.style.left = Math.round(Math.max(sx, (bubble.offsetWidth || 200) + 56)) + 'px';
      bubble.style.top = Math.round(maxY < minY ? minY : clamp(sy, minY, maxY)) + 'px';
      bubble.style.visibility = maxY < minY - bh * 0.5 ? 'hidden' : '';
    }
  }

  render(g, dt) {
    this.time += dt;
    if (g.state === 'shop' && g.player) return this.renderLobby(g, dt);
    const menu = g.state === 'menu' || !g.player;
    const p = g.player;
    // камера
    const viewH = this.h / (g.zoom || 1) / U;
    const L = (viewH * Math.sin(PITCH)) / (2 * Math.tan((FOV * Math.PI) / 360)) * 0.92;
    const sh = g.settings.shake ? g.shakeAmt / U : 0;
    const tx = g.cam.x / U + (Math.random() - 0.5) * sh * 0.7, tz = g.cam.y / U + (Math.random() - 0.5) * sh * 0.7;
    this.target.set(tx, 0, tz);
    if (menu) {
      const yaw = this.time * 0.04;
      const LL = L * 1.15;
      this.camera.position.set(tx + Math.sin(yaw) * LL * Math.cos(PITCH * 0.8), LL * Math.sin(PITCH * 0.8), tz + Math.cos(yaw) * LL * Math.cos(PITCH * 0.8));
    } else this.camera.position.set(tx, L * Math.sin(PITCH), tz + L * Math.cos(PITCH));
    this.camera.lookAt(this.target);
    this.moon.position.set(tx - 18, 34, tz + 10);
    this.moon.target.position.set(tx, 0, tz);
    this.grassTime.value = this.time;

    const eScale = g.timeStopT > 0 ? 0.08 : 1;
    this.syncHero(g, dt, menu);
    this.syncEnemies(g, dt * eScale, dt);
    this.syncAllies(g, dt);
    this.syncFX(g, dt, menu);
    this.syncPickups(g);

    // фильтр остановки времени
    const ts = g.timeStopT > 0 && !menu;
    if (ts !== this.filterOn) {
      this.filterOn = ts;
      this.renderer.domElement.style.filter = ts ? 'saturate(0.2) hue-rotate(-20deg) brightness(0.92)' : '';
    }
    this.composer.render();
    this.drawOverlay(g, menu);
  }

  inView(x, z, m = 4) {
    const dx = x - this.target.x, dz = z - this.target.z;
    const R = (this.w / (this.lastZoom || 1)) / U;
    return Math.abs(dx) < R * 0.65 + m && dz > -R * 0.55 - m && dz < R * 0.55 + m;
  }

  syncHero(g, dt, menu) {
    const u = this.hero;
    if (!u) return;
    const p = g.player;
    if (menu || !p) {
      u.root.visible = false;
      this.heroLight.intensity = 0;
      return;
    }
    const vis = this.heroVis;
    const kit = KITS[p.char.id];
    u.root.visible = true;
    const x = p.x / U, z = p.y / U;
    u.root.position.set(x, 0, z);
    const moving = Math.hypot(p.vx, p.vy) > 25 && p.dashT <= 0;
    // поворот: при беге — по движению, иначе — к цели
    const attackingNow = p.tags.includes('melee') && g.time - p.lastShot < 0.32;
    const face = moving && !attackingNow ? Math.atan2(p.vy, p.vx) : p.aim;
    const want = Math.PI / 2 - face;
    let d = want - u.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    u.yaw += d * Math.min(1, dt * 16);
    u.root.rotation.y = u.yaw;
    if (g.dying > 0 || g.state === 'gameover') u.play('Death_A', { once: true, fade: 0.1 });
    else if (p.dashT > 0) u.play('Dodge_Forward', { once: true, speed: 1.6, fade: 0.05 });
    else if (p.abilityAnimT > 0) u.play(vis.ability, { once: vis.ability !== 'Blocking', fade: 0.1, speed: 1.3 });
    else if (p.aegisT > 0) u.play('Blocking');
    else if (p.spinT > 0) u.play('2H_Melee_Attack_Spin', { speed: 1.4 });
    else if (p.tags.includes('melee') && g.time - p.lastShot < 0.32) u.play(p.weapon.anim, { speed: 1.7, fade: 0.06 });
    else if (moving) u.play('Running_A', { speed: 0.8 + Math.hypot(p.vx, p.vy) / 400 });
    else if (g.time - p.lastShot < 0.45) u.play(p.weapon.anim || vis.attack, { speed: 1.25 });
    else u.play('Idle');
    const blink = p.invuln > 0 && p.aegisT <= 0 && p.dashT <= 0 && g.dying <= 0 && Math.floor(this.time * 18) % 2 === 0;
    u.model.visible = !blink;
    if (p.hurtT > 0.2) u.setEmissive('#ff2020', 0.8);
    else if (p.rageT > 0) u.setEmissive('#ff3010', 0.45 + Math.sin(this.time * 12) * 0.15);
    else if (p.aegisT > 0) u.setEmissive(this.heroChar.color, 0.35);
    else u.setEmissive('#000000', 0);
    if (g.state === 'playing' || g.state === 'gameover') u.mixer.update(dt);
    this.heroLight.position.set(x, 4.2, z + 1.2);
    this.heroLight.intensity = 14 + Math.sin(this.time * 9) * 1.4 + Math.sin(this.time * 23) * 0.8;
  }

  syncEnemies(g, edt, dt) {
    const p = g.player;
    const px = p ? p.x : g.cam.x, py = p ? p.y : g.cam.y;
    const playing = g.state === 'playing' || g.state === 'menu';
    for (const e of g.enemies) {
      if (e.dead || e._u) continue;
      const vis = e.boss ? BOSS_VIS[e.bossDef.id] : ENEMY_VIS[e.type];
      const u = this.acquire(vis.model || 'prim_' + vis.prim, !!e.boss, vis.prim);
      u.vis = vis;
      u.setScale(vis.h * (e.elite ? 1.4 : 1));
      u.yaw = Math.PI / 2 - Math.atan2(py - e.y, px - e.x);
      u.spawnLeft = 0;
      if (vis.spawn && !e.boss) {
        u.play(vis.spawn, { once: true, speed: 2.4, fade: 0 });
        u.spawnLeft = 0.55;
      } else u.play(vis.idle || vis.run, { fade: 0 });
      this.scene.add(u.root);
      e._u = u;
      this.live.add(e);
    }
    for (const e of this.live) {
      const u = e._u;
      const vis = u.vis;
      if (e.dead) {
        this.live.delete(e);
        e._u = null;
        u.play(vis.death, { once: true, fade: 0.08, speed: 1.3 });
        u.setEmissive('#000000', 0);
        this.dying.push({ u, t: e.boss ? 2.4 : 1.1, boss: e.boss });
        continue;
      }
      const x = e.x / U, z = e.y / U;
      const bob = vis.fly ? vis.fly + Math.sin(this.time * 3 + e.spin * 5) * 0.12 : 0;
      u.root.position.set(x, bob, z);
      const spd = Math.hypot(e.vx, e.vy);
      const toP = Math.atan2(py - e.y, px - e.x);
      const face = spd > 20 && !(e.def.fire && spd < 60) ? Math.atan2(e.vy, e.vx) : toP;
      let d = Math.PI / 2 - face - u.yaw;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      u.yaw += d * Math.min(1, dt * 9);
      u.root.rotation.y = u.yaw;
      // выбор анимации
      if (u.spawnLeft > 0) u.spawnLeft -= dt;
      else if (e.boss) {
        if (e.atk >= 0 && vis.attack) u.play(vis.attack, { speed: e.enraged ? 1.3 : 1 });
        else u.play(spd > 20 ? vis.run : vis.idle, { speed: 1 });
      } else if (vis.prim) {
        u.model.rotation.y += dt * 1.5;
        u.model.position.y = 1.2 + Math.sin(this.time * 2 + e.spin) * 0.15;
      } else if (e.def.ai === 'dash' || e.def.ai === 'brute') {
        if (e.state === 1) u.play(vis.attack || vis.idle, { speed: 0.8 });
        else u.play(vis.run, { speed: e.state === 2 ? 2.2 : 1 });
      } else if (vis.attack && (e.def.fire || vis.attackIdle) && spd < 70) u.play(vis.attack, { speed: 1 });
      else if (spd > 14) u.play(vis.run, { speed: Math.min(1.8, 0.6 + spd / (e.speed || 100) * 0.6) });
      else u.play(vis.idle || vis.run);
      // подсветка
      if (e.flash > 0) u.setEmissive('#ffffff', 0.7);
      else if (e.burnT > 0) u.setEmissive('#ff5a10', 0.45);
      else if (e.slowT > 0) u.setEmissive('#40a0ff', 0.4);
      else if (e.elite) u.setEmissive('#ffb020', 0.35);
      else if (e.boss && e.enraged) u.setEmissive('#ff2a10', 0.25 + Math.sin(this.time * 8) * 0.1);
      else if (vis.tint) u.setEmissive(vis.tint, 0.18);
      else u.setEmissive('#000000', 0);
      if (playing && this.near(x, z)) u.mixer.update(edt);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t -= dt;
      d.u.mixer.update(dt);
      if (d.t < 0.45) d.u.root.position.y -= dt * 2.2;
      if (d.t <= 0) {
        this.release(d.u);
        this.dying.splice(i, 1);
      }
    }
  }

  // Скелеты-союзники некроманта
  syncAllies(g, dt) {
    if (!this.allyUnits) this.allyUnits = new Set();
    const menu = g.state === 'menu';
    for (const a of g.allies) {
      if (a._u || a.gone) continue;
      const key = a.knight ? 'Skeleton_Warrior' : 'Skeleton_Minion';
      const u = this.acquire(key, false);
      u.setScale(a.knight ? 1.6 : 1.25);
      u.play('Spawn_Ground_Skeletons', { once: true, speed: 2, fade: 0 });
      u.yaw = 0;
      a._u = u;
      a._dyingPlayed = false;
      this.scene.add(u.root);
      this.allyUnits.add(a);
    }
    for (const a of this.allyUnits) {
      const u = a._u;
      if (!u) continue;
      if (a.gone || !g.allies.includes(a) || menu) {
        this.release(u);
        a._u = null;
        this.allyUnits.delete(a);
        continue;
      }
      u.root.position.set(a.x / U, a.dead && a.deadT > 0.8 ? -(a.deadT - 0.8) * 1.5 : 0, a.y / U);
      const spd = Math.hypot(a.vx, a.vy);
      const face = a.target && !a.target.dead ? Math.atan2(a.target.y - a.y, a.target.x - a.x) : Math.atan2(a.vy, a.vx);
      if (spd > 10 || a.target) {
        let d = Math.PI / 2 - face - u.yaw;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        u.yaw += d * Math.min(1, dt * 10);
      }
      u.root.rotation.y = u.yaw;
      if (a.dead) {
        if (!a._dyingPlayed) {
          a._dyingPlayed = true;
          u.play('Death_A', { once: true, fade: 0.08 });
        }
      } else if (a.rise > 0) {
      } else if (a.attacking > 0) u.play('1H_Melee_Attack_Chop', { speed: 1.5, fade: 0.08 });
      else if (spd > 14) u.play('Running_C', { speed: Math.min(1.8, 0.7 + spd / 200) });
      else u.play('Idle');
      u.setEmissive(a.enrageT > 0 ? '#60ff40' : '#20ff90', a.enrageT > 0 ? 0.6 : 0.32);
      if (g.state === 'playing') u.mixer.update(dt);
      this.fx.shadow.add(a.x / U, 0.03, a.y / U, (a.r * 2.6) / U, (a.r * 2.6) / U, 0, 1, 1, 1);
      if (!a.dead) this.fx.groundRing.add(a.x / U, 0.05, a.y / U, (a.r * 2.8) / U, (a.r * 2.8) / U, 0, 0.1, 0.6, 0.3);
    }
  }

  near(x, z) {
    const dx = x - this.target.x, dz = z - this.target.z;
    return dx * dx + dz * dz < 900;
  }

  beam(x1, y1, z1, x2, y2, z2, w, r, gg, b) {
    if (this.bn >= 1400) return;
    const d = this.tmpD.set(x2 - x1, y2 - y1, z2 - z1);
    const len = d.length();
    if (len < 1e-4) return;
    d.divideScalar(len);
    const dm = this.dummy;
    dm.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    dm.quaternion.setFromUnitVectors(this.UP, d);
    dm.scale.set(w, len, w);
    dm.updateMatrix();
    this.beams.setMatrixAt(this.bn, dm.matrix);
    this.beams.instanceColor.setXYZ(this.bn, r, gg, b);
    this.bn++;
  }

  arrow(x, y, z, dx, dy, dz, sc, r, gg, b) {
    if (this.an >= 700) return;
    const d = this.tmpD.set(dx, dy, dz).normalize();
    const dm = this.dummy;
    dm.position.set(x, y, z);
    dm.quaternion.setFromUnitVectors(this.XA, d);
    dm.scale.setScalar(sc);
    dm.updateMatrix();
    this.arrows.setMatrixAt(this.an, dm.matrix);
    this.arrows.instanceColor.setXYZ(this.an, r, gg, b);
    this.an++;
  }

  syncFX(g, dt, menu) {
    const fx = this.fx;
    for (const l of Object.values(fx)) l.begin();
    this.bn = 0;
    this.an = 0;
    const p = g.player;
    const t = this.time;
    const H = 1.0;
    // Чем больше атак героя на экране и чем крупнее они, тем тусклее каждая:
    // общая яркость не растёт до «каши» и не слепит.
    const crowd = g.projs.length + g.slashes.length * 4 + g.bolts.length * 2 + g.clouds.length * 3 + g.wells.length * 6 + g.meteors.length * 3;
    const sizeK = p ? Math.pow(1 / Math.max(1, p.s.size), 0.75) : 1;
    const wantK = clamp(1.5 / Math.sqrt(1 + crowd / 8), 0.3, 1) * sizeK;
    this.pfxK = this.pfxK == null ? wantK : this.pfxK + (wantK - this.pfxK) * Math.min(1, dt * 5);
    const K = this.pfxK;
    for (const l of [fx.slash, fx.slashN, fx.pGlow, fx.pCore, fx.streak, fx.ring]) l.mesh.material.color.setScalar(K);
    fx.part.mesh.material.color.setScalar(0.35 + 0.65 * K);
    this.beams.material.color.setScalar(0.45 + 0.55 * K);
    this.bloom.strength = 0.5 * (0.5 + 0.5 * K);

    // тени под юнитами
    for (const e of this.live) {
      const s = (e.r * (e.boss ? 3.6 : 2.6)) / U;
      fx.shadow.add(e.x / U, 0.03, e.y / U, s, s, 0, 1, 1, 1);
      if (e.elite) {
        const k = 1.5 + Math.sin(t * 5) * 0.3;
        fx.groundRing.add(e.x / U, 0.06, e.y / U, (e.r * 3.4) / U, (e.r * 3.4) / U, t, 1.6 * k, 1.0 * k, 0.2 * k);
      }
      if (e.boss) {
        const c = this.col(e.bossDef.color);
        const s2 = (e.r * 5) / U;
        fx.rune.add(e.x / U, 0.05, e.y / U, s2, s2, t * 0.5, c.r * 1.6, c.g * 1.6, c.b * 1.6);
      }
      if (e.def.ai === 'dash' && e.state === 1) {
        const k = 1 - e.stateT / 0.65;
        const len = 300 / U, a = e.dashA;
        fx.ground.add(e.x / U + (Math.cos(a) * len) / 2, 0.07, e.y / U + (Math.sin(a) * len) / 2, len, 0.5 + k * 0.4, a, 1.6 * (0.3 + k), 0.2 * (0.3 + k), 0.1);
      }
    }
    if (!p || menu) this.cloud.visible = false;
    if (p && !menu) {
      const x = p.x / U, z = p.y / U;
      fx.shadow.add(x, 0.03, z, 1.4, 1.4, 0, 1, 1, 1);
      const hc = this.col(p.char.color);
      fx.groundRing.add(x, 0.05, z, 1.9, 1.9, 0, hc.r * 0.9, hc.g * 0.9, hc.b * 0.9);
      fx.rune.add(x, 0.04, z, 2.6, 2.6, -t * 0.3, hc.r * 0.35, hc.g * 0.35, hc.b * 0.35);
      if (p.char.id === 'chronos') {
        const R = (2 * 130 * p.s.auraMult) / U;
        fx.groundRing.add(x, 0.05, z, R, R, 0, hc.r * 0.09, hc.g * 0.09, hc.b * 0.09);
      }
      if (p.aegisT > 0) {
        const k = Math.min(1, p.aegisT / 0.3);
        fx.ring.add(x, H, z, (2 * 80) / U, (2 * 80) / U, t, hc.r * 1.8 * k, hc.g * 1.8 * k, hc.b * 1.8 * k);
        fx.part.add(x, H, z, 5.5, 5.5, 0, hc.r * 0.5 * k, hc.g * 0.5 * k, hc.b * 0.5 * k);
      }
      if (p.shield) fx.ring.add(x, H, z, 1.7, 1.7, 0, 0.6, 1.6, 1.8);
      // освящённая земля Готфрида
      if (p.flags.consecrate) {
        const R = ((2 * 115 * (1 + 0.35 * (p.upg.bastion_holyfire || 0))) / U);
        fx.rune.add(x, 0.05, z, R, R, t * 0.25, 0.5, 0.4, 0.15);
        fx.zoneFill.add(x, 0.04, z, R, R, 0, 0.14, 0.11, 0.03);
      }
      // ярость Бранда
      if (p.rageT > 0) {
        const pul = 0.8 + 0.2 * Math.sin(t * 12);
        fx.groundRing.add(x, 0.06, z, 2.6 * pul, 2.6 * pul, 0, 1.6, 0.3, 0.1);
      }
      // грозовая туча
      if (p.flags.cloud) {
        const cl = this.cloud;
        cl.visible = true;
        cl.position.x += (x + 0.6 - cl.position.x) * Math.min(1, dt * 3);
        cl.position.z += (z - 1 - cl.position.z) * Math.min(1, dt * 3);
        cl.position.y = 6.6 + Math.sin(t) * 0.2;
        cl.rotation.y += dt * 0.25;
        this.cloudMat.emissiveIntensity = g.cloudFlash > 0 ? 3 : 0.12 + Math.random() * 0.05;
        fx.shadow.add(cl.position.x, 0.03, cl.position.z, 4, 3, 0, 1, 1, 1);
      } else this.cloud.visible = false;
      if (p.focus && g.dying <= 0) {
        fx.bCore.add(x, H + 0.2, z, 0.38, 0.38, 0, 3, 3, 3);
        fx.ring.add(x, H + 0.2, z, 0.9, 0.9, 0, 1.5, 1.5, 1.5);
      }
    }

    // зоны-телеграфы ударов: контур + заполнение по мере приближения удара
    let ci = 0;
    for (const zn of g.zones) {
      if (zn.dead) continue;
      const c = this.col(zn.color);
      const k = Math.min(1, zn.t / zn.delay);
      const dr = c.r * 0.5 + 0.5, dg = c.g * 0.5 + 0.1, db = c.b * 0.5 + 0.08; // уводим в «опасный» красный
      const x = zn.x / U, z = zn.y / U;
      if (zn.kind === 'circle') {
        const R = (zn.r * 2) / U;
        fx.zoneRing.add(x, 0.07, z, R, R, 0, dr * 1.3, dg * 1.3, db * 1.3);
        fx.zoneFill.add(x, 0.06, z, R * k, R * k, 0, dr * (0.35 + k * 0.5), dg * (0.35 + k * 0.5), db * (0.35 + k * 0.5));
      } else if (zn.kind === 'line' || zn.kind === 'beam') {
        const len = zn.len / U, w = zn.w / U;
        const ca = Math.cos(zn.a), sa = Math.sin(zn.a);
        const live = zn.kind === 'beam' && zn.t >= zn.delay;
        if (live) {
          fx.zoneRect.add(x + (ca * len) / 2, 0.08, z + (sa * len) / 2, len, w, zn.a, c.r * 1.6, c.g * 1.6, c.b * 1.6);
          fx.streak.add(x + (ca * len) / 2, H, z + (sa * len) / 2, len, w * 0.5, zn.a, c.r * 1.4, c.g * 1.4, c.b * 1.4);
        } else {
          fx.zoneRect.add(x + (ca * len) / 2, 0.06, z + (sa * len) / 2, len, w, zn.a, dr * 0.35, dg * 0.35, db * 0.35);
          const fl = len * k;
          fx.zoneRect.add(x + (ca * fl) / 2, 0.07, z + (sa * fl) / 2, fl, w * 0.92, zn.a, dr * 0.8, dg * 0.8, db * 0.8);
        }
      } else if (zn.kind === 'cone' && ci < this.cones.length) {
        const m = this.cones[ci++];
        m.visible = true;
        if (m.userData.arc !== zn.arc) {
          m.geometry.dispose();
          m.geometry = new THREE.CircleGeometry(1, 28, -zn.arc, zn.arc * 2).rotateX(-Math.PI / 2);
          m.userData.arc = zn.arc;
        }
        m.position.set(x, 0.06, z);
        m.rotation.y = -zn.a;
        m.scale.setScalar(zn.len / U);
        m.material.color.setRGB(dr * (0.3 + k * 0.6), dg * (0.3 + k * 0.6), db * (0.3 + k * 0.6));
      }
    }
    for (let i = ci; i < this.cones.length; i++) this.cones[i].visible = false;
    // щит Иерарха Тлена
    if (g.boss && g.boss.shielded) {
      const b = g.boss;
      const s = (b.r * 3.6) / U;
      fx.ring.add(b.x / U, H + 0.6, b.y / U, s, s, t, 0.5, 1.6, 2);
      fx.part.add(b.x / U, H + 0.6, b.y / U, s * 1.1, s * 1.1, 0, 0.12, 0.4, 0.5);
    }

    // огненные следы
    for (const h of g.hazards) {
      const k = h.life / h.max;
      const s = (h.r * 2.8) / U;
      fx.ground.add(h.x / U, 0.08, h.y / U, s, s, 0, 1.6 * k, 0.6 * k, 0.15 * k);
    }

    // снаряды героя
    for (const pr of g.projs) {
      if (pr.dead) continue;
      const c = this.col(pr.color);
      const k = Math.min(1, pr.life / 0.12);
      const x = pr.x / U, z = pr.y / U;
      const a = Math.atan2(pr.vy, pr.vx);
      if (pr.kind === 'arrow') {
        this.arrow(x, H, z, Math.cos(a), 0, Math.sin(a), pr.heavy ? 1.4 : 1, c.r, c.g, c.b);
        const len = (pr.r * 9) / U;
        fx.streak.add(x - (Math.cos(a) * len) / 2, H, z - (Math.sin(a) * len) / 2, len, (pr.r * 1.4) / U, a, c.r * 0.6 * k, c.g * 0.6 * k, c.b * 0.6 * k);
        if (pr.heavy) fx.pGlow.add(x, H, z, 0.9, 0.9, 0, 0.9 * k, 0.7 * k, 0.3 * k);
      } else if (pr.kind === 'flamewave' || pr.kind === 'holywave') {
        const sz = (pr.r * 5.5) / U;
        const fire = pr.kind === 'flamewave';
        fx.slash.add(x, H, z, sz, sz, a, c.r * 1.6 * k, c.g * 1.3 * k, c.b * 1.1 * k);
        fx.slash.add(x - Math.cos(a) * 0.3, H, z - Math.sin(a) * 0.3, sz * 0.8, sz * 0.8, a, fire ? 1.2 * k : 1 * k, fire ? 0.35 * k : 0.9 * k, fire ? 0.05 * k : 0.5 * k);
        fx.pGlow.add(x, H, z, sz * 0.7, sz * 0.7, 0, c.r * 0.5 * k, c.g * 0.4 * k, c.b * 0.3 * k);
      } else if (pr.kind === 'axe') {
        // крутящийся топор: вращающийся диск-лезвие
        const sz = (pr.r * 4.4) / U;
        const sp = t * 22;
        fx.slash.add(x, H, z, sz, sz, sp, c.r * 0.9, c.g * 0.8, c.b * 0.7);
        fx.slash.add(x, H, z, sz, sz, sp + Math.PI, c.r * 0.9, c.g * 0.8, c.b * 0.7);
        fx.pCore.add(x, H, z, sz * 0.22, sz * 0.22, 0, 1.2, 1.1, 1.0);
        if (pr.burn) fx.pGlow.add(x, H, z, sz * 0.8, sz * 0.8, 0, 0.9, 0.3, 0.05);
      } else if (pr.kind === 'knife') {
        this.arrow(x, H, z, Math.cos(a), 0, Math.sin(a), 0.55, 1.4, 1.45, 1.6);
        const len = (pr.r * 6) / U;
        fx.streak.add(x - (Math.cos(a) * len) / 2, H, z - (Math.sin(a) * len) / 2, len, (pr.r * 1.0) / U, a, 0.4 * k, 0.45 * k, 0.55 * k);
      } else if (pr.kind === 'ball') {
        // шаровая молния: сгусток с пляшущими искрами
        const sz = (pr.r * 4.2) / U;
        const fl = 0.8 + Math.random() * 0.4;
        fx.pGlow.add(x, H, z, sz * 1.6 * fl, sz * 1.6 * fl, 0, c.r * 0.7, c.g * 0.7, c.b * 0.9);
        fx.pCore.add(x, H, z, sz * 0.5, sz * 0.5, 0, 1.6, 1.7, 2.0);
        for (let i = 0; i < 3; i++) {
          const an = Math.random() * TAU, rr = sz * 0.6;
          this.beam(x, H, z, x + Math.cos(an) * rr, H + (Math.random() - 0.5) * rr, z + Math.sin(an) * rr, 0.025, c.r * 1.4, c.g * 1.4, c.b * 1.6);
        }
      } else if (pr.kind === 'flask') {
        // склянка летит по дуге
        const prog = 1 - pr.life / pr.max;
        const hh = 0.8 + Math.sin(prog * Math.PI) * 2.2;
        fx.pGlow.add(x, hh, z, 0.7, 0.7, 0, 0.35, 1.0, 0.25);
        fx.pCore.add(x, hh, z, 0.22, 0.22, 0, 0.8, 1.4, 0.6);
        fx.shadow.add(x, 0.03, z, 0.5, 0.5, 0, 0.6, 0.6, 0.6);
      } else if (pr.kind === 'soul') {
        const sz = (pr.r * 5) / U;
        fx.pGlow.add(x, H, z, sz, sz, 0, 0.25 * k, 1.3 * k, 0.6 * k);
        fx.pCore.add(x, H, z, sz * 0.35, sz * 0.35, 0, 0.8 * k, 1.3 * k, 0.9 * k);
        const len = (pr.r * 6) / U;
        fx.streak.add(x - (Math.cos(a) * len) / 2, H, z - (Math.sin(a) * len) / 2, len, sz * 0.5, a, 0.15 * k, 0.9 * k, 0.4 * k);
      } else {
        const s2 = (pr.r * (pr.kind === 'wisp' ? 6.5 : 5.5)) / U;
        fx.pGlow.add(x, H, z, s2, s2, 0, c.r * 1.1 * k, c.g * 1.1 * k, c.b * 1.1 * k);
        const s3 = (pr.r * 1.8) / U;
        fx.pCore.add(x, H, z, s3, s3, 0, 1.1 * k, 1.1 * k, 1.1 * k);
      }
    }

    // удары оружием: дуги секиры и меча
    for (const sl of g.slashes) {
      const k = 1 - sl.life / sl.max;
      const c = this.col(sl.color);
      const sz = ((2 * sl.r) / U) * (0.92 + 0.14 * k);
      const I = Math.pow(1 - k, 1.2) * 0.85;
      const x = sl.x / U, z = sl.y / U;
      if (sl.kind === 'ring') {
        fx.slash.add(x, H * 0.9, z, sz, sz, sl.a + k * 2.5, c.r * I, c.g * I, c.b * I);
        fx.slash.add(x, H * 0.9, z, sz, sz, sl.a + Math.PI + k * 2.5, c.r * I, c.g * I, c.b * I);
      } else {
        const layer = sl.kind === 'narrow' ? fx.slashN : fx.slash;
        layer.add(x, H * 0.95, z, sz, sz * sl.side, sl.a + sl.side * (k - 0.5) * 0.7, c.r * I, c.g * I, c.b * I);
      }
    }

    // дождь стрел
    for (const sa of g.skyArrows) {
      if (sa.t < 0) continue;
      const pr = Math.min(1, sa.t / sa.fall);
      const h = 8 * (1 - pr);
      this.arrow(sa.x / U + 0.5 * (1 - pr), h, sa.y / U, -0.12, -1, 0, 1.1, 0.85, 0.92, 1);
      fx.groundRing.add(sa.x / U, 0.05, sa.y / U, 0.9 * pr, 0.9 * pr, 0, 0.5 * pr, 0.6 * pr, 0.8 * pr);
    }

    // облака чумы
    for (const c of g.clouds) {
      const k = Math.min(1, c.life / 0.5, (c.max - c.life) / 0.25);
      const R = (c.r * 2.4) / U;
      fx.ground.add(c.x / U, 0.07, c.y / U, R, R, 0, 0.12 * k, 0.38 * k, 0.06 * k);
      fx.ground.add(c.x / U + Math.sin(t * 1.3 + c.x) * 0.3, 0.09, c.y / U + Math.cos(t * 1.1 + c.y) * 0.3, R * 0.7, R * 0.7, 0, 0.14 * k, 0.4 * k, 0.07 * k);
      fx.groundRing.add(c.x / U, 0.06, c.y / U, R * 0.85, R * 0.85, t * 0.5, 0.12 * k, 0.4 * k, 0.06 * k);
    }

    // метеоры: метка на земле и падающий огненный ком
    for (const m of g.meteors) {
      const k = Math.min(1, m.t / m.delay);
      const R = (m.R * 2) / U;
      const x = m.x / U, z = m.y / U;
      fx.groundRing.add(x, 0.06, z, R * (0.4 + 0.6 * k), R * (0.4 + 0.6 * k), t * 2, 1.4 * k, 0.5 * k, 0.1 * k);
      fx.ground.add(x, 0.05, z, R * k, R * k, 0, 0.5 * k, 0.15 * k, 0.03 * k);
      const h = 11 * (1 - k), ox = 3 * (1 - k);
      fx.pGlow.add(x + ox, h + 0.3, z - ox * 0.4, 1.9, 1.9, 0, 1.6, 0.6, 0.15);
      fx.pCore.add(x + ox, h + 0.3, z - ox * 0.4, 0.55, 0.55, 0, 2, 1.5, 0.8);
      this.beam(x + ox + 1.2, h + 4, z - ox * 0.4 - 0.5, x + ox, h + 0.3, z - ox * 0.4, 0.28, 1.2, 0.4, 0.08);
    }

    // чёрные воронки
    for (const w of g.wells) {
      const k = Math.min(1, (w.max - w.life) / 0.3, w.life / 0.2);
      const R = (w.R * 2) / U;
      const x = w.x / U, z = w.y / U;
      fx.shadow.add(x, 0.04, z, R * 0.9 * k, R * 0.9 * k, 0, 1, 1, 1);
      fx.groundRing.add(x, 0.06, z, R * k, R * k, -t * 3, 0.6 * k, 0.2 * k, 1.0 * k);
      fx.groundRing.add(x, 0.07, z, R * 0.6 * k, R * 0.6 * k, t * 4, 0.9 * k, 0.4 * k, 1.4 * k);
      fx.rune.add(x, 0.05, z, R * 0.75 * k, R * 0.75 * k, -t * 1.5, 0.5 * k, 0.15 * k, 0.9 * k);
      fx.pGlow.add(x, 0.9, z, 1.6 * k, 1.6 * k, 0, 0.5 * k, 0.15 * k, 0.9 * k);
      fx.pCore.add(x, 0.9, z, 0.35 * k, 0.35 * k, 0, 0.1, 0.02, 0.2);
    }

    // капканы
    for (const tr of g.traps) {
      const armed = tr.arm <= 0;
      const pulse = 0.7 + 0.3 * Math.sin(t * 6 + tr.x);
      const cr = tr.poison ? 0.45 : 1.3, cg = tr.poison ? 1.2 : 0.6, cb = tr.poison ? 0.2 : 0.2;
      const R = (tr.r * 1.2) / U;
      fx.rune.add(tr.x / U, 0.05, tr.y / U, R, R, t * 1.5, cr * (armed ? pulse : 0.3), cg * (armed ? pulse : 0.3), cb);
      fx.ground.add(tr.x / U, 0.07, tr.y / U, 0.8, 0.8, 0, cr * 0.6 * pulse, cg * 0.6 * pulse, cb);
    }

    // столпы света (Суд)
    for (const pl of g.pillars) {
      const k = pl.life / pl.max;
      this.beam(pl.x / U, 0, pl.y / U, pl.x / U, 9, pl.y / U, 0.7 * k, 1.6 * k, 1.4 * k, 0.8 * k);
      this.beam(pl.x / U, 0, pl.y / U, pl.x / U, 9, pl.y / U, 0.18 * k, 2.2 * k, 2.2 * k, 1.8 * k);
      fx.groundRing.add(pl.x / U, 0.06, pl.y / U, 1.8, 1.8, 0, 1.4 * k, 1.2 * k, 0.6 * k);
    }

    // древние каменные кольца
    if (this.ritualRings) for (const rr of this.ritualRings) fx.rune.add(rr.x, 0.03, rr.z, rr.r, rr.r, t * 0.05, 0.3, 0.05, 0.06);

    // частицы
    for (const q of g.particles.list) {
      const k = q.life / (q.max || q.life || 1);
      const c = this.col(q.color);
      if (q.t === 0) {
        const s = (q.size * (0.4 + 0.6 * k) * 2.2) / U;
        fx.part.add(q.x / U, q.h != null ? q.h : H, q.y / U, s, s, 0, c.r * k * 1.4, c.g * k * 1.4, c.b * k * 1.4);
      } else if (q.t === 1) {
        const sp = Math.hypot(q.vx, q.vy);
        const len = Math.max(0.08, (sp * 0.05) / U);
        const a = Math.atan2(q.vy, q.vx);
        fx.streak.add(q.x / U - (Math.cos(a) * len) / 2, H, q.y / U - (Math.sin(a) * len) / 2, len, (q.size * 2.2) / U, a, c.r * 2 * k, c.g * 2 * k, c.b * 2 * k);
      } else {
        const e = 1 - Math.pow(k, 3);
        const r = (q.r0 + (q.size - q.r0) * e) / U;
        fx.ring.add(q.x / U, 0.3, q.y / U, r * 2, r * 2, 0, c.r * k * 1.6, c.g * k * 1.6, c.b * k * 1.6);
      }
    }

    // молнии: ломаные светящиеся сегменты с ответвлением
    const hash = (n) => {
      const v = Math.sin(n * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    for (const b of g.bolts) {
      const k = b.life / b.max;
      const c = this.col(b.color);
      const seed = b.seed + Math.floor(this.time * 28) * 7.13;
      const x1 = b.x1 / U, z1 = b.y1 / U, x2 = b.x2 / U, z2 = b.y2 / U;
      const len = Math.hypot(x2 - x1, b.h2 - b.h1, z2 - z1);
      const amp = Math.min(0.55, len * 0.13);
      const N = 7;
      const pts = [[x1, b.h1, z1]];
      for (let i = 1; i < N; i++) {
        const f = i / N;
        pts.push([x1 + (x2 - x1) * f + (hash(seed + i) - 0.5) * amp * 2, b.h1 + (b.h2 - b.h1) * f + (hash(seed + i + 31) - 0.5) * amp * 0.6, z1 + (z2 - z1) * f + (hash(seed + i + 77) - 0.5) * amp * 2]);
      }
      pts.push([x2, b.h2, z2]);
      const wg = 0.2 * b.w * (0.5 + 0.5 * k), wc = 0.055 * b.w;
      for (let i = 1; i < pts.length; i++) {
        const a0 = pts[i - 1], a1 = pts[i];
        this.beam(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], wg, c.r * 1.3 * k, c.g * 1.3 * k, c.b * 1.5 * k);
        this.beam(a0[0], a0[1], a0[2], a1[0], a1[1], a1[2], wc, 2 * k, 2.1 * k, 2.4 * k);
      }
      // ответвление
      const bi = 2 + Math.floor(hash(seed + 5) * 3);
      const o = pts[bi];
      const bx = o[0] + (hash(seed + 9) - 0.5) * len * 0.5, bz = o[2] + (hash(seed + 13) - 0.5) * len * 0.5, by = o[1] - hash(seed + 17) * 0.5;
      this.beam(o[0], o[1], o[2], bx, by, bz, wc * 0.8, c.r * 1.2 * k, c.g * 1.2 * k, c.b * 1.4 * k);
      fx.part.add(x2, Math.max(0.3, b.h2), z2, 1.4 * k, 1.4 * k, 0, c.r * k, c.g * k, c.b * 1.2 * k);
    }

    // вражеские чары — поверх всего
    for (const b of g.bullets) {
      if (b.dead) continue;
      const c = this.col(b.color);
      const x = b.x / U, z = b.y / U;
      if (b.kind === 'arrow') {
        const a = Math.atan2(b.vy, b.vx);
        this.arrow(x, H, z, Math.cos(a), 0, Math.sin(a), 1.15, 1.2, 0.35, 0.3);
        fx.bGlow.add(x, H, z, 0.55, 0.55, 0, 1.1, 0.25, 0.2);
        continue;
      }
      const s = (b.r * 3.6) / U;
      fx.bGlow.add(x, H, z, s, s, 0, c.r * 1.05, c.g * 1.05, c.b * 1.05);
      const s2 = (b.r * 2.1) / U;
      fx.bCore.add(x, H, z, s2, s2, 0, 0.85 + c.r * 0.35, 0.85 + c.g * 0.35, 0.85 + c.b * 0.35);
    }

    // самоцветы
    const gm = this.gemMesh;
    let n = 0;
    const d = this.dummy;
    for (const gem of g.gems) {
      if (n >= 450) break;
      const x = gem.x / U, z = gem.y / U;
      d.position.set(x, 0.35 + Math.sin(gem.t * 4) * 0.08, z);
      d.rotation.set(0, gem.t * 2.5, 0);
      const s = gem.r / 4.5;
      d.scale.set(s, s * 1.4, s);
      d.updateMatrix();
      gm.setMatrixAt(n, d.matrix);
      const c = this.col(gem.color);
      gm.instanceColor.setXYZ(n, c.r * 2, c.g * 2, c.b * 2);
      // ореол кристаллов слабее, когда их много — иначе пол превращается в сплошное зарево
      const gk = 0.35 * Math.min(1, 40 / Math.max(40, g.gems.length));
      fx.ground.add(x, 0.1, z, (gem.r * 3.5) / U, (gem.r * 3.5) / U, 0, c.r * gk, c.g * gk, c.b * gk);
      n++;
    }
    gm.count = n;
    gm.instanceMatrix.needsUpdate = true;
    gm.instanceColor.needsUpdate = true;

    // кинжалы, птицы-духи и соколы
    const orb = p && !menu ? p.s.orbitals : 0;
    for (let i = 0; i < this.daggers.length; i++) {
      const dg = this.daggers[i];
      const show = i < orb && p.char.id !== 'morra';
      dg.visible = show;
      if (!show) continue;
      const a = p.orbitA + (i * TAU) / orb;
      const x = (p.x + Math.cos(a) * 78) / U, z = (p.y + Math.sin(a) * 78) / U;
      dg.position.set(x, H, z);
      dg.rotation.set(0, -(a + Math.PI / 2) - t * 8, 0);
      fx.part.add(x, H, z, 1.1, 1.1, 0, 0.5, 0.6, 0.9);
    }
    if (p && !menu && p.char.id === 'morra') {
      for (let i = 0; i < orb; i++) {
        const a = p.orbitA + (i * TAU) / orb;
        const x = (p.x + Math.cos(a) * 78) / U, z = (p.y + Math.sin(a) * 78) / U;
        fx.pGlow.add(x, H, z, 1.5, 1.5, 0, 1.8, 0.5, 1.6);
        fx.pCore.add(x, H, z, 0.35, 0.35, 0, 2.5, 2.2, 2.5);
        fx.streak.add(x, H, z, 0.9, 0.3, a + Math.PI / 2 + Math.PI, 1.2, 0.3, 1.1);
      }
    }
    const nd = p && !menu ? p.s.drones : 0;
    for (let i = 0; i < this.falcons.length; i++) {
      const f = this.falcons[i];
      f.visible = i < nd;
      if (!f.visible) continue;
      const a = -p.orbitA * 0.6 + (i * TAU) / nd;
      const x = (p.x + Math.cos(a) * 44) / U, z = (p.y + Math.sin(a) * 44) / U;
      f.position.set(x, 2.1 + Math.sin(t * 3 + i) * 0.2, z);
      f.rotation.set(0, -(a - Math.PI / 2), 0);
      const flap = Math.sin(t * 14 + i) * 0.6;
      f.userData.wl.rotation.x = flap;
      f.userData.wr.rotation.x = -flap;
      fx.shadow.add(x, 0.03, z, 0.6, 0.6, 0, 1, 1, 1);
    }

    // мерцающие свечи и фонари
    const gl = this.glowLayer;
    gl.begin();
    for (const w of this.glows) {
      const f = 0.8 + Math.sin(t * 7 + w.ph) * 0.12 + Math.sin(t * 17 + w.ph * 3) * 0.08;
      gl.add(w.x, w.y, w.z, w.s * f, w.s * f, 0, w.c.r * 1.6 * f, w.c.g * 1.6 * f, w.c.b * 1.6 * f);
    }
    gl.end();
    for (const l of Object.values(fx)) l.end();
    this.beams.count = this.bn;
    this.beams.instanceMatrix.needsUpdate = true;
    this.beams.instanceColor.needsUpdate = true;
    this.arrows.count = this.an;
    this.arrows.instanceMatrix.needsUpdate = true;
    this.arrows.instanceColor.needsUpdate = true;
  }

  syncPickups(g) {
    const seen = new Set();
    for (const k of g.pickups) {
      if (k.dead) continue;
      seen.add(k);
      let m = this.pickMeshes.get(k);
      if (!m) {
        m = this.makePickup(k.type);
        this.scene.add(m);
        this.pickMeshes.set(k, m);
      }
      m.position.set(k.x / U, 0.4 + Math.sin(k.t * 3) * 0.12, k.y / U);
      m.rotation.y = k.t * 1.5;
      const c = this.col(k.type === 'chest' ? '#ffc040' : k.type === 'heart' ? '#ff3050' : '#40c0ff');
      this.fx.ground.add(k.x / U, 0.1, k.y / U, 2.4, 2.4, 0, c.r, c.g, c.b);
      this.fx.part.add(k.x / U, 0.8, k.y / U, 1.6, 1.6, 0, c.r * 0.6, c.g * 0.6, c.b * 0.6);
    }
    for (const [k, m] of this.pickMeshes) {
      if (!seen.has(k)) {
        this.scene.remove(m);
        this.pickMeshes.delete(k);
      }
    }
    this.fx.ground.end();
    this.fx.part.end();
  }

  makePickup(type) {
    const g = new THREE.Group();
    if (type === 'chest') {
      const wood = new THREE.MeshStandardMaterial({ color: '#6a3c1c', roughness: 0.8 });
      const gold = new THREE.MeshStandardMaterial({ color: '#ffc040', metalness: 0.9, roughness: 0.3, emissive: '#ff9a20', emissiveIntensity: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.48), wood);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.7, 12, 1, false, 0, Math.PI), wood);
      lid.rotation.z = Math.PI / 2;
      lid.position.y = 0.21;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.08, 0.52), gold);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.06), gold);
      lock.position.set(0, 0.12, 0.26);
      g.add(body, lid, band, lock);
    } else if (type === 'heart') {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshStandardMaterial({ color: '#ff3050', emissive: '#ff1030', emissiveIntensity: 1.2, roughness: 0.3 }));
      g.add(m);
    } else {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 20, Math.PI * 1.4), new THREE.MeshStandardMaterial({ color: '#40c0ff', emissive: '#2090ff', emissiveIntensity: 1.2 }));
      g.add(m);
    }
    g.traverse((o) => o.isMesh && (o.castShadow = true));
    return g;
  }

  // ---------- 2D-слой поверх: числа урона, указатели, виньетка ----------
  project(x, y, z) {
    const v = this.tmpV.set(x, y, z).project(this.camera);
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h, v.z];
  }

  drawOverlay(g, menu) {
    const ctx = this.octx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (menu) return;
    // числа урона
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tx of g.particles.texts) {
      const [sx, sy] = this.project(tx.x / U, 1.7, tx.y / U);
      const k = tx.life / tx.max;
      const pop = tx.crit ? 1 + Math.max(0, (k - 0.75) * 3) : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${Math.round(tx.size * 1.2 * pop)}px 'Bona Nova SC', Georgia, serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(10,6,2,0.9)';
      ctx.strokeText(tx.str, sx, sy);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.str, sx, sy);
    }
    ctx.globalAlpha = 1;
    const p = g.player;
    if (!p) return;
    // вспышка
    if (g.flashA > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = g.flashA * 0.7;
      ctx.fillStyle = g.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // кровавая виньетка
    const low = 1 - p.hp / p.s.maxHp;
    const hurt = p.hurtT > 0 ? p.hurtT / 0.4 : 0;
    const a = Math.max(low > 0.6 ? (low - 0.6) * 1.6 * (0.7 + 0.3 * Math.sin(this.time * 6)) : 0, hurt * 0.7);
    if (a > 0.01) {
      const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      gr.addColorStop(0, 'rgba(160,0,0,0)');
      gr.addColorStop(1, `rgba(160,0,10,${a * 0.6})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    }
    // указатель на босса
    if (g.boss && !g.boss.dead) {
      const b = g.boss;
      const [bx, by, bz] = this.project(b.x / U, 1.5, b.y / U);
      if (bx < 0 || bx > w || by < 0 || by > h || bz > 1) {
        const [hx, hy] = this.project(p.x / U, 1, p.y / U);
        const ang = Math.atan2(b.y - p.y, b.x - p.x);
        const ex = Math.min(w - 40, Math.max(40, hx + Math.cos(ang) * w)), ey = Math.min(h - 40, Math.max(100, hy + Math.sin(ang) * h));
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-10, 13);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-10, -13);
        ctx.closePath();
        ctx.fillStyle = b.bossDef.color;
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    // джойстик
    if (input.touch.active) {
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#ffe8b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(input.touch.sx, input.touch.sy, 60, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = p.char.color;
      ctx.beginPath();
      ctx.arc(input.touch.sx + input.touch.dx * 60, input.touch.sy + input.touch.dy * 60, 24, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
