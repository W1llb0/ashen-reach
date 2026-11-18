// Уникальные механики героев: у каждого три оружия со своим стилем атаки, ресурс, способность и пути развития.
// Бранд — ближний бой и Ярость; Эйра — болты, метки и капканы; Альдерон — цепные молнии;
// Готфрид — щит и свет; Лиорэ — некромантия и армия скелетов.
import { TAU, rand, angleTo, angleDiff, dist2, clamp } from './util.js';
import { audio } from './audio.js';

// ---------- Общие приёмы ----------

// Удар по дуге перед героем: бьёт всех врагов в секторе, режет вражеские пули
export function meleeSwing(g, o) {
  const p = g.player, s = p.s;
  let hits = 0;
  g.forEnemiesNear(p.x, p.y, o.r, (e) => {
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (o.arc < Math.PI && Math.abs(angleDiff(o.a, Math.atan2(dy, dx))) > o.arc + e.r / d) return;
    const crit = Math.random() < s.crit;
    const dmg = o.dmg * (crit ? s.critMult : 1);
    const kb = e.boss ? 0.04 : e.elite ? 0.3 : 1;
    e.kbx += (dx / d) * o.knock * kb;
    e.kby += (dy / d) * o.knock * kb;
    if (o.burn) {
      e.burnT = 2.5;
      e.burnDps = Math.max(e.burnDps, o.dmg * 0.25 * s.burnMult);
    }
    if (s.frost > 0 && Math.random() < s.frost) e.slowT = 2;
    g.damageEnemy(e, dmg, crit, e.x, e.y);
    g.onHitProc(e, dmg, crit);
    if (s.chain > 0 && Math.random() < s.chain) g.chainLightning(e, dmg * 0.5);
    if (hits < 4) g.particles.sparks(e.x, e.y, o.color, crit ? 4 : 2, 300, 0.22, Math.atan2(dy, dx), 1.0);
    hits++;
    if (o.onHit) o.onHit(e, dmg);
  });
  if (o.cutBullets) {
    const R2 = (o.r + 10) ** 2;
    for (const b of g.bullets) {
      if (b.dead || dist2(p.x, p.y, b.x, b.y) > R2) continue;
      if (o.arc < Math.PI && Math.abs(angleDiff(o.a, angleTo(p.x, p.y, b.x, b.y))) > o.arc) continue;
      b.dead = true;
      g.particles.glow(b.x, b.y, b.color, 12, 0.25);
    }
  }
  g.slashes.push({ x: p.x, y: p.y, a: o.a, arc: o.arc, r: o.r, life: o.life || 0.24, max: o.life || 0.24, color: o.color, side: o.side || 1, kind: o.kind || 'wide' });
  if (o.fire) for (let i = 0; i < 3; i++) {
    const an = o.a + rand(-o.arc, o.arc), rr = rand(o.r * 0.4, o.r);
    g.particles.flame(p.x + Math.cos(an) * rr, p.y + Math.sin(an) * rr, '#ff6a20', 1);
  }
  audio.play('swing', { heavy: o.heavy });
  if (hits) audio.play('slashHit');
  return hits;
}

// Молния от точки к цели с прыжками по ближайшим врагам
export function castLightning(g, x, y, h, target, dmg, jumps, falloff, color = '#a8c8ff') {
  let cx = x, cy = y, ch = h, cur = target;
  const hit = new Set();
  let d = dmg;
  for (let i = 0; i <= jumps && cur; i++) {
    hit.add(cur);
    g.addBolt(cx, cy, ch, cur.x, cur.y, 1.0, color, i === 0 ? 1.4 : 1);
    const crit = Math.random() < g.player.s.crit;
    g.damageEnemy(cur, d * (crit ? g.player.s.critMult : 1), crit, cur.x, cur.y, '#cfe0ff');
    g.onHitProc(cur, d, crit);
    if (g.player.s.frost > 0 && Math.random() < g.player.s.frost) cur.slowT = 2;
    g.particles.sparks(cur.x, cur.y, '#dfe8ff', 5, 280, 0.25);
    g.particles.glow(cur.x, cur.y, color, 30, 0.2);
    cx = cur.x;
    cy = cur.y;
    ch = 1.0;
    d *= falloff;
    let best = null, bd = 210 * 210;
    for (const e of g.enemies) {
      if (e.dead || hit.has(e)) continue;
      const dd = dist2(cx, cy, e.x, e.y);
      if (dd < bd) {
        bd = dd;
        best = e;
      }
    }
    cur = best;
  }
  return hit;
}

