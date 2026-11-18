// Баффы, выдаваемые за уровень: 1 из 3 на выбор. Редкость усиливает эффект.
import { weightedPick } from './util.js';

// уникальные эффекты, которые нельзя получить дважды (ни даром, ни в лавке)
export function ownsUnique(p, group) {
  if (group === 'revive') return !!(p.upg.revive || p.itemCount.phoenix);
  if (group === 'retaliate') return !!p.s.retaliate;
  if (group === 'tempo') return !!(p.upg.myth_heavy || p.upg.myth_squall);
  return false;
}

export const RARITY = {
  common: { id: 'common', name: 'Обычное', color: '#c9b48e', mult: 1, weight: 62 },
  rare: { id: 'rare', name: 'Редкое', color: '#5aaee8', mult: 1.5, weight: 27 },
  epic: { id: 'epic', name: 'Эпическое', color: '#b582ff', mult: 2.1, weight: 9 },
  legendary: { id: 'legendary', name: 'Легендарное', color: '#ffc94a', mult: 3, weight: 2 },
  mythic: { id: 'mythic', name: 'Таинство', color: '#ff5a8a', mult: 1, weight: 0 },
};
const ORDER = ['common', 'rare', 'epic', 'legendary'];

const pct = (v) => `${Math.round(v * 100)}%`;
const r1 = (v) => (Math.round(v * 10) / 10).toString();

