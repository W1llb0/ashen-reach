// Ивентовые волны: у волны появляется своя задача помимо выживания.
import { rand, TAU, clamp, dist2, pick } from './util.js';
import { audio } from './audio.js';
import { ARENA } from './game.js';

export const EVENTS = {
  meteors: { name: 'Звёздный дождь', goal: 'уворачивайся от падающих звёзд', icon: 'comet', spawnK: 0.55 },
  altars: { name: 'Алтари Предела', goal: 'зажги 3 алтаря, стоя рядом с ними', icon: 'flame', spawnK: 0.85 },
  ashring: { name: 'Пепельное кольцо', goal: 'держись внутри сужающегося круга', icon: 'target', spawnK: 0.8 },
};

const EVENT_WAVES = [4, 7, 12, 17];

export function rollEvent(g, n) {
  const endless = n > 20 && n % 3 === 0;
  if (!EVENT_WAVES.includes(n) && !endless) return null;
  const types = Object.keys(EVENTS).filter((t) => t !== g.lastEvent);
  const type = pick(types);
  g.lastEvent = type;
  const p = g.player;
  const ev = { type, def: EVENTS[type], t: 0.8, status: '' };
  if (type === 'altars') {
    const a0 = rand(TAU);
    ev.altars = [0, 1, 2].map((i) => {
      const a = a0 + (i / 3) * TAU + rand(-0.3, 0.3), d = rand(520, 760);
      return { x: clamp(p.x + Math.cos(a) * d, 150, ARENA - 150), y: clamp(p.y + Math.sin(a) * d, 150, ARENA - 150), prog: 0, lit: false };
    });
  }
  if (type === 'ashring') {
    ev.cx = clamp(p.x, 950, ARENA - 950);
    ev.cy = clamp(p.y, 950, ARENA - 950);
    ev.R = ev.R0 = 950;
    ev.R1 = 360;
  }
  return ev;
}

export function updateEvent(g, dt) {
  const ev = g.event, p = g.player, n = g.wave;
  if (ev.type === 'meteors') {
    ev.t -= dt;
    if (ev.t <= 0) {
      ev.t = Math.max(0.55, 1.0 - n * 0.015);
      const dmg = 12 + n * 1.8;
      g.addZone({ x: p.x + p.vx * 0.9, y: p.y + p.vy * 0.9, r: 85, delay: 1.15, dmg, color: '#ff8a3d' });
      const a = rand(TAU), d = rand(80, 320);
      g.addZone({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 95, delay: 1.3, dmg, color: '#ff8a3d' });
    }
    ev.status = 'Звёздный дождь · уворачивайся';
  } else if (ev.type === 'altars') {
    let lit = 0;
    for (const al of ev.altars) {
      if (al.lit) {
        lit++;
        continue;
      }
      if (dist2(p.x, p.y, al.x, al.y) < 95 * 95) al.prog += dt / 3;
      else al.prog = Math.max(0, al.prog - dt * 0.25);
      if (al.prog >= 1) {
        al.lit = true;
        lit++;
        g.particles.ring(al.x, al.y, '#ffd070', 160, 0.6, 8);
        g.particles.burst(al.x, al.y, '#ffd070', 30, 400, 10, 0.7);
        g.toast(`Алтарь зажжён · ${lit}/3`, '#ffd070');
        audio.play('holy');
      }
    }
    ev.status = `Алтари: ${lit} / 3`;
    if (lit === 3 && !ev.done) {
      ev.done = true;
      g.endWaveT = 1.2;
    }
  } else if (ev.type === 'ashring') {
    const k = clamp(g.waveT / (g.waveDur * 0.85), 0, 1);
    ev.R = ev.R0 + (ev.R1 - ev.R0) * k;
    const out = dist2(p.x, p.y, ev.cx, ev.cy) > ev.R * ev.R;
    ev.out = out;
    ev.status = out ? 'Вне кольца — пепел жжёт!' : 'Держись внутри кольца';
    if (Math.random() < 0.7) {
      const a = rand(TAU);
      g.particles.flame(ev.cx + Math.cos(a) * ev.R, ev.cy + Math.sin(a) * ev.R, '#ff5a2a', 1);
    }
    if (out && g.dying <= 0) {
      p.hp -= p.s.maxHp * 0.05 * dt;
      p.hurtT = Math.max(p.hurtT, 0.1);
      if (Math.random() < 0.3) g.particles.flame(p.x + rand(-10, 10), p.y + rand(-10, 10), '#ff5a2a', 1);
      if (p.hp <= 0) {
        p.hp = 0.01;
        p.invuln = p.aegisT = p.dashT = 0;
        g.playerHit(10);
      }
    }
    // враги за кольцом тоже горят
    if ((ev.t -= dt) <= 0) {
      ev.t = 0.5;
      for (const e of g.enemies) if (!e.dead && !e.boss && dist2(e.x, e.y, ev.cx, ev.cy) > ev.R * ev.R) g.damageEnemy(e, e.maxHp * 0.06, false, e.x, e.y, '#ff8a5a');
    }
  }
}

// Награда за ивент — в конце волны
export function endEvent(g) {
  const ev = g.event;
  if (!ev) return;
  const n = g.wave;
  if (ev.type === 'altars') {
    if (ev.done) {
      g.pendingChests++;
      g.addGold(25 + n * 3);
      g.toast('Алтари благословили: сундук и золото', '#ffd070');
    } else g.toast('Алтари погасли без награды', '#a08a70');
  } else {
    g.addGold(20 + n * 3);
    g.toast(`${ev.def.name} пережит: +${Math.round(20 + n * 3)} золота`, '#ffd070');
  }
  g.event = null;
}