const branchCount = (p, b) => (p.branch && p.branch[b]) || 0;

// ---------- Комплекты героев ----------
// kit.weapons[id] — своя атака и дальность для каждого оружия героя

// ---- Бранд: ярость общая для всех его оружий ----
function addRage(g, p, amount) {
  if (p.rageT > 0) return;
  p.rage = Math.min(100, (p.rage || 0) + amount * (p.flags.frenzy ? 1.5 : 1));
  if (p.rage >= 100) {
    p.rage = 0;
    p.rageT = 5 + (p.flags.frenzy ? 2 : 0);
    g.toast('Ярость!', '#ff5a2a');
    audio.play('rage');
    g.particles.ring(p.x, p.y, '#ff3a1a', 120, 0.5, 8);
  }
}
const rageK = (p) => (p.rageT > 0 ? 1.3 : 1);

function sparkSwing(g, p, o) {
  const rage = p.rageT > 0;
  const hits = meleeSwing(g, {
    a: p.aim + (o.off || 0), arc: o.arc, r: o.r * p.s.size * rageK(p), dmg: g.playerDamage() * (rage ? 1.3 : 1) * (o.dmgK || 1), knock: o.knock, heavy: o.heavy,
    burn: rage || p.flags.ashen, fire: rage || p.flags.ashen, color: rage ? '#ff6a20' : '#ffd8b0',
    side: o.side ?? (p.swingN % 2 ? 1 : -1), cutBullets: true, kind: o.kind,
    onHit: (e, d) => {
      if (rage && p.flags.bloodRage) p.hp = Math.min(p.s.maxHp, p.hp + d * 0.03);
    },
  });
  p.rageIdle = 0;
  if (hits) addRage(g, p, hits * 6);
  return hits;
}

function sparkFlameWave(g, p) {
  if (p.flags.flameWave && p.swingN % 3 === 0) {
    g.addProj({ kind: 'flamewave', x: p.x, y: p.y, angle: p.aim, speed: 540, r: 24 * p.s.size, dmg: g.playerDamage() * 1.1, pierce: 99, life: 0.75, color: '#ff6a20', burn: true, knock: 60 });
    audio.play('fireWave');
  }
}

// ---- Эйра: болты и ножи ----
const VEGA = {
  crossbow: { reach: 540, every: 4, speed: 1150, spread: 0.08, jitter: 0.02, base: 1, light: 1 },
  repeater: { reach: 430, every: 8, speed: 1050, spread: 0.1, jitter: 0.07, base: 1, light: 0 },
  knives: { reach: 340, every: 4, speed: 900, spread: 0.2, jitter: 0.03, base: 3, light: 0, knife: true },
};
function vegaShot(g, p) {
  const w = VEGA[p.weapon.id];
  p.shotN = (p.shotN || 0) + 1;
  const heavy = p.shotN % w.every === 0;
  const fan = p.upg.vega_fan || 0;
  let n = w.base + p.s.extraProj + fan * 2;
  if (w.knife && heavy) n += 4;
  const spread = w.spread * (fan ? 1.6 : 1) * (w.knife && heavy ? 1.3 : 1);
  const speed = w.speed * p.s.projSpeed;
  const reach = vegaReach(p);
  const heavyBolt = heavy && !w.knife;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spread + rand(-w.jitter, w.jitter);
    g.addProj({
      kind: w.knife ? 'knife' : 'arrow', x: p.x, y: p.y, angle: p.aim + off, speed, r: heavyBolt ? 6 : w.knife ? 5 : 4.5,
      dmg: g.playerDamage() * (heavyBolt ? 2.2 : 1), pierce: p.s.pierce + (heavyBolt ? 4 : w.light), life: reach / speed,
      color: heavyBolt ? '#ffe0a0' : w.knife ? '#e8eef8' : '#d8ecff', bounce: p.s.bounce, mark: true, heavy: heavyBolt, knock: heavyBolt ? 120 : 40,
    });
  }
  audio.play(w.knife ? 'swing' : 'bow', { heavy: heavyBolt });
}
const vegaReach = (p) => VEGA[p.weapon.id].reach * p.s.range * (p.flags.heavyBolts ? 1 + 0.2 * branchCount(p, 'Снайпер') : 1);

