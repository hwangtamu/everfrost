// Path-of-Exile-style crafting services. Orbs can only be found by defeating
// enemies; applying one to an item costs gold that scales with the target's
// item level. The crafting bench adds a chosen modifier at a chosen tier for
// gold alone (no orb is consumed).

import {AFFIXES, affixSlots, canAddAffix, randomSideAffix, rerollItem, rerollValues, makeAffix, tierOf} from './loot.js';

export const CRAFT_OPERATIONS = {
  transmute: {name: 'Orb of Transmutation', flavor: 'Upgrades a normal item to magic with 1–2 explicit modifiers.', icon: 'sparkles', gold: 20},
  augment: {name: 'Orb of Augmentation', flavor: 'Adds one explicit modifier to a magic item.', icon: 'sparkles', gold: 35},
  regal: {name: 'Regal Orb', flavor: 'Raises a magic item to rare and adds one modifier.', icon: 'star', gold: 90},
  alchemy: {name: 'Orb of Alchemy', flavor: 'Upgrades a normal item directly to rare with a full roll.', icon: 'zap', gold: 110},
  chaos: {name: 'Orb of Chaos', flavor: 'Rerolls every explicit modifier of a rare item.', icon: 'zap', gold: 150},
  exalt: {name: 'Exalted Orb', flavor: 'Adds one random modifier to a rare item.', icon: 'star', gold: 240},
  scour: {name: 'Orb of Scouring', flavor: 'Removes all explicit modifiers, returning the item to normal.', icon: 'download', gold: 30},
  divine: {name: 'Divine Orb', flavor: 'Rerolls the values of existing modifiers without changing their tiers.', icon: 'sparkles', gold: 70}
};

export const craftCost = (op, item) => ({gold: Math.round(op.gold * (1 + (item?.itemLevel || 1) * .18))});

export const craftTarget = (s, id) =>
  (id ? s.inventory.find(i => i.id === id) : null) || Object.values(s.equipment).find(i => i?.id === id) || null;

// Why an orb cannot be used on an item right now ('' when it can).
export function craftBlock(item, opId) {
  if (!item) return 'Choose an item.';
  const full = !['prefix', 'suffix'].some(side => canAddAffix(item, side));
  switch (opId) {
    case 'transmute': case 'alchemy': return item.rarity === 0 ? '' : 'Needs a normal item';
    case 'augment': return item.rarity !== 1 ? 'Needs a magic item' : full ? 'No free modifier slot' : '';
    case 'regal': return item.rarity === 1 ? '' : 'Needs a magic item';
    case 'chaos': return item.rarity === 2 ? '' : 'Needs a rare item';
    case 'exalt': return item.rarity !== 2 ? 'Needs a rare item' : full ? 'No free modifier slot' : '';
    case 'scour': return item.rarity >= 1 ? '' : 'Nothing to remove';
    case 'divine': return item.affixes?.length ? '' : 'No modifiers to reroll';
    default: return 'Unknown orb';
  }
}

export function craft(s, item, opId, rng = Math.random) {
  const op = CRAFT_OPERATIONS[opId];
  if (!op || !item) return {ok: false, reason: 'Unknown operation or target.'};
  const article = /^[aeiou]/i.test(op.name) ? 'an' : 'a';
  if ((s.orbs?.[opId] || 0) < 1) return {ok: false, reason: `You don't have ${article} ${op.name}. Defeat enemies to find orbs.`};
  const cost = craftCost(op, item);
  if (s.gold < cost.gold) return {ok: false, reason: `Not enough gold (${cost.gold}).`};
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
  s.gold -= cost.gold;
  s.orbs[opId] = Math.max(0, (s.orbs[opId] || 0) - 1);
  s.crafted = (s.crafted || 0) + 1;
  return {ok: true, item, opId, cost};
}

export function benchCost(def, tier, itemLevel) {
  const t = tierOf(def, tier), center = (t.minVal + t.maxVal) / 2;
  return {gold: Math.max(25, Math.round(center * 6 * (1 + itemLevel * .08)))};
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
  if (s.gold < cost.gold) return {ok: false, reason: `Not enough gold (${cost.gold}).`};
  s.gold -= cost.gold;
  s.crafted = (s.crafted || 0) + 1;
  item.affixes = [...(item.affixes || []), makeAffix(affixId, item.itemLevel || 1, rng, tierNum)];
  return {ok: true, item, affix: def.name, tier: tierNum, cost};
}