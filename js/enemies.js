// Враги, волны, мини-боссы и финальные боссы. Ставка на читаемость:
// меньше пуль, больше телеграфированных атак по земле (зоны, конусы, линии).
import { TAU, rand, angleTo, dist, pick, clamp } from './util.js';

// ai: chase — бежит к герою; kite — держит дистанцию и стреляет; dash — рывок с телеграфом;
// kamikaze — подбегает и взрывается; artillery — накрывает зоной издалека; healer — лечит своих;
// drift — медленно идёт и крутит спираль; brute — таран; summoner — призывает; blink — телепорты; slammer — удары по земле
export const ENEMY_TYPES = {
  drone: { name: 'Скелет-прислужник', hp: 14, speed: 100, r: 12, dmg: 10, xp: 1, color: '#e8dcc0', ai: 'chase' },
  mite: { name: 'Летучий череп', hp: 7, speed: 175, r: 9, dmg: 6, xp: 1, color: '#b080ff', ai: 'chase' },
  gunner: { name: 'Костяной лучник', hp: 24, speed: 90, r: 13, dmg: 10, xp: 2, color: '#5fe0d0', ai: 'kite', range: 340, fire: { cd: 2.9, n: 1, spread: 0.18, speed: 240 } },
  dasher: { name: 'Синий бес', hp: 26, speed: 82, r: 13, dmg: 14, xp: 2, color: '#4aa0ff', ai: 'dash' },
  bomber: { name: 'Плачущий дух', hp: 22, speed: 125, r: 14, dmg: 24, xp: 2, color: '#9fe0ff', ai: 'kamikaze' },
  splitter: { name: 'Каменный голем', hp: 60, speed: 70, r: 20, dmg: 12, xp: 3, color: '#9dff3d', ai: 'chase', split: 'shard' },
  shard: { name: 'Осколок голема', hp: 12, speed: 150, r: 10, dmg: 7, xp: 1, color: '#9dff3d', ai: 'chase' },
  artillery: { name: 'Костяной метатель', hp: 30, speed: 80, r: 13, dmg: 20, xp: 3, color: '#ff8a3d', ai: 'artillery', range: 440 },
  shaman: { name: 'Маска-целитель', hp: 45, speed: 95, r: 14, dmg: 8, xp: 4, color: '#6aff9a', ai: 'healer' },
  spinner: { name: 'Костяной колдун', hp: 60, speed: 45, r: 16, dmg: 10, xp: 4, color: '#ff4fa0', ai: 'drift', fire: { cd: 0.17, arms: 2, speed: 150, burst: 1.5, rest: 3.8 } },
  brute: { name: 'Орк-громила', hp: 160, speed: 62, r: 22, dmg: 26, xp: 6, color: '#ff9a50', ai: 'brute' },
  summoner: { name: 'Некромант', hp: 70, speed: 70, r: 15, dmg: 8, xp: 6, color: '#c890ff', ai: 'summoner', range: 420 },
  blinker: { name: 'Вихрь-призрак', hp: 36, speed: 0, r: 13, dmg: 10, xp: 4, color: '#ff70e0', ai: 'blink' },
  sentinel: { name: 'Снежный великан', hp: 240, speed: 44, r: 26, dmg: 28, xp: 10, color: '#aee8ff', ai: 'slammer' },
  crystal: { name: 'Кристалл души', hp: 400, speed: 0, r: 22, dmg: 0, xp: 6, color: '#7af0ff', ai: 'static' },
};

// С какой волны появляется враг и его базовый вес в составе волны
const UNLOCK = [
  [1, 'drone', 10], [2, 'mite', 6], [3, 'gunner', 4], [4, 'dasher', 4], [5, 'bomber', 3.2],
  [6, 'splitter', 3], [7, 'artillery', 2.6], [8, 'shaman', 1.4], [9, 'spinner', 1.8], [11, 'brute', 2],
  [12, 'summoner', 1.1], [13, 'blinker', 2.2], [14, 'sentinel', 1.2],
];

