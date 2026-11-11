import {GEAR_SLOTS,RING_SLOTS} from './gear.js';
// Equipment modifiers modeled on Path of Exile's explicit affixes. Every modifier is
// either a prefix or a suffix, and either side holds at most three at once. Each affix
// family defines five tiers (Tier 1 is the strongest and is gated behind a high item
// level). Numeric values roll inside the tier's range, so a Tier 2 roll can be low or high.

export const ITEM_RARITIES = ['Normal', 'Magic', 'Rare', 'Unique'];
export const AFFIX_LIMIT = 3;
const T = (...rows) => rows.map(([minLevel, minVal, maxVal]) => ({minLevel, minVal, maxVal}));
// Three further tiers keep loot worth chasing past the first journey. Flat stats
// grow steeply to keep up with enemies; percentages grow gently toward their caps.
export const DEEP_TIER_LEVELS = [28, 40, 55];
const GROWTH = {flat: [1.6, 2.4, 3.5], percent: [1.2, 1.4, 1.65], slight: [1.1, 1.2, 1.3]};
function deepen(def) {
  if (def.fixedTiers) return def;
  const top = def.tiers.at(-1), factor = 10 ** (def.decimals || 0), round = v => Math.round(v * factor) / factor;
  const curve = GROWTH[def.growth || (def.label.startsWith('%') ? 'percent' : 'flat')];
  def.tiers = [...def.tiers, ...DEEP_TIER_LEVELS.map((minLevel, i) => ({minLevel, minVal: round(top.minVal * curve[i]), maxVal: round(top.maxVal * curve[i])}))];
  return def;
}

