// Кэш пре-рендеренных спрайтов свечения. Рисуются с globalCompositeOperation='lighter'
import { hexToRgb, TAU } from './util.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Мягкое радиальное свечение
export function glowSprite(color, radius) {
  radius = Math.max(2, Math.round(radius));
  const key = 'g' + color + radius;
  let c = cache.get(key);
  if (c) return c;
  const s = radius * 2;
  c = makeCanvas(s, s);
  const x = c.getContext('2d');
  const [r, g, b] = hexToRgb(color);
  const grd = x.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.2, `rgba(${r},${g},${b},0.6)`);
  grd.addColorStop(0.55, `rgba(${r},${g},${b},0.16)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, s, s);
  cache.set(key, c);
  return c;
}

// Пуля в стиле bullet hell: цветной ореол + яркое белое ядро
export function bulletSprite(color, r) {
  r = Math.max(2, Math.round(r));
  const key = 'b' + color + r;
  let c = cache.get(key);
  if (c) return c;
  const pad = Math.ceil(r * 1.6 + 4);
  const s = (r + pad) * 2;
  c = makeCanvas(s, s);
  const x = c.getContext('2d');
  const cx = s / 2;
  const [cr, cg, cb] = hexToRgb(color);
  const grd = x.createRadialGradient(cx, cx, r * 0.5, cx, cx, r + pad);
  grd.addColorStop(0, `rgba(${cr},${cg},${cb},0.9)`);
  grd.addColorStop(0.35, `rgba(${cr},${cg},${cb},0.35)`);
  grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  x.fillStyle = grd;
  x.fillRect(0, 0, s, s);
  x.beginPath();
  x.arc(cx, cx, r, 0, TAU);
  x.fillStyle = `rgb(${cr},${cg},${cb})`;
  x.fill();
  x.beginPath();
  x.arc(cx, cx, r * 0.62, 0, TAU);
  x.fillStyle = '#ffffff';
  x.fill();
  cache.set(key, c);
  return c;
}

// Снаряд игрока: вытянутая «капля» с белым ядром (рисуется с поворотом)
export function boltSprite(color, r) {
  r = Math.max(2, Math.round(r));
  const key = 'p' + color + r;
  let c = cache.get(key);
  if (c) return c;
  const len = r * 5;
  const h = r * 4;
  c = makeCanvas(len + r * 3, h);
  const x = c.getContext('2d');
  const [cr, cg, cb] = hexToRgb(color);
  const cy = h / 2;
  const head = len + r;
  // хвост
  const tail = x.createLinearGradient(0, 0, head, 0);
  tail.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
  tail.addColorStop(1, `rgba(${cr},${cg},${cb},0.75)`);
  x.fillStyle = tail;
  x.beginPath();
  x.moveTo(0, cy);
  x.quadraticCurveTo(head * 0.6, cy - r * 1.1, head, cy - r);
  x.lineTo(head, cy + r);
  x.quadraticCurveTo(head * 0.6, cy + r * 1.1, 0, cy);
  x.fill();
  // ореол головы
  const grd = x.createRadialGradient(head, cy, 0, head, cy, r * 2);
  grd.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
  grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  x.fillStyle = grd;
  x.beginPath();
  x.arc(head, cy, r * 2, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(head, cy, r * 0.7, 0, TAU);
  x.fill();
  c.ox = head; // точка «головы» для позиционирования
  c.oy = cy;
  cache.set(key, c);
  return c;
}

// Фоновая туманность: большой тайл с мягкими пятнами
export function nebulaTile(size, palette) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const col = palette[i % palette.length];
    const [r, g, b] = hexToRgb(col);
    const px = Math.random() * size, py = Math.random() * size;
    const rad = size * (0.12 + Math.random() * 0.3);
    // рисуем с переносом по краям для бесшовности
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const gx = px + ox * size, gy = py + oy * size;
        const grd = x.createRadialGradient(gx, gy, 0, gx, gy, rad);
        const a = 0.05 + Math.random() * 0.06;
        grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        x.fillStyle = grd;
        x.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
  }
  return c;
}

export function starTile(size, count, maxR, alpha) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const r = Math.random() * maxR + 0.3;
    const a = alpha * (0.3 + Math.random() * 0.7);
    const tint = Math.random();
    x.fillStyle = tint < 0.15 ? `rgba(160,200,255,${a})` : tint < 0.25 ? `rgba(255,200,230,${a})` : `rgba(255,255,255,${a})`;
    x.beginPath();
    x.arc(px, py, r, 0, TAU);
    x.fill();
    if (r > maxR * 0.75) {
      const grd = x.createRadialGradient(px, py, 0, px, py, r * 5);
      grd.addColorStop(0, `rgba(200,220,255,${a * 0.35})`);
      grd.addColorStop(1, 'rgba(200,220,255,0)');
      x.fillStyle = grd;
      x.fillRect(px - r * 5, py - r * 5, r * 10, r * 10);
    }
  }
  return c;
}

// Тайл земли ночной степи: бесшовный, с пятнами, травой и камешками
export function groundTile(size) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  x.fillStyle = '#211a11';
  x.fillRect(0, 0, size, size);
  const wrap = (px, py, rad, fn) => {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) {
        const gx = px + ox * size, gy = py + oy * size;
        if (gx + rad < 0 || gy + rad < 0 || gx - rad > size || gy - rad > size) continue;
        fn(gx, gy);
      }
  };
  const patches = ['#2c3418', '#352614', '#1a2414', '#3a2f1c', '#22180e'];
  for (let i = 0; i < 46; i++) {
    const [r, g, b] = hexToRgb(patches[i % patches.length]);
    const px = Math.random() * size, py = Math.random() * size, rad = 40 + Math.random() * 130;
    const a = 0.35 + Math.random() * 0.35;
    wrap(px, py, rad, (gx, gy) => {
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grd.addColorStop(0, `rgba(${r},${g},${b},${a})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = grd;
      x.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    });
  }
  const specks = ['#2e2818', '#1d1910', '#36321c', '#0d0b07', '#3a2c18'];
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = specks[i % specks.length];
    x.globalAlpha = 0.35 + Math.random() * 0.5;
    const s = Math.random() < 0.9 ? 1 : 2;
    x.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  x.globalAlpha = 1;
  // пучки степной травы
  for (let i = 0; i < 260; i++) {
    const px = Math.random() * size, py = Math.random() * size;
    const col = Math.random() < 0.5 ? 'rgba(96,108,52,0.6)' : 'rgba(124,110,60,0.5)';
    wrap(px, py, 10, (gx, gy) => {
      x.strokeStyle = col;
      x.lineWidth = 1;
      x.beginPath();
      const n = 3 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const l = 4 + Math.random() * 6;
        x.moveTo(gx, gy);
        x.lineTo(gx + Math.cos(a) * l, gy + Math.sin(a) * l);
      }
      x.stroke();
    });
  }
  // камешки
  for (let i = 0; i < 55; i++) {
    const px = Math.random() * size, py = Math.random() * size, r = 1.5 + Math.random() * 3.5;
    wrap(px, py, r + 2, (gx, gy) => {
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath();
      x.ellipse(gx + 1, gy + 1.5, r, r * 0.7, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#3a3428';
      x.beginPath();
      x.ellipse(gx, gy, r, r * 0.7, 0, 0, TAU);
      x.fill();
      x.fillStyle = 'rgba(120,108,84,0.35)';
      x.beginPath();
      x.ellipse(gx - r * 0.3, gy - r * 0.25, r * 0.4, r * 0.25, 0, 0, TAU);
      x.fill();
    });
  }
  return c;
}

