// Система частиц: искры, свечения, ударные волны и всплывающие числа урона
import { rand, TAU, easeOutCubic, rgba } from './util.js';
import { glowSprite } from './sprites.js';

const GLOW = 0, SPARK = 1, RING = 2;

export class Particles {
  constructor() {
    this.list = [];
    this.texts = [];
    this.max = 2200;
  }

  clear() {
    this.list.length = 0;
    this.texts.length = 0;
  }

  add(p) {
    if (this.list.length >= this.max) {
      // перезаписываем случайную старую частицу
      this.list[(Math.random() * this.list.length) | 0] = p;
      return;
    }
    this.list.push(p);
  }

  // Облако светящихся точек
  burst(x, y, color, count = 10, speed = 160, size = 6, life = 0.5) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.25 + Math.random() * 0.9);
      this.add({
        t: GLOW, x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.5 + Math.random() * 0.7), max: 0,
        size: size * (0.6 + Math.random() * 0.8), color, drag: 3.2,
      });
    }
  }

  // Линейные искры (вылетают и тянут хвост)
  sparks(x, y, color, count = 8, speed = 320, life = 0.35, dir = null, spread = TAU) {
    for (let i = 0; i < count; i++) {
      const a = dir === null ? Math.random() * TAU : dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.add({
        t: SPARK, x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.5 + Math.random() * 0.7), max: 0,
        size: 1.5 + Math.random() * 1.5, color, drag: 4,
      });
    }
  }

  // Язычки пламени, поднимающиеся вверх (в 3D — по высоте)
  flame(x, y, color = '#ff6a20', count = 1) {
    for (let i = 0; i < count; i++)
      this.add({ t: GLOW, x, y, vx: rand(-14, 14), vy: rand(-14, 14), h: rand(0.25, 0.8), vh: rand(1.4, 2.8), life: rand(0.35, 0.7), max: 0, size: rand(6, 11), color: Math.random() < 0.3 ? '#ffd070' : color, drag: 1.5 });
  }

  ring(x, y, color, radius = 80, life = 0.4, width = 4, r0 = 0) {
    this.add({ t: RING, x, y, vx: 0, vy: 0, life, max: 0, size: radius, r0, color, width, drag: 0 });
  }

  glow(x, y, color, size, life = 0.3, vx = 0, vy = 0) {
    this.add({ t: GLOW, x, y, vx, vy, life, max: 0, size, color, drag: 2 });
  }

  text(x, y, str, color = '#fff', size = 14, crit = false) {
    if (this.texts.length > 120) this.texts.shift();
    this.texts.push({ x: x + rand(-8, 8), y, str, color, size, crit, life: crit ? 0.95 : 0.7, max: crit ? 0.95 : 0.7, vy: crit ? -90 : -60 });
  }

  update(dt) {
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (!p.max) p.max = p.life;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vh) p.h += p.vh * dt;
      L[j++] = p;
    }
    L.length = j;

    const T = this.texts;
    j = 0;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      t.life -= dt;
      if (t.life <= 0) continue;
      t.y += t.vy * dt;
      t.vy *= Math.exp(-3 * dt);
      T[j++] = t;
    }
    T.length = j;
  }

  // Рисуется в мировых координатах, ctx уже трансформирован
  render(ctx, view) {
    ctx.globalCompositeOperation = 'lighter';
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.x < view.x0 - 100 || p.x > view.x1 + 100 || p.y < view.y0 - 100 || p.y > view.y1 + 100) continue;
      const k = p.life / p.max;
      if (p.t === GLOW) {
        const s = p.size * (0.4 + 0.6 * k);
        const spr = glowSprite(p.color, 16);
        ctx.globalAlpha = k;
        ctx.drawImage(spr, p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.t === SPARK) {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        ctx.stroke();
      } else if (p.t === RING) {
        const e = easeOutCubic(1 - k);
        const r = p.r0 + (p.size - p.r0) * e;
        ctx.globalAlpha = k * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width * k + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, r), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  renderTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = t.crit ? 1 + Math.max(0, (k - 0.75) * 3) : 1;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `700 ${Math.round(t.size * pop)}px 'Bona Nova SC', Georgia, serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,4,20,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

export { rgba };