export const TOTAL_WAVES = 20;
export const BOSS_WAVES = { 10: 'warlord', 15: 'frostgiant' };
export const FINAL_BOSSES = ['dragon', 'abyss', 'lich'];

export function wavePool(w) {
  return UNLOCK.filter((u) => u[0] <= w).map(([from, type, wt]) => ({
    type,
    w: wt * (1 + (w - from) * 0.05) * (type === 'drone' ? Math.max(0.35, 1 - w * 0.04) : 1),
    fresh: from === w, // новичок волны — чуть чаще
  }));
}
export const isBossWave = (w) => w === TOTAL_WAVES || !!BOSS_WAVES[w];
export const waveDuration = (w) => Math.min(60, 24 + w * 2);
export const newEnemyAt = (w) => UNLOCK.filter((u) => u[0] === w).map((u) => u[1]);

export const BOSSES = {
  warlord: { id: 'warlord', name: 'Костяной Воевода', title: 'Страж десятой волны', hp: 5200, r: 44, color: '#7ab0ff', color2: '#e0eeff', speed: 72, xp: 80,
    attacks: ['summon', 'slam3', 'fan', 'charge'] },
  frostgiant: { id: 'frostgiant', name: 'Ледяной Исполин', title: 'Страж пятнадцатой волны', hp: 9500, r: 50, color: '#8fe0ff', color2: '#ffffff', speed: 62, xp: 120,
    attacks: ['stomp', 'iceRing', 'charge', 'spikes'] },
  dragon: { id: 'dragon', name: 'Пепельный Дракон', title: 'Владыка Предела', hp: 26000, r: 58, color: '#ff6a2a', color2: '#ffd08a', speed: 85, xp: 300,
    attacks: ['breath', 'meteors', 'dive', 'breath', 'firewall'] },
  abyss: { id: 'abyss', name: 'Владыка Бездны', title: 'Владыка Предела', hp: 24000, r: 54, color: '#ff3a6a', color2: '#ffb0c8', speed: 65, xp: 300,
    attacks: ['beams', 'teleport', 'summonDemons', 'voidOrbs'] },
  lich: { id: 'lich', name: 'Король-Лич', title: 'Владыка Предела', hp: 20000, r: 50, color: '#b07cff', color2: '#ecdcff', speed: 52, xp: 300,
    attacks: ['flower', 'raise', 'soulSpiral', 'deathZones'] },
};

export function createEnemy(type, x, y, scale) {
  const d = ENEMY_TYPES[type];
  const hp = d.hp * scale.hp;
  return {
    type, def: d, x, y, vx: 0, vy: 0, kbx: 0, kby: 0,
    r: d.r, hp, maxHp: hp, speed: d.speed * rand(0.9, 1.1), dmg: d.dmg * scale.dmg, xp: d.xp,
    color: d.color, rot: rand(TAU), rotSpeed: rand(-2, 2), flash: 0,
    fireT: d.fire ? rand(0.8, d.fire.cd + 1) : rand(1.5, 3.5),
    state: 0, stateT: rand(1, 2.5), spin: rand(TAU), burstT: 0,
    slowT: 0, burnT: 0, burnDps: 0, burnTick: 0,
    elite: false, boss: false, dead: false, spawnT: 0.45,
  };
}

export function makeElite(e) {
  e.elite = true;
  e.hp = e.maxHp = e.maxHp * 5;
  e.r *= 1.4;
  e.dmg *= 1.4;
  e.xp *= 6;
}

export function createBoss(id, wave) {
  const b = BOSSES[id];
  const hp = b.hp * (1 + Math.max(0, wave - 10) * 0.04);
  return {
    type: 'boss', def: b, bossDef: b, x: 0, y: 0, vx: 0, vy: 0, kbx: 0, kby: 0,
    r: b.r, hp, maxHp: hp, speed: b.speed, dmg: 20 + wave * 1.2, xp: b.xp,
    color: b.color, rot: 0, rotSpeed: 0.6, flash: 0,
    fireT: 0, state: 0, stateT: 2.2, spin: 0, atk: -1, atkIndex: -1, atkT: 0, emitT: 0, aux: 0,
    slowT: 0, burnT: 0, burnDps: 0, burnTick: 0,
    elite: false, boss: true, dead: false, spawnT: 1.4, enraged: false, shielded: false, phaseMark: 1,
  };
}