// Стрела: оперение, древко, наконечник и светящийся след. Голова — в точке (ox, oy)
export function arrowSprite(color, r) {
  r = Math.max(2, Math.round(r));
  const key = 'a' + color + r;
  let c = cache.get(key);
  if (c) return c;
  const len = r * 9, h = r * 4;
  c = makeCanvas(len + r * 2, h);
  const x = c.getContext('2d');
  const [cr, cg, cb] = hexToRgb(color);
  const cy = h / 2, head = len;
  const tail = x.createLinearGradient(0, 0, head, 0);
  tail.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
  tail.addColorStop(1, `rgba(${cr},${cg},${cb},0.55)`);
  x.fillStyle = tail;
  x.fillRect(0, cy - r * 0.8, head, r * 1.6);
  x.strokeStyle = '#e8d2a0';
  x.lineWidth = Math.max(1.2, r * 0.35);
  x.beginPath();
  x.moveTo(head - r * 6, cy);
  x.lineTo(head, cy);
  x.stroke();
  x.fillStyle = `rgb(${cr},${cg},${cb})`;
  x.beginPath();
  x.moveTo(head - r * 6, cy);
  x.lineTo(head - r * 7.2, cy - r);
  x.lineTo(head - r * 5.4, cy);
  x.lineTo(head - r * 7.2, cy + r);
  x.closePath();
  x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(head + r * 1.4, cy);
  x.lineTo(head - r * 0.4, cy - r * 0.8);
  x.lineTo(head - r * 0.4, cy + r * 0.8);
  x.closePath();
  x.fill();
  c.ox = head;
  c.oy = cy;
  cache.set(key, c);
  return c;
}
