// Превью героев на экране выбора: отдельный небольшой WebGL-рендер с постаментом и светом
import * as THREE from 'three';
import { Unit, HERO_VIS, heroVis } from './render3d.js';
import { charById } from './characters.js';

export class HeroPreview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hd-canvas';
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(300, 300, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.3;
    r.setClearColor(0x000000, 0);
    const s = (this.scene = new THREE.Scene());
    s.add(new THREE.HemisphereLight('#9aa6d8', '#3a2814', 1.4));
    const key = new THREE.DirectionalLight('#ffd8a0', 2.6);
    key.position.set(2, 4, 3);
    s.add(key);
    this.rim = new THREE.DirectionalLight('#ff8040', 3);
    this.rim.position.set(-3, 2.5, -3);
    s.add(this.rim);
    // постамент — каменный диск с золотой каймой
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.16, 40), new THREE.MeshStandardMaterial({ color: '#3a3226', roughness: 0.9 }));
    base.position.y = -0.08;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 8, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc060').multiplyScalar(1.6), toneMapped: false }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.005;
    s.add(base, rim);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.cam.position.set(0, 1.35, 3.9);
    this.cam.lookAt(0, 0.82, 0);
    this.units = {};
    this.current = null;
    this.angle = 0.4;
    this.last = 0;
  }

  unit(id, wid) {
    const key = id + ':' + (wid || charById(id).weapons[0].id);
    if (!this.units[key]) {
      const vis = heroVis(id, wid);
      const u = new Unit(vis.model, vis);
      u.setScale(1.75);
      u.play(vis.pose || 'Idle', { fade: 0 });
      u.root.visible = false;
      this.scene.add(u.root);
      this.units[key] = u;
    }
    return this.units[key];
  }

  select(id, wid, cheer = true) {
    if (this.current) this.current.root.visible = false;
    const u = this.unit(id, wid);
    u.root.visible = true;
    // при выборе герой салютует
    u.curName = '';
    if (cheer) {
      u.play('Cheer', { once: true, fade: 0.1 });
      this.cheerT = 1.6;
    } else {
      const w = charById(id).weapons.find((x) => x.id === wid) || charById(id).weapons[0];
      u.play(w.anim, { once: true, fade: 0.1 });
      this.cheerT = 1.0;
    }
    this.current = u;
    this.currentId = id;
    this.rim.color.set(charById(id).color);
  }

  // Портреты для карточек: рендер каждого героя в картинку
  thumbnails(ids) {
    const out = {};
    this.renderer.setSize(220, 220, false);
    for (const id of ids) {
      const u = this.unit(id);
      u.root.visible = true;
      u.root.rotation.y = 0.5;
      u.mixer.update(0.6);
      this.rim.color.set(charById(id).color);
      this.cam.position.set(0, 1.25, 2.7);
      this.cam.lookAt(0, 0.98, 0);
      this.renderer.render(this.scene, this.cam);
      out[id] = this.canvas.toDataURL('image/png');
      u.root.visible = false;
    }
    this.cam.position.set(0, 1.35, 3.9);
    this.cam.lookAt(0, 0.82, 0);
    this.renderer.setSize(300, 300, false);
    return out;
  }

  // Портреты «герой с оружием»: поза в середине замаха, чтобы оружие было видно
  weaponThumbs(id) {
    const out = {};
    const c = charById(id);
    this.renderer.setSize(240, 200, false);
    this.cam.aspect = 1.2;
    this.cam.updateProjectionMatrix();
    if (this.current) this.current.root.visible = false;
    for (const w of c.weapons) {
      const u = this.unit(id, w.id);
      u.root.visible = true;
      u.root.rotation.y = -0.55;
      u.curName = '';
      u.play(w.anim, { once: true, fade: 0 });
      u.mixer.update(w.anim === 'Throw' ? 0.45 : 0.32);
      this.rim.color.set(c.color);
      this.cam.position.set(0.1, 1.3, 3.15);
      this.cam.lookAt(0, 0.98, 0);
      this.renderer.render(this.scene, this.cam);
      out[w.id] = this.canvas.toDataURL('image/png');
      u.root.visible = false;
      u.curName = '';
      u.play(HERO_VIS[id].pose || 'Idle', { fade: 0 });
    }
    this.cam.position.set(0, 1.35, 3.9);
    this.cam.lookAt(0, 0.82, 0);
    this.renderer.setSize(300, 300, false);
    this.cam.aspect = 1;
    this.cam.updateProjectionMatrix();
    if (this.current) this.current.root.visible = true;
    return out;
  }

  frame(dt) {
    if (!this.current) return;
    this.angle += dt * 0.5;
    this.current.root.rotation.y = this.angle;
    if (this.cheerT > 0) {
      this.cheerT -= dt;
      if (this.cheerT <= 0) this.current.play(HERO_VIS[this.currentId].pose || 'Idle', { fade: 0.3 });
    }
    this.current.mixer.update(dt);
    this.renderer.render(this.scene, this.cam);
  }
}