// ---- Альдерон: перегрузка общая ----
function overloadTick(p) {
  p.castN = (p.castN || 0) + 1;
  const every = p.flags.overload ? 3 : 5;
  return p.castN % every === 0;
}
function overloadBlast(g, x, y, R, dmg) {
  g.explode(x, y, R, dmg, '#b894ff');
  g.particles.ring(x, y, '#d8c0ff', R, 0.4, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rand(0.3);
    g.addBolt(x, y, 1, x + Math.cos(a) * R, y + Math.sin(a) * R, 0.6, '#c8a0ff', 0.8);
  }
  g.shake(4);
  audio.play('thunder');
}

// ---- Готфрид: волна света ----
function holyWave(g, p, big) {
  p.swingN = (p.swingN || 0) + 1;
  const every = p.flags.radiant ? 2 : 3;
  if (p.swingN % every !== 0) return;
  const angs = p.flags.dawn ? [-0.35, 0, 0.35] : [0];
  for (const off of angs)
    g.addProj({ kind: 'holywave', x: p.x, y: p.y, angle: p.aim + off, speed: 620, r: (big ? 36 : 26) * p.s.size, dmg: g.playerDamage() * (big ? 1.4 : 1.2), pierce: 99, life: big ? 0.7 : 0.62, color: '#ffe9a0', heal: p.flags.bless, knock: 120 });
  audio.play('holy');
}

