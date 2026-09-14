import {GEAR_SLOTS} from './gear.js';
// Equipment modifiers modeled on Path of Exile's explicit affixes. Every modifier is
// either a prefix or a suffix, and either side holds at most three at once. Each affix
// family defines five tiers (Tier 1 is the strongest and is gated behind a high item
// level). Numeric values roll inside the tier's range, so a Tier 2 roll can be low or high.

export const ITEM_RARITIES = ['Normal', 'Magic', 'Rare', 'Unique'];
export const AFFIX_LIMIT = 3;
const T = (...rows) => rows.map(([minLevel, minVal, maxVal]) => ({minLevel, minVal, maxVal}));

export const AFFIXES = {
  // ---- Prefixes: grant a base statistic ----
  might: {name: 'Forceful', label: 'attack', stat: 'attack', kind: 'prefix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,2,4],[4,4,7],[8,6,10],[13,9,14],[19,12,18])},
  guard: {name: 'Ironbound', label: 'defense', stat: 'defense', kind: 'prefix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,2,4],[4,3,6],[8,5,8],[13,7,11],[19,9,14])},
  life: {name: 'Vital', label: 'maximum health', stat: 'maxHp', kind: 'prefix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,9,15],[4,15,25],[8,22,36],[13,30,50],[19,40,65])},
  fire: {name: 'Smoldering', label: 'fire damage', stat: 'fire', kind: 'prefix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  cold: {name: 'Frostwoven', label: 'cold damage', stat: 'cold', kind: 'prefix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  lightning: {name: 'Stormforged', label: 'lightning damage', stat: 'lightning', kind: 'prefix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,2,5],[4,4,8],[8,6,12],[13,9,16],[19,12,22])},
  fortification: {name: 'Fortified', label: 'defense', stat: 'defense', kind: 'prefix', slots: ['head', 'shoulder', 'chest', 'belt', 'leg', 'foot'], tiers: T([1,1,3],[4,2,5],[8,3,7],[13,5,9],[19,6,12])},
  colossus: {name: 'Colossus', label: 'maximum health', stat: 'maxHp', kind: 'prefix', slots: ['head', 'shoulder', 'chest', 'belt', 'leg', 'foot'], tiers: T([1,6,11],[4,10,18],[8,15,27],[13,21,38],[19,28,50])},
  // ---- Suffixes: grant utility, speed and offense ----
  haste: {name: 'of Haste', label: '% attack speed', stat: 'haste', kind: 'suffix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,3,6],[4,5,9],[8,8,13],[13,11,17],[19,15,22])},
  precision: {name: 'of Precision', label: '% critical chance', stat: 'critical', kind: 'suffix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,2,4],[4,3,6],[8,5,9],[13,7,11],[19,9,15])},
  swiftness: {name: 'of Swiftness', label: '% movement speed', stat: 'movement', kind: 'suffix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,5,10],[4,8,15],[8,12,20],[13,16,28],[19,22,36])},
  reach: {name: 'of Reach', label: 'tiles attack range', stat: 'reach', kind: 'suffix', decimals: 1, slots: ['hand', 'wrist', 'neck'], tiers: T([1,.3,.5],[4,.4,.7],[8,.6,1],[13,.8,1.3],[19,1,1.7])},
  ferocity: {name: 'of Ruin', label: '% critical strike multiplier', stat: 'criticalMultiplier', kind: 'suffix', slots: ['hand', 'wrist', 'neck'], tiers: T([1,10,18],[4,14,24],[8,20,32],[13,26,40],[19,34,52])},
  resist: {name: 'of Warding', label: '% elemental resistance', stat: 'resist', kind: 'suffix', slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,4,8],[4,6,11],[8,9,15],[13,12,20],[19,16,26])},
  leech: {name: 'of Leech', label: '% damage leeched as life', stat: 'leech', kind: 'suffix', decimals: 1, slots: ['hand', 'wrist'], tiers: T([1,1,2],[4,1.5,3],[8,2.5,4],[13,3.5,5.5],[19,5,7])},
  regeneration: {name: 'of Renewal', label: 'life regenerated / sec', stat: 'regen', kind: 'suffix', decimals: 1, slots: GEAR_SLOTS.filter(s=>s!=='hand'), tiers: T([1,1,2.5],[4,2,4],[8,3,6],[13,4.5,8],[19,6,10])}
};
export const UNIQUE_EFFECTS = {
  hand: {name: 'Dawn’s Echo', description: 'Every fourth basic attack strikes twice.', id: 'echo'},
  chest: {name: 'Last Light', description: 'Take 25% less damage while below 35% health.', id: 'lastLight'},
  neck: {name: 'Wildheart', description: 'Healing skills also restore an extra 15% maximum health.', id: 'wildheart'}
};

for(const slot of GEAR_SLOTS) UNIQUE_EFFECTS[slot] ||= UNIQUE_EFFECTS[['wrist'].includes(slot)?'hand':['belt','foot'].includes(slot)?'neck':'chest'];

export const tierOf = (def, tier) => def.tiers[Math.max(0, Math.min(def.tiers.length - 1, def.tiers.length - (tier | 0)))];

// Roll one explicit modifier of the given family. choosing a tier weighted toward
// the weakest tiers available at the item level, then a value inside that tier.
export function makeAffix(id, itemLevel, rng = Math.random, forcedTier = 0) {
  const a = AFFIXES[id], n = a.tiers.length;
  let chosen = 0;
  if (forcedTier > 0) {
    chosen = Math.max(0, Math.min(n - 1, n - forcedTier));
  } else {
    const eligible = [];
    a.tiers.forEach((t, i) => { if (t.minLevel <= itemLevel) eligible.push(i); });
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
    const pool = Object.entries(AFFIXES).filter(([, a]) => a.kind === side && a.slots.includes(slot));
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
  const pool = Object.entries(AFFIXES).filter(([affixId, a]) => a.kind === side && a.slots.includes(item.slot) && !used.has(affixId));
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

export function lootRarity(enemyTier, rng = Math.random) {
  const roll = rng();
  const thresholds = {normal: [.004, .045, .28], magic: [.015, .16, .70], rare: [.06, .50, 1], unique: [.18, 1, 1]};
  const [unique, rare, magic] = thresholds[enemyTier] || thresholds.normal;
  return roll < unique ? 3 : roll < rare ? 2 : roll < magic ? 1 : 0;
}
export function affixBonuses(items) {
  const bonuses = {attack: 0, defense: 0, maxHp: 0, haste: 0, movement: 0, reach: 0, critical: 0, criticalMultiplier: 0, fire: 0, cold: 0, lightning: 0, resist: 0, leech: 0, regen: 0};
  for (const item of items.filter(Boolean)) for (const affix of item.affixes || []) {
    if (AFFIXES[affix.id]) bonuses[AFFIXES[affix.id].stat] += affix.value;
  }
  return bonuses;
}