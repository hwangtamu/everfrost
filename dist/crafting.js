// Path-of-Exile-style crafting services, paid with the hero's gold and essence.
// Orbs mutate an item in place; costs scale with the target's item level. The
// crafting bench adds a chosen modifier at a chosen tier for a fixed price.

import {AFFIXES, affixSlots, canAddAffix, randomSideAffix, rerollItem, rerollValues, makeAffix, tierOf} from './loot.js';

export const CRAFT_OPERATIONS = {
  transmute: {name: 'Orb of Transmutation', flavor: 'Upgrades a normal item to magic with 1–2 explicit modifiers.', icon: 'sparkles', gold: 20, shards: 1},
  augment: {name: 'Orb of Augmentation', flavor: 'Adds one explicit modifier to a magic item.', icon: 'sparkles', gold: 35, shards: 2},
  regal: {name: 'Regal Orb', flavor: 'Raises a magic item to rare and adds one modifier.', icon: 'star', gold: 90, shards: 6},
  alchemy: {name: 'Orb of Alchemy', flavor: 'Upgrades a normal item directly to rare with a full roll.', icon: 'zap', gold: 110, shards: 8},
  chaos: {name: 'Orb of Chaos', flavor: 'Rerolls every explicit modifier of a rare item.', icon: 'zap', gold: 150, shards: 12},
  exalt: {name: 'Exalted Orb', flavor: 'Adds one random modifier to a rare item.', icon: 'star', gold: 240, shards: 18},
  scour: {name: 'Orb of Scouring', flavor: 'Removes all explicit modifiers, returning the item to normal.', icon: 'download', gold: 30, shards: 2},
  divine: {name: 'Divine Orb', flavor: 'Rerolls the values of existing modifiers without changing their tiers.', icon: 'sparkles', gold: 70, shards: 5}
};

export const craftCost = (op, item) => {
  const scale = 1 + (item?.itemLevel || 1) * .18;
  return {gold: Math.round(op.gold * scale), shards: Math.round(op.shards * scale)};
};

export const craftTarget = (s, id) =>
  (id ? s.inventory.find(i => i.id === id) : null) || Object.values(s.equipment).find(i => i?.id === id) || null;

export function craft(s, item, opId, rng = Math.random) {
  const op = CRAFT_OPERATIONS[opId];
  if (!op || !item) return {ok: false, reason: 'Unknown operation or target.'};
  const cost = craftCost(op, item);
  if (s.gold < cost.gold || s.shards < cost.shards) {
    return {ok: false, reason: `Not enough resources (${cost.gold} gold · ${cost.shards} essence).`};
  }
  const open = () => ['prefix', 'suffix'].filter(side => canAddAffix(item, side));
  switch (opId) {
    case 'transmute': if (item.rarity !== 0) return {ok: false, reason: 'Only normal items can be transmuted.'}; rerollItem(item, 1, rng); break;
    case 'augment': if (item.rarity !== 1) return {ok: false, reason: 'Only magic items can be augmented.'}; if (!open().length) return {ok: false, reason: 'Every modifier slot is full.'}; randomSideAffix(item, rng); break;
    case 'regal': if (item.rarity !== 1) return {ok: false, reason: 'Only magic items can be raised by a Regal Orb.'}; item.rarity = 2; randomSideAffix(item, rng); break;
    case 'alchemy': if (item.rarity !== 0) return {ok: false, reason: 'Only normal items can be upgraded by an Orb of Alchemy.'}; rerollItem(item, 2, rng); break;
    case 'chaos': if (item.rarity !== 2) return {ok: false, reason: 'Chaos orbs reroll rare items.'}; rerollItem(item, 2, rng); break;
    case 'exalt': if (item.rarity !== 2) return {ok: false, reason: 'Exalted orbs only affect rare items.'}; if (!open().length) return {ok: false, reason: 'Every modifier slot is full.'}; randomSideAffix(item, rng); break;
    case 'scour': if (item.rarity < 1) return {ok: false, reason: 'This item already has no modifiers.'}; item.rarity = 0; item.affixes = []; item.unique = null; break;
    case 'divine': if (item.rarity < 1) return {ok: false, reason: 'Divine orbs need an explicit modifier to bless.'}; rerollValues(item, rng); break;
    default: return {ok: false, reason: 'Unknown operation.'};
  }
  s.gold -= cost.gold; s.shards -= cost.shards;
  s.crafted = (s.crafted || 0) + 1;
  return {ok: true, item, opId, cost};
}

export function benchCost(def, tier, itemLevel) {
  const t = tierOf(def, tier), center = (t.minVal + t.maxVal) / 2;
  return {gold: Math.max(25, Math.round(center * 6 * (1 + itemLevel * .08))), shards: 2 + (def.tiers.length - tier) * 2};
}

export function benchCraft(s, item, affixId, tier, rng = Math.random) {
  const def = AFFIXES[affixId];
  if (!item || !def) return {ok: false, reason: 'Choose a modifier and a target item.'};
  if (item.rarity === 0) return {ok: false, reason: 'The bench needs a magic or rare item.'};
  if (!def.slots.includes(item.slot)) return {ok: false, reason: `${def.name} cannot be applied to ${item.slot}s.`};
  const tierNum = Math.max(1, Math.min(def.tiers.length, Math.round(Number(tier) || 1)));
  const t = tierOf(def, tierNum);
  if (t.minLevel > item.itemLevel) return {ok: false, reason: `Tier ${tierNum} requires item level ${t.minLevel} or higher.`};
  if (!canAddAffix(item, def.kind)) return {ok: false, reason: `All ${def.kind} slots are full.`};
  if ((item.affixes || []).some(a => a.id === affixId)) return {ok: false, reason: 'That modifier is already present.'};
  const cost = benchCost(def, tierNum, item.itemLevel || 1);
  if (s.gold < cost.gold || s.shards < cost.shards) {
    return {ok: false, reason: `Not enough resources (${cost.gold} gold · ${cost.shards} essence).`};
  }
  s.gold -= cost.gold; s.shards -= cost.shards;
  s.crafted = (s.crafted || 0) + 1;
  item.affixes = [...(item.affixes || []), makeAffix(affixId, item.itemLevel || 1, rng, tierNum)];
  affixSlots(item);
  return {ok: true, item, affix: def.name, tier: tierNum, cost};
}