export const AFFIXES = {
  // ---- Prefixes: grant a base statistic ----
  might: {name: 'Forceful', label: 'attack', stat: 'attack', kind: 'prefix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,2,4],[4,4,7],[8,6,10],[13,9,14],[19,12,18])},
  guard: {name: 'Ironbound', label: 'defense', stat: 'defense', kind: 'prefix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,2,4],[4,3,6],[8,5,8],[13,7,11],[19,9,14])},
  life: {name: 'Vital', label: 'maximum health', stat: 'maxHp', kind: 'prefix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,9,15],[4,15,25],[8,22,36],[13,30,50],[19,40,65])},
  fire: {name: 'Smoldering', label: 'fire damage', stat: 'fire', kind: 'prefix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  cold: {name: 'Frostwoven', label: 'cold damage', stat: 'cold', kind: 'prefix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  lightning: {name: 'Stormforged', label: 'lightning damage', stat: 'lightning', kind: 'prefix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  fortification: {name: 'Fortified', label: 'defense', stat: 'defense', kind: 'prefix', slots: ['head', 'shoulder', 'chest', 'belt', 'leg', 'foot'], tiers: T([1,1,3],[4,2,5],[8,3,7],[13,5,9],[19,6,12])},
  colossus: {name: 'Colossus', label: 'maximum health', stat: 'maxHp', kind: 'prefix', slots: ['head', 'shoulder', 'chest', 'belt', 'leg', 'foot'], tiers: T([1,6,11],[4,10,18],[8,15,27],[13,21,38],[19,28,50])},
  // ---- Suffixes: grant utility, speed and offense ----
  haste: {name: 'of Haste', label: '% attack speed', stat: 'haste', kind: 'suffix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,3,6],[4,5,9],[8,8,13],[13,11,17],[19,15,22])},
  precision: {name: 'of Precision', label: '% critical chance', stat: 'critical', kind: 'suffix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,2,4],[4,3,6],[8,5,9],[13,7,11],[19,9,15])},
  swiftness: {name: 'of Swiftness', label: '% movement speed', stat: 'movement', kind: 'suffix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,5,10],[4,8,15],[8,12,20],[13,16,28],[19,22,36])},
  reach: {name: 'of Reach', label: 'tiles attack range', stat: 'reach', kind: 'suffix', decimals: 1, growth: 'slight', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,.3,.5],[4,.4,.7],[8,.6,1],[13,.8,1.3],[19,1,1.7])},
  ferocity: {name: 'of Ruin', label: '% critical strike multiplier', stat: 'criticalMultiplier', kind: 'suffix', slots: ['hand', 'wrist', 'neck', ...RING_SLOTS], tiers: T([1,10,18],[4,14,24],[8,20,32],[13,26,40],[19,34,52])},
  resist: {name: 'of Warding', label: '% elemental resistance', stat: 'resist', kind: 'suffix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,4,8],[4,6,11],[8,9,15],[13,12,20],[19,16,26])},
  leech: {name: 'of Leech', label: '% damage leeched as life', stat: 'leech', kind: 'suffix', decimals: 1, growth: 'slight', slots: ['hand', 'wrist', ...RING_SLOTS], tiers: T([1,1,2],[4,1.5,3],[8,2.5,4],[13,3.5,5.5],[19,5,7])},
  regeneration: {name: 'of Renewal', label: 'life regenerated / sec', stat: 'regen', kind: 'suffix', decimals: 1, slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,1,2.5],[4,2,4],[8,3,6],[13,4.5,8],[19,6,10])},
  // ---- Build-shaping modifiers ----
  lucid: {name: 'Lucid', label: 'maximum mana', stat: 'mana', kind: 'prefix', growth: 'percent', slots: ['head', 'neck', 'chest', 'belt', ...RING_SLOTS], tiers: T([1,6,10],[4,9,15],[8,13,21],[13,18,28],[19,24,36])},
  runed: {name: 'Runed', label: '% skill damage', stat: 'skillDamage', kind: 'prefix', slots: ['hand', 'wrist', 'neck', 'head'], tiers: T([1,4,7],[4,6,10],[8,9,14],[13,12,18],[19,16,24])},
  tempo: {name: 'of Tempo', label: '% cooldown recovery', stat: 'cooldown', kind: 'suffix', slots: ['head', 'neck', 'belt', ...RING_SLOTS], tiers: T([1,3,5],[4,4,7],[8,6,9],[13,8,12],[19,10,15])},
  sweeping: {name: 'of Sweeping', label: '% splash damage', stat: 'splash', kind: 'suffix', slots: ['hand', 'wrist', 'shoulder'], tiers: T([1,6,10],[4,9,15],[8,13,20],[13,18,26],[19,24,34])},
  clarity: {name: 'of Clarity', label: '% mana regeneration', stat: 'manaRegen', kind: 'suffix', slots: ['head', 'neck', 'chest', ...RING_SLOTS], tiers: T([1,8,14],[4,12,20],[8,17,27],[13,23,35],[19,30,45])},
  greed: {name: 'of Greed', label: '% gold found', stat: 'goldFind', kind: 'suffix', slots: ['neck', 'belt', 'foot', 'wrist', ...RING_SLOTS], tiers: T([1,8,14],[4,12,20],[8,17,27],[13,23,35],[19,30,45])},
  fortune: {name: 'of Fortune', label: '% item rarity', stat: 'magicFind', kind: 'suffix', slots: ['head', 'neck', 'foot', ...RING_SLOTS], tiers: T([1,5,9],[4,8,13],[8,11,18],[13,15,24],[19,20,32])},
  mastery: {name: 'of Mastery', label: 'to all skill ranks', stat: 'allSkills', kind: 'suffix', fixedTiers: true, slots: ['head', 'neck'], tiers: T([13,1,1],[40,2,2])}
};
for (const def of Object.values(AFFIXES)) deepen(def);

// Unique powers keyed by id, in the spirit of Diablo II / Path of Exile
// uniques: a named power fixed to a base item. `slots` limits which gear slots
// can roll each power. `stats` grants equipment bonuses like explicit affixes —
// plain numbers are flat, {perLevel:n} scales with the item's level. Powers
// without `stats` are special mechanics applied by id inside the engine.
export const UNIQUE_EFFECTS = {
 emberSignet: {name: 'Ember Signet', id: 'emberSignet', slots: RING_SLOTS, stats: {fire: {perLevel: 1.2}, critical: 5}, description: '+1.2 fire damage per item level · +5% critical strike chance. Duplicate powers do not stack.'},
 moonwell: {name: 'Moonwell', id: 'moonwell', slots: RING_SLOTS, stats: {regen: {perLevel: .5}, resist: 12}, description: '+0.5 life regenerated per second per item level · +12% elemental resistance. Duplicate powers do not stack.'},
  echo: {name: 'Dawn’s Echo', id: 'echo', slots: ['hand'], description: 'Every fourth basic attack strikes twice.'},
  stormbrand: {name: 'Stormbrand', id: 'stormbrand', slots: ['hand'], description: 'Your strikes deal bonus lightning damage equal to 30% of your attack.'},
  executioner: {name: 'Executioner’s Oath', id: 'executioner', slots: ['hand'], description: 'Strikes deal 80% more damage to enemies below 35% health.'},
  wildheart: {name: 'Wildheart', id: 'wildheart', slots: ['neck'], description: 'Healing skills also restore an extra 15% maximum health.'},
  tempestEye: {name: 'Eye of the Tempest', id: 'tempestEye', slots: ['neck'], stats: {resist: 15, critical: 8}, description: '+15% elemental resistance · +8% critical strike chance.'},
  crimsonChalice: {name: 'Crimson Chalice', id: 'crimsonChalice', slots: ['neck'], stats: {leech: 4, regen: {perLevel: .6}}, description: '4% of damage leeched as life · +0.6 life regenerated per second per item level.'},
  sagesCrown: {name: 'Sage’s Crown', id: 'sagesCrown', slots: ['head'], description: 'Skill cooldowns recover 30% faster.'},
  starkonja: {name: 'Starkonja’s Pelt', id: 'starkonja', slots: ['head'], stats: {critical: 8, haste: 12, movement: 12}, description: '+8% critical strike chance · +12% attack speed · +12% movement speed.'},
  spikeward: {name: 'Spikeward', id: 'spikeward', slots: ['shoulder'], description: 'Attackers take 35% of the physical damage they deal to you.'},
  aegisOfDawn: {name: 'Aegis of Dawn', id: 'aegisOfDawn', slots: ['shoulder'], stats: {defense: {perLevel: 1.2}, resist: 10}, description: '+1.2 defense per item level · +10% elemental resistance.'},
  lastLight: {name: 'Last Light', id: 'lastLight', slots: ['chest'], description: 'Take 25% less damage while below 35% health.'},
  stoneheart: {name: 'Stoneheart', id: 'stoneheart', slots: ['chest'], description: 'Take 12% less damage from all sources.'},
  warbringer: {name: 'Warbringer', id: 'warbringer', slots: ['wrist'], stats: {attack: {perLevel: 1.5}, leech: 3}, description: '+1.5 attack per item level · 3% of damage leeched as life.'},
  spellweave: {name: 'Spellweave', id: 'spellweave', slots: ['wrist'], description: 'Your skills deal 25% more damage.'},
  soulgorge: {name: 'Soulgorge', id: 'soulgorge', slots: ['belt'], description: 'Slaying an enemy grants +25% attack and movement speed for 6 seconds.'},
  gravebind: {name: 'Gravebind', id: 'gravebind', slots: ['belt'], description: 'Slain enemies restore an additional 6% of your maximum health.'},
  ironstride: {name: 'Ironstride', id: 'ironstride', slots: ['leg'], stats: {movement: 15}, description: 'You cannot be chilled · +15% movement speed.'},
  titanplate: {name: 'Titanplate', id: 'titanplate', slots: ['leg'], stats: {defense: {perLevel: 2}, maxHp: {perLevel: 6}}, description: '+2 defense and +6 maximum health per item level.'},
  windrunner: {name: 'Windrunner', id: 'windrunner', slots: ['foot'], stats: {movement: 45}, description: '+45% movement speed.'},
  emberwalk: {name: 'Emberwalk', id: 'emberwalk', slots: ['foot'], description: 'Take 20% less elemental damage.'},
  frostfang: {name: 'Frostfang', id: 'frostfang', slots: ['hand'], stats: {cold: {perLevel: 1.5}, reach: .6}, description: '+1.5 cold damage per item level · +0.6 tiles attack range.'},
  bloodreaver: {name: 'Bloodreaver', id: 'bloodreaver', slots: ['hand'], stats: {attack: {perLevel: 1.2}, leech: 5}, description: '+1.2 attack per item level · 5% of damage leeched as life.'},
  sunbreaker: {name: 'Sunbreaker', id: 'sunbreaker', slots: ['hand'], stats: {fire: {perLevel: 1.2}, criticalMultiplier: 35}, description: '+1.2 fire damage per item level · +35% critical strike multiplier.'},
  winterOracle: {name: 'Winter Oracle', id: 'winterOracle', slots: ['neck'], stats: {cold: {perLevel: 1}, resist: 12}, description: '+1 cold damage per item level · +12% elemental resistance.'},
  stormglass: {name: 'Stormglass', id: 'stormglass', slots: ['neck'], stats: {lightning: {perLevel: 1.4}, haste: 15}, description: '+1.4 lightning damage per item level · +15% attack speed.'},
  oathOfGiants: {name: 'Oath of Giants', id: 'oathOfGiants', slots: ['neck'], stats: {maxHp: {perLevel: 5}, reach: .8}, description: '+5 maximum health per item level · +0.8 tiles attack range.'},
  ravenlord: {name: 'Ravenlord', id: 'ravenlord', slots: ['head'], stats: {critical: 10, criticalMultiplier: 25}, description: '+10% critical strike chance · +25% critical strike multiplier.'},
  hollowMonarch: {name: 'Hollow Monarch', id: 'hollowMonarch', slots: ['head'], stats: {maxHp: {perLevel: 4}, regen: {perLevel: .4}}, description: '+4 maximum health and +0.4 life regenerated per second per item level.'},
  ashwing: {name: 'Ashwing', id: 'ashwing', slots: ['shoulder'], stats: {fire: {perLevel: .9}, movement: 20}, description: '+0.9 fire damage per item level · +20% movement speed.'},
  glacialBastion: {name: 'Glacial Bastion', id: 'glacialBastion', slots: ['shoulder'], stats: {cold: {perLevel: .8}, defense: {perLevel: 1.4}}, description: '+0.8 cold damage and +1.4 defense per item level.'},
  briarheart: {name: 'Briarheart', id: 'briarheart', slots: ['chest'], stats: {maxHp: {perLevel: 7}, regen: {perLevel: .5}}, description: '+7 maximum health and +0.5 life regenerated per second per item level.'},
  voidCarapace: {name: 'Void Carapace', id: 'voidCarapace', slots: ['chest'], stats: {defense: {perLevel: 1.5}, resist: 18}, description: '+1.5 defense per item level · +18% elemental resistance.'},
  duelistVow: {name: 'Duelist’s Vow', id: 'duelistVow', slots: ['wrist'], stats: {haste: 18, reach: .5}, description: '+18% attack speed · +0.5 tiles attack range.'},
  thundercoil: {name: 'Thundercoil', id: 'thundercoil', slots: ['wrist'], stats: {lightning: {perLevel: 1.1}, critical: 7}, description: '+1.1 lightning damage per item level · +7% critical strike chance.'},
  serpentCoil: {name: 'Serpent Coil', id: 'serpentCoil', slots: ['belt'], stats: {leech: 3, haste: 15}, description: '3% of damage leeched as life · +15% attack speed.'},
  hearthkeeper: {name: 'Hearthkeeper', id: 'hearthkeeper', slots: ['belt'], stats: {regen: {perLevel: .6}, maxHp: {perLevel: 3}}, description: '+0.6 life regenerated per second and +3 maximum health per item level.'},
  outrider: {name: 'Outrider', id: 'outrider', slots: ['leg'], stats: {movement: 25, attack: {perLevel: .8}}, description: '+25% movement speed · +0.8 attack per item level.'},
  duskwarden: {name: 'Duskwarden', id: 'duskwarden', slots: ['leg'], stats: {resist: 15, maxHp: {perLevel: 4}}, description: '+15% elemental resistance · +4 maximum health per item level.'},
  ghoststep: {name: 'Ghoststep', id: 'ghoststep', slots: ['foot'], stats: {movement: 25, reach: .7}, description: '+25% movement speed · +0.7 tiles attack range.'},
  dawnmarch: {name: 'Dawnmarch', id: 'dawnmarch', slots: ['foot'], stats: {movement: 15, regen: {perLevel: .5}, defense: {perLevel: .6}}, description: '+15% movement speed · +0.5 life regenerated per second and +0.6 defense per item level.'},
  rimecircle: {name: 'Rimecircle', id: 'rimecircle', slots: RING_SLOTS, stats: {cold: {perLevel: 1.1}, criticalMultiplier: 20}, description: '+1.1 cold damage per item level · +20% critical strike multiplier. Duplicate powers do not stack.'},
  stormknot: {name: 'Stormknot', id: 'stormknot', slots: RING_SLOTS, stats: {lightning: {perLevel: 1}, haste: 12}, description: '+1 lightning damage per item level · +12% attack speed. Duplicate powers do not stack.'}
};

export const uniquesForSlot = slot => Object.values(UNIQUE_EFFECTS).filter(u => u.slots.includes(slot));

// Aggregate stat bonuses granted by equipped unique powers.
export function uniqueBonuses(items) {
  const out = {}, strongest = new Map();
  for (const item of items.filter(Boolean)) {
    if (!strongest.has(item.unique) || item.itemLevel > strongest.get(item.unique).itemLevel) strongest.set(item.unique,item);
  }
  for (const item of strongest.values()) {
    const u = UNIQUE_EFFECTS[item.unique]; if (!u?.stats) continue;
    for (const [stat, v] of Object.entries(u.stats)) out[stat] = (out[stat] || 0) + Math.round((v.perLevel ? v.perLevel * (item.itemLevel || 1) : v) * 10) / 10;
  }
  return out;
}

export const tierOf = (def, tier) => def.tiers[Math.max(0, Math.min(def.tiers.length - 1, def.tiers.length - (tier | 0)))];

// Roll one explicit modifier of the given family. choosing a tier weighted toward
// the weakest tiers available at the item level, then a value inside that tier.
export function makeAffix(id, itemLevel, rng = Math.random, forcedTier = 0) {
  const a = AFFIXES[id], n = a.tiers.length;
  let chosen = 0;
  if (forcedTier > 0) {
    chosen = Math.max(0, Math.min(n - 1, n - forcedTier));
  } else {
    let eligible = [];
    a.tiers.forEach((t, i) => { if (t.minLevel <= itemLevel) eligible.push(i); });
    // High-level drops stop rolling the weakest tiers: only the best five that fit.
    eligible = eligible.slice(-5);
    if (!eligible.length) eligible.push(0);
    const total = eligible.reduce((sum, _, k) => sum + (eligible.length - k), 0);
    let roll = rng() * total;
    for (let k = 0; k < eligible.length; k++) {
      roll -= eligible.length - k;
      if (roll <= 0) { chosen = eligible[k]; break; }
    }
  }
  const t = a.tiers[chosen], factor = 10 ** (a.decimals || 0);
  const value = Math.max(1 / factor, Math.round((t.minVal + rng() * (t.maxVal - t.minVal)) * factor) / factor);
  return {id, tier: n - chosen, value, min: t.minVal, max: t.maxVal};
}

export function rollAffixes(slot, rarity, itemLevel, rng = Math.random) {
  if (rarity <= 0) return [];
  const rollSide = (side, count) => {
    const pool = Object.entries(AFFIXES).filter(([, a]) => a.kind === side && a.slots.includes(slot) && a.tiers[0].minLevel <= itemLevel);
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const [affixId] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      out.push(makeAffix(affixId, itemLevel, rng));
    }
    return out;
  };
  if (rarity === 1) {
    const affixes = rollSide('prefix', 1);
    if (rng() < .65) affixes.push(...rollSide('suffix', 1));
    return affixes;
  }
  if (rarity === 2) {
    return [...rollSide('prefix', 2 + (rng() < .7 ? 1 : 0)), ...rollSide('suffix', 2 + (rng() < .3 ? 1 : 0))];
  }
  return [...rollSide('prefix', AFFIX_LIMIT), ...rollSide('suffix', AFFIX_LIMIT)];
}

export const affixSlots = item => {
  const count = side => (item?.affixes || []).filter(a => AFFIXES[a.id]?.kind === side).length;
  return {prefix: count('prefix'), suffix: count('suffix')};
};
export const canAddAffix = (item, side) => affixSlots(item)[side] < AFFIX_LIMIT;

export function addAffix(item, side, rng = Math.random) {
  const used = new Set((item.affixes || []).filter(a => AFFIXES[a.id]?.kind === side).map(a => a.id));
  const pool = Object.entries(AFFIXES).filter(([affixId, a]) => a.kind === side && a.slots.includes(item.slot) && !used.has(affixId) && a.tiers[0].minLevel <= (item.itemLevel || 1));
  if (!pool.length || !canAddAffix(item, side)) return null;
  const [affixId] = pool[Math.floor(rng() * pool.length)];
  item.affixes = [...(item.affixes || []), makeAffix(affixId, item.itemLevel || 1, rng)];
  return item;
}
export function randomSideAffix(item, rng = Math.random) {
  const open = ['prefix', 'suffix'].filter(side => canAddAffix(item, side));
  return open.length ? addAffix(item, open[Math.floor(rng() * open.length)], rng) : null;
}
export function rerollItem(item, rarity, rng = Math.random) {
  item.affixes = rollAffixes(item.slot, rarity, item.itemLevel || 1, rng);
  item.rarity = rarity;
  return item;
}
export function rerollValues(item, rng = Math.random) {
  for (const affix of item.affixes || []) {
    const a = AFFIXES[affix.id]; if (!a) continue;
    const t = tierOf(a, affix.tier), factor = 10 ** (a.decimals || 0);
    affix.value = Math.max(1 / factor, Math.round((t.minVal + rng() * (t.maxVal - t.minVal)) * factor) / factor);
    affix.min = t.minVal; affix.max = t.maxVal;
  }
  return item;
}

export function affixText(affix) {
  const a = AFFIXES[affix.id];
  if (!a) return '';
  return `+${affix.value}${a.label.startsWith('%') ? '' : ' '}${a.label}`;
}
// Stored tier numbers follow the family's current tier list, so a value range
// saved before tiers were added maps back to the right row.
export function retier(affix) {
  const def = AFFIXES[affix.id]; if (!def) return affix;
  const n = def.tiers.length;
  let index = def.tiers.findIndex(t => t.minVal === affix.min && t.maxVal === affix.max);
  if (index < 0) index = def.tiers.findIndex(t => affix.value >= t.minVal && affix.value <= t.maxVal);
  if (index < 0) { let best = Infinity; def.tiers.forEach((t, i) => { const d = Math.abs(affix.value - (t.minVal + t.maxVal) / 2); if (d < best) { best = d; index = i; } }); }
  const t = def.tiers[index];
  affix.tier = n - index; affix.min = t.minVal; affix.max = t.maxVal;
  affix.value = Math.max(t.minVal, Math.min(t.maxVal, affix.value));
  return affix;
}

export function lootRarity(enemyTier, rng = Math.random) {
  const roll = rng();
  const thresholds = {normal: [.004, .045, .28], magic: [.015, .16, .70], rare: [.06, .50, 1], unique: [.18, 1, 1]};
  const [unique, rare, magic] = thresholds[enemyTier] || thresholds.normal;
  return roll < unique ? 3 : roll < rare ? 2 : roll < magic ? 1 : 0;
}
export function affixBonuses(items) {
  const bonuses = {attack: 0, defense: 0, maxHp: 0, haste: 0, movement: 0, reach: 0, critical: 0, criticalMultiplier: 0, fire: 0, cold: 0, lightning: 0, resist: 0, leech: 0, regen: 0, mana: 0, skillDamage: 0, cooldown: 0, splash: 0, manaRegen: 0, goldFind: 0, magicFind: 0, allSkills: 0};
  for (const item of items.filter(Boolean)) for (const affix of item.affixes || []) {
    if (AFFIXES[affix.id]) bonuses[AFFIXES[affix.id].stat] += affix.value;
  }
  return bonuses;
}