export const KITS = {
  // ---- Бранд: секира, Ярость, огненный вихрь ----
  spark: {
    rateMul: (p) => (p.rageT > 0 ? 1.5 : 1) * (p.spinT > 0 ? 0 : 1),
    weapons: {
      axe: {
        reach: (p) => 130 * p.s.size * rageK(p) + 30,
        attack(g, p) {
          p.swingN = (p.swingN || 0) + 1;
          sparkSwing(g, p, { arc: 1.2, r: 130, knock: 150, heavy: true });
          sparkFlameWave(g, p);
        },
      },
      twin: {
        reach: (p) => 108 * p.s.size * rageK(p) + 30,
        attack(g, p) {
          p.swingN = (p.swingN || 0) + 1;
          const cross = p.swingN % 5 === 0;
          sparkSwing(g, p, { arc: 0.85, r: 108, knock: 70, kind: 'narrow', off: cross ? 0.25 : 0, dmgK: cross ? 1.6 : 1 });
          if (cross) {
            sparkSwing(g, p, { arc: 0.85, r: 108, knock: 120, kind: 'narrow', off: -0.25, dmgK: 1.6, side: -1 });
            g.shake(3);
          }
          sparkFlameWave(g, p);
        },
      },
      throw: {
        reach: (p) => 360 * p.s.range,
        attack(g, p) {
          p.swingN = (p.swingN || 0) + 1;
          const rage = p.rageT > 0;
          const n = 1 + p.s.extraProj;
          const speed = 640 * p.s.projSpeed;
          const out = (360 * p.s.range) / speed;
          for (let i = 0; i < n; i++)
            g.addProj({
              kind: 'axe', x: p.x, y: p.y, angle: p.aim + (i - (n - 1) / 2) * 0.32, speed, r: 16 * p.s.size * rageK(p), dmg: g.playerDamage() * (rage ? 1.3 : 1),
              pierce: 999, life: out * 2.4, ret: out, color: rage ? '#ff6a20' : '#ffd8b0', burn: rage || p.flags.ashen, knock: 90, rage: true,
            });
          audio.play('swing', { heavy: true });
          sparkFlameWave(g, p);
        },
      },
    },
    onProjHit(g, p, e, pr) {
      if (pr.rage) {
        addRage(g, p, 5);
        if (p.rageT > 0 && p.flags.bloodRage) p.hp = Math.min(p.s.maxHp, p.hp + pr.dmg * 0.03);
      }
    },
    update(g, p, dt) {
      if (p.rageT > 0) {
        p.rageT -= dt;
        if (Math.random() < 0.4) g.particles.flame(p.x + rand(-10, 10), p.y + rand(-10, 10), '#ff4a1a', 1);
      } else {
        p.rageIdle = (p.rageIdle || 0) + dt;
        if (p.rageIdle > 2) p.rage = Math.max(0, (p.rage || 0) - 10 * dt);
      }
      if (p.spinT > 0) {
        p.spinT -= dt;
        p.spinTick = (p.spinTick || 0) - dt;
        const R = 150 * (p.flags.bladeStorm ? 1.3 : 1) * p.s.size;
        if (p.flags.pull)
          g.forEnemiesNear(p.x, p.y, R * 1.9, (e) => {
            if (e.boss) return;
            const a = angleTo(e.x, e.y, p.x, p.y);
            e.kbx += Math.cos(a) * 240 * dt * 6;
            e.kby += Math.sin(a) * 240 * dt * 6;
          });
        if (p.spinTick <= 0) {
          p.spinTick = 0.14;
          meleeSwing(g, {
            a: p.spinA = (p.spinA || 0) + 2.1, arc: Math.PI, r: R, dmg: g.playerDamage() * 0.55, knock: 60, burn: true, fire: true,
            color: '#ff7a30', cutBullets: true, life: 0.18, kind: 'ring',
            onHit: (e) => {
              if (p.flags.eternal && e.dead) {
                p.abilityCd = Math.max(0, p.abilityCd - 0.5);
                p.spinT += 0.2;
              }
            },
          });
        }
      }
    },
    speedMul: (p) => (p.spinT > 0 ? 1.3 : 1) * (p.rageT > 0 && p.flags.berserk ? 1.25 : 1),
    armorAdd: (p) => (p.rageT > 0 && p.flags.berserk ? 0.4 : 0),
    ability(g, p) {
      p.spinT = 2.2 + (p.flags.bladeStorm ? 1.2 : 0);
      p.spinTick = 0;
      g.particles.ring(p.x, p.y, '#ff7a30', 180, 0.5, 8);
      g.shake(8);
      audio.play('whirl');
    },
    resource(p) {
      if (p.rageT > 0) return { label: 'Ярость', v: p.rageT / (5 + (p.flags.frenzy ? 2 : 0)), color: '#ff4a1a', active: true };
      return { label: 'Ярость', v: (p.rage || 0) / 100, color: '#c8502a' };
    },
  },

  // ---- Эйра: арбалет, самострел, ножи; метки и капканы ----
  vega: {
    rateMul: (p) => (p.volleyT > 0 ? 2 : 1),
    weapons: {
      crossbow: { reach: vegaReach, attack: vegaShot },
      repeater: { reach: vegaReach, attack: vegaShot },
      knives: { reach: vegaReach, attack: vegaShot },
    },
    update(g, p, dt) {
      if (p.flags.minefield) {
        p.mineT = (p.mineT || 4) - dt;
        if (p.mineT <= 0) {
          p.mineT = 4;
          g.addTrap(p.x, p.y);
        }
      }
      if (p.flags.arrowRain) {
        p.rainT = (p.rainT || 5) - dt;
        const t = p.aimTarget;
        if (p.rainT <= 0 && t && !t.dead) {
          p.rainT = 5;
          for (let i = 0; i < 12; i++) g.skyArrows.push({ x: t.x + rand(-90, 90), y: t.y + rand(-90, 90), t: -i * 0.05, fall: 0.45, dmg: g.playerDamage() * 1.5 });
          audio.play('volley');
        }
      }
    },
    ability(g, p) {
      const mv = g.moveDir;
      const a = Math.hypot(mv.x, mv.y) > 0.2 ? Math.atan2(mv.y, mv.x) : p.aim;
      const traps = p.flags.trapper ? 3 : 1;
      for (let i = 0; i < traps; i++) g.addTrap(p.x - Math.cos(a) * i * 40, p.y - Math.sin(a) * i * 40);
      p.dashT = 0.17;
      p.dashVx = Math.cos(a) * 1400;
      p.dashVy = Math.sin(a) * 1400;
      p.invuln = Math.max(p.invuln, 0.4);
      p.dashHit = new Set();
      g.particles.ring(p.x, p.y, '#8fd3ff', 60, 0.3, 4);
      audio.play('dash');
    },
    resource(p) {
      const every = VEGA[p.weapon.id].every;
      const n = (p.shotN || 0) % every;
      return { label: p.weapon.id === 'knives' ? 'Веер ножей' : 'Пронзающий болт', v: n / (every - 1), color: '#8fd3ff', active: n === every - 1 };
    },
  },

  // ---- Альдерон: посох, шаровые молнии, гримуар; перегрузка, гроза, время ----
  chronos: {
    rateMul: () => 1,
    weapons: {
      staff: {
        reach: (p) => 430 * p.s.range,
        attack(g, p) {
          const t = p.aimTarget;
          if (!t || t.dead) return;
          const over = overloadTick(p);
          const jumps = 2 + (p.upg.chronos_fork || 0) + p.s.extraProj;
          const falloff = p.flags.conduct ? 1 : 0.8;
          const sx = p.x + Math.cos(p.aim) * 20, sy = p.y + Math.sin(p.aim) * 20;
          castLightning(g, sx, sy, 1.9, t, g.playerDamage() * (over ? 2.5 : 1), over ? jumps + 2 : jumps, falloff, over ? '#c8a0ff' : '#a8c8ff');
          if (over) overloadBlast(g, t.x, t.y, p.flags.overload ? 190 : 140, g.playerDamage() * 1.5);
          else audio.play('zap');
        },
      },
      orb: {
        reach: (p) => 420 * p.s.range,
        attack(g, p) {
          const over = overloadTick(p);
          const n = 1 + p.s.extraProj;
          const speed = 230 * p.s.projSpeed;
          for (let i = 0; i < n; i++)
            g.addProj({
              kind: 'ball', x: p.x + Math.cos(p.aim) * 20, y: p.y + Math.sin(p.aim) * 20, angle: p.aim + (i - (n - 1) / 2) * 0.35, speed,
              r: (over ? 24 : 16) * p.s.size, dmg: g.playerDamage() * 0.6, pierce: 999, life: 2.3 * p.s.range, color: over ? '#c8a0ff' : '#a8c8ff', knock: 10,
              zap: { n: 2 + (p.upg.chronos_fork || 0), R: 150 * p.s.size, dmg: g.playerDamage() * (over ? 1.4 : 1), t: 0, jumps: p.flags.conduct ? 1 : 0 },
              blast: over,
            });
          audio.play(over ? 'thunder' : 'zap');
        },
      },
      tome: {
        reach: (p) => 260 * p.s.range,
        attack(g, p) {
          const over = overloadTick(p);
          const R = 260 * p.s.range;
          const n = 3 + (p.upg.chronos_fork || 0) + p.s.extraProj;
          const cand = [];
          g.forEnemiesNear(p.x, p.y, R, (e) => {
            if (Math.abs(angleDiff(p.aim, angleTo(p.x, p.y, e.x, e.y))) < 0.85) cand.push(e);
          });
          cand.sort((a, b) => dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y));
          const sx = p.x + Math.cos(p.aim) * 18, sy = p.y + Math.sin(p.aim) * 18;
          for (const e of cand.slice(0, n)) castLightning(g, sx, sy, 1.5, e, g.playerDamage(), p.flags.conduct ? 1 : 0, 0.8);
          if (over) {
            const NR = (p.flags.overload ? 260 : 210) * p.s.size;
            g.forEnemiesNear(p.x, p.y, NR, (e) => {
              g.damageEnemy(e, g.playerDamage() * 1.8, false, e.x, e.y, '#d8c0ff');
              e.slowT = Math.max(e.slowT, 1.5);
            });
            g.particles.ring(p.x, p.y, '#d8c0ff', NR, 0.45, 8);
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * TAU + rand(0.3);
              g.addBolt(p.x, p.y, 1.2, p.x + Math.cos(a) * NR, p.y + Math.sin(a) * NR, 0.5, '#c8a0ff', 0.9);
            }
            g.shake(5);
            audio.play('thunder');
          } else if (cand.length) audio.play('zap');
        },
      },
    },
    update(g, p, dt) {
      if (p.flags.cloud) {
        p.cloudT = (p.cloudT || 1.2) - dt;
        if (p.cloudT <= 0) {
          p.cloudT = 1.2 * Math.pow(0.7, p.upg.chronos_thunder || 0);
          const cand = g.enemies.filter((e) => !e.dead && e.def.ai !== 'static' && g.onScreen(e.x, e.y) && dist2(e.x, e.y, p.x, p.y) < 480 * 480);
          if (cand.length) {
            const e = cand[(Math.random() * cand.length) | 0];
            g.addBolt(e.x + rand(-20, 20), e.y + rand(-20, 20), 9, e.x, e.y, 0, '#c0d8ff', 1.6);
            const dmg = g.playerDamage() * (1.3 + 0.3 * (p.upg.chronos_thunder || 0));
            if (p.flags.wrath) g.explode(e.x, e.y, 90, dmg * 0.6, '#a8c8ff');
            g.damageEnemy(e, dmg, false, e.x, e.y, '#cfe0ff');
            g.particles.ring(e.x, e.y, '#c0d8ff', 70, 0.3, 4);
            g.cloudFlash = 0.15;
            audio.play('zap', { sky: true });
          }
        }
      }
    },
    // разряды шаровой молнии
    projUpdate(g, p, pr, dt) {
      const z = pr.zap;
      z.t -= dt;
      if (z.t > 0) return;
      z.t = 0.32;
      const near = [];
      g.forEnemiesNear(pr.x, pr.y, z.R, (e) => {
        near.push(e);
      });
      near.sort((a, b) => dist2(pr.x, pr.y, a.x, a.y) - dist2(pr.x, pr.y, b.x, b.y));
      for (const e of near.slice(0, z.n)) castLightning(g, pr.x, pr.y, 1.0, e, z.dmg, z.jumps, 0.8, pr.color);
      if (near.length && Math.random() < 0.5) audio.play('zap', { sky: false });
    },
    projEnd(g, p, pr) {
      if (pr.blast) overloadBlast(g, pr.x, pr.y, p.flags.overload ? 200 : 160, g.playerDamage() * 2.2);
    },
    ability(g, p) {
      g.timeStopT = 3 + (p.flags.loop ? 1.5 : 0);
      g.timeStopMax = g.timeStopT;
      g.particles.ring(p.x, p.y, '#f0e2ff', 900, 0.9, 8);
      g.particles.ring(p.x, p.y, '#b894ff', 600, 0.7, 4);
      g.flash('#b894ff', 0.25);
      audio.play('timestop');
    },
    resource(p) {
      const every = p.flags.overload ? 3 : 5;
      const k = ((p.castN || 0) % every) / (every - 1);
      return { label: 'Заряд', v: k, color: '#b894ff', active: (p.castN || 0) % every === every - 1 };
    },
  },

  // ---- Готфрид: меч и щит, двуручный меч, шипастый щит; свет и освящённая земля ----
  bastion: {
    rateMul: () => 1,
    weapons: {
      sword: {
        reach: (p) => 150 * p.s.size + 30,
        attack(g, p) {
          meleeSwing(g, { a: p.aim, arc: 0.6, r: 150 * p.s.size, dmg: g.playerDamage(), knock: 260, color: '#fff0c0', cutBullets: true, kind: 'narrow', heavy: true });
          holyWave(g, p, false);
        },
      },
      great: {
        reach: (p) => 165 * p.s.size + 30,
        attack(g, p) {
          meleeSwing(g, { a: p.aim, arc: 1.5, r: 165 * p.s.size, dmg: g.playerDamage(), knock: 200, color: '#fff0c0', cutBullets: true, kind: 'wide', heavy: true, side: (p.swingN || 0) % 2 ? 1 : -1 });
          g.shake(2);
          holyWave(g, p, true);
        },
      },
      spiked: {
        reach: (p) => 115 * p.s.size + 30,
        attack(g, p) {
          meleeSwing(g, {
            a: p.aim, arc: 0.95, r: 115 * p.s.size, dmg: g.playerDamage(), knock: 380, color: '#ffe0a0', cutBullets: true, kind: 'narrow', heavy: true,
            onHit: (e) => (e.slowT = Math.max(e.slowT, 0.9)),
          });
          holyWave(g, p, false);
        },
      },
    },
    update(g, p, dt) {
      if (p.flags.consecrate) {
        const R = 115 * (1 + 0.35 * (p.upg.bastion_holyfire || 0));
        p.auraT = (p.auraT || 0) - dt;
        if (p.auraT <= 0) {
          p.auraT = 0.5;
          const dmg = g.playerDamage() * 0.35 * (1 + 0.5 * (p.upg.bastion_holyfire || 0));
          g.forEnemiesNear(p.x, p.y, R, (e) => {
            g.damageEnemy(e, dmg, false, e.x, e.y, '#ffe9a0');
            if (Math.random() < 0.3) g.particles.flame(e.x, e.y, '#ffe080', 1);
          });
        }
        if (p.flags.judge) {
          p.judgeT = (p.judgeT || 7) - dt;
          if (p.judgeT <= 0) {
            p.judgeT = 7;
            g.forEnemiesNear(p.x, p.y, R * 1.6, (e) => {
              g.damageEnemy(e, g.playerDamage() * 4, true, e.x, e.y, '#fff3c0');
              g.pillars.push({ x: e.x, y: e.y, life: 0.5, max: 0.5 });
            });
            g.flash('#fff0b0', 0.15);
            audio.play('judge');
          }
        }
      }
    },
    // щит ловит пули спереди (если в руке щит)
    blocks(p, b) {
      if (!p.weapon.shield) return false;
      const arc = (p.flags.faith ? 1.25 : 0.95) + (p.weapon.reflect ? 0.25 : 0);
      return Math.abs(angleDiff(p.aim, angleTo(p.x, p.y, b.x, b.y))) < arc;
    },
    ability(g, p) {
      p.aegisT = 2.5 + (p.flags.mirror ? 1 : 0);
      p.aegisMax = p.aegisT;
      g.particles.ring(p.x, p.y, '#e0b050', 90, 0.4, 6);
      g.shake(5);
      audio.play('shieldBlock');
    },
    resource(p) {
      const every = p.flags.radiant ? 2 : 3;
      const k = ((p.swingN || 0) % every) / (every - 1);
      return { label: 'Волна света', v: k, color: '#ffe080', active: (p.swingN || 0) % every === every - 1 };
    },
  },

  // ---- Лиорэ: стрелы души, кинжал, склянки чумы; армия скелетов ----
  morra: {
    rateMul: () => 1,
    weapons: {
      souls: {
        reach: (p) => 470 * p.s.range,
        attack(g, p) {
          const n = 1 + p.s.extraProj;
          for (let i = 0; i < n; i++)
            g.addProj({ kind: 'soul', x: p.x, y: p.y, angle: p.aim + (i - (n - 1) / 2) * 0.25, speed: 420 * p.s.projSpeed, r: 7 * p.s.size, dmg: g.playerDamage(), homing: 5 + p.s.homing, life: (470 * p.s.range) / 420, color: '#7dffb0', pierce: p.s.pierce + (p.flags.absorb ? 2 : 0), split: p.flags.absorb, bounce: p.s.bounce });
          audio.play('soul');
        },
      },
      dagger: {
        reach: (p) => 105 * p.s.size + 30,
        attack(g, p) {
          p.daggerSwing = true;
          p.swingN = (p.swingN || 0) + 1;
          meleeSwing(g, {
            a: p.aim, arc: 1.0, r: 105 * p.s.size, dmg: g.playerDamage(), knock: 90, color: '#9dffc4', cutBullets: true, kind: 'narrow', side: p.swingN % 2 ? 1 : -1,
            onHit: () => (p.hp = Math.min(p.s.maxHp, p.hp + 0.6)),
          });
          p.daggerSwing = false;
        },
      },
      flask: {
        reach: (p) => 400 * p.s.range,
        attack(g, p) {
          const t = p.aimTarget;
          if (!t || t.dead) return;
          const n = 1 + p.s.extraProj;
          const speed = 520 * p.s.projSpeed;
          for (let i = 0; i < n; i++) {
            const tx = t.x + t.vx * 0.5 + (i ? rand(-70, 70) : 0), ty = t.y + t.vy * 0.5 + (i ? rand(-70, 70) : 0);
            const d = Math.hypot(tx - p.x, ty - p.y);
            g.addProj({ kind: 'flask', x: p.x, y: p.y, angle: angleTo(p.x, p.y, tx, ty), speed, r: 6, dmg: g.playerDamage(), life: Math.max(0.15, d / speed), noHit: true, color: '#9dff6a' });
          }
          audio.play('swing');
        },
      },
    },
    projEnd(g, p, pr) {
      if (pr.kind !== 'flask') return;
      g.clouds.push({ x: pr.x, y: pr.y, r: 85 * p.s.size, life: 3.5, max: 3.5, tick: 0, dmg: pr.dmg });
      g.particles.burst(pr.x, pr.y, '#9dff6a', 14, 260, 8, 0.5);
      audio.play('boneBreak');
    },
    update() {},
    minionCap: (p) => 4 + 2 * (p.upg.morra_legion || 0),
    onKill(g, p, e) {
      if (e.def.ai === 'static') return;
      let chance = 0.22 + 0.15 * (p.upg.morra_harvest || 0);
      if (p.daggerSwing) chance += 0.28;
      if (e.plagueUntil > g.time) chance += 0.2;
      if (Math.random() < chance && g.allies.filter((a) => !a.dead).length < KITS.morra.minionCap(p)) g.raiseAlly(e.x, e.y);
    },
    ability(g, p) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(0.5);
        g.raiseAlly(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, true);
      }
      for (const a of g.allies) {
        if (a.dead) continue;
        a.hp = a.maxHp;
        a.enrageT = 4;
      }
      g.particles.ring(p.x, p.y, '#6fe0a0', 160, 0.6, 8);
      g.flash('#40ff90', 0.12);
      audio.play('summon');
    },
    resource(p, g) {
      const n = g.allies.filter((a) => !a.dead).length, cap = KITS.morra.minionCap(p);
      return { label: `Скелеты ${n}/${cap}`, v: n / cap, color: '#6fe0a0', active: n >= cap };
    },
  },
};

// Атака и дальность берутся у выбранного оружия
for (const kit of Object.values(KITS)) {
  kit.reach = (p) => kit.weapons[p.weapon.id].reach(p);
  kit.attack = (g, p) => kit.weapons[p.weapon.id].attack(g, p);
}

export const kitOf = (p) => KITS[p.char.id];
