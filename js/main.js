// Точка входа: загрузка 3D-моделей, связывание игры, вида, интерфейса и ввода
import { Game } from './game.js';
import { UI } from './ui.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { loadAssets } from './assets.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const loadFill = document.getElementById('loadFill');
const loadText = document.getElementById('loadText');

async function boot() {
  try {
    await loadAssets((k) => {
      loadFill.style.width = Math.round(k * 100) + '%';
    });
  } catch (err) {
    console.error(err);
    loadText.textContent = 'Не удалось загрузить модели. Обнови страницу.';
    return;
  }
  loadText.textContent = 'Разжигаем костры…';
  await new Promise((r) => setTimeout(r, 30));

  const { View3D } = await import('./render3d.js');
  let view;
  try {
    view = new View3D(canvas, overlay);
  } catch (err) {
    console.error(err);
    loadText.textContent = 'Браузер не поддерживает WebGL — игра не может запуститься.';
    return;
  }
  const ui = new UI();
  const game = new Game(canvas, ui);
  game.view = view;
  game.resize();
  view.prewarm();
  input.attach(canvas);
  ui.init(game);
  ui.initPreview();

  window.addEventListener('resize', () => game.resize());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pause();
  });

  // Браузеры разрешают звук только после жеста пользователя
  const unlock = () => {
    audio.init();
    ui.applyAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  let last = performance.now();
  function loop(now) {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    try {
      game.frame(dt);
    } catch (err) {
      console.error(err);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  document.getElementById('loading').classList.add('done');
  document.body.classList.add('ready');
  window.__rift = game;
}

boot();