const steer = (e, tvx, tvy, k, dt) => {
  const f = 1 - Math.exp(-k * dt);
  e.vx += (tvx - e.vx) * f;
  e.vy += (tvy - e.vy) * f;
};

// ---------- Поведение обычных врагов ----------
export function updateEnemy(e, g, dt) {
  const p = g.player;
  if (e.spawnT > 0) {
    e.spawnT -= dt;
    if (!e.boss) return;
  }
  const slow = e.slowT > 0 ? 0.5 : 1;
  if (e.slowT > 0) e.slowT -= dt;
  const sp = e.speed * slow;
  const a = angleTo(e.x, e.y, p.x, p.y);
  const d = dist(e.x, e.y, p.x, p.y);
  if (e.boss) return updateBoss(e, g, dt, a, d);
  const ca = Math.cos(a), sa = Math.sin(a);
  e.fireT -= dt;

  switch (e.def.ai) {
    case 'chase':
    case 'drift':
      steer(e, ca * sp, sa * sp, e.def.ai === 'drift' ? 1.5 : 4, dt);
      break;
    case 'static':
      e.vx = e.vy = 0;
      break;
    case 'kite':
    case 'summoner':
    case 'artillery': {
      const R = e.def.range;
      const k = d > R ? 1 : d < R * 0.65 ? -0.9 : 0;
      const side = (e.spin > Math.PI ? 1 : -1) * 0.6;
      steer(e, (ca * k - sa * side) * sp, (sa * k + ca * side) * sp, 2.5, dt);
      break;
    }
    case 'healer': {
      // держится за спинами союзников, подальше от героя
      const k = d < 320 ? -1 : d > 480 ? 0.6 : 0;
      steer(e, ca * k * sp, sa * k * sp, 2, dt);
      break;
    }
    case 'dash':
    case 'brute': {
      const brute = e.def.ai === 'brute';
      e.stateT -= dt;
      if (e.state === 0) {
        steer(e, ca * sp, sa * sp, 4, dt);
        if (d < (brute ? 300 : 340) && e.stateT <= 0) {
          e.state = 1;
          e.stateT = brute ? 0.95 : 0.65;
          e.dashA = a;
          e.windup = e.stateT;
          if (brute) g.addZone({ kind: 'line', x: e.x, y: e.y, a, len: 420, w: e.r * 2.2, delay: e.stateT, dmg: 0, color: e.color, follow: e, visualOnly: true });
        }
      } else if (e.state === 1) {
        if (!brute) e.dashA = a;
        steer(e, 0, 0, 8, dt);
        if (e.stateT <= 0) {
          e.state = 2;
          e.stateT = brute ? 0.6 : 0.42;
          const v = brute ? 760 : 720;
          e.vx = Math.cos(e.dashA) * v;
          e.vy = Math.sin(e.dashA) * v;
        }
      } else if (e.state === 2) {
        if (Math.random() < 0.6) g.particles.glow(e.x, e.y, e.color, 10, 0.25);
        if (e.stateT <= 0) {
          e.state = 3;
          e.stateT = brute ? 1.4 : 0.9;
        }
      } else {
        steer(e, 0, 0, 3, dt);
        if (e.stateT <= 0) {
          e.state = 0;
          e.stateT = rand(1.2, 2.2);
        }
      }
      break;
    }
    case 'kamikaze': {
      if (e.state === 0) {
        steer(e, ca * sp, sa * sp, 3.5, dt);
        if (d < 80) {
          e.state = 1;
          e.stateT = 0.85;
          steer(e, 0, 0, 20, 1);
          g.addZone({ x: e.x, y: e.y, r: 95, delay: 0.85, dmg: e.dmg, color: '#9fe0ff', onBurst: () => !e.dead && g.killEnemy(e, true) });
        }
      } else {
        steer(e, 0, 0, 10, dt);
        e.flash = Math.sin(e.stateT * 30) > 0 ? 0.05 : 0;
        e.stateT -= dt;
      }
      break;
    }
    case 'blink': {
      e.vx = e.vy = 0;
      e.stateT -= dt;
      if (e.state === 0 && e.stateT <= 0) {
        // исчезает и появляется рядом с героем
        const ang = rand(TAU), R = rand(200, 300);
        g.particles.burst(e.x, e.y, e.color, 14, 200, 8, 0.4);
        e.x = clamp(p.x + Math.cos(ang) * R, 40, g.arena - 40);
        e.y = clamp(p.y + Math.sin(ang) * R, 40, g.arena - 40);
        g.particles.ring(e.x, e.y, e.color, 50, 0.35, 3);
        e.state = 1;
        e.stateT = 0.55;
      } else if (e.state === 1 && e.stateT <= 0) {
        const n = e.elite ? 7 : 5;
        for (let i = 0; i < n; i++) g.fireBullet(e.x, e.y, a + (i - (n - 1) / 2) * 0.2, 210, { color: e.color, r: 6, dmg: e.dmg });
        e.state = 0;
        e.stateT = rand(1.8, 2.6);
      }
      break;
    }
    case 'slammer': {
      if (e.state === 0) {
        steer(e, ca * sp, sa * sp, 2, dt);
        if (d < 240 && e.fireT <= 0) {
          e.state = 1;
          e.stateT = 1.05;
          g.addZone({ x: e.x, y: e.y, r: 150, delay: 1.05, dmg: e.dmg, color: '#aee8ff', follow: e });
        }
      } else {
        steer(e, 0, 0, 8, dt);
        e.stateT -= dt;
        if (e.stateT <= 0) {
          e.state = 0;
          e.fireT = 3.6;
          g.shake(6);
        }
      }
      break;
    }
  }

  // особые действия
  const ai = e.def.ai;
  if (ai === 'kite' && e.fireT <= 0 && d < 700) {
    const f = e.def.fire;
    e.fireT = f.cd * rand(0.85, 1.15) * (e.elite ? 0.7 : 1);
    const n = e.elite ? 3 : f.n;
    for (let i = 0; i < n; i++) g.fireBullet(e.x, e.y, a + (i - (n - 1) / 2) * f.spread, f.speed * 1.25, { color: '#ff5a4a', r: 5, dmg: e.dmg, kind: 'arrow' });
  } else if (ai === 'drift') {
    const f = e.def.fire;
    e.burstT += dt;
    if (e.burstT % (f.burst + f.rest) < f.burst && d < 650) {
      e.emit = (e.emit || 0) - dt;
      if (e.emit <= 0) {
        e.emit = f.cd;
        for (let i = 0; i < f.arms; i++) g.fireBullet(e.x, e.y, e.spin + (i * TAU) / f.arms, f.speed, { color: e.color, r: 6, dmg: e.dmg });
        e.spin += 0.35;
      }
    }
  } else if (ai === 'artillery' && e.fireT <= 0 && d < 750) {
    e.fireT = rand(3.2, 4.2);
    const lead = 0.6;
    const tx = p.x + p.vx * lead, ty = p.y + p.vy * lead;
    g.addZone({ x: tx, y: ty, r: e.elite ? 90 : 65, delay: 1.3, dmg: e.dmg, color: '#ff8a3d' });
    g.particles.sparks(e.x, e.y, '#ffb060', 6, 250, 0.3, angleTo(e.x, e.y, tx, ty), 0.6);
  } else if (ai === 'healer' && e.fireT <= 0) {
    e.fireT = 2.6;
    let healed = 0;
    g.forEnemiesNear(e.x, e.y, 230, (o) => {
      if (o === e || o.boss || o.hp >= o.maxHp) return;
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.18);
      g.particles.glow(o.x, o.y, '#6aff9a', 26, 0.5);
      g.particles.text(o.x, o.y - o.r, '+', '#6aff9a', 16);
      healed++;
    });
    if (healed) g.particles.ring(e.x, e.y, '#6aff9a', 230, 0.6, 3);
  } else if (ai === 'summoner' && e.fireT <= 0 && d < 800) {
    e.fireT = 6.5;
    if (g.enemies.length < g.maxEnemies) {
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * TAU + rand(1);
        g.spawnEnemy('drone', e.x + Math.cos(ang) * 50, e.y + Math.sin(ang) * 50);
      }
      g.particles.ring(e.x, e.y, '#c890ff', 90, 0.5, 4);
    }
  }
}

