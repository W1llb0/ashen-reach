// Ядро игры: мир, игрок, снаряды, враги, опыт, столкновения и рендер
import { TAU, clamp, rand, randInt, chance, dist2, angleTo, angleDiff, compact, weightedPick, pick, formatNum, store } from './util.js';
import { Particles } from './particles.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { CHARACTERS, charById } from './characters.js';
import { ENEMY_TYPES, BOSSES, TOTAL_WAVES, BOSS_WAVES, FINAL_BOSSES, wavePool, waveDuration, isBossWave, newEnemyAt, createEnemy, createBoss, makeElite, updateEnemy } from './enemies.js';
import { rollShop, itemPrice, rerollPrice } from './shop.js';
import { newForge, rollForge, forgePrice, forgeStep, MAX_FORGE } from './forge.js';
import { rollChoices, applyChoice } from './upgrades.js';
import { KITS, kitOf, castLightning } from './heroes.js';

export const ARENA = 3200;
const CELL = 64;
const COLS = Math.ceil(ARENA / CELL) + 1;
const MAX_ENEMIES = 150;
const MAX_BULLETS = 520;
const MAX_PROJS = 900;

const GEM_TIERS = [
  { v: 100, color: '#ff4a6a', r: 9 },
  { v: 25, color: '#6ab8ff', r: 7.5 },
  { v: 5, color: '#5fe08a', r: 6 },
  { v: 1, color: '#ffc560', r: 4.5 },
];

