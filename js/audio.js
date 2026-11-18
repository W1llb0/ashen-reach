// Процедурный звук на WebAudio: «живые» инструменты (пэды, хор, арфа, виолончель, лютня,
// военные барабаны, медь, колокола) с общей реверберацией, и звуковые эффекты атак.
// Внешних файлов нет — всё синтезируется.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Аккорды в ре миноре (MIDI): корень и звучание
const CH = {
  Dm: { root: 38, notes: [62, 65, 69] },
  Bb: { root: 34, notes: [58, 62, 65] },
  Gm: { root: 43, notes: [55, 58, 62] },
  A: { root: 45, notes: [57, 61, 64] },
  F: { root: 41, notes: [57, 60, 65] },
  C: { root: 36, notes: [55, 60, 64] },
  Am: { root: 45, notes: [57, 60, 64] },
  Eb: { root: 39, notes: [58, 63, 67] },
};

// Настроения: темп, гармония (по 2 такта на аккорд), слои
const MOODS = {
  0: { bpm: 66, prog: ['Dm', 'Bb', 'Gm', 'A'], bars: 2 }, // меню
  1: { bpm: 108, prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', 'A'], bars: 1 }, // бой
  2: { bpm: 132, prog: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'C', 'A'], bars: 1 }, // босс
  3: { bpm: 84, prog: ['Dm', 'Am', 'Bb', 'C'], bars: 2 }, // привал у костра
};