// ---------- Боссы ----------
function updateBoss(e, g, dt, a, d) {
  const p = g.player;
  const b = e.bossDef;
  e.rot += dt * (e.enraged ? 1.4 : 0.7);
  if (!e.enraged && e.hp < e.maxHp * 0.5) {
    e.enraged = true;
    g.particles.ring(e.x, e.y, '#ffffff', 300, 0.6, 8);
    g.shake(10);
    g.toast(`${b.name} в ярости!`, b.color2);
  }
  // Король-Лич: кристаллы душ делают его неуязвимым
  if (b.id === 'lich') {
    const marks = [1, 0.66, 0.33];
    if (e.phaseMark < marks.length + 1 && e.hp <= e.maxHp * marks[e.phaseMark - 1] && !e.shielded) {
      e.phaseMark++;
      e.shielded = true;
      e.crystals = [];
      for (let i = 0; i < 3; i++) {
        const ang = (i / 3) * TAU + rand(1);
        const c = g.spawnEnemy('crystal', e.x + Math.cos(ang) * 330, e.y + Math.sin(ang) * 330, false, true);
        if (c) e.crystals.push(c);
      }
      g.toast('Разбей кристаллы душ!', '#7af0ff');
    }
    if (e.shielded && e.crystals && e.crystals.every((c) => c.dead)) {
      e.shielded = false;
      g.particles.ring(e.x, e.y, '#7af0ff', 200, 0.6, 8);
      g.toast('Щит Лича разрушен', '#7af0ff');
    }
  }

  // перемещение: кружит вокруг героя на дистанции
  if (e.charging > 0) {
    e.charging -= dt;
    if (Math.random() < 0.7) g.particles.glow(e.x, e.y, b.color, 30, 0.4);
  } else {
    const want = b.id === 'dragon' ? 340 : 290;
    const k = d > want + 60 ? 1 : d < want - 60 ? -0.7 : 0;
    const side = Math.sin(g.time * 0.4) > 0 ? 1 : -1;
    const tvx = (Math.cos(a) * k + Math.cos(a + Math.PI / 2) * side * 0.55) * e.speed;
    const tvy = (Math.sin(a) * k + Math.sin(a + Math.PI / 2) * side * 0.55) * e.speed;
    steer(e, tvx, tvy, 1.5, dt);
  }
  if (e.spawnT > 0) return;

  const rate = e.enraged ? 1.3 : 1;
  e.stateT -= dt;
  if (e.atk < 0) {
    if (e.stateT <= 0) {
      e.atkIndex = (e.atkIndex + 1) % b.attacks.length;
      e.atk = e.atkIndex;
      const name = b.attacks[e.atk];
      // «огненная стена» дракона — только в ярости
      if (name === 'firewall' && !e.enraged) e.atkIndex = (e.atkIndex + 1) % b.attacks.length;
      e.atk = e.atkIndex;
      e.atkT = 0;
      e.emitT = 0;
      e.aux = 0;
    }
    return;
  }
  e.atkT += dt * rate;
  e.emitT -= dt * rate;
  const name = b.attacks[e.atk];
  const c1 = b.color, c2 = b.color2;
  const dmg = e.dmg;
  const B = (ang, spd, o = {}) => g.fireBullet(e.x, e.y, ang, spd, { color: c1, r: 7, dmg: dmg * 0.7, ...o });
  let dur = 5;

  const charge = (len = 560, wind = 0.9) => {
    e.chargeA = angleTo(e.x, e.y, p.x, p.y);
    g.addZone({ kind: 'line', x: e.x, y: e.y, a: e.chargeA, len, w: e.r * 2, delay: wind, dmg: 0, color: c1, follow: e, visualOnly: true });
    e.pendingCharge = wind;
  };
  if (e.pendingCharge > 0) {
    e.pendingCharge -= dt;
    steer(e, 0, 0, 10, dt);
    if (e.pendingCharge <= 0) {
      e.charging = 0.62;
      e.vx = Math.cos(e.chargeA) * 920;
      e.vy = Math.sin(e.chargeA) * 920;
      g.shake(6);
    }
  }

  switch (name) {
    // --- Костяной Воевода ---
    case 'summon':
      dur = 2.5;
      if (e.aux === 0) {
        e.aux = 1;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * TAU;
          g.spawnEnemy(i % 3 === 0 ? 'gunner' : 'drone', e.x + Math.cos(ang) * 110, e.y + Math.sin(ang) * 110);
        }
        g.particles.ring(e.x, e.y, c1, 160, 0.6, 6);
      }
      break;
    case 'slam3':
      dur = 3.4;
      if (e.emitT <= 0 && e.aux < 3) {
        e.aux++;
        e.emitT = 0.75;
        g.addZone({ x: p.x + p.vx * 0.3, y: p.y + p.vy * 0.3, r: 100, delay: 0.95, dmg, color: c1 });
      }
      break;
    case 'fan':
      dur = 3;
      if (e.emitT <= 0 && e.aux < 3) {
        e.aux++;
        e.emitT = 0.8;
        for (let i = -4; i <= 4; i++) B(a + i * 0.13, 230, { color: c2 });
      }
      break;
    case 'charge':
      dur = 3.6;
      if (e.emitT <= 0 && e.aux < 2) {
        e.aux++;
        e.emitT = 1.8;
        charge();
      }
      break;
    // --- Ледяной Исполин ---
    case 'stomp':
      dur = 3.2;
      if (e.aux === 0) {
        e.aux = 1;
        g.addZone({ x: e.x, y: e.y, r: 210, delay: 1.2, dmg, color: c1, follow: e });
        for (let i = 0; i < 4; i++) g.addZone({ x: p.x + rand(-160, 160), y: p.y + rand(-160, 160), r: 70, delay: 1.6 + i * 0.2, dmg: dmg * 0.8, color: c1 });
      }
      break;
    case 'iceRing':
      dur = 3.2;
      if (e.emitT <= 0 && e.aux < 2) {
        e.aux++;
        e.emitT = 1.2;
        const n = 16, off = rand(TAU);
        for (let i = 0; i < n; i++) B(off + (i * TAU) / n, 130, { color: c1, r: 8 });
      }
      break;
    case 'spikes':
      dur = 2.8;
      if (e.aux === 0) {
        e.aux = 1;
        const off = a;
        for (let i = 0; i < 6; i++) g.addZone({ kind: 'line', x: e.x, y: e.y, a: off + (i * TAU) / 6, len: 520, w: 46, delay: 1.0, dmg, color: c1 });
      }
      break;
    // --- Пепельный Дракон ---
    case 'breath':
      dur = 3.6;
      if (e.emitT <= 0 && e.aux < 3) {
        e.aux++;
        e.emitT = 1.15;
        g.addZone({ kind: 'cone', x: e.x, y: e.y, a, arc: 0.45, len: 460, delay: 0.95, dmg, color: '#ff7a2e', follow: e, aimAt: p,
          onBurst: (z) => {
            for (let i = 0; i < 30; i++) {
              const an = z.a + rand(-z.arc, z.arc), r = rand(40, z.len);
              g.particles.glow(z.x + Math.cos(an) * r, z.y + Math.sin(an) * r, i % 2 ? '#ff7a2e' : '#ffd08a', rand(14, 26), 0.5);
            }
          } });
      }
      break;
    case 'meteors':
      dur = 3.4;
      if (e.emitT <= 0 && e.aux < 9) {
        e.aux++;
        e.emitT = 0.22;
        g.addZone({ x: p.x + rand(-300, 300), y: p.y + rand(-260, 260), r: 72, delay: 1.35, dmg, color: '#ff6a2a' });
      }
      break;
    case 'dive':
      dur = 4.2;
      if (e.emitT <= 0 && e.aux < 2) {
        e.aux++;
        e.emitT = 2;
        charge(700, 0.85);
      }
      break;
    case 'firewall':
      dur = 3.2;
      if (e.emitT <= 0) {
        e.emitT = 0.16;
        for (let i = 0; i < 3; i++) B(e.spin + (i * TAU) / 3, 150, { color: i % 2 ? c1 : c2 });
        e.spin += 0.22;
      }
      break;
    // --- Владыка Бездны ---
    case 'beams':
      dur = 5;
      if (e.aux === 0) {
        e.aux = 1;
        const n = e.enraged ? 5 : 4, off = rand(TAU), dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++)
          g.addZone({ kind: 'beam', x: e.x, y: e.y, a: off + (i * TAU) / n, len: 900, w: 34, delay: 1.1, active: 3.2, dmg: dmg * 0.6, color: c1, follow: e, rotSpeed: 0.55 * dir });
      }
      break;
    case 'teleport':
      dur = 2.6;
      if (e.aux === 0 && e.atkT > 0.4) {
        e.aux = 1;
        g.particles.burst(e.x, e.y, c1, 40, 400, 14, 0.6);
        const ang = rand(TAU);
        e.x = clamp(p.x + Math.cos(ang) * 260, 80, g.arena - 80);
        e.y = clamp(p.y + Math.sin(ang) * 260, 80, g.arena - 80);
        g.particles.ring(e.x, e.y, c1, 140, 0.5, 6);
        const n = 12;
        for (let i = 0; i < n; i++) B((i * TAU) / n + 0.13, 170, { color: c2 });
      }
      break;
    case 'summonDemons':
      dur = 2.4;
      if (e.aux === 0) {
        e.aux = 1;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * TAU;
          g.spawnEnemy('dasher', e.x + Math.cos(ang) * 120, e.y + Math.sin(ang) * 120);
        }
        g.particles.ring(e.x, e.y, c1, 170, 0.6, 6);
      }
      break;
    case 'voidOrbs':
      dur = 3.5;
      if (e.emitT <= 0 && e.aux < (e.enraged ? 6 : 4)) {
        e.aux++;
        e.emitT = 0.5;
        B(a + rand(-0.6, 0.6), 120, { color: '#ff3a6a', r: 13, homing: 1.1, life: 6.5, dmg: dmg * 0.9 });
      }
      break;
    // --- Король-Лич ---
    case 'flower':
      dur = 3.4;
      if (e.emitT <= 0 && e.aux < 3) {
        const n = 14;
        for (let i = 0; i < n; i++) B(e.aux * 0.22 + (i * TAU) / n, 145, { color: e.aux % 2 ? c1 : c2, angVel: e.aux % 2 ? 0.45 : -0.45 });
        e.aux++;
        e.emitT = 1;
      }
      break;
    case 'raise':
      dur = 2.4;
      if (e.aux === 0) {
        e.aux = 1;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * TAU;
          g.spawnEnemy('drone', p.x + Math.cos(ang) * 320, p.y + Math.sin(ang) * 320);
        }
        g.toast('Мёртвые восстают!', c2);
      }
      break;
    case 'soulSpiral':
      dur = 3.2;
      if (e.emitT <= 0) {
        e.emitT = 0.15;
        B(e.spin, 140, { color: c2 });
        B(e.spin + Math.PI, 140, { color: c1 });
        e.spin += 0.3;
      }
      break;
    case 'deathZones':
      dur = 3.2;
      if (e.emitT <= 0 && e.aux < 3) {
        e.aux++;
        e.emitT = 0.7;
        g.addZone({ x: p.x + p.vx * 0.4, y: p.y + p.vy * 0.4, r: 115, delay: 1.1, dmg, color: c1 });
      }
      break;
  }
  if (e.atkT >= dur) {
    e.atk = -1;
    e.stateT = e.enraged ? 0.7 : 1.3;
  }
}

export { pick, clamp };
