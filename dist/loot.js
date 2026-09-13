export const ITEM_RARITIES = ['Normal', 'Magic', 'Rare', 'Unique'];
export const AFFIXES = {
  might: {name: 'Forceful', label: 'attack', stat: 'attack', min: 2, scale: .6, slots: ['weapon', 'charm']},
  guard: {name: 'Ironbound', label: 'defense', stat: 'defense', min: 2, scale: .4, slots: ['armor', 'charm']},
  life: {name: 'Vital', label: 'maximum health', stat: 'maxHp', min: 9, scale: 2, slots: ['armor', 'charm']},
  haste: {name: 'of Haste', label: '% attack speed', stat: 'haste', min: 4, scale: .5, slots: ['weapon', 'charm']},
  precision: {name: 'of Precision', label: '% critical chance', stat: 'critical', min: 2, scale: .2, slots: ['weapon', 'charm']},
  fire: {name: 'Smoldering', label: 'fire damage', stat: 'fire', min: 2, scale: .5, slots: ['weapon', 'charm']},
  cold: {name: 'Frostwoven', label: 'cold damage', stat: 'cold', min: 2, scale: .5, slots: ['weapon', 'charm']},
  lightning: {name: 'Stormforged', label: 'lightning damage', stat: 'lightning', min: 2, scale: .5, slots: ['weapon', 'charm']},
  resist: {name: 'of Warding', label: '% elemental resistance', stat: 'resist', min: 5, scale: .8, slots: ['armor', 'charm']},
  leech: {name: 'Vampiric', label: '% damage leeched as life', stat: 'leech', min: 1, scale: .15, slots: ['weapon']},
  regeneration: {name: 'of Renewal', label: 'life regenerated / sec', stat: 'regen', min: 1, scale: .15, slots: ['armor', 'charm']}
};
export const UNIQUE_EFFECTS = {
  weapon: {name: 'Dawn’s Echo', description: 'Every fourth basic attack strikes twice.', id: 'echo'},
  armor: {name: 'Last Light', description: 'Take 25% less damage while below 35% health.', id: 'lastLight'},
  charm: {name: 'Wildheart', description: 'Healing skills also restore an extra 15% maximum health.', id: 'wildheart'}
};
export function rollAffixes(slot, rarity, level, rng = Math.random) {
  const pool = Object.entries(AFFIXES).filter(([, a]) => a.slots.includes(slot));
  const count = rarity === 0 ? 0 : rarity === 1 ? 1 + Math.floor(rng() * 2) : rarity === 2 ? 3 : 4;
  const result = [];
  for (let i = 0; i < count && pool.length; i++) {
    const [id, a] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const value = Math.max(1, Math.round((a.min + level * a.scale) * (.8 + rng() * .5)));
    result.push({id, value, tier: Math.max(1, 5 - Math.floor(level / 5))});
  }
  return result;
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
  const bonuses = {attack: 0, defense: 0, maxHp: 0, haste: 0, critical: 0, fire: 0, cold: 0, lightning: 0, resist: 0, leech: 0, regen: 0};
  for (const item of items.filter(Boolean)) for (const affix of item.affixes || []) {
    if (AFFIXES[affix.id]) bonuses[AFFIXES[affix.id].stat] += affix.value;
  }
  return bonuses;
}