// Мелодии: [шаг (16-е) в пределах 2 тактов, смещение в полутонах от 62 (D4), длина в шагах]
const MEL = {
  0: [[0, 7, 8], [8, 5, 4], [12, 3, 4], [16, 2, 12], [28, 0, 4]],
  1: [[0, 0, 2], [2, 3, 2], [4, 5, 4], [8, 7, 2], [10, 5, 2], [12, 3, 4], [16, 2, 2], [18, 3, 2], [20, 0, 6], [28, -2, 4]],
  2: [[0, 12, 3], [3, 10, 3], [6, 8, 2], [8, 7, 4], [12, 8, 2], [14, 10, 2], [16, 12, 4], [20, 15, 4], [24, 13, 8]],
  3: [[0, 0, 3], [3, 3, 1], [4, 5, 2], [6, 7, 2], [8, 5, 4], [12, 3, 2], [14, 2, 2], [16, 0, 6], [24, 2, 2], [26, 3, 2], [28, 5, 4]],
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVolume = 0.6;
    this.musicVolume = 0.45;
    this.last = Object.create(null);
    this.intensity = 0;
    this.mood = 0;
    this.musicOn = false;
    this.muted = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // реверберация — сгенерированный импульс большого каменного зала
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.4, 2.6);
    this.revIn = ctx.createGain();
    this.revIn.gain.value = 1;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.85;
    this.revIn.connect(this.reverb);
    this.reverb.connect(revOut);
    revOut.connect(this.master);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.14;
    this.sfx.connect(sfxSend);
    sfxSend.connect(this.revIn);

    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.music.connect(this.master);
    this.musicDry = ctx.createGain();
    this.musicDry.gain.value = 0.8;
    this.musicDry.connect(this.music);
    this.musicWet = ctx.createGain();
    this.musicWet.gain.value = 0.55;
    this.musicWet.connect(this.revIn);
    // общая точка входа музыки: сухой сигнал + посыл в реверб
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.musicDry);
    this.musicBus.connect(this.musicWet);
    // реверб громкость следует за громкостью музыки
    this.musicWetLevel = ctx.createGain();

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.distCurve = this.makeCurve(3);
    if (this.musicOn) this.startMusic();
  }

  makeIR(sec, decay) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // ранние отражения + плотный хвост
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.02 ? 1 : 0;
        ch[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay) + early * 0.5) * (1 - Math.exp(-i / 200));
      }
    }
    return buf;
  }

  makeCurve(k) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return c;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfx) this.sfx.gain.value = v;
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.music) {
      this.music.gain.value = v;
      this.musicWet.gain.value = 0.55 * Math.min(1, v / 0.45);
    }
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.75, this.ctx.currentTime, 0.03);
  }

  throttle(name, gap) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < gap * 1000) return false;
    this.last[name] = now;
    return true;
  }

  // ---------- Строительные блоки ----------
  env(g, t, a, peak, dur, rel = 0.05) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur - rel), rel / 3 + 0.01);
  }

  tone({ f = 440, f2 = null, dur = 0.1, type = 'sine', vol = 0.1, attack = 0.005, delay = 0, out = null, detune = 0, q = 0, lp = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = lp;
      fl.Q.value = q;
      o.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, vol = 0.1, freq = 1000, f2 = null, q = 1, type = 'lowpass', delay = 0, out = null, attack = 0.002 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(out || this.sfx);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // металлический звон (колокол, щит, монета)
  bell(f, t, vol, decay = 2.2, out = null) {
    const parts = [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]];
    for (const [m, a] of parts) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol * a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / Math.sqrt(m));
      o.connect(g);
      g.connect(out || this.sfx);
      o.start(t);
      o.stop(t + decay + 0.1);
    }
  }

  // ---------- Инструменты музыки ----------
  pad(notes, t, dur, vol) {
    const ctx = this.ctx;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.setValueAtTime(500, t);
    fl.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    fl.frequency.linearRampToValueAtTime(600, t + dur);
    fl.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
    fl.connect(g);
    g.connect(this.musicBus);
    for (const m of notes)
      for (const dt of [-11, 0, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = dt;
        o.connect(fl);
        o.start(t);
        o.stop(t + dur + 1);
      }
  }

  choir(m, t, dur, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.7);
    g.gain.setValueAtTime(vol, t + Math.max(0.8, dur - 0.6));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 760;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1180;
    f2.Q.value = 7;
    const mix = ctx.createGain();
    mix.gain.value = 2.4;
    f1.connect(mix);
    f2.connect(mix);
    mix.connect(g);
    g.connect(this.musicBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    for (const [mm, dt] of [[m, -7], [m, 6], [m - 12, 0]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(mm);
      o.detune.value = dt;
      lg.connect(o.detune);
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + dur + 0.8);
    }
    lfo.start(t);
    lfo.stop(t + dur + 0.8);
  }

  harp(m, t, vol) {
    this.tone({ f: mtof(m), dur: 1.8, type: 'triangle', vol, attack: 0.003, delay: t - this.ctx.currentTime, out: this.musicBus, lp: 3200 });
    this.tone({ f: mtof(m + 12), dur: 0.9, type: 'sine', vol: vol * 0.35, attack: 0.002, delay: t - this.ctx.currentTime, out: this.musicBus });
  }

  lute(m, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = mtof(m) * 1.002;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = 3;
    fl.frequency.setValueAtTime(3800, t);
    fl.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    o.connect(fl);
    o2.connect(g2);
    g2.connect(fl);
    fl.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.2);
    o2.stop(t + 1.2);
  }

  cello(m, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = 1.5;
    fl.frequency.setValueAtTime(400, t);
    fl.frequency.linearRampToValueAtTime(1300, t + 0.05);
    fl.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(fl);
    fl.connect(g);
    g.connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.12);
  }

  brass(notes, t, dur, vol) {
    const ctx = this.ctx;
    const ws = ctx.createWaveShaper();
    ws.curve = this.distCurve;
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = 2;
    fl.frequency.setValueAtTime(250, t);
    fl.frequency.exponentialRampToValueAtTime(2200, t + 0.08);
    fl.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
    ws.connect(fl);
    fl.connect(g);
    g.connect(this.musicBus);
    for (const m of notes)
      for (const dt of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = dt;
        o.connect(ws);
        o.start(t);
        o.stop(t + dur + 0.25);
      }
  }

  drum(t, vol, deep = true) {
    const delay = t - this.ctx.currentTime;
    this.tone({ f: deep ? 95 : 170, f2: deep ? 40 : 85, dur: deep ? 0.5 : 0.25, type: 'sine', vol, attack: 0.002, delay, out: this.music });
    this.noise({ dur: deep ? 0.16 : 0.08, vol: vol * 0.5, freq: deep ? 500 : 1200, type: 'lowpass', delay, out: this.musicBus });
  }

  // ---------- Сэмплер-секвенсор ----------
  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    if (on) this.startMusic();
    else this.stopMusic();
  }
  startMusic() {
    if (this.timer || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextTime < ctx.currentTime + 0.15) {
      // смена настроения — только на начале такта, чтобы переход был музыкальным
      if (this.step % 16 === 0 && this.mood !== this.intensity) {
        this.mood = this.intensity;
        this.step = 0;
      }
      const M = MOODS[this.mood] || MOODS[0];
      const sd = 60 / M.bpm / 4;
      this.playStep(this.step, this.nextTime, sd, M);
      this.nextTime += sd;
      this.step++;
    }
  }

  playStep(step, t, sd, M) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chordName = M.prog[Math.floor(bar / M.bars) % M.prog.length];
    const ch = CH[chordName];
    const mood = this.mood;
    const chordStart = s === 0 && bar % M.bars === 0;
    const chordDur = sd * 16 * M.bars;
    const mel = MEL[mood];
    const phraseStep = step % 32;
    const playMel = mood === 0 ? bar % 4 >= 2 : mood === 3 ? true : bar % 4 >= 2;

    if (mood === 0) {
      // меню: тёмный пэд, хор, редкая арфа, колокол
      if (chordStart) {
        this.pad(ch.notes.map((n) => n - 12), t, chordDur, 0.022);
        this.choir(ch.notes[2], t, chordDur * 0.95, 0.05);
        this.tone({ f: mtof(ch.root), dur: chordDur, type: 'sine', vol: 0.09, attack: 1, delay: t - this.ctx.currentTime, out: this.musicBus });
        if (bar % 4 === 0) this.bell(mtof(ch.notes[0] + 12), t, 0.05, 3.5, this.musicBus);
      }
      if (s % 4 === 0 && Math.random() < 0.6) this.harp(ch.notes[(s / 4) % 3] + (s >= 8 ? 12 : 0), t, 0.05);
    } else if (mood === 1 || mood === 2) {
      const boss = mood === 2;
      if (chordStart) {
        this.pad(ch.notes.map((n) => n - 12), t, chordDur, boss ? 0.018 : 0.014);
        if (bar % 2 === 0) this.choir(ch.notes[boss ? 2 : 1], t, chordDur * (boss ? 1.9 : 1.8), boss ? 0.05 : 0.032);
      }
      // остинато виолончели
      const pat = boss ? [0, 0, 7, 0, 12, 0, 7, 10, 0, 0, 7, 0, 12, 10, 7, 3] : [0, null, 0, 7, null, 0, 12, null, 0, null, 0, 7, null, 10, 7, null];
      const n = pat[s];
      if (n != null && (boss || s % 1 === 0)) this.cello(ch.root + 12 + n, t, sd * (boss ? 0.9 : 1.6), boss ? 0.05 : 0.045);
      // военные барабаны
      const deep = boss ? [0, 3, 6, 8, 10, 11, 14] : [0, 6, 8, 11];
      if (deep.includes(s)) this.drum(t, s === 0 || s === 8 ? 0.32 : 0.2, true);
      if (s === 4 || s === 12) this.drum(t, boss ? 0.2 : 0.14, false);
      if (s % 2 === 1 && (boss || s % 4 === 3)) this.noise({ dur: 0.04, vol: 0.04, freq: 7000, type: 'highpass', delay: t - this.ctx.currentTime, out: this.music });
      if (boss && (s === 0 || s === 8) && bar % 2 === 0) this.brass(ch.notes.map((x) => x - 12), t, sd * 6, 0.05);
      // мелодия арфой/хором поверх
      if (playMel) for (const [st, off, len] of mel) if (st === phraseStep) {
        if (boss) this.brass([62 + off], t, sd * len, 0.03);
        else this.harp(62 + off, t, 0.06);
      }
    } else if (mood === 3) {
      // привал: лютня, тихий барабан, треск костра
      if (chordStart) {
        this.pad(ch.notes.map((n) => n - 12), t, chordDur, 0.01);
        this.tone({ f: mtof(ch.root), dur: chordDur, type: 'sine', vol: 0.06, attack: 0.8, delay: t - this.ctx.currentTime, out: this.musicBus });
      }
      const arp = [0, 1, 2, 1, 0, 2, 1, 2];
      if (s % 2 === 0) this.lute(ch.notes[arp[(s / 2) % 8]] - 12, t, 0.045);
      if (playMel) for (const [st, off, len] of mel) if (st === phraseStep) this.lute(62 + off, t, 0.06);
      if (s === 0 || s === 10) this.drum(t, 0.08, false);
      if (Math.random() < 0.35) this.noise({ dur: 0.02 + Math.random() * 0.04, vol: 0.02 + Math.random() * 0.03, freq: 2500 + Math.random() * 3000, type: 'bandpass', q: 2, delay: t - this.ctx.currentTime + Math.random() * sd, out: this.music });
    }
  }

  // ---------- Звуковые эффекты ----------
  play(name, opt = {}) {
    if (!this.ctx || this.sfxVolume <= 0 || this.muted) return;
    const ctx = this.ctx;
    switch (name) {
      case 'swing':
        if (!this.throttle('swing', 0.06)) return;
        this.noise({ dur: 0.22, vol: opt.heavy ? 0.16 : 0.1, freq: 2400, f2: 300, type: 'bandpass', q: 1.6 });
        this.tone({ f: 140, f2: 60, dur: 0.15, type: 'sine', vol: 0.06 });
        break;
      case 'slashHit':
        if (!this.throttle('slashHit', 0.05)) return;
        this.noise({ dur: 0.12, vol: 0.16, freq: 900, f2: 200, type: 'lowpass' });
        this.tone({ f: 180, f2: 70, dur: 0.12, type: 'triangle', vol: 0.1 });
        break;
      case 'bow':
        if (!this.throttle('bow', 0.06)) return;
        this.tone({ f: opt.heavy ? 140 : 210, f2: opt.heavy ? 90 : 150, dur: 0.12, type: 'triangle', vol: opt.heavy ? 0.09 : 0.05 });
        this.noise({ dur: 0.18, vol: 0.06, freq: 4000, f2: 1500, type: 'bandpass', q: 2, delay: 0.01 });
        break;
      case 'arrowHit':
        if (!this.throttle('arrowHit', 0.04)) return;
        this.noise({ dur: 0.06, vol: 0.08, freq: 1800, type: 'bandpass', q: 3 });
        this.tone({ f: 320, f2: 160, dur: 0.06, type: 'square', vol: 0.025 });
        break;
      case 'zap':
        if (!this.throttle('zap', 0.05)) return;
        this.noise({ dur: 0.12, vol: opt.sky ? 0.2 : 0.14, freq: 5000, f2: 1200, type: 'highpass' });
        this.tone({ f: 1400, f2: 180, dur: 0.12, type: 'sawtooth', vol: 0.035 });
        if (opt.sky) this.noise({ dur: 0.7, vol: 0.12, freq: 300, f2: 80, type: 'lowpass', delay: 0.04 });
        break;
      case 'thunder':
        this.noise({ dur: 0.2, vol: 0.25, freq: 6000, f2: 900, type: 'highpass' });
        this.noise({ dur: 1.4, vol: 0.28, freq: 400, f2: 50, type: 'lowpass', delay: 0.03 });
        this.tone({ f: 70, f2: 30, dur: 1, type: 'sine', vol: 0.2 });
        break;
      case 'fireWave':
        if (!this.throttle('fireWave', 0.1)) return;
        this.noise({ dur: 0.5, vol: 0.18, freq: 400, f2: 2500, type: 'bandpass', q: 0.8 });
        this.noise({ dur: 0.3, vol: 0.08, freq: 3000, type: 'highpass', delay: 0.1 });
        break;
      case 'holy':
        if (!this.throttle('holy', 0.08)) return;
        [76, 81, 88].forEach((m, i) => this.bell(mtof(m), ctx.currentTime + i * 0.025, 0.035, 1.2));
        this.noise({ dur: 0.35, vol: 0.05, freq: 6000, f2: 3000, type: 'highpass' });
        break;
      case 'soul':
        if (!this.throttle('soul', 0.08)) return;
        this.tone({ f: 520, f2: 390, dur: 0.35, type: 'sine', vol: 0.05, attack: 0.04 });
        this.tone({ f: 523, f2: 392, dur: 0.35, type: 'sine', vol: 0.04, attack: 0.04, detune: 18 });
        break;
      case 'raise':
        if (!this.throttle('raise', 0.12)) return;
        this.noise({ dur: 0.4, vol: 0.12, freq: 300, f2: 1200, type: 'bandpass', q: 1 });
        for (let i = 0; i < 5; i++) this.noise({ dur: 0.03, vol: 0.06, freq: 2500, type: 'bandpass', q: 4, delay: 0.05 + i * 0.05 });
        break;
      case 'boneBreak':
        if (!this.throttle('bone', 0.06)) return;
        for (let i = 0; i < 4; i++) this.noise({ dur: 0.03, vol: 0.09, freq: 1800 + i * 400, type: 'bandpass', q: 5, delay: i * 0.035 });
        break;
      case 'summon':
        this.tone({ f: 55, dur: 1.6, type: 'sawtooth', vol: 0.12, attack: 0.3, lp: 400 });
        [50, 53, 57].forEach((m) => this.tone({ f: mtof(m), dur: 1.4, type: 'sawtooth', vol: 0.03, attack: 0.4, lp: 1200 }));
        this.noise({ dur: 1, vol: 0.12, freq: 200, f2: 1600, type: 'bandpass' });
        break;
      case 'trap':
        this.noise({ dur: 0.3, vol: 0.2, freq: 1500, f2: 150 });
        this.bell(900, ctx.currentTime, 0.05, 0.4);
        break;
      case 'block':
        if (!this.throttle('block', 0.06)) return;
        this.bell(620 + Math.random() * 60, ctx.currentTime, 0.07, 0.7);
        this.noise({ dur: 0.05, vol: 0.1, freq: 3000, type: 'highpass' });
        break;
      case 'whirl':
        this.noise({ dur: 2.2, vol: 0.14, freq: 500, f2: 1800, type: 'bandpass', q: 2, attack: 0.2 });
        this.tone({ f: 90, f2: 140, dur: 2, type: 'sawtooth', vol: 0.05, lp: 500 });
        break;
      case 'rage':
        this.tone({ f: 80, f2: 160, dur: 0.6, type: 'sawtooth', vol: 0.12, lp: 900 });
        this.noise({ dur: 0.6, vol: 0.16, freq: 800, f2: 200 });
        break;
      case 'judge':
        [74, 79, 86, 91].forEach((m, i) => this.bell(mtof(m), ctx.currentTime + i * 0.04, 0.06, 2));
        this.noise({ dur: 0.8, vol: 0.12, freq: 200, f2: 60 });
        break;
      case 'volley':
        for (let i = 0; i < 6; i++) this.noise({ dur: 0.15, vol: 0.05, freq: 4000, f2: 1200, type: 'bandpass', q: 2, delay: i * 0.05 });
        break;
      case 'hit':
        if (!this.throttle('hit', 0.04)) return;
        this.noise({ dur: 0.06, vol: 0.08, freq: 1200, f2: 300 });
        this.tone({ f: 220, f2: 110, dur: 0.06, type: 'triangle', vol: 0.05 });
        break;
      case 'crit':
        if (!this.throttle('crit', 0.06)) return;
        this.noise({ dur: 0.1, vol: 0.12, freq: 2500, f2: 600, type: 'bandpass', q: 1.5 });
        this.bell(1500, ctx.currentTime, 0.03, 0.3);
        break;
      case 'kill':
        if (!this.throttle('kill', 0.04)) return;
        this.noise({ dur: 0.16, vol: 0.1, freq: 1600, f2: 250, type: 'bandpass', q: 1.2 });
        this.tone({ f: 130, f2: 50, dur: 0.14, type: 'sine', vol: 0.08 });
        break;
      case 'explode':
        if (!this.throttle('explode', 0.06)) return;
        this.noise({ dur: 0.6, vol: 0.24, freq: 1400, f2: 60 });
        this.tone({ f: 110, f2: 30, dur: 0.5, type: 'sine', vol: 0.2 });
        break;
      case 'hurt':
        this.tone({ f: 200, f2: 60, dur: 0.3, type: 'sawtooth', vol: 0.12, lp: 900 });
        this.noise({ dur: 0.25, vol: 0.18, freq: 700, f2: 120 });
        break;
      case 'shieldBlock':
        this.bell(440, ctx.currentTime, 0.08, 1.4);
        this.bell(660, ctx.currentTime + 0.03, 0.05, 1.2);
        break;
      case 'xp': {
        if (!this.throttle('xp', 0.03)) return;
        const f = 1500 + Math.min(opt.combo || 0, 30) * 40;
        this.tone({ f, dur: 0.08, type: 'sine', vol: 0.035 });
        this.tone({ f: f * 1.5, dur: 0.06, type: 'sine', vol: 0.02, delay: 0.02 });
        break;
      }
      case 'graze':
        if (!this.throttle('graze', 0.06)) return;
        this.tone({ f: 2800, f2: 3400, dur: 0.03, type: 'sine', vol: 0.015 });
        break;
      case 'levelup': {
        const t = ctx.currentTime;
        [62, 69, 74, 77, 81].forEach((m, i) => this.bell(mtof(m + 12), t + i * 0.07, 0.05, 2));
        [62, 65, 69].forEach((m) => this.tone({ f: mtof(m), dur: 1.2, type: 'sawtooth', vol: 0.02, attack: 0.3, lp: 1500 }));
        break;
      }
      case 'select':
        [74, 81].forEach((m, i) => this.bell(mtof(m), ctx.currentTime + i * 0.05, 0.05, 1.2));
        break;
      case 'ui':
        if (!this.throttle('ui', 0.04)) return;
        this.tone({ f: 900, f2: 700, dur: 0.05, type: 'triangle', vol: 0.04 });
        break;
      case 'hover':
        if (!this.throttle('hover', 0.05)) return;
        this.tone({ f: 1600, dur: 0.025, type: 'sine', vol: 0.012 });
        break;
      case 'ability':
        this.noise({ dur: 0.5, vol: 0.16, freq: 300, f2: 3000, type: 'bandpass', q: 2 });
        break;
      case 'dash':
        this.noise({ dur: 0.22, vol: 0.14, freq: 800, f2: 5000, type: 'bandpass', q: 1.5 });
        break;
      case 'timestop':
        this.tone({ f: 700, f2: 80, dur: 1.2, type: 'sine', vol: 0.16 });
        this.bell(mtof(86), ctx.currentTime, 0.05, 3);
        this.tone({ f: 1053, f2: 120, dur: 1.2, type: 'triangle', vol: 0.05 });
        break;
      case 'boss': {
        const t = ctx.currentTime;
        // рёв чудовища
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(70, t);
        o.frequency.linearRampToValueAtTime(48, t + 1.6);
        const ws = ctx.createWaveShaper();
        ws.curve = this.distCurve;
        const fl = ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = 700;
        const g = ctx.createGain();
        this.env(g, t, 0.15, 0.22, 1.8, 0.6);
        o.connect(ws);
        ws.connect(fl);
        fl.connect(g);
        g.connect(this.sfx);
        o.start(t);
        o.stop(t + 2.2);
        this.noise({ dur: 1.6, vol: 0.18, freq: 500, f2: 120, attack: 0.1 });
        for (let i = 0; i < 3; i++) this.drum(t + i * 0.42, 0.35, true);
        break;
      }
      case 'bossDie':
        this.noise({ dur: 2, vol: 0.3, freq: 2500, f2: 50 });
        this.tone({ f: 150, f2: 30, dur: 1.6, type: 'sawtooth', vol: 0.16, lp: 800 });
        [62, 66, 69, 74, 78].forEach((m, i) => this.bell(mtof(m + 12), ctx.currentTime + 0.6 + i * 0.09, 0.06, 2.5));
        break;
      case 'chest':
        [69, 74, 78, 81, 86].forEach((m, i) => this.bell(mtof(m), ctx.currentTime + i * 0.05, 0.05, 1.4));
        break;
      case 'heal':
        this.tone({ f: 500, f2: 1000, dur: 0.35, type: 'sine', vol: 0.08 });
        this.bell(mtof(86), ctx.currentTime + 0.05, 0.03, 1);
        break;
      case 'gameover': {
        const t = ctx.currentTime;
        [62, 58, 55, 50].forEach((m, i) => this.tone({ f: mtof(m), dur: 1.2, type: 'sawtooth', vol: 0.05, attack: 0.05, delay: i * 0.35, lp: 1100 }));
        this.drum(t, 0.3, true);
        break;
      }
      case 'revive':
        [62, 69, 74, 81, 86].forEach((m, i) => this.bell(mtof(m), ctx.currentTime + i * 0.08, 0.06, 2));
        break;
      case 'shoot':
        break;
    }
  }
}

export const audio = new AudioEngine();
