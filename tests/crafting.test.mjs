import {GEAR_SLOTS} from '../dist/gear.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {AFFIXES, rollAffixes, makeAffix, affixSlots, rerollValues, tierOf, affixText, itemGrade, ITEM_GRADES} from '../dist/loot.js';
import {CRAFT_OPERATIONS, craft, craftCost, craftEligibility, craftTarget} from '../dist/crafting.js';
import {createGame, makeItem, saveGame, loadGame, SAVE_KEY} from '../dist/engine.js';
import {seededRandom} from '../dist/world.js';

const rng = seededRandom(2024);
function memory() { const data = new Map(); return {getItem: k => data.get(k), setItem: (k, v) => data.set(k, v)}; }
function rich() { const s = createGame(1000, 1); s.gold = 50000; for (const key of Object.keys(CRAFT_OPERATIONS)) s.orbs[key] = 50; return s; }

test('rarity dictates explicit modifier counts inside prefix and suffix limits', () => {
  for (const slot of GEAR_SLOTS) for (const rarity of [0, 1, 2, 3]) {
    for (let n = 0; n < 60; n++) {
      const affixes = rollAffixes(slot, rarity, 10, rng);
      const prefixes = affixes.filter(a => AFFIXES[a.id].kind === 'prefix');
      assert.equal(prefixes.length + affixes.length - prefixes.length, affixes.length);
      if (rarity === 0) assert.equal(affixes.length, 0);
      if (rarity === 1) assert.equal(prefixes.length, 1);
      if (rarity === 2) assert(prefixes.length >= 2 && prefixes.length <= 3);
      if (rarity === 3) assert.equal(prefixes.length, 3);
      assert(affixes.every(a => AFFIXES[a.id].slots.includes(slot)));
      assert.equal(new Set(affixes.map(a => a.id)).size, affixes.length);
    }
  }
});

test('tiers gate by item level and values stay inside their tier range', () => {
  for (const id of Object.keys(AFFIXES)) {
    const def = AFFIXES[id];
    for (let ilvl = 1; ilvl <= 24; ilvl += 3) for (let n = 0; n < 40; n++) {
      const a = makeAffix(id, ilvl, rng);
      assert(a.tier >= 1 && a.tier <= def.tiers.length);
      const t = tierOf(def, a.tier);
      assert(t.minLevel <= ilvl);
      assert(a.value >= t.minVal && a.value <= t.maxVal);
      assert.equal(affixText(a).length > 0, true);
    }
  }
  // A high item level can reach Tier 1; a low one never can.
  const low = new Set(Array.from({length: 300}, () => makeAffix('might', 2, rng).tier));
  const mid = new Set(Array.from({length: 300}, () => makeAffix('might', 30, rng).tier));
  const high = new Set(Array.from({length: 300}, () => makeAffix('might', 200, rng).tier));
  assert(low.has(9)); assert(!low.has(5)); assert(mid.has(5)); assert(!mid.has(1)); assert(high.has(1));
});

test('orb eligibility follows the new rules and failed crafts never charge', () => {
  const s = rich();
  const bare = makeItem('hand', 0, 20);            // 0 explicit modifiers
  assert.equal(craftEligibility('augment', bare), '');
  assert.equal(craftEligibility('regal', bare), '');
  assert.equal(craftEligibility('alchemy', bare), '');
  assert(craftEligibility('chaos', bare));          // requires more than 3
  assert.equal(craftEligibility('exalt', bare), '');
  assert(craftEligibility('scour', bare));          // nothing to remove

  const full = makeItem('hand', 3, 20);             // 3 prefixes + 3 suffixes
  assert.equal(full.affixes.length, 6);
  assert(craftEligibility('augment', full));
  assert(craftEligibility('regal', full));
  assert(craftEligibility('alchemy', full));
  assert.equal(craftEligibility('chaos', full), '');
  assert(craftEligibility('exalt', full));

  const gold = s.gold, orbs = s.orbs.exalt, snapshot = JSON.stringify(full);
  assert(!craft(s, full, 'exalt', rng).ok);
  assert.equal(s.gold, gold); assert.equal(s.orbs.exalt, orbs);
  assert.equal(JSON.stringify(full), snapshot);
});

test('crafting orbs produce the specified modifier counts and charge exact costs once', () => {
  const s = rich();
  const item = makeItem('hand', 0, 20); s.inventory.push(item);
  const cost = craftCost(CRAFT_OPERATIONS.transmute, item);
  const gold = s.gold, orbs = s.orbs.transmute;
  assert(craft(s, item, 'transmute', rng).ok);
  assert(item.affixes.length >= 1 && item.affixes.length <= 2); // at most two
  assert.equal(s.gold, gold - cost.gold); assert.equal(s.orbs.transmute, orbs - 1);

  // Transmutation is always available: it rerolls into 1–2 modifiers again.
  assert(craft(s, item, 'transmute', rng).ok);
  assert(item.affixes.length >= 1 && item.affixes.length <= 2);

  // Reach more than 3 modifiers with Exalted (adds one until 6).
  let guard = 20;
  while (item.affixes.length <= 3 && guard-- > 0) assert(craft(s, item, 'exalt', rng).ok);
  assert(item.affixes.length > 3);
  assert(craft(s, item, 'chaos', rng).ok);           // reroll into exactly 6
  assert.equal(item.affixes.length, 6);
  const slots = affixSlots(item);
  assert(slots.prefix === 3 && slots.suffix === 3);

  assert(craft(s, item, 'transmute', rng).ok);       // back to 1–2
  assert(craft(s, item, 'alchemy', rng).ok);         // fewer than 3 → 3–6
  assert(item.affixes.length >= 3 && item.affixes.length <= 6);
  assert(affixSlots(item).prefix <= 3 && affixSlots(item).suffix <= 3);
});

