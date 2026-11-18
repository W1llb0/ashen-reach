// DOM-интерфейс: меню, выбор героя, HUD, выбор баффов, пауза, итоги забега
import { CHARACTERS, charById } from './characters.js';
import { HeroPreview } from './preview.js';
import { KITS } from './heroes.js';
import { RARITY, upgradeById } from './upgrades.js';
import { TIERS, itemById, itemPrice, rerollPrice } from './shop.js';
import { WEAPON_FAMS, ARMOR_FAMS, famsOf, forgeName, rarityOf, stepDesc, mainFam, LEGEND_AT, MAX_FORGE } from './forge.js';
import { BOSSES } from './enemies.js';
const LINES = {
  greet: ['Живой? Здесь? Как… свежо.', 'Садись к огню, странник. Товар не кусается. Почти.', 'Твои монеты пахнут кровью. Мне нравится.', 'Мёртвые болтливы. А я — нет. Покупай.', 'Ещё жив? Тогда тебе понадобится вот это.'],
  boss: ['Впереди страж. Он не ведает жалости — и ты не ведай.', 'Чую, скоро тяжёлый бой. Запасись получше.'],
  final: ['Последняя ночь, странник. Владыка Предела уже проснулся.', 'Что бы ни случилось дальше — покупай всё. Мёртвым золото ни к чему.'],
  buy: ['Мудрый выбор.', 'Эта вещь служила прежнему хозяину… недолго.', 'Носи с честью. Или умри с ней.', 'Сделка скреплена.', 'Хе-хе. Обращайся ещё.'],
  poor: ['Монет маловато, странник.', 'Мёртвые в долг не дают.', 'Без золота — без товара.'],
  forge: ['Металл помнит руку кузнеца. И руку убийцы.', 'Остынет — и будет злее прежнего.', 'Хорошая закалка. Мертвецы оценят.', 'Вот теперь это оружие, а не железка.'],
  reroll: ['Посмотрим, что ещё завалялось в склепе…', 'Ладно, ладно. Вот другое.', 'Есть у меня кое-что получше…'],
};
const pickLine = (arr) => arr[Math.floor(Math.random() * arr.length)];
const BOSSES_NAMES = { dragon: 'Пепельного Дракона', abyss: 'Владыку Бездны', lich: 'Иерарха Тлена' };
import { icon } from './icons.js';
import { audio } from './audio.js';
import { input } from './input.js';
import { formatTime, formatNum, store } from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);

export class UI {
  constructor() {
    this.game = null;
    this.selected = store.get('kurgan_lastChar', 'spark');
    this.weaponSel = store.get('kurgan_weapons', {}) || {};
    this.screens = {};
    this.hudCache = {};
    this.previewRaf = 0;
    this.levelChoices = null;
  }

