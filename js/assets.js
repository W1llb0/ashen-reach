// Загрузка 3D-моделей (glTF + meshopt) и подготовка шаблонов для клонирования
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = 'assets/models/';

export const MODEL_FILES = {
  // герои (KayKit Adventurers, CC0)
  Barbarian: 'Barbarian.glb',
  Knight: 'Knight.glb',
  Mage: 'Mage.glb',
  Rogue: 'Rogue.glb',
  Rogue_Hooded: 'Rogue_Hooded.glb',
  // нежить (KayKit Skeletons, CC0)
  Skeleton_Minion: 'Skeleton_Minion.glb',
  Skeleton_Rogue: 'Skeleton_Rogue.glb',
  Skeleton_Mage: 'Skeleton_Mage.glb',
  Skeleton_Warrior: 'Skeleton_Warrior.glb',
  // чудовища (Quaternius Ultimate Monsters, CC0)
  GhostSkull: 'GhostSkull.glb',
  BlueDemon: 'BlueDemon.glb',
  Ghost: 'Ghost.glb',
  Goleling: 'Goleling.glb',
  Yeti: 'Yeti.glb',
  Demon: 'Demon.glb',
  DragonEvolved: 'DragonEvolved.glb',
  Tribal: 'Tribal.glb',
  Orc: 'Orc.glb',
  Hywirl: 'Hywirl.glb',
};

export const DECOR_FILES = [
  'gravestone', 'grave_A', 'grave_A_destroyed', 'gravemarker_A', 'gravemarker_B', 'lantern_standing', 'candle_triple',
  'skull_candle', 'tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'shrine_candles', 'post_skull', 'bone_A',
  'ribcage', 'skull', 'pillar', 'crypt', 'fence_broken', 'fence_pillar_broken',
];

// Модели KayKit используют один скелет — анимации лежат в общем файле
const KAYKIT = new Set(['Barbarian', 'Knight', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Warrior']);

export const assets = { models: {}, decor: {}, kaykitClips: {}, ready: false };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const jobs = [];
  let done = 0;
  const total = Object.keys(MODEL_FILES).length + DECOR_FILES.length + 1;
  const tick = () => onProgress && onProgress(++done / total);
  const load = (url) => loader.loadAsync(url).then((g) => (tick(), g));

  jobs.push(
    load(BASE + 'kaykit_anims.glb').then((g) => {
      for (const c of g.animations) assets.kaykitClips[c.name] = c;
    })
  );
  for (const [name, file] of Object.entries(MODEL_FILES)) {
    jobs.push(
      load(BASE + file).then((g) => {
        prepareModel(g.scene);
        mergeSkinned(g.scene);
        const box = new THREE.Box3().setFromObject(g.scene);
        const size = box.getSize(new THREE.Vector3());
        const clips = {};
        for (const c of g.animations) clips[c.name] = c;
        assets.models[name] = { scene: g.scene, height: size.y || 1, width: Math.max(size.x, size.z) || 1, clips, kaykit: KAYKIT.has(name), minY: box.min.y };
      })
    );
  }
  for (const name of DECOR_FILES) {
    jobs.push(
      load(BASE + 'decor/' + name + '.glb').then((g) => {
        prepareModel(g.scene, true);
        assets.decor[name] = g.scene;
      })
    );
  }
  await Promise.all(jobs);
  for (const m of Object.values(assets.models)) if (m.kaykit) m.clips = assets.kaykitClips;
  assets.ready = true;
  return assets;
}

function prepareModel(root, isStatic = false) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = isStatic;
      o.frustumCulled = !o.isSkinnedMesh;
      const m = o.material;
      if (m && m.map) {
        m.map.colorSpace = THREE.SRGBColorSpace;
        m.map.anisotropy = 4;
      }
      if (m) {
        m.roughness = Math.max(0.55, m.roughness ?? 1);
        m.metalness = Math.min(0.15, m.metalness ?? 0);
      }
    }
  });
}

// Склейка всех skinned-частей модели (тело, руки, ноги, голова) в один меш с общим скелетом:
// вместо ~9 вызовов отрисовки на персонажа остаётся 1.
function mergeSkinned(root) {
  root.updateMatrixWorld(true);
  const all = [];
  root.traverse((o) => o.isSkinnedMesh && all.push(o));
  const groups = new Map();
  for (const m of all) {
    const k = m.material.map || m.material;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(m);
  }
  for (const meshes of groups.values()) if (meshes.length > 1) mergeGroup(meshes);
}

function mergeGroup(meshes) {
  const mat = meshes[0].material;
  const bm = meshes[0].bindMatrix;
  const ref = meshes[0].skeleton;
  if (!meshes.every((m) => m.bindMatrix.equals(bm) && m.skeleton.bones.length === ref.bones.length && m.skeleton.bones.every((b, i) => b === ref.bones[i]))) return;
  const getters = ['getX', 'getY', 'getZ', 'getW'];
  const geos = [];
  for (const m of meshes) {
    // квантизация каждой части «спрятана» в её обратных матрицах костей:
    // приводим геометрию к матрицам первой части (M одинакова для всех костей)
    const M = ref.boneInverses[0].clone().invert().multiply(m.skeleton.boneInverses[0]);
    const chk = ref.boneInverses[7].clone().invert().multiply(m.skeleton.boneInverses[7]);
    if (!approxEq(M, chk)) return;
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) {
      const a = m.geometry.getAttribute(n);
      if (!a) return;
      const isIdx = n === 'skinIndex';
      const out = isIdx ? new Uint16Array(a.count * a.itemSize) : new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a[getters[k]](i);
      g.setAttribute(n, isIdx ? new THREE.Uint16BufferAttribute(out, a.itemSize) : new THREE.Float32BufferAttribute(out, a.itemSize));
    }
    const ia = m.geometry.getIndex();
    if (ia) g.setIndex(Array.from(ia.array));
    g.applyMatrix4(bm.clone().invert().multiply(M).multiply(bm));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  if (!merged) return;
  merged.computeBoundingSphere();
  const sm = new THREE.SkinnedMesh(merged, mat);
  sm.name = 'Merged_' + meshes[0].name;
  sm.castShadow = true;
  const first = meshes[0];
  first.parent.add(sm);
  sm.position.copy(first.position);
  sm.quaternion.copy(first.quaternion);
  sm.scale.copy(first.scale);
  sm.updateMatrixWorld(true);
  sm.bind(new THREE.Skeleton(ref.bones, ref.boneInverses.map((b) => b.clone())), bm.clone());
  for (const m of meshes) m.parent.remove(m);
}

function approxEq(a, b) {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > 1e-4) return false;
  return true;
}