test('augment, regal and exalt each add exactly one modifier inside the 3+3 caps', () => {
  const s = rich();
  const item = makeItem('hand', 0, 20); s.inventory.push(item);
  assert(craft(s, item, 'augment', rng).ok);
  assert.equal(item.affixes.length, 1);
  assert(craft(s, item, 'regal', rng).ok);
  assert.equal(item.affixes.length, 2);
  assert(craft(s, item, 'exalt', rng).ok);
  assert.equal(item.affixes.length, 3);
  assert(affixSlots(item).prefix <= 3 && affixSlots(item).suffix <= 3);
  // A full item refuses every adding orb.
  const full = makeItem('hand', 3, 20);
  assert(!craft(s, full, 'augment', rng).ok);
  assert(!craft(s, full, 'regal', rng).ok);
  assert(!craft(s, full, 'exalt', rng).ok);
});

test('scouring removes every explicit modifier and keeps unique powers', () => {
  const s = rich();
  const item = makeItem('hand', 3, 20); s.inventory.push(item);
  const unique = item.unique, roll = item.uniqueRoll;
  assert.equal(item.affixes.length, 6);
  assert(craft(s, item, 'scour', rng).ok);
  assert.equal(item.affixes.length, 0);
  assert.equal(item.unique, unique);     // permanent implicit power survives
  assert.equal(item.uniqueRoll, roll);   // its roll is untouched by scouring
  assert(!craft(s, item, 'scour', rng).ok);
});

test('divine rerolls every value while keeping modifier types and tiers', () => {
  const s = rich();
  const item = makeItem('hand', 3, 20); s.inventory.push(item);
  const ids = item.affixes.map(a => a.id), tiers = item.affixes.map(a => a.tier);
  const unique = item.unique, roll = item.uniqueRoll;
  assert(craft(s, item, 'divine', rng).ok);
  assert.deepEqual(item.affixes.map(a => a.id), ids);
  assert.deepEqual(item.affixes.map(a => a.tier), tiers);
  for (const a of item.affixes) {
    const t = tierOf(AFFIXES[a.id], a.tier);
    assert(a.value >= t.minVal && a.value <= t.maxVal);
  }
  assert.equal(item.unique, unique);
  if (roll !== undefined) assert(item.uniqueRoll >= .9 && item.uniqueRoll <= 1.1);
});

test('item grade follows the strongest modifier tier, from D to S', () => {
  const d = makeItem('hand', 0, 20); // no modifiers
  assert.equal(itemGrade(d), 0); assert.equal(ITEM_GRADES[itemGrade(d)], 'D');
  d.affixes = [{id: 'might', tier: 9, value: 3, min: 2, max: 4}];
  assert.equal(itemGrade(d), 0);
  d.affixes.push({id: 'haste', tier: 1, value: 22, min: 22, max: 29});
  assert.equal(itemGrade(d), 8); assert.equal(ITEM_GRADES[itemGrade(d)], 'S');
  d.affixes = [{id: 'fire', tier: 6, value: 23, min: 23, max: 34}];
  assert.equal(itemGrade(d), 3); assert.equal(ITEM_GRADES[itemGrade(d)], 'A');
});

test('craftTarget finds equipped and satchel items; craft tracks the forge quest', () => {
  const s = rich();
  const equipped = s.equipment.hand;
  assert.equal(craftTarget(s, equipped.id), equipped);
  const pocket = makeItem('neck', 0, 5);
  s.inventory.unshift(pocket);
  assert.equal(craftTarget(s, pocket.id), pocket);
  assert.equal(craftTarget(s, 'nope'), null);
  const before = s.crafted;
  assert(craft(s, pocket, 'transmute', rng).ok);
  assert.equal(s.crafted, before + 1);
});

test('legacy-style and crafted affixes survive the save round trip', () => {
  const storage = memory(), s = rich();
  const item = makeItem('hand', 2, 12); s.inventory.unshift(item);
  craft(s, item, 'divine', rng);
  item.affixes[0] = {id: item.affixes[0].id, value: 13}; // legacy: no tier, min or max
  saveGame(s, storage, 1000);
  const loaded = loadGame(storage, 1001);
  assert(!loaded.recovered);
  const copy = loaded.state.inventory.find(i => i.id === item.id);
  assert(copy);
  for (const a of copy.affixes) {
    const t = tierOf(AFFIXES[a.id], a.tier);
    assert(a.value >= t.minVal && a.value <= t.maxVal);
    assert.equal(a.min, t.minVal); assert.equal(a.max, t.maxVal);
  }
});

test('divine orb rerolls values but keeps tiers and never exceeds the tier range', () => {
  const item = makeItem('hand', 2, 20);
  const snapshot = item.affixes.map(a => ({id: a.id, tier: a.tier}));
  const values = new Set();
  for (let i = 0; i < 60; i++) {
    rerollValues(item, rng);
    for (const a of item.affixes) {
      const t = tierOf(AFFIXES[a.id], a.tier);
      assert(a.value >= t.minVal && a.value <= t.maxVal);
      values.add(a.value);
    }
  }
  assert(values.size > 1); // values actually move
  assert.deepEqual(item.affixes.map(a => ({id: a.id, tier: a.tier})), snapshot);
});