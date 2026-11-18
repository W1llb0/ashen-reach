// Кузня Мортимера: оружие и броню героя улучшают за золото в разные стороны.
// Каждая ступень даёт базовый прирост и свойство выбранного направления.
// Три ступени одного направления открывают его легендарное свойство.
import { weightedPick } from './util.js';

export const MAX_FORGE = 9;
export const LEGEND_AT = 3;

export const FORGE_RARITY = [
  { name: 'Обычное', color: '#c9b48e' },
  { name: 'Редкое', color: '#5aaee8' },
  { name: 'Эпическое', color: '#b582ff' },
  { name: 'Легендарное', color: '#ffc94a' },
];
export const rarityIndex = (lvl) => (lvl >= 7 ? 3 : lvl >= 4 ? 2 : lvl >= 2 ? 1 : 0);
export const rarityOf = (lvl) => FORGE_RARITY[rarityIndex(lvl)];

const s = (p) => p.s;

// Направления для оружия
export const WEAPON_FAMS = {
  fire: {
    name: 'Пламя', gen: 'Пламени', icon: 'flame', color: '#ff7a30',
    step: '+10% шанса поджечь, поджог сильнее на 20%',
    apply: (p) => { s(p).ignite += 0.1; s(p).burnMult += 0.2; },
    legend: { name: 'Погребальный жар', desc: 'Горящие враги взрываются при смерти' },
    legendApply: (p) => (p.flags.pyre = true),
  },
  frost: {
    name: 'Стужа', gen: 'Стужи', icon: 'snow', color: '#8fe0ff',
    step: '+9% шанса замедлить врага',
    apply: (p) => (s(p).frost += 0.09),
    legend: { name: 'Вечная мерзлота', desc: 'Замедленные враги получают на 30% больше урона' },
    legendApply: (p) => (p.flags.permafrost = true),
  },
  storm: {
    name: 'Гроза', gen: 'Грозы', icon: 'chain', color: '#a8c8ff',
    step: '+8% шанса ударить цепной молнией',
    apply: (p) => (s(p).chain += 0.08),
    legend: { name: 'Гнев небес', desc: 'Каждые 2.5 сек. молния с неба бьёт ближайшего врага (×3 урона)' },
    legendApply: (p) => (p.flags.skyWrath = true),
  },
  blood: {
    name: 'Кровь', gen: 'Крови', icon: 'drop', color: '#ff4a5a',
    step: '+4% шанса крита, +15% урона критов',
    apply: (p) => { s(p).crit += 0.04; s(p).critMult += 0.15; },
    legend: { name: 'Жажда', desc: 'Критические удары лечат на 1% макс. здоровья' },
    legendApply: (p) => (p.flags.thirst = true),
  },
  might: {
    name: 'Сила', gen: 'Силы', icon: 'burst', color: '#ffb060',
    step: '+9% урона, +5% размера атак',
    apply: (p) => { s(p).dmgMult += 0.09; s(p).size += 0.05; },
    legend: { name: 'Сокрушение', desc: '+35% урона по элитным врагам и боссам' },
    legendApply: (p) => (p.flags.crush = true),
  },
  swift: {
    name: 'Ветер', gen: 'Ветра', icon: 'wind', color: '#b8ffd0',
    step: '+9% скорости атаки, +3% скорости движения',
    apply: (p) => { s(p).rateMult += 0.09; s(p).speedMult += 0.03; },
    legend: { name: 'Эхо удара', desc: 'Каждая 4-я атака повторяется' },
    legendApply: (p) => (p.flags.echoAttack = true),
  },
};