// каждый уровень требует заметно больше опыта, чем предыдущий
export const xpFor = (l) => Math.floor(9 + (l - 1) * 7 + Math.pow(l - 1, 1.95) * 0.8);

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.view = null;
    this.arena = ARENA;
    this.maxEnemies = MAX_ENEMIES;
    this.zones = [];
    this.ui = ui;
    this.particles = new Particles();
    this.state = 'menu';
    this.settings = Object.assign({ sfx: 0.6, music: 0.45, shake: true, muted: false, numbers: true }, store.get('kurgan_settings', {}));
    this.records = store.get('kurgan_records', {});
    this.enemies = [];
    this.bullets = [];
    this.projs = [];
    this.gems = [];
    this.pickups = [];
    this.hazards = [];
    this.bolts = [];
    this.slashes = [];
    this.traps = [];
    this.allies = [];
    this.skyArrows = [];
    this.pillars = [];
    this.clouds = [];
    this.meteors = [];
    this.wells = [];
    this.blasts = [];
    this.cloudFlash = 0;
    this.grid = Array.from({ length: COLS * COLS }, () => []);
    this.usedCells = [];
    this.qid = 0;
    this.cam = { x: ARENA / 2, y: ARENA / 2 };
    this.shakeAmt = 0;
    this.flashA = 0;
    this.flashColor = '#fff';
    this.time = 0;
    this.realTime = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.timeStopT = 0;
    this.timeStopMax = 1;
    this.moveDir = { x: 0, y: 0 };
    this.menuEmit = { t: 0, spin: 0, mode: 0, modeT: 6 };
    this.emberT = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    if (this.view) this.view.resize(this.w, this.h);
    this.zoom = clamp(Math.sqrt(this.w * this.h) / 1050, 0.55, 1.6);
  }

  saveSettings() {
    store.set('kurgan_settings', this.settings);
  }

  // ---------- Запуск забега ----------
  start(charId, weaponId) {
    const ch = charById(charId);
    this.weaponId = weaponId;
    this.enemies.length = this.bullets.length = this.projs.length = 0;
    this.gems.length = this.pickups.length = this.hazards.length = this.bolts.length = 0;
    this.slashes.length = this.traps.length = this.allies.length = this.skyArrows.length = this.pillars.length = this.clouds.length = this.meteors.length = this.wells.length = this.blasts.length = 0;
    this.particles.clear();
    this.time = 0;
    this.timeScale = 1;
    this.slowmoT = 0;
    this.timeStopT = 0;
    this.spawnT = 1;
    this.boss = null;
    this.zones.length = 0;
    this.wave = 0;
    this.gold = 0;
    this.endWaveT = 0;
    this.finalBossId = pick(FINAL_BOSSES);
    this.pendingLevels = 0;
    this.pendingChests = 0;
    this.xpCombo = 0;
    this.xpComboT = 0;
    this.dying = 0;
    this.stats = { kills: 0, damage: 0, taken: 0, bosses: 0, graze: 0, elites: 0, goldTotal: 0 };
    this.player = this.createPlayer(ch);
    if (this.view) {
      this.view.reset();
      this.view.setHero(ch.id, this.player.weapon.id);
    }
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.state = 'playing';
    audio.intensity = 1;
    this.ui.onRunStart(this);
    this.startWave(1);
  }

  // ---------- Волны ----------
  startWave(n) {
    this.wave = n;
    this.waveT = 0;
    this.wavePhase = 'fight';
    this.waveDur = isBossWave(n) ? Infinity : waveDuration(n);
    this.spawnT = 0.6;
    this.endWaveT = 0;
    this.bossPending = isBossWave(n) ? 2 : 0;
    this.swarmAt = !isBossWave(n) && n >= 5 && n % 4 === 1 ? this.waveDur * 0.5 : -1;
    const p = this.player;
    p.hp = p.s.maxHp;
    p.invuln = 1.5;
    p.abilityCd = 0;
    this.bullets.length = 0;
    this.zones.length = 0;
    this.state = 'playing';
    audio.intensity = isBossWave(n) ? 2 : 1;
    const fresh = newEnemyAt(n).map((t) => ENEMY_TYPES[t].name);
    let sub = fresh.length ? 'Новый враг: ' + fresh.join(', ') : 'Продержись ' + this.waveDur + ' сек.';
    if (n === TOTAL_WAVES) sub = 'Финальная битва';
    else if (BOSS_WAVES[n]) sub = 'Мини-босс: ' + BOSSES[BOSS_WAVES[n]].name;
    this.ui.waveBanner(n, TOTAL_WAVES, sub, isBossWave(n));
  }

  waveScale() {
    // враги крепнут с каждой волной: здоровье растёт быстрее урона, чтобы бой не превращался в ваншоты
    const w = this.wave - 1;
    return { hp: 1 + w * 0.3 + w * w * 0.034, dmg: 1 + w * 0.095 + w * w * 0.0015, spd: 1 + w * 0.009 };
  }

  endWave() {
    if (this.wavePhase !== 'fight') return;
    this.wavePhase = 'clearing';
    this.clearT = 1.4;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.dead = true;
      this.particles.burst(e.x, e.y, e.color, 6, 160, 8, 0.5);
    }
    this.boss = null;
    this.ui.hideBoss();
    for (const b of this.bullets) b.dead = true;
    this.zones.length = 0;
    for (const g of this.gems) g.mag = true;
    for (const k of this.pickups) {
      if (k.type === 'chest') this.pendingChests++;
      k.dead = true;
    }
    if (this.wave < TOTAL_WAVES) this.toast(`Волна ${this.wave} выстояна`, '#ffd870');
    audio.play('chest');
  }

  nextReward() {
    if (this.wave >= TOTAL_WAVES) return this.victory();
    if (this.pendingChests > 0) {
      this.pendingChests--;
      this.openChoice(true);
    } else if (this.pendingLevels > 0) this.openChoice(false);
    else this.openShop();
  }

  openShop() {
    this.state = 'shop';
    this.shopRerolls = 0;
    this.shopOffers = this.rollOffers();
    audio.intensity = 3;
    this.ui.showShop(this);
  }

  // Товар лавки: 2 улучшения оружия, 2 улучшения брони и 2 диковины
  rollOffers() {
    const p = this.player;
    const out = [];
    let relics = 2;
    for (const slot of ['weapon', 'armor']) {
      const fams = rollForge(p, slot, 2);
      relics += 2 - fams.length;
      for (const fam of fams) out.push({ kind: 'forge', slot, fam, sold: false });
    }
    for (const it of rollShop(p, this.wave, relics)) out.push({ kind: 'item', ...it });
    return out;
  }

  offerPrice(o) {
    if (o.kind === 'forge') return forgePrice(this.player.forge[o.slot].lvl, this.wave);
    return itemPrice(o, this.wave);
  }

  offerAvailable(o) {
    return !o.sold && (o.kind !== 'forge' || this.player.forge[o.slot].lvl < MAX_FORGE);
  }

  buyItem(i) {
    const it = this.shopOffers[i];
    if (!it || !this.offerAvailable(it)) return false;
    const price = this.offerPrice(it);
    if (this.gold < price) return false;
    this.gold -= price;
    it.sold = true;
    const p = this.player;
    if (it.kind === 'forge') {
      const legend = forgeStep(p, it.slot, it.fam);
      this.lastLegend = legend;
      if (legend) audio.play('levelup');
    } else {
      it.apply(p);
      p.items.push(it.id);
      p.itemCount[it.id] = (p.itemCount[it.id] || 0) + 1;
    }
    audio.play('select');
    return true;
  }

  // если всё раскуплено — новый товар бесплатно
  shopRerollPrice() {
    return this.shopOffers && this.shopOffers.every((o) => !this.offerAvailable(o)) ? 0 : rerollPrice(this.wave, this.shopRerolls);
  }

  rerollShop() {
    const price = this.shopRerollPrice();
    if (this.gold < price) return false;
    this.gold -= price;
    if (price > 0) this.shopRerolls++;
    this.shopOffers = this.rollOffers();
    audio.play('ui');
    return true;
  }

  leaveShop() {
    this.ui.hideShop();
    this.startWave(this.wave + 1);
  }

  victory() {
    this.state = 'victory';
    audio.intensity = 0;
    audio.play('bossDie');
    const res = this.saveRecord(true);
    this.ui.showGameOver(this, res, true);
  }

  saveRecord(won) {
    const p = this.player;
    const score = Math.round(this.stats.kills * 10 + p.level * 50 + this.stats.bosses * 1500 + (this.wave - 1) * 400 + (won ? 10000 : 0));
    const id = p.char.id;
    const prev = this.records[id] || { wave: 0, level: 0, kills: 0, score: 0, wins: 0, runs: 0 };
    const isRecord = score > (prev.score || 0);
    this.records[id] = {
      wave: Math.max(prev.wave || 0, this.wave), level: Math.max(prev.level || 0, p.level), kills: Math.max(prev.kills || 0, this.stats.kills),
      score: Math.max(prev.score || 0, score), wins: (prev.wins || 0) + (won ? 1 : 0), runs: (prev.runs || 0) + 1, time: Math.max(prev.time || 0, this.time),
    };
    store.set('kurgan_records', this.records);
    return { score, isRecord };
  }

  createPlayer(ch) {
    const weapon = ch.weapons.find((w) => w.id === this.weaponId) || ch.weapons[0];
    const s = {
      maxHp: ch.hp, dmgMult: 1, rateMult: 1, extraProj: 0, pierce: 0, crit: 0.05 + (weapon.crit || 0), critMult: 2,
      projSpeed: 1, range: 1, size: 1, homing: 0, bounce: 0, explosive: 0, chain: 0, frost: 0,
      orbitals: 0, drones: 0, regen: 0, armor: ch.armor.base, shieldCd: 0, lifesteal: 0, retaliate: 0, speedMult: 1, magnet: 1,
      cdMult: 1, xpMult: 1, luck: 0, revive: 0, burnMult: 1, auraMult: 1, wispChance: 0, ignite: 0, dodge: 0, thorns: 0,
    };
    if (ch.id === 'vega') {
      s.crit += 0.15;
      s.critMult = 2.5;
    }
    return {
      char: ch, weapon, tags: weapon.tags, forge: newForge(), mods: { rate: 1, dmg: 1 }, atkScale: 1, stepT: 1, wellT: 4, weaponMult: 1, duskT: 0, wrathT: 2.5, atkN: 0, echoT: 0, s, x: ARENA / 2, y: ARENA / 2, vx: 0, vy: 0, aim: 0, hp: ch.hp, r: 15, hitR: 5,
      level: 1, xp: 0, xpNext: xpFor(1), invuln: 1, fireT: 0.3, abilityCd: 0, abilityMax: ch.ability.cd,
      dashT: 0, dashVx: 0, dashVy: 0, dashHit: null, aegisT: 0, aegisMax: 1, shield: 0, shieldT: 0,
      flags: {}, upg: {}, upgList: [], items: [], itemCount: {}, branch: {}, rage: 0, rageT: 0, spinT: 0, orbitA: 0, lastShot: -9, abilityAnimT: 0, droneT: [0, 0, 0], volleyT: 0, trailT: 0, rerolls: 2, hurtT: 0,
    };
  }

  playerDamage() {
    const p = this.player;
    return p.weapon.damage * p.s.dmgMult * p.weaponMult * p.mods.dmg * p.atkScale * (p.duskT > 0 ? 1.3 : 1);
  }

  toast(text, color = '#fff') {
    this.ui.toast(text, color);
  }
  shake(a) {
    if (this.settings.shake) this.shakeAmt = Math.min(24, Math.max(this.shakeAmt, a));
  }
  flash(color, a) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  }

  // ---------- Главный цикл ----------
  frame(rawDt) {
    rawDt = Math.min(rawDt, 1 / 30);
    this.realTime += rawDt;
    if (this.state === 'playing') {
      if (this.slowmoT > 0) {
        this.slowmoT -= rawDt;
        this.timeScale = this.slowmoT > 0 ? 0.3 : 1;
      }
      const dt = rawDt * this.timeScale;
      this.update(dt, rawDt);
      if (input.pressed('Escape', 'KeyP') && !this.dying) this.pause();
      this.ambient(rawDt);
    } else if (this.state === 'menu') {
      this.updateMenu(rawDt);
    } else if (this.state === 'gameover' || this.state === 'victory') {
      this.particles.update(rawDt);
      this.updateBullets(rawDt, 1, false);
      compact(this.bullets);
    }
    this.render(rawDt);
    if (this.state === 'playing' || this.state === 'menu') this.ui.updateHud(this);
    input.endFrame();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause(this);
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
  }

  // Фоновая «демо» анимация в меню
  // Тлеющие искры и светлячки над степью
  ambient(dt) {
    this.emberT -= dt;
    while (this.emberT <= 0) {
      this.emberT += this.state === 'menu' ? 0.05 : 0.12;
      const R = this.viewRadius();
      const x = this.cam.x + rand(-R, R), y = this.cam.y + rand(-R * 0.7, R * 0.7);
      const fly = Math.random() < 0.3;
      this.particles.add({ t: 0, x, y, vx: rand(-14, 14), vy: fly ? rand(6, 22) : rand(-45, -20), life: rand(2.5, 5), max: 0, size: fly ? rand(2.5, 4) : rand(2.5, 4.5), color: fly ? '#6e6672' : '#ff5a2a', drag: 0 });
    }
  }

  updateMenu(dt) {
    this.ambient(dt);
    this.time += dt;
    this.cam.x = ARENA / 2 + Math.cos(this.time * 0.05) * 300;
    this.cam.y = ARENA / 2 + Math.sin(this.time * 0.07) * 200;
    const m = this.menuEmit;
    m.modeT -= dt;
    if (m.modeT <= 0) {
      m.mode = (m.mode + 1) % 3;
      m.modeT = 7;
    }
    m.t -= dt;
    const cx = ARENA / 2, cy = ARENA / 2;
    const cols = ['#c8303c', '#9a70ff', '#e8d4b0'];
    while (m.t <= 0) {
      if (m.mode === 0) {
        for (let i = 0; i < 5; i++) this.fireBullet(cx, cy, m.spin + (i * TAU) / 5, 120, { color: cols[0], r: 6, life: 14 });
        m.spin += 0.13;
        m.t += 0.09;
      } else if (m.mode === 1) {
        for (let i = 0; i < 30; i++) this.fireBullet(cx, cy, m.spin + (i * TAU) / 30, 110, { color: cols[1], r: 6, angVel: 0.4, life: 14 });
        m.spin += 0.3;
        m.t += 0.7;
      } else {
        this.fireBullet(cx, cy, m.spin, 100, { color: cols[2], r: 6, life: 14 });
        this.fireBullet(cx, cy, m.spin + Math.PI, 100, { color: '#c8303c', r: 6, life: 14 });
        m.spin += 2.39996;
        m.t += 0.035;
      }
    }
    this.updateBullets(dt, 1, false);
    this.particles.update(dt);
    compact(this.bullets);
  }

  update(dt, rawDt) {
    this.time += dt;
    const p = this.player;
    this.moveDir = input.moveVector();

    let eScale = 1;
    if (this.timeStopT > 0) {
      this.timeStopT -= dt;
      eScale = 0.08;
    }
    const edt = dt * eScale;

    if (this.dying > 0) {
      this.dying -= rawDt;
      this.particles.update(dt);
      this.updateBullets(dt, eScale, false);
      compact(this.bullets);
      if (this.dying <= 0) this.gameOver();
      return;
    }

    this.updatePlayer(dt);
    this.updateSpawner(dt);
    this.buildGrid();
    this.updateEnemies(dt, edt);
    this.separate();
    this.updateProjectiles(dt);
    this.updateOrbitals(dt);
    this.updateDrones(dt);
    this.updateHazards(dt);
    this.updateZones(dt, eScale);
    this.updateBullets(dt, eScale, true);
    this.updateContact();
    this.updateGems(dt);
    this.updatePickups(dt);
    this.particles.update(dt);
    for (const b of this.bolts) b.life -= dt;
    this.updateHeroSystems(dt, edt);

    compact(this.enemies);
    compact(this.bullets);
    compact(this.projs);
    compact(this.gems);
    compact(this.pickups);
    compact(this.hazards);
    this.bolts = this.bolts.filter((b) => b.life > 0);
    compact(this.slashes);
    compact(this.traps);
    compact(this.skyArrows);
    compact(this.pillars);
    compact(this.clouds);
    compact(this.meteors);
    compact(this.wells);
    compact(this.blasts);

    if (this.xpComboT > 0) {
      this.xpComboT -= dt;
      if (this.xpComboT <= 0) this.xpCombo = 0;
    }

    // камера
    const k = 1 - Math.exp(-6 * rawDt);
    this.cam.x += (p.x + p.vx * 0.12 - this.cam.x) * k;
    this.cam.y += (p.y + p.vy * 0.12 - this.cam.y) * k;

    if (this.wavePhase === 'clearing' && this.state === 'playing') {
      this.clearT -= rawDt;
      if (this.clearT <= 0 && (this.gems.length === 0 || this.clearT < -2)) {
        for (const g of this.gems) {
          this.gainXp(g.v);
          this.addGold(g.v);
        }
        this.gems.length = 0;
        this.wavePhase = 'rewards';
        this.nextReward();
      }
    }
  }

  addGold(v) {
    v = Math.max(1, Math.round(v));
    this.gold += v;
    this.stats.goldTotal += v;
  }

  // ---------- Игрок ----------
  updatePlayer(dt) {
    const p = this.player, s = p.s, ch = p.char;
    const focus = input.down('ShiftLeft', 'ShiftRight');
    p.focus = focus;
    const kit = kitOf(p);
    const spd = ch.speed * s.speedMult * (focus ? 0.5 : 1) * (kit.speedMul ? kit.speedMul(p) : 1);
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += p.dashVx * dt;
      p.y += p.dashVy * dt;
      const dmg = this.playerDamage() * 4 * (p.flags.blade ? 2 : 1);
      this.forEnemiesNear(p.x, p.y, 46, (e) => {
        if (p.dashHit.has(e)) return;
        p.dashHit.add(e);
        this.damageEnemy(e, dmg, true, e.x, e.y);
        this.particles.sparks(e.x, e.y, ch.color2, 8, 400);
      });
      this.particles.add({ t: 0, x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, max: 0, size: 26, color: ch.color, drag: 0 });
      if (p.dashT <= 0) {
        p.vx = p.dashVx * 0.15;
        p.vy = p.dashVy * 0.15;
        if (p.flags.volley) p.volleyT = 2;
      }
    } else {
      const tvx = this.moveDir.x * spd, tvy = this.moveDir.y * spd;
      const k = 1 - Math.exp(-14 * dt);
      p.vx += (tvx - p.vx) * k;
      p.vy += (tvy - p.vy) * k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.x = clamp(p.x, 24, ARENA - 24);
    p.y = clamp(p.y, 24, ARENA - 24);

    // прицеливание
    // автоприцел: ближайший враг, босс в приоритете, с упреждением
    p.aimTargetT = (p.aimTargetT || 0) - dt;
    if (p.aimTargetT <= 0 || !p.aimTarget || p.aimTarget.dead) {
      p.aimTargetT = 0.1;
      // цель — только видимые враги в пределах дальности оружия
      const reach = kit.reach(p);
      let t = this.nearestEnemy(p.x, p.y, reach, null, true);
      if (this.boss && !this.boss.dead && this.onScreen(this.boss.x, this.boss.y) && dist2(p.x, p.y, this.boss.x, this.boss.y) < reach * reach) {
        if (!t || dist2(p.x, p.y, t.x, t.y) > 150 * 150) t = this.boss;
      }
      p.aimTarget = t;
    }
    const tg = p.aimTarget;
    let want = p.aim;
    if (tg && !tg.dead) {
      const d = Math.sqrt(dist2(p.x, p.y, tg.x, tg.y));
      const lead = Math.min(0.5, d / (p.weapon.speed * p.s.projSpeed));
      want = angleTo(p.x, p.y, tg.x + tg.vx * lead, tg.y + tg.vy * lead);
    } else if (Math.hypot(p.vx, p.vy) > 30) want = Math.atan2(p.vy, p.vx);
    let da = want - p.aim;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    p.aim += da * Math.min(1, dt * 22);

    // стрельба
    if (p.volleyT > 0) p.volleyT -= dt;
    const rm = kit.rateMul(p);
    p.fireT -= dt * rm;
    const interval = 1 / (p.weapon.rate * Math.max(0.2, s.rateMult) * p.mods.rate);
    let guard = 0;
    if (!p.aimTarget || p.aimTarget.dead || rm <= 0) p.fireT = Math.max(p.fireT, 0);
    else
      while (p.fireT <= 0 && guard++ < 6) {
        p.fireT += interval;
        this.fireWeapon();
      }

    // способность
    if (p.abilityCd > 0) p.abilityCd -= dt;
    const useAbility = input.pressed('Space', 'Mouse2', 'KeyE') || input.abilityTouch;
    input.abilityTouch = false;
    if (useAbility && p.abilityCd <= 0) {
      kit.ability(this, p);
      p.abilityAnimT = 0.7;
      let cd = ch.ability.cd * s.cdMult - (ch.id === 'vega' && p.flags.blade ? 0.8 : 0);
      cd = Math.max(0.8, cd);
      p.abilityCd = p.abilityMax = cd;
    }

    if (p.invuln > 0) p.invuln -= dt;
    if (p.aegisT > 0) p.aegisT -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.abilityAnimT > 0) p.abilityAnimT -= dt;
    if (s.regen > 0) p.hp = Math.min(s.maxHp, p.hp + s.regen * dt);
    if (s.shieldCd > 0 && !p.shield) {
      p.shieldT += dt;
      if (p.shieldT >= s.shieldCd) {
        p.shield = 1;
        p.shieldT = 0;
        this.particles.ring(p.x, p.y, '#8cf0ff', 40, 0.4, 3);
      }
    }
    // огненный след
    if (p.flags.trail) {
      p.trailT -= dt;
      if (p.trailT <= 0 && Math.hypot(p.vx, p.vy) > 40) {
        p.trailT = 0.07;
        this.hazards.push({ x: p.x, y: p.y, r: 28, life: 1.8, max: 1.8, tick: 0, dmg: this.playerDamage() * 0.45, color: ch.color });
      }
    }
    kit.update(this, p, dt);
    p.orbitA += dt * 3.2;
    if (p.echoT > 0 && (p.echoT -= dt) <= 0 && p.aimTarget && !p.aimTarget.dead) {
      kit.attack(this, p);
      p.lastShot = this.time;
    }
    if (p.duskT > 0) p.duskT -= dt;
    if (p.flags.secondWind && p.hp < s.maxHp * 0.35) p.hp = Math.min(s.maxHp, p.hp + s.regen * 3 * dt);
    // легенда «Гнев небес»
    if (p.flags.skyWrath && (p.wrathT -= dt) <= 0) {
      const t = this.nearestEnemy(p.x, p.y, 520, null, true);
      if (t) {
        p.wrathT = 2.5;
        this.addBolt(t.x + rand(-20, 20), t.y + rand(-20, 20), 9, t.x, t.y, 0, '#c0d8ff', 1.5);
        this.damageEnemy(t, this.playerDamage() * 3, true, t.x, t.y, '#cfe0ff');
        this.particles.ring(t.x, t.y, '#c0d8ff', 70, 0.3, 4);
        audio.play('zap', { sky: true });
      } else p.wrathT = 0.3;
    }
  }

  fireWeapon() {
    const p = this.player;
    kitOf(p).attack(this, p);
    p.lastShot = this.time;
    // легенда «Эхо удара»: каждая 4-я атака повторяется
    p.atkN++;
    if (p.flags.echoAttack && p.atkN % 4 === 0) p.echoT = 0.12;
    // таинства
    if (p.flags.trident) {
      this.extraAttack(0.52, 0.45);
      this.extraAttack(-0.52, 0.45);
    }
    if (p.flags.twoface) this.extraAttack(Math.PI, 0.7);
    if (p.flags.meteor && p.atkN % 5 === 0 && p.aimTarget && !p.aimTarget.dead) {
      const t = p.aimTarget;
      this.meteors.push({ x: t.x + t.vx * 0.4, y: t.y + t.vy * 0.4, t: 0, delay: 0.55, R: 130 * p.s.size, dmg: this.playerDamage() * 3 });
    }
    if (p.flags.bloodPrice) p.hp = Math.max(1, p.hp - 2 / (p.weapon.rate * Math.max(0.2, p.s.rateMult) * p.mods.rate));
  }

  // Дополнительная атака в другом направлении (Трезубец, Двуликий): счётчики героя не сбиваются
  extraAttack(off, scale) {
    const p = this.player, kit = kitOf(p);
    const save = { aim: p.aim, aimTarget: p.aimTarget, swingN: p.swingN, shotN: p.shotN, castN: p.castN };
    p.aim = save.aim + off;
    const reach = kit.reach(p);
    let best = null, bd = reach * reach;
    for (const e of this.enemies) {
      if (e.dead || e === save.aimTarget || e.def.ai === 'static') continue;
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d > bd || Math.abs(angleDiff(p.aim, angleTo(p.x, p.y, e.x, e.y))) > 0.6) continue;
      bd = d;
      best = e;
    }
    p.aimTarget = best;
    p.atkScale = scale;
    try {
      kit.attack(this, p);
    } finally {
      p.atkScale = 1;
      Object.assign(p, save);
    }
  }

  // общие эффекты попадания от кузни: поджог и «Жажда»
  onHitProc(e, dmg, crit) {
    const p = this.player, s = p.s;
    if (s.ignite > 0 && Math.random() < s.ignite) {
      e.burnT = 2.5;
      e.burnDps = Math.max(e.burnDps, dmg * 0.25 * s.burnMult);
    }
    if (crit && p.flags.thirst && (p.thirstT || 0) < this.time) {
      p.thirstT = this.time + 0.2;
      p.hp = Math.min(s.maxHp, p.hp + s.maxHp * 0.01);
    }
  }

  addProj(o) {
    if (this.projs.length >= MAX_PROJS) return null;
    const pr = {
      x: o.x, y: o.y, vx: Math.cos(o.angle) * o.speed, vy: Math.sin(o.angle) * o.speed,
      r: o.r || 6, dmg: o.dmg, pierce: o.pierce || 0, life: o.life || 1, max: o.life || 1,
      color: o.color || '#fff', kind: o.kind || 'orb', burn: !!o.burn, homing: o.homing || 0,
      bounce: o.bounce || 0, explosive: o.explosive || 0, decel: o.decel || 0, knock: o.knock ?? 50,
      echo: !!o.echo, hit: null, tgt: null, tgtT: 0, dead: false,
      mark: !!o.mark, heavy: !!o.heavy, heal: !!o.heal, split: !!o.split,
      noHit: !!o.noHit, ret: o.ret || 0, zap: o.zap || null, blast: !!o.blast, rage: !!o.rage, sx: o.x, sy: o.y,
    };
    this.projs.push(pr);
    return pr;
  }

  // ---------- Пространственная сетка ----------
  buildGrid() {
    for (const i of this.usedCells) this.grid[i].length = 0;
    this.usedCells.length = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const x0 = clamp(Math.floor((e.x - e.r) / CELL), 0, COLS - 1), x1 = clamp(Math.floor((e.x + e.r) / CELL), 0, COLS - 1);
      const y0 = clamp(Math.floor((e.y - e.r) / CELL), 0, COLS - 1), y1 = clamp(Math.floor((e.y + e.r) / CELL), 0, COLS - 1);
      for (let cy = y0; cy <= y1; cy++)
        for (let cx = x0; cx <= x1; cx++) {
          const idx = cy * COLS + cx;
          const c = this.grid[idx];
          if (c.length === 0) this.usedCells.push(idx);
          c.push(e);
        }
    }
  }

  // Вызывает cb(e) для врагов, пересекающих круг. cb может вернуть true, чтобы остановить поиск
  forEnemiesNear(x, y, r, cb) {
    const q = ++this.qid;
    const x0 = clamp(Math.floor((x - r) / CELL), 0, COLS - 1), x1 = clamp(Math.floor((x + r) / CELL), 0, COLS - 1);
    const y0 = clamp(Math.floor((y - r) / CELL), 0, COLS - 1), y1 = clamp(Math.floor((y + r) / CELL), 0, COLS - 1);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const c = this.grid[cy * COLS + cx];
        for (let i = 0; i < c.length; i++) {
          const e = c[i];
          if (e._q === q || e.dead) continue;
          e._q = q;
          const rr = r + e.r;
          if (dist2(x, y, e.x, e.y) < rr * rr) {
            if (cb(e)) return;
          }
        }
      }
  }

  // Видна ли точка на экране (с небольшим запасом внутрь)
  onScreen(x, y, k = 0.9) {
    const hw = (this.w / this.zoom / 2) * k, hh = (this.h / this.zoom / 2) * k;
    return Math.abs(x - this.cam.x) < hw && y - this.cam.y < hh * 0.92 && this.cam.y - y < hh * 1.05;
  }

  nearestEnemy(x, y, maxD, exclude = null, visible = false) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || e === exclude || e.spawnT > 0.2) continue;
      if (visible && !this.onScreen(e.x, e.y)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  // ---------- Спавн ----------
  viewRadius() {
    return Math.hypot(this.w, this.h) / 2 / this.zoom;
  }

  spawnEnemy(type, x, y, elite = false, force = false) {
    if (!force && this.enemies.length >= MAX_ENEMIES) return null;
    const e = createEnemy(type, clamp(x, 20, ARENA - 20), clamp(y, 20, ARENA - 20), this.waveScale());
    if (elite) makeElite(e);
    this.enemies.push(e);
    return e;
  }

  spawnPos(extra = 60) {
    const p = this.player;
    const R = this.viewRadius() + extra;
    for (let tries = 0; tries < 6; tries++) {
      const a = rand(TAU);
      const x = clamp(p.x + Math.cos(a) * R, 30, ARENA - 30);
      const y = clamp(p.y + Math.sin(a) * R, 30, ARENA - 30);
      if (dist2(x, y, p.x, p.y) > 380 * 380) return { x, y };
    }
    const a = rand(TAU);
    return { x: clamp(p.x + Math.cos(a) * 420, 30, ARENA - 30), y: clamp(p.y + Math.sin(a) * 420, 30, ARENA - 30) };
  }

  updateSpawner(dt) {
    if (this.wavePhase !== 'fight') return;
    this.waveT += dt;
    const w = this.wave;
    if (this.bossPending > 0) {
      this.bossPending -= dt;
      if (this.bossPending <= 0) this.spawnBoss();
    }
    if (this.endWaveT > 0) {
      this.endWaveT -= dt;
      if (this.endWaveT <= 0) this.endWave();
      return;
    }
    if (this.waveT >= this.waveDur) return this.endWave();
    // событие «окружение»
    if (this.swarmAt > 0 && this.waveT >= this.swarmAt) {
      this.swarmAt = -1;
      const p = this.player;
      const n = 16 + w;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        this.spawnEnemy(w > 8 ? 'mite' : 'drone', p.x + Math.cos(a) * 520, p.y + Math.sin(a) * 520, false, true);
      }
      this.toast('Нежить смыкает кольцо!', '#ff7a4a');
    }
    let rate = 1 + w * 0.34;
    if (isBossWave(w)) rate *= 0.28;
    const cap = Math.min(MAX_ENEMIES, 44 + w * 7);
    if (this.enemies.length >= cap) return;
    this.spawnT -= dt;
    let guard = 0;
    const pool = wavePool(w);
    while (this.spawnT <= 0 && guard++ < 8) {
      this.spawnT += 1 / rate;
      const row = weightedPick(pool, (r) => r.w * (r.fresh ? 1.6 : 1));
      const pos = this.spawnPos();
      const cluster = row.type === 'drone' || row.type === 'mite' ? randInt(1, 2 + Math.floor(w / 5)) : 1;
      const eliteChance = w >= 3 ? 0.014 + w * 0.003 : 0;
      for (let i = 0; i < cluster; i++) this.spawnEnemy(row.type, pos.x + rand(-40, 40), pos.y + rand(-40, 40), i === 0 && chance(eliteChance));
    }
  }

  spawnBoss() {
    const p = this.player;
    const id = this.wave === TOTAL_WAVES ? this.finalBossId : BOSS_WAVES[this.wave];
    const b = createBoss(id, this.wave);
    const a = rand(TAU);
    b.x = clamp(p.x + Math.cos(a) * 460, 100, ARENA - 100);
    b.y = clamp(p.y + Math.sin(a) * 460, 100, ARENA - 100);
    this.enemies.push(b);
    this.boss = b;
    audio.play('boss');
    audio.intensity = 2;
    this.shake(14);
    this.particles.ring(b.x, b.y, b.color, 260, 1, 10);
    this.ui.showBoss(b);
  }

  // ---------- Враги ----------
  updateEnemies(dt, edt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.dead) continue;
      updateEnemy(e, this, edt);
      e.x += (e.vx + e.kbx) * edt;
      e.y += (e.vy + e.kby) * edt;
      const kd = Math.exp(-9 * dt);
      e.kbx *= kd;
      e.kby *= kd;
      e.x = clamp(e.x, e.r, ARENA - e.r);
      e.y = clamp(e.y, e.r, ARENA - e.r);
      e.rot += e.rotSpeed * edt;
      if (e.flash > 0) e.flash -= dt;
      if (e.markT > 0) e.markT -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (Math.random() < 0.35) this.particles.glow(e.x + rand(-e.r, e.r) * 0.6, e.y + rand(-e.r, e.r) * 0.6, '#ff8a3d', 8, 0.35, 0, -60);
        if (e.burnTick <= 0) {
          e.burnTick = 0.33;
          this.damageEnemy(e, e.burnDps * 0.33, false, e.x, e.y, '#ff9a4d');
        }
        if (e.burnT <= 0) e.burnDps = 0;
      }
      // слишком далеко отставшие обычные враги переносятся ближе
      if (!e.boss && !e.elite && e.def.ai !== 'static' && dist2(e.x, e.y, p.x, p.y) > 1800 * 1800) {
        const pos = this.spawnPos();
        e.x = pos.x;
        e.y = pos.y;
      }
    }
  }

  separate() {
    for (const e of this.enemies) {
      if (e.dead || e.boss) continue;
      this.forEnemiesNear(e.x, e.y, e.r * 0.9, (o) => {
        if (o === e) return;
        const dx = e.x - o.x, dy = e.y - o.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = e.r + o.r - d;
        if (overlap > 0) {
          const push = Math.min(overlap, 6) * (o.boss ? 1 : 0.5);
          e.x += (dx / d) * push;
          e.y += (dy / d) * push;
        }
      });
    }
  }

  damageEnemy(e, dmg, crit, x, y, color = null) {
    if (e.dead) return;
    if (e.shielded) {
      if (Math.random() < 0.08) this.particles.text(e.x, e.y - e.r - 4, 'щит', '#7af0ff', 13);
      e.flash = 0.03;
      return;
    }
    const pl = this.player;
    if (e.markT > 0) dmg *= 1.25;
    if (pl && pl.flags.brittle && (e.slowT > 0 || this.timeStopT > 0)) dmg *= 1.25;
    if (pl && pl.flags.loop && this.timeStopT > 0) dmg *= 1.5;
    if (pl && pl.flags.permafrost && e.slowT > 0) dmg *= 1.3;
    if (pl && pl.flags.crush && (e.elite || e.boss)) dmg *= 1.35;
    e.hp -= dmg;
    e.flash = 0.07;
    this.stats.damage += dmg;
    if (this.settings.numbers && dmg >= 1) {
      this.particles.text(e.x, e.y - e.r - 4, formatNum(dmg), color || (crit ? '#ffd23d' : '#ffffff'), crit ? 18 : 12, crit);
    }
    if (e.boss) this.ui.updateBoss(e);
    if (e.hp <= 0) this.killEnemy(e);
  }

  hitEnemy(e, pr) {
    const p = this.player, s = p.s;
    let dmg = pr.dmg;
    const crit = Math.random() < s.crit;
    if (crit) dmg *= s.critMult;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const kbk = e.boss ? 0.05 : e.elite ? 0.35 : 1;
    e.kbx += (pr.vx / sp) * pr.knock * kbk;
    e.kby += (pr.vy / sp) * pr.knock * kbk;
    if (pr.burn) {
      e.burnT = 2;
      e.burnDps = Math.max(e.burnDps, pr.dmg * 0.2 * s.burnMult);
    }
    if (s.frost > 0 && Math.random() < s.frost) {
      e.slowT = 2;
      this.particles.burst(e.x, e.y, '#9fe8ff', 5, 120, 6, 0.4);
    }
    this.particles.sparks(pr.x, pr.y, pr.color, crit ? 7 : 3, crit ? 420 : 260, 0.25, Math.atan2(pr.vy, pr.vx), 1.4);
    audio.play(crit ? 'crit' : pr.kind === 'arrow' ? 'arrowHit' : 'hit');
    if (pr.mark && crit) e.markT = 4;
    if (p.flags.execute && pr.kind === 'arrow' && !e.boss && e.hp - dmg < e.maxHp * 0.2) dmg = Math.max(dmg, e.hp + 1);
    if (pr.heal) p.hp = Math.min(s.maxHp, p.hp + 1);
    if (pr.split && !pr.didSplit) {
      pr.didSplit = true;
      const t = this.nearestEnemy(e.x, e.y, 300, e);
      if (t) this.addProj({ kind: 'soul', x: e.x, y: e.y, angle: angleTo(e.x, e.y, t.x, t.y), speed: 420, r: pr.r * 0.8, dmg: pr.dmg * 0.7, homing: 6, life: 0.9, color: pr.color });
    }
    this.damageEnemy(e, dmg, crit, pr.x, pr.y);
    this.onHitProc(e, dmg, crit);
    const kit = kitOf(p);
    if (kit.onProjHit) kit.onProjHit(this, p, e, pr);
    if (s.chain > 0 && Math.random() < s.chain) this.chainLightning(e, dmg * 0.6);
    if (pr.explosive > 0) this.explode(pr.x, pr.y, pr.explosive, pr.dmg * 0.5, pr.color);
  }

  chainLightning(from, dmg) {
    let cur = from;
    const hit = new Set([from]);
    for (let i = 0; i < 3; i++) {
      let best = null, bd = 240 * 240;
      for (const e of this.enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      hit.add(best);
      this.addBolt(cur.x, cur.y, 1, best.x, best.y, 1, '#a8c8ff', 1);
      this.damageEnemy(best, dmg, false, best.x, best.y, '#9fd8ff');
      cur = best;
    }
  }

  explode(x, y, R, dmg, color) {
    this.forEnemiesNear(x, y, R, (e) => this.damageEnemy(e, dmg, false, e.x, e.y, '#ffb36b'));
    this.particles.ring(x, y, color, R, 0.3, 4);
    this.particles.burst(x, y, color, 8, R * 3, 10, 0.35);
    audio.play('explode');
  }

  killEnemy(e, noDrop = false) {
    if (e.dead) return;
    e.dead = true;
    const p = this.player, s = p.s;
    if (!noDrop) this.stats.kills++;
    this.particles.burst(e.x, e.y, e.color, e.boss ? 120 : e.elite ? 30 : 12, e.boss ? 700 : 260, e.boss ? 20 : 9, e.boss ? 1.4 : 0.55);
    this.particles.sparks(e.x, e.y, e.color, e.boss ? 60 : 8, e.boss ? 900 : 380, 0.4);
    this.particles.ring(e.x, e.y, e.color, e.r * (e.boss ? 8 : 2.6), e.boss ? 1 : 0.3, e.boss ? 10 : 3);
    audio.play('kill');
    if (noDrop) return;
    this.dropXp(e.x, e.y, e.xp);
    const kit = kitOf(p);
    if (kit.onKill) kit.onKill(this, p, e);
    if (p.flags.pyre && e.burnT > 0) this.explode(e.x, e.y, 80, this.playerDamage() * 0.8, '#ff6a20');
    if (p.flags.chainReact && this.blasts.length < 40) this.blasts.push({ x: e.x, y: e.y, t: 0.09 });
    if (p.flags.shards && !e.boss && this.projs.length < 600) {
      const a0 = rand(TAU);
      for (let i = 0; i < 3; i++)
        this.addProj({ kind: 'orb', x: e.x, y: e.y, angle: a0 + (i / 3) * TAU, speed: 480, r: 5, dmg: this.playerDamage() * 0.4, life: 0.5, color: p.char.color2, knock: 30 });
    }
    if (p.flags.bloodPrice) p.hp = Math.min(s.maxHp, p.hp + 2.5);
    if (e.def.split) {
      for (let i = 0; i < 2; i++) this.spawnEnemy(e.def.split, e.x + rand(-15, 15), e.y + rand(-15, 15));
    }
    if (e.elite) {
      this.stats.elites++;
      this.addGold(4 + this.wave);
      this.pickups.push({ type: 'chest', x: e.x, y: e.y, t: 0, dead: false });
      this.shake(6);
    }
    if (s.lifesteal > 0 && Math.random() < s.lifesteal && p.hp < s.maxHp) {
      p.hp = Math.min(s.maxHp, p.hp + 2);
      this.particles.glow(p.x, p.y, '#ff4f7a', 20, 0.3);
    }
    if (s.wispChance > 0 && Math.random() < s.wispChance) {
      this.addProj({ x: e.x, y: e.y, angle: rand(TAU), speed: 220, r: 8, dmg: this.playerDamage() * 2, life: 3, color: '#ff4fd8', kind: 'wisp', homing: 8 });
    }
    if (!e.boss) {
      if (Math.random() < 0.004) this.pickups.push({ type: 'heart', x: e.x, y: e.y, t: 0, dead: false });
      else if (Math.random() < 0.0025) this.pickups.push({ type: 'magnet', x: e.x, y: e.y, t: 0, dead: false });
    }
    if (e.boss) this.bossDefeated(e);
  }

  bossDefeated(b) {
    this.boss = null;
    this.stats.bosses++;
    this.player.rerolls += 1;
    this.addGold(40 + this.wave * 4);
    this.endWaveT = 1.8;
    // все вражеские пули превращаются в искры
    for (const bl of this.bullets) {
      if (bl.dead) continue;
      bl.dead = true;
      if (Math.random() < 0.3) this.particles.glow(bl.x, bl.y, bl.color, 10, 0.4);
    }
    this.pendingChests += 2;
    this.slowmoT = 1.1;
    this.shake(24);
    this.flash('#ffffff', 0.5);
    audio.play('bossDie');
    audio.intensity = 1;
    this.ui.hideBoss();
    this.toast(`${b.bossDef.name} повержен!`, b.bossDef.color2);
  }

  // ---------- Снаряды игрока ----------
  updateProjectiles(dt) {
    for (const pr of this.projs) {
      if (pr.dead) continue;
      pr.life -= dt;
      // метательный топор: долетает и возвращается к герою
      if (pr.ret) {
        const p = this.player;
        if (!pr.back && pr.max - pr.life >= pr.ret) {
          pr.back = true;
          pr.hit = null;
        }
        if (pr.back) {
          const sp = Math.hypot(pr.vx, pr.vy);
          const a = angleTo(pr.x, pr.y, p.x, p.y);
          const k = 1 - Math.exp(-9 * dt);
          pr.vx += (Math.cos(a) * sp - pr.vx) * k;
          pr.vy += (Math.sin(a) * sp - pr.vy) * k;
          if (dist2(pr.x, pr.y, p.x, p.y) < 26 * 26) pr.life = 0;
        }
      }
      if (pr.zap) kitOf(this.player).projUpdate(this, this.player, pr, dt);
      if (pr.life <= 0) {
        pr.dead = true;
        const kitE = kitOf(this.player);
        if (kitE.projEnd) kitE.projEnd(this, this.player, pr);
        if (pr.echo) {
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + rand(0.4);
            this.addProj({ x: pr.x, y: pr.y, angle: a, speed: 380, r: pr.r * 0.5, dmg: pr.dmg * 0.4, pierce: 1, life: 0.55, color: pr.color, kind: 'orb' });
          }
        }
        if (pr.kind === 'wisp' && pr.explosive) this.explode(pr.x, pr.y, pr.explosive, pr.dmg * 0.5, pr.color);
        continue;
      }
      if (pr.decel) {
        const d = Math.exp(-pr.decel * dt);
        pr.vx *= d;
        pr.vy *= d;
      }
      if (pr.homing > 0) {
        pr.tgtT -= dt;
        if (pr.tgtT <= 0 || !pr.tgt || pr.tgt.dead) {
          pr.tgtT = 0.18;
          pr.tgt = this.nearestEnemy(pr.x, pr.y, 380);
        }
        if (pr.tgt && !pr.tgt.dead) {
          const sp = Math.hypot(pr.vx, pr.vy);
          let a = Math.atan2(pr.vy, pr.vx);
          const ta = angleTo(pr.x, pr.y, pr.tgt.x, pr.tgt.y);
          let diff = ta - a;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const maxTurn = pr.homing * dt;
          a += clamp(diff, -maxTurn, maxTurn);
          pr.vx = Math.cos(a) * sp;
          pr.vy = Math.sin(a) * sp;
        }
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (pr.x < -50 || pr.y < -50 || pr.x > ARENA + 50 || pr.y > ARENA + 50) {
        pr.dead = true;
        continue;
      }
      if (pr.noHit) continue;
      if (pr.kind === 'wisp' && Math.random() < 0.5) this.particles.glow(pr.x, pr.y, pr.color, pr.r * 1.4, 0.3);
      else if (pr.kind === 'flamewave') {
        if (Math.random() < 0.8) this.particles.flame(pr.x + rand(-pr.r, pr.r), pr.y + rand(-pr.r, pr.r), '#ff6a20', 1);
      } else if (pr.kind === 'holywave') {
        if (Math.random() < 0.5) this.particles.add({ t: 0, x: pr.x + rand(-pr.r, pr.r), y: pr.y + rand(-pr.r, pr.r), vx: 0, vy: 0, h: 1, vh: rand(0.5, 1.5), life: 0.5, max: 0, size: 5, color: '#fff0b0', drag: 0 });
      } else if (pr.kind === 'soul') {
        if (Math.random() < 0.6) this.particles.add({ t: 0, x: pr.x, y: pr.y, vx: rand(-15, 15), vy: rand(-15, 15), h: 1, vh: rand(0.2, 0.8), life: 0.45, max: 0, size: pr.r * 1.4, color: '#40ff90', drag: 2 });
      }

      this.forEnemiesNear(pr.x, pr.y, pr.r, (e) => {
        if (pr.hit && pr.hit.has(e)) return false;
        this.hitEnemy(e, pr);
        if (pr.pierce > 0) {
          pr.pierce--;
          (pr.hit || (pr.hit = new Set())).add(e);
          return false;
        }
        if (pr.bounce > 0) {
          pr.bounce--;
          (pr.hit || (pr.hit = new Set())).add(e);
          const t = this.nearestEnemy(pr.x, pr.y, 320, e);
          if (t) {
            const sp = Math.hypot(pr.vx, pr.vy);
            const a = angleTo(pr.x, pr.y, t.x, t.y);
            pr.vx = Math.cos(a) * sp;
            pr.vy = Math.sin(a) * sp;
            pr.life = Math.max(pr.life, 0.6);
            return true;
          }
        }
        pr.dead = true;
        return true;
      });
    }
  }

  updateOrbitals(dt) {
    const p = this.player, n = p.s.orbitals;
    if (!n) return;
    const R = 78;
    const dmg = this.playerDamage() * 0.9;
    for (let i = 0; i < n; i++) {
      const a = p.orbitA + (i * TAU) / n;
      const ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
      this.forEnemiesNear(ox, oy, 12, (e) => {
        if ((e.orbHit || 0) > this.time) return;
        e.orbHit = this.time + 0.35;
        this.damageEnemy(e, dmg, false, ox, oy);
        const ka = angleTo(p.x, p.y, e.x, e.y);
        if (!e.boss) {
          e.kbx += Math.cos(ka) * 120;
          e.kby += Math.sin(ka) * 120;
        }
        this.particles.sparks(ox, oy, p.char.color2, 4, 300);
      });
      // сбиваем вражеские пули
      for (const b of this.bullets) {
        if (b.dead) continue;
        const rr = 13 + b.r;
        if (dist2(ox, oy, b.x, b.y) < rr * rr) {
          b.dead = true;
          this.particles.glow(b.x, b.y, b.color, 14, 0.25);
        }
      }
    }
  }

  updateDrones(dt) {
    const p = this.player, n = p.s.drones;
    for (let i = 0; i < n; i++) {
      const a = -p.orbitA * 0.6 + (i * TAU) / Math.max(1, n);
      const dx = p.x + Math.cos(a) * 44, dy = p.y + Math.sin(a) * 44;
      p.droneT[i] = (p.droneT[i] || 0) - dt;
      if (p.droneT[i] <= 0) {
        const t = this.nearestEnemy(dx, dy, 480, null, true);
        if (t) {
          p.droneT[i] = 0.5 / p.s.rateMult;
          this.addProj({ x: dx, y: dy, angle: angleTo(dx, dy, t.x, t.y), speed: 760, r: 4, dmg: this.playerDamage() * 0.6, life: 0.9, color: '#d0f4ff', kind: 'bolt', pierce: 0 });
        }
      }
    }
  }

  updateHazards(dt) {
    for (const h of this.hazards) {
      h.life -= dt;
      if (h.life <= 0) {
        h.dead = true;
        continue;
      }
      h.tick -= dt;
      if (h.tick <= 0) {
        h.tick = 0.3;
        this.forEnemiesNear(h.x, h.y, h.r, (e) => {
          this.damageEnemy(e, h.dmg, false, e.x, e.y, '#ff9a4d');
          e.burnT = Math.max(e.burnT, 1);
          e.burnDps = Math.max(e.burnDps, h.dmg * 0.5);
        });
      }
    }
  }

  // ---------- Системы героев: молнии, удары, капканы, скелеты-союзники, дождь стрел ----------
  addBolt(x1, y1, h1, x2, y2, h2, color = '#a8c8ff', w = 1) {
    if (this.bolts.length > 60) return;
    this.bolts.push({ x1, y1, h1, x2, y2, h2, color, w, life: 0.22, max: 0.22, seed: Math.random() * 1000 });
  }

  addTrap(x, y) {
    if (this.traps.length >= 14) this.traps.shift();
    const p = this.player;
    this.traps.push({ x, y, r: 58, arm: 0.35, life: 25, dmg: this.playerDamage() * 5 * (p.flags.poison ? 1.5 : 1), poison: !!p.flags.poison, dead: false });
  }

  raiseAlly(x, y, extra = false) {
    const p = this.player;
    const cap = KITS.morra.minionCap(p) + (extra ? 3 : 0);
    if (this.allies.filter((a) => !a.dead).length >= cap) return null;
    const steel = 1 + 0.6 * (p.upg.morra_steel || 0);
    const knight = p.flags.knights ? 1 : 0;
    const hp = 45 * (1 + this.wave * 0.18) * steel * (knight ? 1.8 : 1);
    const a = { x, y, vx: 0, vy: 0, r: knight ? 16 : 12, hp, maxHp: hp, atkT: 0.5, rise: 0.8, enrageT: 0, knight: !!knight, dead: false, target: null, tgtT: 0 };
    this.allies.push(a);
    this.particles.burst(x, y, '#40ff90', 10, 140, 8, 0.5);
    this.particles.ring(x, y, '#40ff90', 50, 0.4, 3);
    audio.play('raise');
    return a;
  }

  updateHeroSystems(dt, edt) {
    const p = this.player;
    for (const sl of this.slashes) {
      sl.life -= dt;
      if (sl.life <= 0) sl.dead = true;
      else {
        sl.x = p.x;
        sl.y = p.y;
      }
    }
    for (const pl of this.pillars) if ((pl.life -= dt) <= 0) pl.dead = true;
    if (this.cloudFlash > 0) this.cloudFlash -= dt;
    // капканы
    for (const t of this.traps) {
      t.life -= dt;
      if (t.arm > 0) t.arm -= dt;
      if (t.life <= 0) {
        t.dead = true;
        continue;
      }
      if (t.arm > 0) continue;
      let trig = false;
      this.forEnemiesNear(t.x, t.y, 22, () => (trig = true));
      if (trig) {
        t.dead = true;
        this.forEnemiesNear(t.x, t.y, t.r, (e) => {
          this.damageEnemy(e, t.dmg, true, e.x, e.y, '#ffd0a0');
          e.slowT = t.poison ? 3 : 1.2;
          if (t.poison) {
            e.burnT = 3;
            e.burnDps = Math.max(e.burnDps, t.dmg * 0.15);
          }
        });
        this.particles.ring(t.x, t.y, t.poison ? '#8aff40' : '#ffb060', t.r, 0.35, 5);
        this.particles.sparks(t.x, t.y, '#ffd0a0', 14, 380, 0.35);
        audio.play('trap');
      }
    }
    // дождь стрел
    for (const a of this.skyArrows) {
      a.t += dt;
      if (a.t >= a.fall) {
        a.dead = true;
        this.forEnemiesNear(a.x, a.y, 40, (e) => this.damageEnemy(e, a.dmg, false, e.x, e.y));
        this.particles.sparks(a.x, a.y, '#d8ecff', 4, 200, 0.2);
      }
    }
    this.updateMythic(dt);
    // облака чумы
    for (const c of this.clouds) {
      c.life -= dt;
      if (c.life <= 0) {
        c.dead = true;
        continue;
      }
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = 0.4;
        this.forEnemiesNear(c.x, c.y, c.r, (e) => {
          e.plagueUntil = this.time + 0.6;
          this.damageEnemy(e, c.dmg, false, e.x, e.y, '#b8ff80');
        });
      }
      if (Math.random() < 0.5) this.particles.add({ t: 0, x: c.x + rand(-c.r, c.r) * 0.8, y: c.y + rand(-c.r, c.r) * 0.8, vx: rand(-10, 10), vy: rand(-10, 10), h: 0.3, vh: rand(0.2, 0.6), life: 0.9, max: 0, size: 9, color: '#8aff50', drag: 1 });
    }
    // скелеты-союзники
    if (this.allies.length) this.updateAllies(dt, edt);
  }

  // Таинства: метеоры, воронки, цепные взрывы, поступь великана
  updateMythic(dt) {
    const p = this.player;
    for (const m of this.meteors) {
      m.t += dt;
      if (m.t >= m.delay) {
        m.dead = true;
        this.explode(m.x, m.y, m.R, m.dmg, '#ff8a3d');
        this.particles.burst(m.x, m.y, '#ffb060', 24, 520, 12, 0.6);
        for (let i = 0; i < 8; i++) this.particles.flame(m.x + rand(-m.R, m.R) * 0.5, m.y + rand(-m.R, m.R) * 0.5, '#ff6a20', 1);
        this.shake(6);
      }
    }
    for (const b of this.blasts) {
      b.t -= dt;
      if (b.t <= 0) {
        b.dead = true;
        this.explode(b.x, b.y, 90, this.playerDamage() * 0.45, '#ff9a4a');
      }
    }
    if (p.flags.well && (p.wellT -= dt) <= 0) {
      // самая плотная группа врагов на экране
      let best = null, bn = 0;
      const cand = this.enemies.filter((e) => !e.dead && this.onScreen(e.x, e.y));
      for (let i = 0; i < Math.min(30, cand.length); i++) {
        const e = cand[(Math.random() * cand.length) | 0];
        let n = 0;
        for (const o of cand) if (dist2(e.x, e.y, o.x, o.y) < 150 * 150) n++;
        if (n > bn) {
          bn = n;
          best = e;
        }
      }
      p.wellT = best ? 7 : 0.5;
      if (best) {
        this.wells.push({ x: best.x, y: best.y, life: 2.6, max: 2.6, R: 190 * p.s.size, tick: 0 });
        audio.play('timestop');
      }
    }
    for (const w of this.wells) {
      w.life -= dt;
      if (w.life <= 0) {
        w.dead = true;
        this.explode(w.x, w.y, w.R * 0.7, this.playerDamage() * 1.6, '#c070ff');
        this.shake(5);
        continue;
      }
      this.forEnemiesNear(w.x, w.y, w.R, (e) => {
        if (e.boss) return;
        const d = Math.sqrt(dist2(w.x, w.y, e.x, e.y)) || 1;
        const f = 1300 * dt * (0.4 + (1 - d / w.R)) * (e.elite ? 0.4 : 1);
        e.kbx += ((w.x - e.x) / d) * f;
        e.kby += ((w.y - e.y) / d) * f;
      });
      w.tick -= dt;
      if (w.tick <= 0) {
        w.tick = 0.25;
        this.forEnemiesNear(w.x, w.y, w.R * 0.55, (e) => this.damageEnemy(e, this.playerDamage() * 0.35, false, e.x, e.y, '#e0b0ff'));
      }
      if (Math.random() < 0.8) {
        const a = rand(TAU), r = w.R * rand(0.7, 1);
        this.particles.add({ t: 0, x: w.x + Math.cos(a) * r, y: w.y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2 - Math.sin(a) * 160, vy: -Math.sin(a) * r * 2.2 + Math.cos(a) * 160, h: 0.3, life: 0.45, max: 0, size: 5, color: '#b070ff', drag: 0 });
      }
    }
    if (p.flags.titan && Math.hypot(p.vx, p.vy) > 40 && (p.stepT -= dt) <= 0) {
      p.stepT = 1;
      const R = 130 * p.s.size;
      this.forEnemiesNear(p.x, p.y, R, (e) => {
        this.damageEnemy(e, this.playerDamage() * 0.9, false, e.x, e.y);
        if (e.boss) return;
        const a = angleTo(p.x, p.y, e.x, e.y);
        e.kbx += Math.cos(a) * 320;
        e.kby += Math.sin(a) * 320;
      });
      this.particles.ring(p.x, p.y, '#e8c890', R, 0.35, 6);
      this.particles.burst(p.x, p.y, '#a08060', 10, 260, 7, 0.4);
      this.shake(3);
      audio.play('block');
    }
  }

  updateAllies(dt, edt) {
    const p = this.player;
    const fast = p.flags.stride ? 1.35 : 1;
    const dmgBase = this.playerDamage() * 1.1 * (1 + 0.6 * (p.upg.morra_steel || 0)) * (p.flags.knights ? 2 : 1);
    for (const a of this.allies) {
      if (a.dead) {
        a.deadT = (a.deadT || 0) + dt;
        if (a.deadT > 1.6) a.gone = true;
        continue;
      }
      if (a.rise > 0) {
        a.rise -= dt;
        continue;
      }
      if (a.enrageT > 0) a.enrageT -= dt;
      const rage = a.enrageT > 0 ? 1.5 : 1;
      a.tgtT -= dt;
      if (a.tgtT <= 0 || !a.target || a.target.dead) {
        a.tgtT = 0.3;
        a.target = null;
        let bd = 330 * 330;
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0.2) continue;
          const d = Math.min(dist2(a.x, a.y, e.x, e.y), dist2(p.x, p.y, e.x, e.y) * 1.2);
          if (d < bd && dist2(p.x, p.y, e.x, e.y) < 520 * 520) {
            bd = d;
            a.target = e;
          }
        }
      }
      let tx, ty, sp = 165 * fast * rage;
      const t = a.target;
      if (t) {
        tx = t.x;
        ty = t.y;
      } else {
        // держится рядом с хозяйкой
        const i = this.allies.indexOf(a);
        const ang = (i / Math.max(1, this.allies.length)) * TAU + this.time * 0.3;
        tx = p.x + Math.cos(ang) * 90;
        ty = p.y + Math.sin(ang) * 90;
        sp *= 0.9;
      }
      const d = Math.hypot(tx - a.x, ty - a.y) || 1;
      const reachD = t ? a.r + t.r + 8 : 20;
      const k = 1 - Math.exp(-6 * dt);
      const tvx = d > reachD ? ((tx - a.x) / d) * sp : 0, tvy = d > reachD ? ((ty - a.y) / d) * sp : 0;
      a.vx += (tvx - a.vx) * k;
      a.vy += (tvy - a.vy) * k;
      a.x = clamp(a.x + a.vx * dt, 20, ARENA - 20);
      a.y = clamp(a.y + a.vy * dt, 20, ARENA - 20);
      if (dist2(a.x, a.y, p.x, p.y) > 700 * 700) {
        a.x = p.x + rand(-60, 60);
        a.y = p.y + rand(-60, 60);
      }
      a.atkT -= dt * fast * rage;
      a.attacking = Math.max(0, (a.attacking || 0) - dt);
      if (t && d <= reachD + 4 && a.atkT <= 0) {
        a.atkT = 0.8;
        a.attacking = 0.45;
        this.damageEnemy(t, dmgBase * rage, false, t.x, t.y, '#9affc0');
        const ang = angleTo(a.x, a.y, t.x, t.y);
        if (!t.boss) {
          t.kbx += Math.cos(ang) * (a.knight ? 180 : 90);
          t.kby += Math.sin(ang) * (a.knight ? 180 : 90);
        }
        this.particles.sparks(t.x, t.y, '#9affc0', 4, 240, 0.2, ang, 1);
        if (t.dead && p.flags.reap) p.hp = Math.min(p.s.maxHp, p.hp + 1);
      }
      // враги бьют скелетов при контакте
      this.forEnemiesNear(a.x, a.y, a.r, (e) => {
        if (e.def.ai === 'static' || e.spawnT > 0) return;
        a.hp -= e.dmg * 0.9 * edt;
      });
      if (a.hp <= 0) {
        a.dead = true;
        this.particles.burst(a.x, a.y, '#9affc0', 12, 200, 8, 0.5);
        audio.play('boneBreak');
        if (p.flags.boneBurst) this.explode(a.x, a.y, 90, this.playerDamage() * 2.2, '#9affc0');
      }
    }
    for (let i = this.allies.length - 1; i >= 0; i--) if (this.allies[i].dead && this.allies[i].gone) this.allies.splice(i, 1);
  }

  // ---------- Зоны-телеграфы: удары по земле, конусы, линии, лучи ----------
  addZone(o) {
    const z = Object.assign({ kind: 'circle', x: 0, y: 0, r: 60, a: 0, arc: 0.5, len: 300, w: 40, delay: 1, t: 0, active: 0, dmg: 10, color: '#ff5040', follow: null, rotSpeed: 0, dead: false }, o);
    this.zones.push(z);
    return z;
  }

  zoneHits(z, p) {
    const hr = p.hitR + 2;
    if (z.kind === 'circle') return dist2(z.x, z.y, p.x, p.y) < (z.r + hr) ** 2;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d = Math.hypot(dx, dy);
    if (z.kind === 'cone') return d < z.len && Math.abs(angleDiff(z.a, Math.atan2(dy, dx))) < z.arc + hr / Math.max(d, 1);
    // линия / луч
    const c = Math.cos(z.a), sn = Math.sin(z.a);
    const along = dx * c + dy * sn;
    if (along < 0 || along > z.len) return false;
    return Math.abs(-dx * sn + dy * c) < z.w / 2 + hr;
  }

  updateZones(dt, eScale) {
    const p = this.player;
    for (const z of this.zones) {
      if (z.dead) continue;
      const k = dt * eScale;
      z.t += k;
      const f = z.follow;
      if (f) {
        if (f.dead && z.visualOnly) {
          z.dead = true;
          continue;
        }
        if (!f.dead && (z.t < z.delay || z.kind === 'beam')) {
          z.x = f.x;
          z.y = f.y;
        }
      }
      if (z.aimAt && z.t < z.delay * 0.7) z.a = angleTo(z.x, z.y, z.aimAt.x, z.aimAt.y);
      if (z.kind === 'beam') {
        if (z.t >= z.delay) {
          z.a += z.rotSpeed * k;
          if (this.zoneHits(z, p)) this.playerHit(z.dmg);
          if (Math.random() < 0.5) {
            const r = rand(z.len * 0.9);
            this.particles.glow(z.x + Math.cos(z.a) * r, z.y + Math.sin(z.a) * r, z.color, 16, 0.3);
          }
          if (z.t >= z.delay + z.active) z.dead = true;
        }
        continue;
      }
      if (z.t >= z.delay) {
        z.dead = true;
        if (!z.visualOnly && this.zoneHits(z, p)) this.playerHit(z.dmg);
        if (z.kind === 'circle') {
          this.particles.ring(z.x, z.y, z.color, z.r * 1.1, 0.35, 5);
          this.particles.burst(z.x, z.y, z.color, 10, z.r * 4, 12, 0.45);
          if (!z.visualOnly) audio.play('explode');
        } else if (z.kind === 'line' && !z.visualOnly) {
          for (let i = 0; i < 10; i++) {
            const r = (i / 10) * z.len;
            this.particles.glow(z.x + Math.cos(z.a) * r, z.y + Math.sin(z.a) * r, z.color, 18, 0.4);
          }
        }
        if (z.onBurst) z.onBurst(z);
      }
    }
    compact(this.zones);
  }

  // ---------- Вражеские пули ----------
  fireBullet(x, y, a, speed, o = {}) {
    if (this.bullets.length >= MAX_BULLETS) return;
    const r = o.r || 6;
    const color = o.color || '#ff3d6e';
    this.bullets.push({
      x, y, a, spd: speed, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, color,
      dmg: o.dmg || 10, accel: o.accel || 0, angVel: o.angVel || 0, homing: o.homing || 0, life: o.life || 9, kind: o.kind || 'orb',
      grazed: false, dead: false,
    });
  }

  clearBullets(x, y, R) {
    const R2 = R * R;
    for (const b of this.bullets) {
      if (b.dead) continue;
      if (dist2(x, y, b.x, b.y) < R2) {
        b.dead = true;
        if (Math.random() < 0.5) this.particles.glow(b.x, b.y, b.color, 12, 0.35);
      }
    }
  }

  updateBullets(dt, eScale, collide) {
    const p = this.player;
    const bdt = dt * eScale;
    const auraR = p && p.char.id === 'chronos' ? 130 * p.s.auraMult : 0;
    const aura2 = auraR * auraR;
    const aegis = collide && p.aegisT > 0;
    for (const b of this.bullets) {
      if (b.dead) continue;
      let k = bdt;
      let d2 = 1e9;
      if (collide) {
        d2 = dist2(b.x, b.y, p.x, p.y);
        if (auraR && d2 < aura2) k *= 0.55;
      }
      b.life -= k;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      if (b.homing && collide) {
        const d = angleDiff(b.a, angleTo(b.x, b.y, p.x, p.y));
        b.a += clamp(d, -b.homing * k, b.homing * k);
      }
      if (b.angVel || b.accel || b.homing) {
        b.a += b.angVel * k;
        b.spd = Math.max(20, b.spd + b.accel * k);
        b.vx = Math.cos(b.a) * b.spd;
        b.vy = Math.sin(b.a) * b.spd;
      }
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (b.x < -20 || b.y < -20 || b.x > ARENA + 20 || b.y > ARENA + 20) {
        b.dead = true;
        continue;
      }
      if (!collide) continue;

      if (aegis && d2 < 78 * 78) {
        // отражение Эгидой
        b.dead = true;
        const a = angleTo(p.x, p.y, b.x, b.y);
        this.addProj({ x: b.x, y: b.y, angle: a + rand(-0.15, 0.15), speed: 560, r: 6, dmg: (this.playerDamage() * 0.9 + 4) * (p.flags.mirror ? 2 : 1), life: 1, color: p.char.color2, kind: 'orb', pierce: 1 });
        this.particles.sparks(b.x, b.y, p.char.color, 3, 250);
        continue;
      }
      // щит Готфрида отбивает пули спереди
      if (p.char.id === 'bastion' && d2 < 38 * 38 && KITS.bastion.blocks(p, b)) {
        b.dead = true;
        // шипастый щит отбивает снаряд обратно
        if (p.weapon.reflect) this.addProj({ kind: 'orb', x: b.x, y: b.y, angle: Math.atan2(-b.vy, -b.vx), speed: 720, r: 7, dmg: this.playerDamage() * 1.2, pierce: 1, life: 0.8, color: '#ffe9a0', knock: 80 });
        this.particles.sparks(b.x, b.y, '#fff0c0', 5, 260, 0.25);
        this.particles.ring(p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, '#ffe9a0', 26, 0.2, 3);
        audio.play('block');
        if (p.flags.faith) this.explode(b.x, b.y, 60, this.playerDamage() * 0.6, '#ffe9a0');
        continue;
      }
      const hr = p.hitR + b.r * 0.75;
      if (d2 < hr * hr) {
        if (p.invuln <= 0 && p.dashT <= 0) {
          b.dead = true;
          this.playerHit(b.dmg);
        }
        continue;
      }
      if (!b.grazed) {
        const gr = p.hitR + b.r + 20;
        if (d2 < gr * gr) {
          b.grazed = true;
          this.stats.graze++;
          this.gainXp(0.12);
          this.particles.sparks(b.x, b.y, '#ffffff', 2, 200, 0.2);
          audio.play('graze');
        }
      }
    }
  }

  updateContact() {
    const p = this.player;
    this.forEnemiesNear(p.x, p.y, p.hitR + 3, (e) => {
      if ((e.spawnT > 0 && !e.boss) || e.def.ai === 'static') return;
      if (p.flags.thorns && (e.thornT || 0) < this.time) {
        e.thornT = this.time + 0.4;
        this.damageEnemy(e, this.playerDamage() * 3, false, e.x, e.y, '#d6ff6b');
      }
      if (p.dashT > 0 || p.aegisT > 0) return;
      this.playerHit(e.dmg);
      return true;
    });
  }

  playerHit(dmg) {
    const p = this.player, s = p.s;
    if (p.invuln > 0 || p.aegisT > 0 || p.dashT > 0 || this.dying > 0) return;
    // уклонение (броня Тени)
    if (s.dodge > 0 && Math.random() < s.dodge) {
      p.invuln = 0.45;
      this.particles.text(p.x, p.y - 26, 'уклон', '#c8b8ff', 14, false);
      this.particles.ring(p.x, p.y, '#a890ff', 40, 0.25, 3);
      if (p.flags.dusk) p.duskT = 2;
      audio.play('dash');
      return;
    }
    if (p.shield) {
      p.shield = 0;
      p.shieldT = 0;
      p.invuln = 0.7;
      this.particles.ring(p.x, p.y, '#8cf0ff', 70, 0.4, 5);
      this.clearBullets(p.x, p.y, 80);
      audio.play('shieldBlock');
      if (p.flags.runeBurst) {
        this.explode(p.x, p.y, 170, this.playerDamage() * 3, '#8cf0ff');
        this.forEnemiesNear(p.x, p.y, 170, (e) => {
          if (e.boss) return;
          const a = angleTo(p.x, p.y, e.x, e.y);
          e.kbx += Math.cos(a) * 600;
          e.kby += Math.sin(a) * 600;
        });
      }
      return;
    }
    const kitA = kitOf(p);
    dmg *= 1 - Math.min(0.8, s.armor + (kitA.armorAdd ? kitA.armorAdd(p) : 0));
    if (p.flags.unbreakable) dmg = Math.min(dmg, s.maxHp * 0.2);
    // шипы брони
    if (s.thorns > 0) {
      const td = this.playerDamage() * s.thorns;
      this.forEnemiesNear(p.x, p.y, 130, (e) => this.damageEnemy(e, td, false, e.x, e.y, '#d6ff6b'));
      this.particles.ring(p.x, p.y, '#d6ff6b', 130, 0.3, 4);
    }
    p.hp -= dmg;
    p.hurtT = 0.4;
    p.invuln = 1;
    this.stats.taken += dmg;
    this.shake(9);
    this.flash('#ff2050', 0.35);
    this.particles.burst(p.x, p.y, '#ff3d6e', 20, 300, 10, 0.5);
    this.particles.text(p.x, p.y - 24, '-' + Math.round(dmg), '#ff5c7a', 16, false);
    this.clearBullets(p.x, p.y, 60);
    audio.play('hurt');
    if (s.retaliate) {
      for (let i = 0; i < 18; i++) {
        this.addProj({ x: p.x, y: p.y, angle: (i / 18) * TAU, speed: 520, r: 7, dmg: this.playerDamage() * 1.5, life: 0.9, color: '#ff9df5', kind: 'orb', pierce: 1 });
      }
    }
    if (p.hp <= 0) {
      if (s.revive > 0) {
        s.revive--;
        p.hp = s.maxHp * 0.6;
        p.invuln = 3;
        this.clearBullets(p.x, p.y, 900);
        this.particles.ring(p.x, p.y, '#ffb627', 500, 1, 10);
        this.particles.burst(p.x, p.y, '#ffb627', 60, 500, 14, 1);
        this.flash('#ffb627', 0.5);
        audio.play('revive');
        this.toast('Живая вода возвращает к жизни!', '#ffb627');
        return;
      }
      p.hp = 0;
      this.die();
    }
  }

  die() {
    const p = this.player;
    this.dying = 1.4;
    this.timeScale = 0.35;
    this.slowmoT = 0;
    this.particles.burst(p.x, p.y, p.char.color, 90, 600, 16, 1.4);
    this.particles.sparks(p.x, p.y, '#ffffff', 50, 800, 0.8);
    this.particles.ring(p.x, p.y, p.char.color, 400, 1.2, 10);
    this.shake(24);
    this.flash('#ffffff', 0.6);
    audio.play('explode');
  }

  gameOver() {
    this.state = 'gameover';
    this.timeScale = 1;
    audio.intensity = 0;
    audio.play('gameover');
    this.ui.showGameOver(this, this.saveRecord(false), false);
  }

  // ---------- Опыт и подбираемое ----------
  dropXp(x, y, v) {
    v = Math.round(v);
    for (const tier of GEM_TIERS) {
      while (v >= tier.v) {
        v -= tier.v;
        if (this.gems.length > 380) {
          // слияние: прибавляем к случайному кристаллу
          const g = this.gems[(Math.random() * this.gems.length) | 0];
          g.v += tier.v;
          continue;
        }
        const a = rand(TAU), s = rand(30, 110);
        this.gems.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v: tier.v, r: tier.r, color: tier.color, mag: false, t: rand(10), dead: false });
      }
    }
  }

  updateGems(dt) {
    const p = this.player;
    const mr = 110 * p.s.magnet;
    const mr2 = mr * mr;
    for (const g of this.gems) {
      g.t += dt;
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (!g.mag && d2 < mr2) g.mag = true;
      if (g.mag) {
        const d = Math.sqrt(d2) || 1;
        const sp = 900;
        const k = 1 - Math.exp(-7 * dt);
        g.vx += ((p.x - g.x) / d * sp - g.vx) * k;
        g.vy += ((p.y - g.y) / d * sp - g.vy) * k;
        if (d < p.r + 6) {
          g.dead = true;
          this.gainXp(g.v);
          this.addGold(g.v);
          this.xpCombo++;
          this.xpComboT = 0.6;
          audio.play('xp', { combo: this.xpCombo });
          continue;
        }
      } else {
        const dd = Math.exp(-5 * dt);
        g.vx *= dd;
        g.vy *= dd;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
  }

  gainXp(v) {
    const p = this.player;
    p.xp += v * p.s.xpMult;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpFor(p.level);
      this.pendingLevels++;
    }
  }

  updatePickups(dt) {
    const p = this.player;
    for (const k of this.pickups) {
      k.t += dt;
      const d2 = dist2(k.x, k.y, p.x, p.y);
      if (d2 < 140 * 140) {
        const d = Math.sqrt(d2) || 1;
        k.x += ((p.x - k.x) / d) * 380 * dt;
        k.y += ((p.y - k.y) / d) * 380 * dt;
      }
      if (d2 < 30 * 30) {
        k.dead = true;
        if (k.type === 'chest') {
          this.pendingChests++;
          audio.play('chest');
          this.particles.ring(k.x, k.y, '#ffd23d', 120, 0.5, 6);
        } else if (k.type === 'heart') {
          p.hp = Math.min(p.s.maxHp, p.hp + 30 + p.s.maxHp * 0.1);
          audio.play('heal');
          this.particles.burst(p.x, p.y, '#ff4f7a', 16, 200, 10, 0.5);
          this.particles.text(p.x, p.y - 26, '+HP', '#ff7a9a', 16);
        } else if (k.type === 'magnet') {
          for (const g of this.gems) g.mag = true;
          audio.play('select');
          this.particles.ring(p.x, p.y, '#3de8ff', 600, 0.8, 6);
        }
      }
    }
  }

  // ---------- Выбор награды ----------
  openChoice(isChest) {
    const p = this.player;
    this.state = 'levelup';
    const choices = rollChoices(p, 3, isChest ? 1 : 0);
    if (!isChest) audio.play('levelup');
    this.flash(isChest ? '#ffd23d' : '#8cf0ff', 0.25);
    this.particles.ring(p.x, p.y, isChest ? '#ffd23d' : '#8cf0ff', 160, 0.6, 6);
    this.ui.showLevelUp(this, choices, isChest);
  }

  pickChoice(choice, isChest) {
    const p = this.player;
    applyChoice(p, choice);
    audio.play('select');
    if (!isChest) this.pendingLevels--;
    this.ui.hideLevelUp();
    this.ui.refreshUpgrades(this);
    if (this.wavePhase === 'rewards') this.nextReward();
    else {
      this.state = 'playing';
      p.invuln = Math.max(p.invuln, 0.6);
    }
  }

  reroll(isChest) {
    const p = this.player;
    if (p.rerolls <= 0) return null;
    p.rerolls--;
    audio.play('ui');
    return rollChoices(p, 3, isChest ? 1 : 0);
  }

  // ---------- Рендер ----------
  // Вся отрисовка — в 3D-виде (render3d.js); здесь только затухание эффектов
  render(dt) {
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    if (this.view) this.view.render(this, dt);
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 2.2);
  }
}

export { CHARACTERS, ENEMY_TYPES };