  init(game) {
    this.game = game;
    this.hud = $('#hud');
    this.buildMenu();
    this.buildSelect();
    this.screens.levelup = $('#screen-levelup');
    this.screens.pause = $('#screen-pause');
    this.screens.over = $('#screen-over');
    this.screens.help = $('#screen-help');
    this.screens.shop = $('#screen-shop');
    this.buildHelp();

    $('#abilityBtn').addEventListener('click', () => {
      input.abilityTouch = true;
    });
    $('#abilityBtn').addEventListener('touchstart', (e) => {
      input.abilityTouch = true;
      e.preventDefault();
    }, { passive: false });
    $('#pauseBtn').addEventListener('click', () => game.pause());
    $('#pauseBtn').innerHTML = icon('pause', 18);
    $('#killsIcon').innerHTML = icon('skull', 18);
    $('#goldIcon').innerHTML = icon('coin', 18);
    $('#muteBtn').addEventListener('click', () => this.click(() => this.toggleMute()));
    this.refreshMute();

    // глобальные горячие клавиши для меню
    window.addEventListener('keydown', (e) => this.onKey(e));
    // звук наведения на кнопки
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest('button, .card, .hero')) audio.play('hover');
    });
    document.addEventListener('pointerdown', () => audio.init(), { once: false });

    this.show('menu');
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('visible', k === name);
    this.current = name;
    if (name === 'select') this.startPreview();
    else this.stopPreview();
  }

  hideAll() {
    for (const el of Object.values(this.screens)) el.classList.remove('visible');
    this.current = null;
    this.stopPreview();
  }

  onKey(e) {
    const g = this.game;
    if (e.code === 'KeyM' && !e.repeat) {
      this.toggleMute();
      return;
    }
    if (this.current === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      this.click(() => this.show('select'));
    } else if (this.current === 'select') {
      const idx = CHARACTERS.findIndex((c) => c.id === this.selected);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.selectHero(CHARACTERS[(idx + 1) % CHARACTERS.length].id);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.selectHero(CHARACTERS[(idx + CHARACTERS.length - 1) % CHARACTERS.length].id);
      if (/^Digit[1-5]$/.test(e.code)) this.selectHero(CHARACTERS[+e.code.slice(5) - 1].id);
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startRun();
      }
      if (e.code === 'Escape') this.show('menu');
    } else if (this.current === 'levelup' && this.levelChoices) {
      if (/^Digit[1-3]$/.test(e.code)) {
        const i = +e.code.slice(5) - 1;
        if (this.levelChoices[i]) this.pick(i);
      }
      if (e.code === 'KeyR') this.doReroll();
    } else if (this.current === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (this.pauseOpenedAt && performance.now() - this.pauseOpenedAt > 150) g.resume();
    } else if (this.current === 'over' && e.code === 'Enter') {
      this.startRun();
    } else if (this.current === 'shop' && e.code === 'Enter') {
      g.leaveShop();
    } else if (this.current === 'help' && e.code === 'Escape') {
      this.show('menu');
    }
  }

  click(fn) {
    audio.init();
    audio.play('ui');
    fn();
  }

  // ---------- Главное меню ----------
  buildMenu() {
    const el = $('#screen-menu');
    this.screens.menu = el;
    el.innerHTML = `
      <div class="menu-wrap">
        <div class="logo">
          <div class="logo-emblem">${icon('skull', 44, 1.4)}</div>
          <div class="logo-kicker">roguelike · bullet hell</div>
          <h1 class="logo-title">Пепельный Предел</h1>
          <div class="ornament"></div>
          <div class="logo-sub">Древнее зло пробудилось среди пепла и могил. Выстой двадцать волн нежити и сразись с Владыкой Предела.</div>
        </div>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-act="play">${icon('sword', 20)} Начать поход</button>
          <button class="btn" data-act="help">${icon('eye', 20)} Наставление</button>
          <button class="btn btn-ghost" data-act="sound">${icon('sound', 20)} <span class="sound-label"></span></button>
        </div>
        <div class="menu-records"></div>
      </div>
      <div class="menu-foot">WASD — движение · стрельба автоматическая · Space — способность · Shift — фокус · M — звук</div>`;
    el.querySelector('[data-act=play]').onclick = () => this.click(() => this.show('select'));
    el.querySelector('[data-act=help]').onclick = () => this.click(() => this.show('help'));
    el.querySelector('[data-act=sound]').onclick = () =>
      this.click(() => this.toggleMute());
    this.refreshMenu();
  }

  refreshMenu() {
    if (this.screens.menu) this.refreshMute();
    const rec = this.game.records;
    let best = null;
    for (const [id, r] of Object.entries(rec)) if (!best || r.score > best.r.score) best = { id, r };
    const total = Object.values(rec).reduce((a, r) => a + (r.runs || 0), 0);
    $('.menu-records', this.screens.menu).innerHTML = best
      ? `<div class="rec-chip">${icon('crown', 16)} Слава: <b>${formatNum(best.r.score)}</b> · ${charById(best.id).name}</div>
         <div class="rec-chip">${icon('skull', 16)} Лучшая волна: <b>${Math.max(...Object.values(rec).map((r) => r.wave || 0))} / 20</b></div>
         <div class="rec-chip">${icon('dice', 16)} Походов: <b>${total}</b> · побед: <b>${Object.values(rec).reduce((a, r) => a + (r.wins || 0), 0)}</b></div>`
      : `<div class="rec-chip">${icon('star', 16)} Первый поход ещё впереди</div>`;
  }

  toggleMute() {
    const s = this.game.settings;
    s.muted = !s.muted;
    this.game.saveSettings();
    audio.init();
    this.applyAudio();
    this.refreshMute();
    this.toast(s.muted ? 'Звук выключен' : 'Звук включён', '#e8c060');
  }

  refreshMute() {
    const m = this.game.settings.muted;
    const b = $('#muteBtn');
    if (b) {
      b.innerHTML = icon(m ? 'mute' : 'sound', 18);
      b.classList.toggle('off', m);
      b.title = m ? 'Включить звук (M)' : 'Выключить звук (M)';
    }
    const lbl = this.screens.menu && $('.sound-label', this.screens.menu);
    if (lbl) lbl.textContent = m ? 'Звук: выкл' : 'Звук: вкл';
    const mi = this.screens.menu && $('[data-act=sound] .ico', this.screens.menu);
    if (mi) mi.outerHTML = icon(m ? 'mute' : 'sound', 20);
  }

  applyAudio() {
    const s = this.game.settings;
    audio.setSfxVolume(s.sfx);
    audio.setMusicVolume(s.music);
    audio.setMusic(s.music > 0);
    audio.setMuted(!!s.muted);
  }

  // ---------- Помощь ----------
  buildHelp() {
    const el = this.screens.help;
    el.innerHTML = `
      <div class="panel help-panel">
        <h2>Наставление</h2>
        <div class="help-grid">
          <div class="help-item">${icon('wind', 26)}<div><b>Движение</b><span>WASD / стрелки. На телефоне — джойстик в любом месте экрана.</span></div></div>
          <div class="help-item">${icon('target', 26)}<div><b>Стрельба</b><span>Полностью автоматическая: герой сам целится в ближайшего врага, а босса бьёт в первую очередь. Тебе остаётся уклоняться.</span></div></div>
          <div class="help-item">${icon('burst', 26)}<div><b>Способность</b><span>Space, E или ПКМ. У каждого героя своя, с перезарядкой.</span></div></div>
          <div class="help-item">${icon('eye', 26)}<div><b>Фокус</b><span>Удерживай Shift: медленнее движение и видно уязвимое место — крошечную точку в центре героя.</span></div></div>
          <div class="help-item">${icon('star', 26)}<div><b>Опыт и золото</b><span>Самоцветы павших дают опыт и золото. Золото тратится в лавке на артефакты. Враги в золотом ореоле роняют ларцы.</span></div></div>
          <div class="help-item">${icon('dice', 26)}<div><b>Волны</b><span>20 волн, каждая сложнее и приводит новых врагов. После волны — выбор даров за набранные уровни, затем лавка торговца.</span></div></div>
          <div class="help-item">${icon('crown', 26)}<div><b>Боссы</b><span>На 10-й и 15-й волне — мини-боссы, на 20-й — один из трёх Владык Предела, у каждого свои приёмы. Красные круги и линии на земле — места будущих ударов: уходи из них.</span></div></div>
          <div class="help-item">${icon('pause', 26)}<div><b>Пауза и звук</b><span>Esc или P — пауза: там описание героя, даров и артефактов, настройки. M — выключить звук.</span></div></div>
        </div>
        <button class="btn btn-primary" data-act="back">Ясно</button>
      </div>`;
    el.querySelector('[data-act=back]').onclick = () => this.click(() => this.show('menu'));
  }

  // ---------- Выбор героя ----------
  buildSelect() {
    const el = $('#screen-select');
    this.screens.select = el;
    el.innerHTML = `
      <div class="select-wrap">
        <div class="select-head">
          <button class="btn btn-ghost btn-sm" data-act="back">← Назад</button>
          <h2>Выбери героя</h2>
          <div class="spacer"></div>
        </div>
        <div class="heroes"></div>
        <div class="hero-detail panel"></div>
      </div>`;
    el.querySelector('[data-act=back]').onclick = () => this.click(() => this.show('menu'));
    const list = $('.heroes', el);
    list.innerHTML = CHARACTERS.map(
      (c, i) => `
      <button class="hero" data-id="${c.id}" style="--c:${c.color};--c2:${c.color2}">
        <span class="hero-key">${i + 1}</span>
        <img class="hero-img" alt="" />
        <span class="hero-name">${c.name}</span>
        <span class="hero-title">${c.title}</span>
      </button>`
    ).join('');
    list.querySelectorAll('.hero').forEach((b) => {
      b.onclick = () => {
        if (this.selected === b.dataset.id) this.startRun();
        else this.selectHero(b.dataset.id);
      };
    });
    this.selectHero(this.selected, true);
  }

  selectHero(id, silent = false) {
    this.selected = id;
    if (!silent) audio.play('ui');
    const el = this.screens.select;
    el.querySelectorAll('.hero').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    const c = charById(id);
    const wid = this.weaponOf(id);
    const rec = this.game.records[id];
    const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div></div>`;
    $('.hero-detail', el).style.setProperty('--c', c.color);
    $('.hero-detail', el).style.setProperty('--c2', c.color2);
    $('.hero-detail', el).innerHTML = `
      <div class="hd-top">
        <div class="hd-preview"></div>
        <div class="hd-info">
          <div class="hd-title">${c.title} · ${c.role}</div>
          <h3>${c.name}</h3>
          <p class="hd-lore">${c.lore}</p>
          <div class="stats">
            ${bar('Здоровье', c.stats.hp)}${bar('Скорость', c.stats.speed)}${bar('Урон', c.stats.damage)}${bar('Сложность', c.stats.difficulty)}
          </div>
        </div>
      </div>
      <div class="sect hd-sect">Оружие похода</div>
      <div class="weapon-pick">${c.weapons.map((w) => this.weaponCard(c, w, w.id === wid)).join('')}</div>
      <div class="hd-abilities two">
        <div class="ab">${icon('star', 22)}<div><b>${c.passive.name}</b><span>${c.passive.desc}</span></div></div>
        <div class="ab ab-main">${icon(c.ability.icon, 22)}<div><b>${c.ability.name} <em>${c.ability.cd} сек.</em></b><span>${c.ability.desc}</span></div></div>
      </div>
      <div class="branches">${c.branches.map((b) => `<div class="branch">${icon(b.icon, 18)}<div><b>Путь: ${b.name}</b><span>${b.desc}</span></div></div>`).join('')}</div>
      <div class="hd-foot">
        <div class="hd-rec">${rec ? `Слава: <b>${formatNum(rec.score)}</b> · волна ${rec.wave || 0}/20${rec.wins ? ` · побед: ${rec.wins}` : ''}` : 'Этим героем ещё не играли'}</div>
        <button class="btn btn-primary" data-act="start">${icon('sword', 20)} В бой</button>
      </div>`;
    $('[data-act=start]', el).onclick = () => this.startRun();
    el.querySelectorAll('.wpn').forEach((b) => (b.onclick = () => {
      if (b.dataset.w === this.weaponOf(id)) return;
      this.weaponSel[id] = b.dataset.w;
      store.set('kurgan_weapons', this.weaponSel);
      audio.play('ui');
      el.querySelectorAll('.wpn').forEach((x) => x.classList.toggle('on', x === b));
      if (this.preview) this.preview.select(id, b.dataset.w, false);
    }));
    if (this.preview) {
      if (!this.weaponThumbs) this.weaponThumbs = {};
      if (!this.weaponThumbs[id]) {
        this.weaponThumbs[id] = this.preview.weaponThumbs(id);
        el.querySelectorAll('.wpn').forEach((b) => {
          const art = b.querySelector('.wpn-art');
          const img = document.createElement('img');
          img.src = this.weaponThumbs[id][b.dataset.w];
          art.prepend(img);
        });
      }
      $('.hd-preview', el).appendChild(this.preview.canvas);
      this.preview.select(id, wid);
    }
  }

  weaponCard(c, w, on) {
    const thumbs = this.weaponThumbs && this.weaponThumbs[c.id];
    const names = ['Урон', 'Скорость', 'Дальность', 'Охват'];
    const bars = w.bars.map((v, i) => `<div class="wbar"><span>${names[i]}</span><div class="wbar-track">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= v ? 'on' : ''}"></i>`).join('')}</div></div>`).join('');
    return `<button class="wpn ${on ? 'on' : ''}" data-w="${w.id}">
      <div class="wpn-art">${thumbs ? `<img src="${thumbs[w.id]}" alt="" />` : ''}<span class="wpn-ico">${icon(w.icon, 18)}</span><span class="wpn-check">${icon('star', 12)} Выбрано</span></div>
      <div class="wpn-body">
        <span class="wpn-style">${w.style}</span>
        <b>${w.name}</b>
        <div class="wbars">${bars}</div>
        <p>${w.desc}</p>
      </div>
    </button>`;
  }

  weaponOf(id) {
    const c = charById(id);
    const w = this.weaponSel[id];
    return c.weapons.some((x) => x.id === w) ? w : c.weapons[0].id;
  }

  // Вызывается после загрузки моделей: портреты для карточек и 3D-превью
  initPreview() {
    this.preview = new HeroPreview();
    const thumbs = this.preview.thumbnails(CHARACTERS.map((c) => c.id));
    this.screens.select.querySelectorAll('.hero').forEach((b) => {
      b.querySelector('.hero-img').src = thumbs[b.dataset.id];
    });
    this.selectHero(this.selected, true);
  }

  startRun() {
    audio.init();
    store.set('kurgan_lastChar', this.selected);
    this.applyAudio();
    audio.play('select');
    this.hideAll();
    this.game.start(this.selected, this.weaponOf(this.selected));
  }

  startPreview() {
    if (this.previewRaf || !this.preview) return;
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      this.preview.frame(dt);
      this.previewRaf = requestAnimationFrame(loop);
    };
    this.previewRaf = requestAnimationFrame(loop);
  }

  stopPreview() {
    cancelAnimationFrame(this.previewRaf);
    this.previewRaf = 0;
  }

  // ---------- HUD ----------
  onRunStart(g) {
    this.hud.classList.remove('hidden');
    const c = g.player.char;
    this.hud.style.setProperty('--c', c.color);
    this.hud.style.setProperty('--c2', c.color2);
    $('#abilityIcon').innerHTML = icon(c.ability.icon, 28);
    $('#abilityName').textContent = c.ability.name;
    this.hudCache = {};
    this.hideBoss();
    this.refreshUpgrades(g);
    $('#toasts').innerHTML = '';
  }

  set(key, val, fn) {
    if (this.hudCache[key] === val) return;
    this.hudCache[key] = val;
    fn(val);
  }

  updateHud(g) {
    if (g.state === 'menu' || !g.player) return;
    const p = g.player;
    const hpPct = Math.max(0, p.hp / p.s.maxHp);
    this.set('hp', Math.round(hpPct * 1000), () => {
      $('#hpFill').style.width = hpPct * 100 + '%';
      $('#hpGhost').style.width = hpPct * 100 + '%';
      this.hud.classList.toggle('low-hp', hpPct < 0.3);
    });
    this.set('hpText', `${Math.ceil(p.hp)} / ${Math.round(p.s.maxHp)}`, (v) => ($('#hpText').textContent = v));
    this.set('xp', Math.round((p.xp / p.xpNext) * 500), (v) => ($('#xpFill').style.width = v / 5 + '%'));
    this.set('lvl', p.level, (v) => {
      $('#lvl').textContent = v;
      $('#lvlBadge').classList.remove('pop');
      void $('#lvlBadge').offsetWidth;
      $('#lvlBadge').classList.add('pop');
    });
    let tl;
    if (g.wavePhase !== 'fight') tl = '✦';
    else if (!isFinite(g.waveDur)) tl = 'БОСС';
    else tl = String(Math.max(0, Math.ceil(g.waveDur - g.waveT)));
    this.set('time', tl, (v) => {
      $('#timer').textContent = v;
      $('#timer').classList.toggle('urgent', /^\d+$/.test(v) && +v <= 5);
    });
    this.set('wave', g.wave + (g.endless ? 'e' : ''), () => ($('#waveLabel').textContent = g.endless ? `Волна ${g.wave} · бесконечность` : `Волна ${g.wave} / 20`));
    const evs = g.event ? g.event.status : '';
    this.set('event', evs + (g.event && g.event.out ? '!' : ''), () => {
      const ei = $('#eventInfo');
      ei.textContent = evs;
      ei.classList.toggle('hidden', !evs);
      ei.classList.toggle('alarm', !!(g.event && g.event.out));
    });
    this.set('gold', g.gold, (v) => ($('#gold').textContent = formatNum(v)));
    this.set('pend', g.pendingLevels + g.pendingChests, (v) => {
      const b = $('#lvlBadge');
      b.dataset.pending = v > 0 ? '+' + v : '';
    });
    this.set('kills', g.stats.kills, (v) => ($('#kills').textContent = formatNum(v)));
    this.set('shield', p.shield ? 1 : p.s.shieldCd ? 0 : -1, (v) => {
      $('#shieldPip').className = 'shield-pip ' + (v === 1 ? 'on' : v === 0 ? 'off' : 'none');
    });
    const cdPct = p.abilityCd > 0 ? p.abilityCd / p.abilityMax : 0;
    this.set('cd', Math.round(cdPct * 100), (v) => {
      $('#ability').style.setProperty('--cd', v / 100);
      $('#ability').classList.toggle('ready', v === 0);
    });
    this.set('cdText', p.abilityCd > 0 ? Math.ceil(p.abilityCd) : '', (v) => ($('#abilityCd').textContent = v));
    const res = KITS[p.char.id].resource(p, g);
    this.set('res', Math.round(res.v * 60) + res.label + (res.active ? 1 : 0), () => {
      $('#resFill').style.width = Math.max(0, Math.min(1, res.v)) * 100 + '%';
      $('#resFill').style.background = res.color;
      $('#resLabel').textContent = res.label;
      $('#res').classList.toggle('active', !!res.active);
    });
  }

  refreshUpgrades(g) {
    const p = g.player;
    const box = $('#upgrades');
    const items = Object.entries(p.upg).map(([id, n]) => {
      const u = upgradeById(id);
      const last = [...p.upgList].reverse().find((c) => c.up.id === id);
      const col = last ? last.rarity.color : '#fff';
      return `<div class="upg" style="--r:${col}" title="${u.name}">${icon(u.icon, 18)}${n > 1 ? `<b>${n}</b>` : ''}</div>`;
    });
    box.innerHTML = items.join('');
  }

  toast(text, color = '#fff') {
    const box = $('#toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.setProperty('--c', color);
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2800);
  }

  showBoss(b) {
    const el = $('#bossbar');
    el.classList.remove('hidden');
    el.style.setProperty('--c', b.bossDef.color);
    el.style.setProperty('--c2', b.bossDef.color2);
    $('#bossName').textContent = b.bossDef.name;
    $('#bossFill').style.width = '100%';
    const warn = $('#bossWarn');
    warn.innerHTML = `<div class="warn-line">${b.bossDef.title}</div><div class="warn-name">${b.bossDef.name}</div>`;
    warn.style.setProperty('--c', b.bossDef.color);
    warn.classList.remove('show');
    void warn.offsetWidth;
    warn.classList.add('show');
  }
  waveBanner(n, total, sub, boss, event) {
    const warn = $('#bossWarn');
    warn.innerHTML = `<div class="warn-line">${event ? 'Особая волна' : boss ? (n === total ? 'Последняя волна' : 'Испытание') : 'Новая волна'}</div><div class="warn-name">Волна ${n}</div><div class="warn-sub">${sub}</div>`;
    warn.style.setProperty('--c', boss ? '#ff5a3a' : '#e8c060');
    warn.classList.remove('show');
    void warn.offsetWidth;
    warn.classList.add('show');
  }

  updateBoss(b) {
    const pct = Math.max(0, b.hp / b.maxHp) * 100;
    $('#bossFill').style.width = pct + '%';
  }
  hideBoss() {
    $('#bossbar').classList.add('hidden');
  }

  // ---------- Выбор баффа ----------
  showLevelUp(g, choices, isChest) {
    this.levelChoices = choices;
    this.levelIsChest = isChest;
    const el = this.screens.levelup;
    const p = g.player;
    el.innerHTML = `
      <div class="lu-wrap ${isChest ? 'chest' : ''}">
        <div class="lu-head">
          <div class="lu-kicker">${isChest ? 'Трофей элиты' : 'Новый уровень'}${g.pendingLevels > 1 && !isChest ? ` · осталось ${g.pendingLevels}` : ''}</div>
          <h2>${isChest ? 'Сундук с сокровищем' : `Уровень ${p.level - g.pendingLevels + 1}`}</h2>
          <div class="ornament"></div>
          <div class="lu-sub">Выбери один дар</div>
        </div>
        <div class="cards"></div>
        <div class="lu-foot">
          <button class="btn btn-ghost btn-sm" data-act="reroll">${this.rerollLabel(g)}</button>
        </div>
      </div>`;
    this.renderCards(choices);
    el.querySelector('[data-act=reroll]').onclick = () => this.doReroll();
    this.show('levelup');
  }

  renderCards(choices) {
    const el = this.screens.levelup;
    const p = this.game.player;
    const box = $('.cards', el);
    box.innerHTML = choices
      .map((c, i) => {
        const u = c.up;
        const have = p.upg[u.id] || 0;
        return `
        <button class="card r-${c.rarity.id}" style="--r:${c.rarity.color};--d:${i * 70}ms" data-i="${i}">
          <span class="card-key">${i + 1}</span>
          <span class="card-rarity">${c.rarity.name}</span>
          <span class="card-icon">${icon(u.icon, 40, 1.8)}</span>
          <span class="card-name">${u.name}</span>
          <span class="card-tag">${u.cap ? '★ Вершина пути · ' : ''}${u.tag}${have ? ` · есть ×${have}` : ''}</span>
          <span class="card-desc">${u.desc(c.mult, p)}</span>
        </button>`;
      })
      .join('');
    box.querySelectorAll('.card').forEach((b) => (b.onclick = () => this.pick(+b.dataset.i)));
    // защита от случайного клика сразу после появления
    this.cardsReadyAt = performance.now() + 350;
  }

  pick(i) {
    if (performance.now() < this.cardsReadyAt) return;
    const c = this.levelChoices && this.levelChoices[i];
    if (!c) return;
    const card = this.screens.levelup.querySelector(`.card[data-i="${i}"]`);
    if (card) card.classList.add('picked');
    const choices = this.levelChoices;
    this.levelChoices = null;
    setTimeout(() => this.game.pickChoice(choices[i], this.levelIsChest), 160);
  }

  doReroll() {
    if (!this.levelChoices) return;
    const nc = this.game.reroll(this.levelIsChest);
    if (!nc) return;
    this.levelChoices = nc;
    this.renderCards(nc);
    this.cardsReadyAt = performance.now() + 150;
    this.screens.levelup.querySelector('[data-act=reroll]').outerHTML = `<button class="btn btn-ghost btn-sm" data-act="reroll">${this.rerollLabel(this.game)}</button>`;
    this.screens.levelup.querySelector('[data-act=reroll]').onclick = () => this.doReroll();
  }

  rerollLabel(g) {
    const price = g.choiceRerollPrice();
    return `${icon('dice', 18)} Перебросить · ${icon('coin', 15)} <b class="${g.gold < price ? 'poor' : ''}">${price}</b> <span class="muted">(${g.gold})</span> <kbd>R</kbd>`;
  }

  hideLevelUp() {
    this.screens.levelup.classList.remove('visible');
    this.current = null;
  }

  // ---------- Пауза ----------
  showPause(g) {
    this.pauseOpenedAt = performance.now();
    this.pauseTab = this.pauseTab || 'hero';
    this.renderPause(g);
    this.show('pause');
  }

  renderPause(g) {
    const el = this.screens.pause;
    const s = g.settings;
    const p = g.player;
    const tabs = [
      ['hero', 'Герой'],
      ['gifts', `Дары (${p.upgList.length})`],
      ['items', `Артефакты (${p.items.length})`],
      ['settings', 'Настройки'],
    ];
    let body = '';
    if (this.pauseTab === 'hero') body = this.heroSheet(p);
    else if (this.pauseTab === 'gifts') body = this.giftList(p);
    else if (this.pauseTab === 'items') body = this.itemList(p);
    else
      body = `
        <label class="row">Эффекты <input type="range" min="0" max="1" step="0.05" value="${s.sfx}" data-k="sfx"></label>
        <label class="row">Музыка <input type="range" min="0" max="1" step="0.05" value="${s.music}" data-k="music"></label>
        <label class="row toggle">Без звука <input type="checkbox" ${s.muted ? 'checked' : ''} data-k="muted"><i></i></label>
        <label class="row toggle">Тряска экрана <input type="checkbox" ${s.shake ? 'checked' : ''} data-k="shake"><i></i></label>
        <label class="row toggle">Числа урона <input type="checkbox" ${s.numbers ? 'checked' : ''} data-k="numbers"><i></i></label>`;
    el.innerHTML = `
      <div class="panel pause-panel">
        <h2>Пауза · волна ${g.wave} / 20</h2>
        <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === this.pauseTab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div>
        <div class="tab-body">${body}</div>
        <div class="pause-btns">
          <button class="btn btn-primary" data-act="resume">Продолжить</button>
          <button class="btn btn-ghost" data-act="quit">Сдаться</button>
        </div>
      </div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => this.click(() => {
      this.pauseTab = b.dataset.tab;
      this.renderPause(g);
    })));
    el.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => {
        const k = inp.dataset.k;
        s[k] = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
        this.applyAudio();
        this.refreshMute();
        g.saveSettings();
      };
    });
    el.querySelector('[data-act=resume]').onclick = () => this.click(() => g.resume());
    el.querySelector('[data-act=quit]').onclick = () =>
      this.click(() => {
        this.hidePause();
        g.state = 'playing';
        g.player.hp = 0;
        g.player.s.revive = 0;
        g.die();
      });
  }

  // Карточка героя: оружие, пассивка, способность и текущие характеристики
  heroSheet(p) {
    const c = p.char, s = p.s;
    const pc = (v) => Math.round(v * 100) + '%';
    const rate = p.weapon.rate * s.rateMult;
    const projs = 1 + s.extraProj;
    const cd = Math.max(0.8, c.ability.cd * s.cdMult);
    const st = [
      ['Здоровье', `${Math.ceil(p.hp)} / ${Math.round(s.maxHp)}`], ['Урон', `${Math.round(this.game.playerDamage())} (${pc(s.dmgMult * p.weaponMult)})`],
      ['Скорость атаки', `${rate.toFixed(1)} / сек.`], ['Снарядов', projs], ['Шанс крита', pc(s.crit)], ['Урон крита', '×' + s.critMult.toFixed(1)],
      ['Броня', pc(s.armor)], ['Регенерация', `${s.regen.toFixed(1)} / сек.`], ['Скорость', pc(s.speedMult)], ['Пробивание', s.pierce],
      ['Перезарядка', `${cd.toFixed(1)} сек.`], ['Радиус сбора', pc(s.magnet)],
    ];
    if (s.dodge > 0) st.push(['Уклонение', pc(s.dodge)]);
    return `
      <div class="sheet" style="--c:${c.color}">
        <div class="sheet-head"><b>${c.name}</b><span>${c.title} · уровень ${p.level}</span></div>
        ${this.gearRow(p, 'weapon')}
        ${this.gearRow(p, 'armor')}
        ${p.forge.ability.lvl ? this.gearRow(p, 'ability') : ''}
        <div class="info-row">${icon('star', 20)}<div><b>${c.passive.name}</b><span>${c.passive.desc}</span></div></div>
        <div class="info-row main">${icon(c.ability.icon, 20)}<div><b>${c.ability.name} · ${cd.toFixed(1)} сек.</b><span>${c.ability.desc} Клавиша Space.</span></div></div>
        <div class="stat-grid">${st.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
        <div class="sect" style="margin-top:14px">Пути развития</div>
        <div class="branches">${c.branches.map((b) => {
          const n = (p.branch && p.branch[b.name]) || 0;
          return `<div class="branch ${n ? 'on' : ''}">${icon(b.icon, 18)}<div><b>${b.name} <em>${n ? `даров: ${n}${n >= 2 ? ' · вершина открыта' : ''}` : 'не выбран'}</em></b><span>${b.desc}</span></div></div>`;
        }).join('')}</div>
      </div>`;
  }

  // Оружие или броня героя: имя по кузне, редкость, ступени направлений и легенды
  gearRow(p, slot) {
    const f = p.forge[slot];
    const r = rarityOf(f.lvl);
    const fams = famsOf(slot);
    const base = slot === 'weapon' ? p.weapon.desc + ' Атакует сама, по ближайшему видимому врагу.' : slot === 'ability' ? p.char.ability.desc : `Базовая броня ${Math.round(p.char.armor.base * 100)}%. Улучшается в кузне у костра.`;
    const steps = Object.entries(f.fams).map(([id, n]) => `<i style="--f:${fams[id].color}">${fams[id].name} ${n}${n >= LEGEND_AT ? ' ★' : ''}</i>`).join('');
    const legends = Object.entries(f.fams).filter(([, n]) => n >= LEGEND_AT).map(([id]) => `<em class="legend">★ ${fams[id].legend.name}: ${fams[id].legend.desc}</em>`).join('');
    const ic = slot === 'weapon' ? p.weapon.icon : slot === 'ability' ? p.char.ability.icon : p.char.armor.icon;
    return `<div class="info-row gear-row" style="--r:${r.color}">${icon(ic, 20)}<div><b>${forgeName(p, slot)} <em>${r.name}${f.lvl ? ` · ступень ${f.lvl}/${MAX_FORGE}` : ''}</em></b><span>${base}</span>${steps ? `<div class="fams">${steps}</div>` : ''}${legends}</div></div>`;
  }

  // Итоговый билд забега: снаряжение, таинства, пути и главные артефакты
  buildSummary(p) {
    const chip = (ic, color, title, sub) => `<div class="bchip" style="--r:${color}">${icon(ic, 16)}<div><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
    const gear = ['weapon', 'armor', 'ability'].filter((sl) => sl !== 'ability' || p.forge.ability.lvl).map((sl) => {
      const f = p.forge[sl];
      const fams = famsOf(sl);
      const ic = sl === 'weapon' ? p.weapon.icon : sl === 'ability' ? p.char.ability.icon : p.char.armor.icon;
      const legends = Object.entries(f.fams).filter(([, n]) => n >= LEGEND_AT).map(([id]) => '★ ' + fams[id].legend.name).join(', ');
      return chip(ic, rarityOf(f.lvl).color, forgeName(p, sl), legends || rarityOf(f.lvl).name);
    });
    const myth = p.upgList.filter((c) => c.up.mythic).map((c) => chip(c.up.icon, '#ff5a8a', c.up.name, 'Таинство'));
    const branches = p.char.branches.filter((b) => p.branch[b.name]).map((b) => chip(b.icon, p.char.color, 'Путь: ' + b.name, `даров: ${p.branch[b.name]}${p.branch[b.name] >= 2 ? ' · вершина' : ''}`));
    const items = Object.entries(p.itemCount).map(([id, n]) => ({ it: itemById(id), n })).sort((a, b) => b.it.tier - a.it.tier).slice(0, 6)
      .map(({ it, n }) => chip(it.icon, TIERS[it.tier].color, it.name + (n > 1 ? ` ×${n}` : ''), ''));
    const sect = (name, arr) => (arr.length ? `<div class="bsect"><em>${name}</em><div class="bchips">${arr.join('')}</div></div>` : '');
    return `<div class="build-sum">${sect('Снаряжение', gear)}${sect('Таинства', myth)}${sect('Пути', branches)}${sect('Артефакты', items)}</div>`;
  }

  giftList(p) {
    if (!p.upgList.length) return '<div class="muted empty">Даров пока нет — они выдаются за уровни после каждой волны.</div>';
    const rows = Object.entries(p.upg).map(([id, n]) => {
      const u = upgradeById(id);
      const picks = p.upgList.filter((c) => c.up.id === id);
      const last = picks[picks.length - 1];
      return `<div class="info-row" style="--r:${last.rarity.color}">${icon(u.icon, 20)}<div><b>${u.name}${n > 1 ? ` ×${n}` : ''} <em>${last.rarity.name}</em></b><span>${picks.map((c) => c.up.desc(c.mult, p)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</span></div></div>`;
    });
    return `<div class="info-list">${rows.join('')}</div>`;
  }

  itemList(p) {
    if (!p.items.length) return '<div class="muted empty">Артефактов пока нет — их продают в лавке между волнами.</div>';
    const rows = Object.entries(p.itemCount).map(([id, n]) => {
      const it = itemById(id);
      const t = TIERS[it.tier];
      return `<div class="info-row" style="--r:${t.color}">${icon(it.icon, 20)}<div><b>${it.name}${n > 1 ? ` ×${n}` : ''} <em>${t.name}</em></b><span>${it.desc}</span></div></div>`;
    });
    return `<div class="info-list">${rows.join('')}</div>`;
  }

  // ---------- Лавка: лобби у костра ----------
  showShop(g) {
    this.shopLine = pickLine(g.wave + 1 === 20 ? LINES.final : g.wave + 1 === 10 || g.wave + 1 === 15 ? LINES.boss : LINES.greet);
    this.gearOpen = false;
    this.hud.classList.add('hidden');
    $('#bossWarn').classList.remove('show');
    $('#toasts').innerHTML = '';
    this.renderShop(g);
    this.show('shop');
    setTimeout(() => g.view && g.view.lobbyEvent('greet'), 250);
  }

  say(g, kind) {
    this.shopLine = pickLine(LINES[kind]);
    const b = $('#shopBubble span', this.screens.shop);
    if (b) {
      b.textContent = this.shopLine;
      const bb = $('#shopBubble', this.screens.shop);
      bb.classList.remove('talk');
      void bb.offsetWidth;
      bb.classList.add('talk');
    }
  }

  renderShop(g) {
    const el = this.screens.shop;
    const p = g.player;
    const rp = g.shopRerollPrice();
    const next = g.wave + 1;
    const nextTxt = next === 20 ? 'финальная битва' : next === 10 || next === 15 ? 'мини-босс' : 'новые враги';
    el.innerHTML = `
      <div class="lobby">
        <div class="lobby-top">
          <div class="lobby-title">
            <div class="lu-kicker">Волна ${g.wave} выстояна · впереди ${next}-я — ${nextTxt}</div>
            <h2>Привал у костра</h2>
          </div>
          <div class="purse">${icon('coin', 22)}<b>${g.gold}</b><span>золота</span></div>
        </div>
        <div class="bubble talk" id="shopBubble"><b>Мортимер, меняла мёртвых</b><span>${this.shopLine}</span></div>
        <div class="gear ${this.gearOpen ? 'open' : ''}">
          <div class="gear-inner">${this.heroSheet(p)}<div class="sect">Артефакты</div>${this.itemList(p)}</div>
        </div>
        <div class="counter">
          ${this.statStrip(g)}
          <div class="wares">
            ${['weapon', 'armor', 'ability'].map((slot) => this.stallHtml(g, slot)).join('')}
            <div class="stall stall-relic">
              <div class="stall-head">${icon('star', 20)}<div><b>Диковины</b><em>артефакты из склепа</em></div></div>
              <div class="stall-items">${g.shopOffers.map((o, i) => (o.kind === 'item' || o.kind === 'heal' ? this.wareHtml(g, o, i) : '')).join('')}</div>
            </div>
          </div>
          <div class="lobby-actions">
            <button class="btn btn-ghost btn-sm" data-act="gear">${icon('shield', 18)} Снаряжение</button>
            <button class="btn btn-ghost btn-sm" data-act="reroll" ${g.gold < rp ? 'disabled' : ''}>${icon('dice', 18)} Другой товар · ${rp === 0 ? 'бесплатно' : `${icon('coin', 15)} ${rp}`}</button>
            <button class="btn btn-primary" data-act="next">${icon('sword', 20)} В путь — волна ${next}</button>
          </div>
        </div>
      </div>`;
    el.querySelectorAll('.buy').forEach((b) => (b.onclick = () => {
      const o = g.shopOffers[+b.dataset.i];
      const before = this.heroStats(g);
      if (g.buyItem(+b.dataset.i)) {
        this.statDelta = { before, t: performance.now() };
        g.view.lobbyEvent('buy');
        this.shopLine = g.lastLegend ? `«${g.lastLegend.name}» пробудилось. Теперь это оружие помнит кровь.` : o.kind === 'forge' ? pickLine(LINES.forge) : pickLine(LINES.buy);
        if (g.lastLegend && o.slot === 'armor') this.shopLine = `«${g.lastLegend.name}» пробудилось. Такую броню не пробить и смерти.`;
        g.lastLegend = null;
        this.refreshUpgrades(g);
        this.renderShop(g);
      }
    }));
    el.querySelectorAll('.ware:not(.can):not(.sold)').forEach((w) => (w.onclick = () => {
      g.view.lobbyEvent('poor');
      this.say(g, 'poor');
    }));
    el.querySelector('[data-act=reroll]').onclick = () => {
      if (g.rerollShop()) {
        g.view.lobbyEvent('reroll');
        this.shopLine = pickLine(LINES.reroll);
        this.renderShop(g);
      } else this.say(g, 'poor');
    };
    el.querySelector('[data-act=next]').onclick = () => this.click(() => g.leaveShop());
    el.querySelector('[data-act=gear]').onclick = () => this.click(() => {
      this.gearOpen = !this.gearOpen;
      el.querySelector('.gear').classList.toggle('open', this.gearOpen);
    });
  }

  // Основные характеристики героя — числами, для сравнения до и после покупки
  heroStats(g) {
    const p = g.player, s = p.s;
    const rate = p.weapon.rate * Math.max(0.2, s.rateMult) * p.mods.rate;
    return [
      { k: 'hp', ic: 'heart', n: 'Здоровье', v: Math.round(s.maxHp), f: (v) => v },
      { k: 'dmg', ic: 'sword', n: 'Урон', v: g.playerDamage(), f: (v) => Math.round(v) },
      { k: 'dps', ic: 'burst', n: 'Урон в сек.', v: g.playerDamage() * rate, f: (v) => Math.round(v) },
      { k: 'rate', ic: 'zap', n: 'Атак в сек.', v: rate, f: (v) => v.toFixed(2) },
      { k: 'crit', ic: 'target', n: 'Крит', v: s.crit, f: (v) => Math.round(v * 100) + '%' },
      { k: 'armor', ic: 'shield', n: 'Броня', v: Math.min(0.8, s.armor), f: (v) => Math.round(v * 100) + '%' },
      { k: 'dodge', ic: 'eye', n: 'Уклонение', v: s.dodge, f: (v) => Math.round(v * 100) + '%' },
      { k: 'regen', ic: 'regen', n: 'Реген', v: s.regen, f: (v) => v.toFixed(1) },
      { k: 'speed', ic: 'wind', n: 'Скорость', v: s.speedMult, f: (v) => Math.round(v * 100) + '%' },
    ];
  }

  statStrip(g) {
    const cur = this.heroStats(g);
    const d = this.statDelta && performance.now() - this.statDelta.t < 400 ? this.statDelta.before : null;
    this.statDelta = null;
    return `<div class="stat-strip">${cur.map((st, i) => {
      const prev = d ? d[i].v : st.v;
      const diff = st.v - prev;
      const up = Math.abs(diff) > 1e-6;
      return `<div class="sstat ${up ? (diff > 0 ? 'up' : 'down') : ''}" title="${st.n}">${icon(st.ic, 15)}<span>${st.n}</span><b>${st.f(st.v)}</b>${up ? `<em>${diff > 0 ? '▲' : '▼'} ${st.f(Math.abs(diff))}</em>` : ''}</div>`;
    }).join('')}</div>`;
  }

  stallHtml(g, slot) {
    const p = g.player;
    const f = p.forge[slot];
    const r = rarityOf(f.lvl);
    const ic = slot === 'weapon' ? p.weapon.icon : slot === 'ability' ? p.char.ability.icon : p.char.armor.icon;
    const cards = g.shopOffers.map((o, i) => (o.kind === 'forge' && o.slot === slot ? this.wareHtml(g, o, i) : '')).join('');
    return `<div class="stall" style="--r:${r.color}">
      <div class="stall-head">${icon(ic, 20)}<div><b>${forgeName(p, slot)}</b><em>${slot === 'weapon' ? 'Оружие' : slot === 'ability' ? 'Способность' : 'Броня'} · ${r.name}${f.lvl ? ` · ${f.lvl}/${MAX_FORGE}` : ''}</em></div></div>
      <div class="stall-items">${cards || '<div class="muted stall-max">Предел мастерства достигнут</div>'}</div>
    </div>`;
  }

  wareHtml(g, o, i) {
    const p = g.player;
    const price = g.offerPrice(o);
    const avail = g.offerAvailable(o);
    const can = avail && g.gold >= price;
    let color, kicker, name, desc, ic;
    if (o.kind === 'forge') {
      const fam = famsOf(o.slot)[o.fam];
      const n = p.forge[o.slot].fams[o.fam] || 0;
      const next = rarityOf(p.forge[o.slot].lvl + 1);
      color = fam.color;
      ic = fam.icon;
      kicker = `${o.slot === 'weapon' ? 'Закалка' : o.slot === 'ability' ? 'Обряд' : 'Укрепление'} · ступень ${n + 1}${n + 1 === LEGEND_AT ? ' · легенда' : ''}`;
      const cur = rarityOf(p.forge[o.slot].lvl);
      name = next !== cur ? `${fam.name} <span class="to" style="color:${next.color}">→ ${next.name}</span>` : fam.name;
      desc = stepDesc(p, o.slot, o.fam);
    } else if (o.kind === 'heal') {
      color = '#ff6a7a';
      ic = 'heart';
      kicker = `Здоровье ${Math.ceil(p.hp)} / ${Math.round(p.s.maxHp)}`;
      name = 'Отвар знахаря';
      desc = 'Восстанавливает 50% здоровья. Между волнами раны заживают лишь наполовину.';
    } else {
      const t = TIERS[o.tier];
      const have = p.itemCount[o.id] || 0;
      color = t.color;
      ic = o.icon;
      kicker = `${t.name}${have ? ` · есть ×${have}` : ''}`;
      name = o.name;
      desc = o.desc;
    }
    return `<div class="ware ${!avail ? 'sold' : ''} ${can ? 'can' : ''}" style="--r:${color};--d:${i * 60}ms">
      <span class="ware-ico">${icon(ic, 24, 1.7)}</span>
      <div class="ware-body"><span class="ware-tier">${kicker}</span><b class="ware-name">${name}</b><p class="ware-desc">${desc}</p></div>
      <button class="seal buy" data-i="${i}" ${!can ? 'disabled' : ''}>${!avail ? (o.kind === 'heal' && !o.sold ? 'Здоров' : 'Куплено') : `${icon('coin', 14)}<b>${price}</b>`}</button>
    </div>`;
  }

  hideShop() {
    this.hud.classList.remove('hidden');
    this.screens.shop.classList.remove('visible');
    this.current = null;
  }

  hidePause() {
    this.screens.pause.classList.remove('visible');
    this.current = null;
  }

  // ---------- Итоги ----------
  showGameOver(g, { score, isRecord }, won = false) {
    this.hud.classList.add('hidden');
    const el = this.screens.over;
    const p = g.player;
    const st = g.stats;
    const cell = (ic, label, val) => `<div class="go-cell">${icon(ic, 20)}<span>${label}</span><b>${val}</b></div>`;
    const boss = won && g.finalBossId ? ` и сразил${p.char.male ? '' : 'а'} ${BOSSES_NAMES[g.finalBossId] || 'Владыку'}` : '';
    el.innerHTML = `
      <div class="panel over-panel ${won ? 'won' : ''}" style="--c:${won ? '#ffc94a' : p.char.color};--c2:${p.char.color2}">
        <div class="lu-kicker">${won ? 'Победа' : 'Поход окончен'}</div>
        <h2>${won ? `${p.char.name} выстоял${p.char.male ? '' : 'а'} все 20 волн${boss}` : `${p.char.name} ${p.char.male ? 'пал' : 'пала'} на волне ${g.wave}`}</h2>
        <div class="ornament"></div>
        <div class="score ${isRecord ? 'record' : ''}">
          <span>${formatNum(score)}</span>
          ${isRecord ? `<em>${icon('crown', 16)} Новая слава</em>` : ''}
        </div>
        <div class="go-grid">
          ${cell('skull', 'Волна', g.endless ? `${g.wave} · ∞` : `${g.wave} / 20`)}
          ${cell('star', 'Уровень', p.level)}
          ${cell('sword', 'Убийств', formatNum(st.kills))}
          ${cell('crown', 'Боссов', st.bosses)}
          ${cell('coin', 'Золота', formatNum(st.goldTotal))}
          ${cell('clock', 'Время', formatTime(g.time))}
        </div>
        ${this.buildSummary(p)}
        <div class="pause-btns">
          ${won ? `<button class="btn btn-primary" data-act="endless">${icon('skull', 18)} Бесконечный поход</button>` : ''}
          <button class="btn ${won ? '' : 'btn-primary'}" data-act="again">${icon('sword', 18)} Снова в бой</button>
          <button class="btn" data-act="hero">Сменить героя</button>
          <button class="btn btn-ghost" data-act="menu">В меню</button>
        </div>
      </div>`;
    el.querySelector('[data-act=again]').onclick = () => this.click(() => this.startRun());
    const en = el.querySelector('[data-act=endless]');
    if (en) en.onclick = () => this.click(() => g.continueEndless());
    el.querySelector('[data-act=hero]').onclick = () => this.click(() => this.toMenu('select'));
    el.querySelector('[data-act=menu]').onclick = () => this.click(() => this.toMenu('menu'));
    this.show('over');
  }

  toMenu(screen) {
    const g = this.game;
    g.state = 'menu';
    g.player = null;
    g.enemies.length = 0;
    g.bullets.length = 0;
    g.projs.length = 0;
    g.gems.length = 0;
    g.pickups.length = 0;
    g.hazards.length = 0;
    g.particles.clear();
    if (g.view) g.view.reset();
    audio.intensity = 0;
    this.hud.classList.add('hidden');
    this.refreshMenu();
    this.selectHero(this.selected, true);
    this.show(screen);
  }
}
