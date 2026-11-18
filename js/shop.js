// Диковины лавки: артефакты за золото (рядом с кузней оружия и брони). У сильных бывают изъяны.
import { weightedPick } from './util.js';
import { ownsUnique } from './upgrades.js';

export const TIERS = {
  1: { name: 'Обычный', color: '#c9b48e', base: 14 },
  2: { name: 'Редкий', color: '#5aaee8', base: 30 },
  3: { name: 'Эпический', color: '#b582ff', base: 58 },
  4: { name: 'Легендарный', color: '#ffc94a', base: 95 },
};

const s = (p) => p.s;
export const ITEMS = [
  // I
  { id: 'whetstone', tier: 1, name: 'Точильный камень', icon: 'sword', desc: '+8% урона', apply: (p) => (s(p).dmgMult += 0.08) },
  { id: 'boots', tier: 1, name: 'Сапоги странника', icon: 'wind', desc: '+6% скорости движения', apply: (p) => (s(p).speedMult += 0.06) },
  { id: 'balm', tier: 1, name: 'Целебный бальзам', icon: 'regen', desc: '+0.5 HP в секунду', apply: (p) => (s(p).regen += 0.5) },
  { id: 'amulet', tier: 1, name: 'Медный амулет', icon: 'heart', desc: '+15 к макс. здоровью', apply: (p) => { s(p).maxHp += 15; p.hp += 15; } },
  { id: 'quiver', tier: 1, name: 'Лёгкая перевязь', icon: 'zap', desc: '+8% скорости атаки', apply: (p) => (s(p).rateMult += 0.08) },
  { id: 'lens', tier: 1, name: 'Линза ювелира', icon: 'target', desc: '+5% шанса крита', apply: (p) => (s(p).crit += 0.05) },
  { id: 'lodestone', tier: 1, name: 'Магнитный камень', icon: 'magnet', desc: '+30% радиуса сбора', apply: (p) => (s(p).magnet += 0.3) },
  // II
  { id: 'serrated', tier: 2, name: 'Зазубренный клинок', icon: 'sword', desc: '+14% урона, +4% шанса крита', apply: (p) => { s(p).dmgMult += 0.14; s(p).crit += 0.04; } },
  { id: 'mail', tier: 2, name: 'Кольчуга стража', icon: 'shield', desc: '+8% брони', apply: (p) => (s(p).armor = Math.min(0.7, s(p).armor + 0.08)) },
  { id: 'belt', tier: 2, name: 'Пояс великана', icon: 'heart', desc: '+30 к макс. здоровью, +4% урона', apply: (p) => { s(p).maxHp += 30; p.hp += 30; s(p).dmgMult += 0.04; } },
  { id: 'hourglass', tier: 2, name: 'Песочные часы', icon: 'hourglass', desc: '−12% перезарядки способности', apply: (p) => (s(p).cdMult *= 0.88) },
  { id: 'owl', needs: 'proj', tier: 2, name: 'Совиное перо', icon: 'pierce', desc: 'Снаряды пробивают +1 врага', apply: (p) => (s(p).pierce += 1) },
  { id: 'gloves', tier: 2, name: 'Перчатки ловкача', icon: 'zap', desc: '+16% скорости атаки, но −4% урона', apply: (p) => { s(p).rateMult += 0.16; s(p).dmgMult -= 0.04; } },
  { id: 'tome', tier: 2, name: 'Том мудреца', icon: 'star', desc: '+15% опыта', apply: (p) => (s(p).xpMult += 0.15) },
  // III
  { id: 'chalice', tier: 3, name: 'Кровавый кубок', icon: 'drop', desc: '+12% шанса исцелиться при убийстве', apply: (p) => (s(p).lifesteal += 0.12) },
  { id: 'runeshield', tier: 3, name: 'Рунный щит', icon: 'hexshield', desc: 'Защитная руна поглощает удар (раз в 12 сек.)', max: 1, apply: (p) => { s(p).shieldCd = s(p).shieldCd ? Math.max(6, s(p).shieldCd - 3) : 12; p.shield = 1; } },
  { id: 'stormeye', tier: 3, name: 'Око бури', icon: 'chain', desc: '+12% шанса цепной молнии', apply: (p) => (s(p).chain += 0.12) },
  { id: 'frostrune', tier: 3, name: 'Руна стужи', icon: 'snow', desc: '+15% шанса замедлить врага', apply: (p) => (s(p).frost += 0.15) },
  { id: 'scroll', needs: 'proj', tier: 3, name: 'Свиток множества', icon: 'split', desc: '+1 снаряд в залпе', max: 3, apply: (p) => (s(p).extraProj += 1) },
  { id: 'hammer', tier: 3, name: 'Молот разрушителя', icon: 'burst', desc: '+30% урона, но −8% скорости', apply: (p) => { s(p).dmgMult += 0.3; s(p).speedMult -= 0.08; } },
  { id: 'dagger', tier: 3, name: 'Пляшущий кинжал', icon: 'orbit', desc: '+1 кинжал кружит вокруг и сбивает чары', max: 4, apply: (p) => (s(p).orbitals += 1) },
  // IV
  { id: 'crown', tier: 4, name: 'Корона павшего короля', icon: 'crown', desc: '+22% урона, +20% опыта, +20 к здоровью', max: 1, apply: (p) => { s(p).dmgMult += 0.22; s(p).xpMult += 0.2; s(p).maxHp += 20; p.hp += 20; } },
  { id: 'phoenix', group: 'revive', tier: 4, name: 'Сердце феникса', icon: 'flame', desc: 'Один раз воскрешает с 60% здоровья', max: 1, apply: (p) => (s(p).revive += 1) },
  { id: 'cloak', tier: 4, name: 'Плащ сумерек', icon: 'shield', desc: '+15% брони, +10% скорости движения', max: 1, apply: (p) => { s(p).armor = Math.min(0.7, s(p).armor + 0.15); s(p).speedMult += 0.1; } },
  { id: 'dragoneye', tier: 4, name: 'Око дракона', icon: 'eye', desc: '+12% шанса крита, +70% урона критов', max: 1, apply: (p) => { s(p).crit += 0.12; s(p).critMult += 0.7; } },
  { id: 'falcon', tier: 4, name: 'Ловчий сокол', icon: 'bird', desc: 'Сокол-спутник бьёт ближайших врагов', max: 2, apply: (p) => (s(p).drones += 1) },
];

export const itemById = (id) => ITEMS.find((i) => i.id === id);

export function itemPrice(it, wave) {
  return Math.round(TIERS[it.tier].base * (1 + (wave - 1) * 0.09));
}

export function rerollPrice(wave, n) {
  return Math.round(3 + wave * 0.8 + n * 3);
}

export function rollShop(p, wave, count = 2) {
  const luck = p.s.luck;
  const w = {
    1: Math.max(1.5, 10 - wave * 0.45),
    2: wave >= 2 ? 6 : 1,
    3: wave >= 5 ? 2.5 + wave * 0.18 + luck * 2 : 0,
    4: wave >= 9 ? 0.8 + wave * 0.07 + luck * 1.5 : 0,
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const tags = p.tags || [];
    const pool = ITEMS.filter((it) => !out.some((o) => o.id === it.id) && (!it.max || (p.itemCount[it.id] || 0) < it.max) &&
      (!it.needs || tags.includes(it.needs)) && (!it.group || !ownsUnique(p, it.group)));
    const it = weightedPick(pool, (it) => w[it.tier]);
    if (it) out.push({ ...it, sold: false });
  }
  return out;
}