// fixed — фиксированная редкость (эффект не масштабируется)
export const UPGRADES = [
  { id: 'dmg', name: 'Сила великана', icon: 'sword', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.12 * m)} к урону`, apply: (p, m) => (p.s.dmgMult += 0.12 * m) },
  { id: 'rate', name: 'Скорострельность', icon: 'zap', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.11 * m)} к скорости атаки`, apply: (p, m) => (p.s.rateMult += 0.11 * m) },
  { id: 'multi', needs: 'proj', name: 'Залп', icon: 'split', tag: 'Атака', max: 4, fixed: 'epic',
    desc: () => '+1 снаряд в каждом залпе', apply: (p) => (p.s.extraProj += 1) },
  { id: 'pierce', needs: 'proj', name: 'Пронзающий удар', icon: 'pierce', tag: 'Атака', max: 5, fixed: 'rare',
    desc: () => 'Снаряды пронзают +1 врага', apply: (p) => (p.s.pierce += 1) },
  { id: 'crit', name: 'Меткость', icon: 'target', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.06 * m)} шанс крит. удара`, apply: (p, m) => (p.s.crit += 0.06 * m) },
  { id: 'critdmg', name: 'Казнь', icon: 'skull', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.25 * m)} к урону критов`, apply: (p, m) => (p.s.critMult += 0.25 * m) },
  { id: 'velocity', needs: 'proj', name: 'Попутный ветер', icon: 'comet', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.12 * m)} скорость и +${pct(0.1 * m)} дальность снарядов`, apply: (p, m) => { p.s.projSpeed += 0.12 * m; p.s.range += 0.1 * m; } },
  { id: 'caliber', name: 'Тяжёлая рука', icon: 'expand', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.15 * m)} размер атак (снаряды, размах удара) и +${pct(0.05 * m)} урона`, apply: (p, m) => { p.s.size += 0.15 * m; p.s.dmgMult += 0.05 * m; } },
  { id: 'homing', needs: 'proj', name: 'Ищущие снаряды', icon: 'homing', tag: 'Атака', max: 3, fixed: 'epic',
    desc: () => 'Снаряды сами находят ближайших врагов', apply: (p) => (p.s.homing += 2.2) },
  { id: 'bounce', needs: 'proj', name: 'Рикошет', icon: 'bounce', tag: 'Атака', max: 3, fixed: 'rare',
    desc: () => 'Снаряды отскакивают к ещё одному врагу', apply: (p) => (p.s.bounce += 1) },
  { id: 'explosive', name: 'Взрывная руна', icon: 'burst', tag: 'Атака', max: 3, fixed: 'epic',
    desc: () => 'Попадания взрываются, задевая врагов рядом (50% урона)', apply: (p) => (p.s.explosive += p.s.explosive ? 20 : 55) },
  { id: 'chain', name: 'Цепная молния', icon: 'chain', tag: 'Атака', max: 99,
    desc: (m) => `+${pct(0.1 * m)} шанс ударить молнией по 3 врагам`, apply: (p, m) => (p.s.chain += 0.1 * m) },
  { id: 'frost', name: 'Морозная руна', icon: 'snow', tag: 'Контроль', max: 99,
    desc: (m) => `+${pct(0.12 * m)} шанс замедлить врага на 50%`, apply: (p, m) => (p.s.frost += 0.12 * m) },
  { id: 'orbital', name: 'Пляшущий клинок', icon: 'orbit', tag: 'Атака', max: 6, fixed: 'rare',
    desc: () => '+1 клинок кружит вокруг героя и сбивает вражеские снаряды', apply: (p) => (p.s.orbitals += 1) },
  { id: 'drone', name: 'Сокол-спутник', icon: 'bird', tag: 'Атака', max: 3, fixed: 'epic',
    desc: () => 'Ловчий сокол кружит рядом и бьёт ближайших врагов', apply: (p) => (p.s.drones += 1) },

  { id: 'vitality', name: 'Живучесть', icon: 'heart', tag: 'Защита', max: 99,
    desc: (m) => `+${Math.round(20 * m)} к макс. здоровью и лечение`, apply: (p, m) => { p.s.maxHp += 20 * m; p.hp += 20 * m; } },
  { id: 'regen', name: 'Регенерация', icon: 'regen', tag: 'Защита', max: 99,
    desc: (m) => `+${r1(0.6 * m)} HP в секунду`, apply: (p, m) => (p.s.regen += 0.6 * m) },
  { id: 'armor', name: 'Броня', icon: 'shield', tag: 'Защита', max: 99,
    desc: (m) => `−${pct(0.07 * m)} получаемого урона`, apply: (p, m) => (p.s.armor = Math.min(0.7, p.s.armor + 0.07 * m)) },
  { id: 'aegis', name: 'Защитная руна', icon: 'hexshield', tag: 'Защита', max: 3, fixed: 'epic',
    desc: (_, p) => (p && p.s.shieldCd ? 'Руна восстанавливается на 3 сек. быстрее' : 'Руна поглощает одно попадание. Восстановление 14 сек.'),
    apply: (p) => { p.s.shieldCd = p.s.shieldCd ? p.s.shieldCd - 3 : 14; p.shield = 1; } },
  { id: 'vampire', name: 'Кровавая жатва', icon: 'drop', tag: 'Защита', max: 99,
    desc: (m) => `+${pct(0.07 * m)} шанс исцелиться на 2 HP при убийстве`, apply: (p, m) => (p.s.lifesteal += 0.07 * m) },
  { id: 'retaliate', group: 'retaliate', name: 'Возмездие', icon: 'spikes', tag: 'Защита', max: 1, fixed: 'epic',
    desc: () => 'При получении урона выпускает кольцо из 18 снарядов', apply: (p) => (p.s.retaliate = 1) },

  { id: 'speed', name: 'Лёгкая поступь', icon: 'wind', tag: 'Мобильность', max: 99,
    desc: (m) => `+${pct(0.08 * m)} к скорости движения`, apply: (p, m) => (p.s.speedMult += 0.08 * m) },
  { id: 'magnet', name: 'Притяжение', icon: 'magnet', tag: 'Утилита', max: 99,
    desc: (m) => `+${pct(0.35 * m)} к радиусу сбора опыта`, apply: (p, m) => (p.s.magnet += 0.35 * m) },
  { id: 'cooldown', name: 'Сосредоточение', icon: 'clock', tag: 'Способность', max: 99,
    desc: (m) => `−${pct(0.09 * m)} к перезарядке способности`, apply: (p, m) => (p.s.cdMult *= 1 - 0.09 * m) },
  { id: 'wisdom', name: 'Мудрость веков', icon: 'star', tag: 'Утилита', max: 99,
    desc: (m) => `+${pct(0.12 * m)} к получаемому опыту`, apply: (p, m) => (p.s.xpMult += 0.12 * m) },
  { id: 'luck', name: 'Благосклонность судьбы', icon: 'clover', tag: 'Утилита', max: 99,
    desc: (m) => `+${pct(0.25 * m)} к шансу редких наград`, apply: (p, m) => (p.s.luck += 0.25 * m) },

  { id: 'glass', name: 'Ярость берсерка', icon: 'glass', tag: 'Легенда', max: 1, fixed: 'legendary',
    desc: () => '+50% урона, но −30% макс. здоровья', apply: (p) => { p.s.dmgMult += 0.5; p.s.maxHp *= 0.7; p.hp = Math.min(p.hp, p.s.maxHp); } },
  { id: 'revive', group: 'revive', name: 'Слеза феникса', icon: 'flame', tag: 'Легенда', max: 1, fixed: 'legendary',
    desc: () => 'Один раз воскрешает с 60% здоровья', apply: (p) => (p.s.revive += 1) },
  { id: 'overclock', name: 'Благословение воителя', icon: 'zap', tag: 'Легенда', max: 1, fixed: 'legendary',
    desc: () => '+35% скорострельности и +1 снаряд', apply: (p) => { p.s.rateMult += 0.35; p.s.extraProj += 1; } },

  // --- Таинства: меняют саму механику атаки, вокруг них строится билд ---
  { id: 'myth_trident', mythic: true, name: 'Трезубец', icon: 'split', max: 1, fixed: 'mythic',
    desc: () => 'Каждая атака дополнительно бьёт под углом ±30° (45% урона). Цели ищутся в своих направлениях', apply: (p) => (p.flags.trident = true) },
  { id: 'myth_twoface', mythic: true, name: 'Двуликий', icon: 'eye', max: 1, fixed: 'mythic',
    desc: () => 'Каждая атака повторяется за спиной героя с 70% урона', apply: (p) => (p.flags.twoface = true) },
  { id: 'myth_heavy', mythic: true, group: 'tempo', name: 'Длань титана', icon: 'burst', max: 1, fixed: 'mythic',
    desc: () => 'Атаки на 40% реже, но урон ×2.3 и размах +35%', apply: (p) => { p.mods.rate *= 0.6; p.mods.dmg *= 2.3; p.s.size += 0.35; } },
  { id: 'myth_squall', mythic: true, group: 'tempo', name: 'Шквал', icon: 'zap', max: 1, fixed: 'mythic',
    desc: () => 'Атаки почти вдвое чаще (×1.9), но урон ×0.6. Сильнее раскрывает эффекты при попадании', apply: (p) => { p.mods.rate *= 1.9; p.mods.dmg *= 0.6; } },
  { id: 'myth_chain', mythic: true, name: 'Цепная реакция', icon: 'burst', max: 1, fixed: 'mythic',
    desc: () => 'Убитые враги взрываются (45% урона героя). Взрывы добивают соседей — и те тоже взрываются', apply: (p) => (p.flags.chainReact = true) },
  { id: 'myth_meteor', mythic: true, name: 'Звездопад', icon: 'comet', max: 1, fixed: 'mythic',
    desc: () => 'Каждая 5-я атака обрушивает на цель метеор: взрыв на 300% урона', apply: (p) => (p.flags.meteor = true) },
  { id: 'myth_well', mythic: true, name: 'Чёрная воронка', icon: 'orbit', max: 1, fixed: 'mythic',
    desc: () => 'Каждые 7 сек. в гуще врагов открывается воронка: стягивает их в кучу, ранит и схлопывается взрывом', apply: (p) => (p.flags.well = true) },
  { id: 'myth_shards', mythic: true, name: 'Раскол', icon: 'spikes', max: 1, fixed: 'mythic',
    desc: () => 'Из убитого врага вылетают 3 осколка (40% урона), которые тоже могут добивать', apply: (p) => (p.flags.shards = true) },
  { id: 'myth_titan', mythic: true, name: 'Поступь великана', icon: 'tower', max: 1, fixed: 'mythic',
    desc: () => 'Пока герой движется, каждую секунду бьёт ударной волной вокруг (90% урона, отбрасывает)', apply: (p) => (p.flags.titan = true) },
  { id: 'myth_blood', mythic: true, name: 'Кровавая цена', icon: 'drop', max: 1, fixed: 'mythic',
    desc: () => 'Атаки стоят здоровья (около 2 HP в сек.), но урон ×1.7, а каждое убийство лечит 2.5 HP', apply: (p) => { p.flags.bloodPrice = true; p.mods.dmg *= 1.7; } },

  // --- Пути развития героев (branch). Венчающий дар (cap) открывается после 2 даров пути ---
  // Бранд
  { id: 'spark_blood', char: 'spark', branch: 'Ярость', name: 'Кровавая ярость', icon: 'drop', max: 1, fixed: 'rare',
    desc: () => 'В Ярости 3% нанесённого урона лечат Бранда', apply: (p) => (p.flags.bloodRage = true) },
  { id: 'spark_frenzy', char: 'spark', branch: 'Ярость', name: 'Неистовство', icon: 'skull', max: 1, fixed: 'rare',
    desc: () => 'Ярость копится в 1.5 раза быстрее и длится на 2 сек. дольше', apply: (p) => (p.flags.frenzy = true) },
  { id: 'spark_berserk', char: 'spark', branch: 'Ярость', cap: true, name: 'Берсерк', icon: 'crown', max: 1, fixed: 'epic',
    desc: () => 'В Ярости: −40% получаемого урона и +25% скорости', apply: (p) => (p.flags.berserk = true) },
  { id: 'spark_wave', char: 'spark', branch: 'Пламя', name: 'Огненная волна', icon: 'flame', max: 1, fixed: 'rare',
    desc: () => 'Каждый 3-й удар выпускает волну пламени, пронзающую всех', apply: (p) => (p.flags.flameWave = true) },
  { id: 'spark_ash', char: 'spark', branch: 'Пламя', name: 'Пепельный клинок', icon: 'flame', max: 1, fixed: 'rare',
    desc: () => 'Удары всегда поджигают, поджог сильнее на 60%', apply: (p) => { p.flags.ashen = true; p.s.burnMult += 0.6; } },
  { id: 'spark_pyre', char: 'spark', branch: 'Пламя', cap: true, name: 'Погребальный костёр', icon: 'burst', max: 1, fixed: 'epic',
    desc: () => 'Горящие враги взрываются при смерти', apply: (p) => (p.flags.pyre = true) },
  { id: 'spark_storm', char: 'spark', branch: 'Вихрь', name: 'Буря клинков', icon: 'burst', max: 1, fixed: 'rare',
    desc: () => 'Огненный вихрь длится на 1.2 сек. дольше и шире на 30%', apply: (p) => (p.flags.bladeStorm = true) },
  { id: 'spark_pull', char: 'spark', branch: 'Вихрь', name: 'Воронка', icon: 'magnet', max: 1, fixed: 'rare',
    desc: () => 'Вихрь затягивает врагов к Бранду', apply: (p) => (p.flags.pull = true) },
  { id: 'spark_eternal', char: 'spark', branch: 'Вихрь', cap: true, name: 'Вечный вихрь', icon: 'orbit', max: 1, fixed: 'epic',
    desc: () => 'Убийства во время вихря продлевают его и сокращают перезарядку', apply: (p) => (p.flags.eternal = true) },
  // Эйра
  { id: 'vega_fan', char: 'vega', branch: 'Залп', name: 'Веер болтов', icon: 'split', max: 2, fixed: 'rare',
    desc: () => '+2 болта веером в каждом выстреле', apply: () => {} },
  { id: 'vega_ricochet', char: 'vega', branch: 'Залп', name: 'Рикошет', icon: 'bounce', max: 2, fixed: 'rare',
    desc: () => 'Болты отскакивают к ещё одному врагу', apply: (p) => (p.s.bounce += 1) },
  { id: 'vega_rain', char: 'vega', branch: 'Залп', cap: true, name: 'Дождь стрел', icon: 'zap', max: 1, fixed: 'epic',
    desc: () => 'Каждые 5 сек. на цель обрушиваются 12 стрел', apply: (p) => (p.flags.arrowRain = true) },
  { id: 'vega_heavy', char: 'vega', branch: 'Снайпер', name: 'Тяжёлые болты', icon: 'pierce', max: 2, fixed: 'rare',
    desc: () => '+35% урона и +20% дальности, но −8% скорострельности', apply: (p) => { p.flags.heavyBolts = true; p.s.dmgMult += 0.35; p.s.rateMult -= 0.08; } },
  { id: 'vega_weak', char: 'vega', branch: 'Снайпер', name: 'Слабое место', icon: 'target', max: 2, fixed: 'rare',
    desc: () => '+10% шанса крита и +60% урона критов', apply: (p) => { p.s.crit += 0.1; p.s.critMult += 0.6; } },
  { id: 'vega_execute', char: 'vega', branch: 'Снайпер', cap: true, name: 'Казнь', icon: 'skull', max: 1, fixed: 'epic',
    desc: () => 'Болт добивает врага, у которого остаётся меньше 20% здоровья (кроме боссов)', apply: (p) => (p.flags.execute = true) },
  { id: 'vega_trapper', char: 'vega', branch: 'Капканы', name: 'Мастер ловушек', icon: 'spikes', max: 1, fixed: 'rare',
    desc: () => 'Шаг тени оставляет 3 капкана вместо одного', apply: (p) => (p.flags.trapper = true) },
  { id: 'vega_poison', char: 'vega', branch: 'Капканы', name: 'Яд болотницы', icon: 'drop', max: 1, fixed: 'rare',
    desc: () => 'Капканы сильнее на 50%, травят и надолго замедляют', apply: (p) => (p.flags.poison = true) },
  { id: 'vega_minefield', char: 'vega', branch: 'Капканы', cap: true, name: 'Минное поле', icon: 'burst', max: 1, fixed: 'epic',
    desc: () => 'Каждые 4 сек. капкан сам появляется под ногами', apply: (p) => (p.flags.minefield = true) },
  // Альдерон
  { id: 'chronos_fork', char: 'chronos', branch: 'Цепи', name: 'Разветвление', icon: 'chain', max: 3, fixed: 'rare',
    desc: () => 'Молния перескакивает на +1 врага', apply: () => {} },
  { id: 'chronos_conduct', char: 'chronos', branch: 'Цепи', name: 'Проводник', icon: 'zap', max: 1, fixed: 'rare',
    desc: () => 'Молния не слабеет при прыжках', apply: (p) => (p.flags.conduct = true) },
  { id: 'chronos_overload', char: 'chronos', branch: 'Цепи', cap: true, name: 'Перегрузка', icon: 'burst', max: 1, fixed: 'epic',
    desc: () => 'Перегрузка каждый 3-й разряд, взрыв шире', apply: (p) => (p.flags.overload = true) },
  { id: 'chronos_cloud', char: 'chronos', branch: 'Буря', name: 'Грозовая туча', icon: 'zap', max: 1, fixed: 'epic',
    desc: () => 'Над Альдероном плывёт туча и бьёт молнией врагов каждые 1.2 сек.', apply: (p) => (p.flags.cloud = true) },
  { id: 'chronos_thunder', char: 'chronos', branch: 'Буря', name: 'Громовержец', icon: 'chain', max: 2, fixed: 'rare', req: (p) => p.flags.cloud,
    desc: () => 'Туча бьёт на 30% чаще и сильнее', apply: () => {} },
  { id: 'chronos_wrath', char: 'chronos', branch: 'Буря', cap: true, name: 'Небесный гнев', icon: 'burst', max: 1, fixed: 'epic',
    desc: () => 'Удары тучи взрываются по площади', apply: (p) => (p.flags.wrath = true) },
  { id: 'chronos_aura', char: 'chronos', branch: 'Время', name: 'Круг безвременья', icon: 'hourglass', max: 2, fixed: 'rare',
    desc: () => '+40% радиус замедления снарядов', apply: (p) => (p.s.auraMult += 0.4) },
  { id: 'chronos_brittle', char: 'chronos', branch: 'Время', name: 'Хрупкость', icon: 'snow', max: 1, fixed: 'rare',
    desc: () => 'Замедленные враги получают на 25% больше урона, +15% шанса замедлить', apply: (p) => { p.flags.brittle = true; p.s.frost += 0.15; } },
  { id: 'chronos_loop', char: 'chronos', branch: 'Время', cap: true, name: 'Петля времени', icon: 'clock', max: 1, fixed: 'epic',
    desc: () => 'Остановка времени дольше на 1.5 сек., замершие враги получают ×1.5 урона', apply: (p) => { p.flags.loop = true; p.s.cdMult *= 0.8; } },
  // Готфрид
  { id: 'bastion_radiant', char: 'bastion', branch: 'Свет', name: 'Сияющий клинок', icon: 'sun', max: 1, fixed: 'rare',
    desc: () => 'Волна света каждый 2-й удар', apply: (p) => (p.flags.radiant = true) },
  { id: 'bastion_bless', char: 'bastion', branch: 'Свет', name: 'Благословение', icon: 'heart', max: 1, fixed: 'rare',
    desc: () => 'Волна света лечит на 1 HP за каждого задетого врага', apply: (p) => (p.flags.bless = true) },
  { id: 'bastion_dawn', char: 'bastion', branch: 'Свет', cap: true, name: 'Рассвет', icon: 'split', max: 1, fixed: 'epic',
    desc: () => 'Волна света расходится тройным веером', apply: (p) => (p.flags.dawn = true) },
  { id: 'bastion_thorns', char: 'bastion', branch: 'Твердыня', name: 'Шипастый щит', icon: 'spikes', max: 1, fixed: 'rare',
    desc: () => 'Враги, коснувшиеся героя, получают 300% урона', apply: (p) => (p.flags.thorns = true) },
  { id: 'bastion_fort', char: 'bastion', branch: 'Твердыня', name: 'Непоколебимость', icon: 'tower', max: 2, fixed: 'rare',
    desc: () => '+40 к макс. здоровью и +8% брони', apply: (p) => { p.s.maxHp += 40; p.hp += 40; p.s.armor = Math.min(0.7, p.s.armor + 0.08); } },
  { id: 'bastion_faith', char: 'bastion', branch: 'Твердыня', cap: true, name: 'Бастион веры', icon: 'hexshield', max: 1, fixed: 'epic',
    desc: () => 'Щит ловит снаряды шире, каждый отбитый вспыхивает святым взрывом', apply: (p) => { p.flags.faith = true; p.flags.mirror = true; } },
  { id: 'bastion_consecrate', char: 'bastion', branch: 'Освящение', name: 'Освящённая земля', icon: 'star', max: 1, fixed: 'epic',
    desc: () => 'Святой огонь вокруг Готфрида жжёт врагов дважды в секунду', apply: (p) => (p.flags.consecrate = true) },
  { id: 'bastion_holyfire', char: 'bastion', branch: 'Освящение', name: 'Святой огонь', icon: 'flame', max: 2, fixed: 'rare', req: (p) => p.flags.consecrate,
    desc: () => 'Аура шире на 35% и сильнее на 50%', apply: () => {} },
  { id: 'bastion_judge', char: 'bastion', branch: 'Освящение', cap: true, name: 'Суд', icon: 'crown', max: 1, fixed: 'epic', req: (p) => p.flags.consecrate,
    desc: () => 'Каждые 7 сек. столпы света бьют всех врагов в ауре', apply: (p) => (p.flags.judge = true) },
  // Лиорэ
  { id: 'morra_legion', char: 'morra', branch: 'Легион', name: 'Армия тьмы', icon: 'skull', max: 2, fixed: 'rare',
    desc: () => '+2 к лимиту скелетов', apply: () => {} },
  { id: 'morra_harvest', char: 'morra', branch: 'Легион', name: 'Мрачная жатва', icon: 'ghost', max: 2, fixed: 'rare',
    desc: () => '+15% шанс поднять павшего врага', apply: () => {} },
  { id: 'morra_bones', char: 'morra', branch: 'Легион', cap: true, name: 'Костяной взрыв', icon: 'burst', max: 1, fixed: 'epic',
    desc: () => 'Погибая, скелеты взрываются', apply: (p) => (p.flags.boneBurst = true) },
  { id: 'morra_steel', char: 'morra', branch: 'Рыцари', name: 'Кость и сталь', icon: 'sword', max: 2, fixed: 'rare',
    desc: () => '+60% здоровья и урона новых скелетов', apply: () => {} },
  { id: 'morra_stride', char: 'morra', branch: 'Рыцари', name: 'Ярость мёртвых', icon: 'wind', max: 1, fixed: 'rare',
    desc: () => 'Скелеты двигаются и бьют на 35% быстрее', apply: (p) => (p.flags.stride = true) },
  { id: 'morra_knights', char: 'morra', branch: 'Рыцари', cap: true, name: 'Рыцари смерти', icon: 'crown', max: 1, fixed: 'epic',
    desc: () => 'Новые скелеты встают рыцарями: ×2 урон, ×1.8 здоровье', apply: (p) => (p.flags.knights = true) },
  { id: 'morra_spirits', char: 'morra', branch: 'Души', name: 'Духи-хранители', icon: 'bird', max: 2, fixed: 'rare',
    desc: () => '+2 духа кружат рядом и сбивают вражеские снаряды', apply: (p) => (p.s.orbitals += 2) },
  { id: 'morra_reap', char: 'morra', branch: 'Души', name: 'Жатва душ', icon: 'drop', max: 1, fixed: 'rare',
    desc: () => 'Каждое убийство скелетом лечит Лиорэ на 1 HP', apply: (p) => (p.flags.reap = true) },
  { id: 'morra_absorb', char: 'morra', branch: 'Души', cap: true, name: 'Поглощение', icon: 'split', max: 1, fixed: 'epic',
    desc: () => 'Стрелы души пронзают 2 врагов и раздваиваются при попадании', apply: (p) => (p.flags.absorb = true) },
];

