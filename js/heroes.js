// Уникальные механики героев: свой тип атаки, ресурс, способность и пути развития.
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
export const KITS = {
  // ---- Бранд: секира, Ярость, огненный вихрь ----
  spark: {
    tags: ['melee'],
    reach: (p) => 130 * p.s.size * (p.rageT > 0 ? 1.3 : 1) + 30,
    rateMul: (p) => (p.rageT > 0 ? 1.5 : 1) * (p.spinT > 0 ? 0 : 1),
    attackAnim: '1H_Melee_Attack_Chop',
    attack(g, p) {
      p.swingN = (p.swingN || 0) + 1;
      const rage = p.rageT > 0;
      const r = 130 * p.s.size * (rage ? 1.3 : 1);
      const hits = meleeSwing(g, {
        a: p.aim, arc: 1.2, r, dmg: g.playerDamage() * (rage ? 1.3 : 1), knock: 150, heavy: true,
        burn: rage || p.flags.ashen, fire: rage || p.flags.ashen, color: rage ? '#ff6a20' : '#ffd8b0',
        side: p.swingN % 2 ? 1 : -1, cutBullets: true,
        onHit: (e, d) => {
          if (rage && p.flags.bloodRage) p.hp = Math.min(p.s.maxHp, p.hp + d * 0.03);
        },
      });
      p.rageIdle = 0;
      if (!rage && hits) {
        p.rage = Math.min(100, (p.rage || 0) + hits * 6 * (p.flags.frenzy ? 1.5 : 1));
        if (p.rage >= 100) {
          p.rage = 0;
          p.rageT = 5 + (p.flags.frenzy ? 2 : 0);
          g.toast('Ярость!', '#ff5a2a');
          audio.play('rage');
          g.particles.ring(p.x, p.y, '#ff3a1a', 120, 0.5, 8);
        }
      }
      if (p.flags.flameWave && p.swingN % 3 === 0) {
        g.addProj({ kind: 'flamewave', x: p.x, y: p.y, angle: p.aim, speed: 540, r: 24 * p.s.size, dmg: g.playerDamage() * 1.1, pierce: 99, life: 0.75, color: '#ff6a20', burn: true, knock: 60 });
        audio.play('fireWave');
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

  // ---- Эйра: арбалет, метки, капканы ----
  vega: {
    tags: ['proj'],
    reach: (p) => 540 * p.s.range * (p.flags.heavyBolts ? 1 + 0.2 * branchCount(p, 'Снайпер') : 1),
    rateMul: (p) => (p.volleyT > 0 ? 2 : 1),
    attackAnim: '2H_Ranged_Shooting',
    attack(g, p) {
      p.shotN = (p.shotN || 0) + 1;
      const heavy = p.shotN % 4 === 0;
      const fan = p.upg.vega_fan || 0;
      const n = 1 + p.s.extraProj + fan * 2;
      const spread = fan ? 0.16 : 0.08;
      const speed = 1150 * p.s.projSpeed;
      const reach = KITS.vega.reach(p);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * spread + rand(-0.02, 0.02);
        g.addProj({
          kind: 'arrow', x: p.x, y: p.y, angle: p.aim + off, speed, r: heavy ? 6 : 4.5,
          dmg: g.playerDamage() * (heavy ? 2.2 : 1), pierce: p.s.pierce + (heavy ? 4 : 1), life: reach / speed,
          color: heavy ? '#ffe0a0' : '#d8ecff', bounce: p.s.bounce, mark: true, heavy, knock: heavy ? 120 : 40,
        });
      }
      audio.play('bow', { heavy });
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
      const k = ((p.shotN || 0) % 4) / 3;
      return { label: 'Пронзающий болт', v: k, color: '#8fd3ff', active: (p.shotN || 0) % 4 === 3 };
    },
  },

  // ---- Альдерон: цепная молния, перегрузка, гроза, время ----
  chronos: {
    tags: ['spell'],
    reach: (p) => 430 * p.s.range,
    rateMul: () => 1,
    attackAnim: 'Spellcast_Shoot',
    attack(g, p) {
      const t = p.aimTarget;
      if (!t || t.dead) return;
      p.castN = (p.castN || 0) + 1;
      const every = p.flags.overload ? 3 : 5;
      const over = p.castN % every === 0;
      const jumps = 2 + (p.upg.chronos_fork || 0) + p.s.extraProj;
      const falloff = p.flags.conduct ? 1 : 0.8;
      const sx = p.x + Math.cos(p.aim) * 20, sy = p.y + Math.sin(p.aim) * 20;
      const dmg = g.playerDamage() * (over ? 2.5 : 1);
      castLightning(g, sx, sy, 1.9, t, dmg, over ? jumps + 2 : jumps, falloff, over ? '#c8a0ff' : '#a8c8ff');
      if (over) {
        const R = p.flags.overload ? 190 : 140;
        g.explode(t.x, t.y, R, g.playerDamage() * 1.5, '#b894ff');
        g.particles.ring(t.x, t.y, '#d8c0ff', R, 0.4, 6);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          g.addBolt(t.x, t.y, 1, t.x + Math.cos(a) * R, t.y + Math.sin(a) * R, 0.6, '#c8a0ff', 0.8);
        }
        g.shake(4);
        audio.play('thunder');
      } else audio.play('zap');
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

  // ---- Готфрид: выпады мечом, щит, свет, освящённая земля ----
  bastion: {
    tags: ['melee'],
    reach: (p) => 150 * p.s.size + 30,
    rateMul: () => 1,
    attackAnim: 'Dualwield_Melee_Attack_Stab',
    attack(g, p) {
      p.swingN = (p.swingN || 0) + 1;
      meleeSwing(g, { a: p.aim, arc: 0.6, r: 150 * p.s.size, dmg: g.playerDamage(), knock: 260, color: '#fff0c0', cutBullets: true, kind: 'narrow', heavy: true });
      const every = p.flags.radiant ? 2 : 3;
      if (p.swingN % every === 0) {
        const angs = p.flags.dawn ? [-0.35, 0, 0.35] : [0];
        for (const off of angs)
          g.addProj({ kind: 'holywave', x: p.x, y: p.y, angle: p.aim + off, speed: 620, r: 26 * p.s.size, dmg: g.playerDamage() * 1.2, pierce: 99, life: 0.62, color: '#ffe9a0', heal: p.flags.bless, knock: 120 });
        audio.play('holy');
      }
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
    // щит ловит пули спереди
    blocks(p, b) {
      const arc = p.flags.faith ? 1.25 : 0.95;
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

  // ---- Лиорэ: стрелы души и армия скелетов ----
  morra: {
    tags: ['proj', 'summon'],
    reach: (p) => 470 * p.s.range,
    rateMul: () => 1,
    attackAnim: 'Spellcast_Shoot',
    attack(g, p) {
      const n = 1 + p.s.extraProj;
      for (let i = 0; i < n; i++)
        g.addProj({ kind: 'soul', x: p.x, y: p.y, angle: p.aim + (i - (n - 1) / 2) * 0.25, speed: 420 * p.s.projSpeed, r: 7 * p.s.size, dmg: g.playerDamage(), homing: 5 + p.s.homing, life: (470 * p.s.range) / 420, color: '#7dffb0', pierce: p.s.pierce + (p.flags.absorb ? 2 : 0), split: p.flags.absorb, bounce: p.s.bounce });
      audio.play('soul');
    },
    update() {},
    minionCap: (p) => 4 + 2 * (p.upg.morra_legion || 0),
    onKill(g, p, e) {
      if (e.def.ai === 'static') return;
      const chance = 0.22 + 0.15 * (p.upg.morra_harvest || 0);
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

export const kitOf = (p) => KITS[p.char.id];