// Направления для брони
export const ARMOR_FAMS = {
  plate: {
    name: 'Твердь', gen: 'Тверди', icon: 'shield', color: '#c8c0b0',
    step: '+5% брони, +12 к здоровью, −2% скорости',
    apply: (p) => { s(p).armor = Math.min(0.7, s(p).armor + 0.05); s(p).maxHp += 12; p.hp += 12; s(p).speedMult -= 0.02; },
    legend: { name: 'Несокрушимость', desc: 'Один удар снимает не больше 20% макс. здоровья' },
    legendApply: (p) => (p.flags.unbreakable = true),
  },
  shadow: {
    name: 'Тень', gen: 'Тени', icon: 'eye', color: '#a890ff',
    step: '+5% шанса уклониться, +4% скорости',
    apply: (p) => { s(p).dodge = Math.min(0.5, s(p).dodge + 0.05); s(p).speedMult += 0.04; },
    legend: { name: 'Шаг в сумрак', desc: 'После уклонения 2 сек. +30% урона' },
    legendApply: (p) => (p.flags.dusk = true),
  },
  thorns: {
    name: 'Шипы', gen: 'Шипов', icon: 'spikes', color: '#d6ff6b',
    step: 'Получая удар, ранит врагов вокруг (+80% урона героя)',
    apply: (p) => (s(p).thorns += 0.8),
    legend: { name: 'Железная дева', desc: 'Получая удар, выпускает кольцо из 18 шипов' },
    legendApply: (p) => (s(p).retaliate = 1),
  },
  rune: {
    name: 'Руны', gen: 'Рун', icon: 'hexshield', color: '#8cf0ff',
    step: 'Руна-щит поглощает удар (восстановление −2 сек.), −5% перезарядки способности',
    apply: (p) => { s(p).shieldCd = s(p).shieldCd ? Math.max(4, s(p).shieldCd - 2) : 14; p.shield = 1; s(p).cdMult *= 0.95; },
    legend: { name: 'Рунная вспышка', desc: 'Разбитая руна взрывается и отбрасывает врагов' },
    legendApply: (p) => (p.flags.runeBurst = true),
  },
  life: {
    name: 'Жизнь', gen: 'Жизни', icon: 'regen', color: '#7dff9a',
    step: '+0.4 HP в секунду, +15 к здоровью',
    apply: (p) => { s(p).regen += 0.4; s(p).maxHp += 15; p.hp += 15; },
    legend: { name: 'Второе дыхание', desc: 'Ниже 35% здоровья регенерация ×4' },
    legendApply: (p) => (p.flags.secondWind = true),
  },
};

export const famsOf = (slot) => (slot === 'weapon' ? WEAPON_FAMS : ARMOR_FAMS);

export function newForge() {
  return { weapon: { lvl: 0, fams: {} }, armor: { lvl: 0, fams: {} } };
}

// Ведущее направление — по нему называется предмет
export function mainFam(slot, f) {
  let best = null, bn = 0;
  for (const [id, n] of Object.entries(f.fams)) if (n > bn) { bn = n; best = id; }
  return best ? famsOf(slot)[best] : null;
}

export function forgeName(p, slot) {
  const f = p.forge[slot];
  const base = slot === 'weapon' ? p.weapon.name : p.char.armor.name;
  const m = mainFam(slot, f);
  return m ? `${base} ${m.gen} +${f.lvl}` : base;
}

export function forgePrice(lvl, wave) {
  return Math.round((20 + lvl * 15) * (1 + (wave - 1) * 0.04));
}

// Два направления на выбор; уже начатые предлагаются чаще
export function rollForge(p, slot, count = 2) {
  const f = p.forge[slot];
  if (f.lvl >= MAX_FORGE) return [];
  const ids = Object.keys(famsOf(slot));
  const out = [];
  for (let i = 0; i < count; i++) {
    const pool = ids.filter((id) => !out.includes(id));
    const id = weightedPick(pool, (id) => {
      const n = f.fams[id] || 0;
      return n >= LEGEND_AT ? 1.6 : n > 0 ? 2.6 : 1.2;
    });
    if (id) out.push(id);
  }
  return out;
}

// Ступень кузни. Возвращает легендарное свойство, если оно только что открылось.
export function forgeStep(p, slot, famId) {
  const f = p.forge[slot];
  const fam = famsOf(slot)[famId];
  f.lvl++;
  f.fams[famId] = (f.fams[famId] || 0) + 1;
  if (slot === 'weapon') p.weaponMult = 1 + 0.07 * f.lvl;
  else {
    s(p).maxHp += 8;
    p.hp += 8;
  }
  fam.apply(p);
  if (f.fams[famId] === LEGEND_AT) {
    fam.legendApply(p);
    return fam.legend;
  }
  return null;
}

// Описание ступени для карточки в лавке
export function stepDesc(p, slot, famId) {
  const fam = famsOf(slot)[famId];
  const n = p.forge[slot].fams[famId] || 0;
  const base = slot === 'weapon' ? '+7% урона оружия' : '+8 к здоровью';
  let txt = `${base}; ${fam.step}.`;
  if (n + 1 === LEGEND_AT) txt += ` Откроет: «${fam.legend.name}» — ${fam.legend.desc.toLowerCase()}.`;
  return txt;
}