const FALLBACK = { id: 'heal', name: 'Передышка', icon: 'plus', tag: 'Восстановление', max: 999, fixed: 'common',
  desc: () => 'Восстанавливает 35% здоровья', apply: (p) => (p.hp = Math.min(p.s.maxHp, p.hp + p.s.maxHp * 0.35)) };

function rollRarity(luck, minRarity = 0) {
  const w = {
    common: RARITY.common.weight,
    rare: RARITY.rare.weight * (1 + luck),
    epic: RARITY.epic.weight * (1 + luck * 1.5),
    legendary: RARITY.legendary.weight * (1 + luck * 2),
  };
  const ids = ORDER.slice(minRarity);
  return RARITY[weightedPick(ids, (id) => w[id])];
}

// Сгенерировать 3 варианта для выбора
export function rollChoices(p, count = 3, bonusLuck = 0) {
  const luck = p.s.luck + bonusLuck;
  const tags = p.tags || [];
  const pool = UPGRADES.filter((u) =>
    (!u.char || u.char === p.char.id) && (p.upg[u.id] || 0) < u.max &&
    (!u.group || !ownsUnique(p, u.group)) &&
    (!u.needs || tags.includes(u.needs)) &&
    (!u.cap || ((p.branch && p.branch[u.branch]) || 0) >= 2) &&
    (!u.req || u.req(p)) &&
    (!u.mythic || p.level >= 3));
  const out = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const cand = pool.filter((u) => !used.has(u.id));
    if (!cand.length) break;
    const u = weightedPick(cand, (u) => {
      let w = 10;
      if (u.fixed === 'rare') w = 6;
      if (u.fixed === 'epic') w = 3.5 * (1 + luck * 0.6);
      if (u.fixed === 'legendary') w = 0.9 * (1 + luck);
      if (u.mythic) w = 2.2 * (1 + luck) * (bonusLuck > 0 ? 1.6 : 1);
      if (u.char) w *= 1.5;
      if (u.branch && p.branch && p.branch[u.branch]) w *= 2.2; // выбранный путь предлагается чаще
      if (u.cap) w *= 1.6;
      return w;
    });
    used.add(u.id);
    const rarity = u.fixed ? RARITY[u.fixed] : rollRarity(luck, bonusLuck > 0 ? 1 : 0);
    out.push({ up: u, rarity, mult: u.fixed ? 1 : rarity.mult });
  }
  while (out.length < count) out.push({ up: FALLBACK, rarity: RARITY.common, mult: 1 });
  return out;
}

export function applyChoice(p, choice) {
  choice.up.apply(p, choice.mult);
  p.upg[choice.up.id] = (p.upg[choice.up.id] || 0) + 1;
  if (choice.up.branch) p.branch[choice.up.branch] = (p.branch[choice.up.branch] || 0) + 1;
  p.upgList.push(choice);
}

for (const u of UPGRADES) if (u.branch) u.tag = 'Путь: ' + u.branch;
for (const u of UPGRADES) if (u.mythic) u.tag = 'Таинство · меняет атаку';

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id) || FALLBACK;
