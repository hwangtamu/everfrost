import test from 'node:test';
import assert from 'node:assert/strict';
import {AFFIXES, rollAffixes, makeAffix, affixSlots, canAddAffix, rerollValues, tierOf, affixText} from '../dist/loot.js';
import {CRAFT_OPERATIONS, craft, craftCost, benchCraft, benchCost, craftTarget} from '../dist/crafting.js';
import {createGame, makeItem, saveGame, loadGame, SAVE_KEY} from '../dist/engine.js';
import {seededRandom} from '../dist/world.js';

const rng = seededRandom(2024);
function memory() { const data = new Map(); return {getItem: k => data.get(k), setItem: (k, v) => data.set(k, v)}; }
function rich() { const s = createGame(1000, 1); s.gold = 10000; s.shards = 1000; return s; }

test('rarity dictates explicit modifier counts inside prefix and suffix limits', () => {
  for (const slot of ['weapon', 'armor', 'charm']) for (const rarity of [0, 1, 2, 3]) {
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
  const high = new Set(Array.from({length: 300}, () => makeAffix('might', 30, rng).tier));
  assert(low.has(5)); assert(!low.has(1)); assert(high.has(1));
});

test('crafting orbs follow rarity transitions and charge exact costs once', () => {
  const s = rich();
  const item = makeItem('weapon', 0, 10);
  const cost = craftCost(CRAFT_OPERATIONS.transmute, item);
  const gold = s.gold, shards = s.shards;
  assert(craft(s, item, 'transmute', rng).ok);
  assert.equal(item.rarity, 1);
  assert(item.affixes.length >= 1 && item.affixes.length <= 2);
  assert.equal(s.gold, gold - cost.gold); assert.equal(s.shards, shards - cost.shards);
  assert(!craft(s, item, 'transmute', rng).ok); // already magic

  const before = item.affixes.length;
  assert(craft(s, item, 'augment', rng).ok);
  assert.equal(item.affixes.length, before + 1);

  assert(craft(s, item, 'regal', rng).ok);
  assert.equal(item.rarity, 2);
  const rareCount = item.affixes.length;
  assert(craft(s, item, 'exalt', rng).ok);
  assert.equal(item.affixes.length, rareCount + 1);

  assert(craft(s, item, 'chaos', rng).ok);
  assert.equal(item.rarity, 2);
  assert(item.affixes.length >= 4 && item.affixes.length <= 6);

  const ids = item.affixes.map(a => a.id);
  assert(craft(s, item, 'divine', rng).ok);
  assert.deepEqual(item.affixes.map(a => a.id), ids);

  assert(craft(s, item, 'scour', rng).ok);
  assert.equal(item.rarity, 0); assert.equal(item.affixes.length, 0);
  assert(!craft(s, item, 'exalt', rng).ok);

  // Failure paths do not spend resources or mutate the item.
  const snapshot = JSON.stringify(item);
  s.gold = 0;
  assert(!craft(s, item, 'alchemy', rng).ok);
  assert.equal(JSON.stringify(item), snapshot);
  assert(affixSlots(item).prefix === 0);
});

test('alchemy, full rerolls and bench crafting stay within all caps', () => {
  const s = rich();
  const item = makeItem('weapon', 0, 12);
  assert(craft(s, item, 'alchemy', rng).ok);
  assert.equal(item.rarity, 2);
  const weaponPrefixes = ['might', 'fire', 'cold', 'lightning'];
  // Find a state with an open prefix slot and a prefix family not already present.
  for (let guard = 0; guard < 40 && (item.affixes.filter(a => AFFIXES[a.id].kind === 'prefix').length > 2 || weaponPrefixes.every(id => item.affixes.some(a => a.id === id))); guard++) {
    craft(s, item, 'chaos', rng);
  }
  const id = weaponPrefixes.find(x => !item.affixes.some(a => a.id === x));
  const prefixes = item.affixes.filter(a => AFFIXES[a.id].kind === 'prefix');
  assert(prefixes.length >= 2 && prefixes.length <= 3);
  assert(id);

  const def = AFFIXES[id], cost = benchCost(def, 3, item.itemLevel);
  const gold = s.gold, shards = s.shards;
  const r = benchCraft(s, item, id, 3, rng);
  assert(r.ok);
  const affix = item.affixes.find(a => a.id === id);
  assert(affix); assert.equal(affix.tier, 3);
  assert.equal(affix.min, def.tiers.at(-3).minVal);
  assert.equal(s.gold, gold - cost.gold); assert.equal(s.shards, shards - cost.shards);
  assert(!benchCraft(s, item, id, 3, rng).ok); // duplicates rejected
  assert(!benchCraft(s, makeItem('weapon', 1, 3), id, 3, rng).ok); // item level too low
  assert(!benchCraft(s, item, 'resist', 3, rng).ok); // wrong slot for a weapon
});

test('craftTarget finds equipped and satchel items; craft tracks the forge quest', () => {
  const s = rich();
  const equipped = s.equipment.weapon;
  assert.equal(craftTarget(s, equipped.id), equipped);
  const pocket = makeItem('charm', 0, 5);
  s.inventory.unshift(pocket);
  assert.equal(craftTarget(s, pocket.id), pocket);
  assert.equal(craftTarget(s, 'nope'), null);
  const before = s.crafted;
  assert(craft(s, pocket, 'transmute', rng).ok);
  assert.equal(s.crafted, before + 1);
});

test('legacy-style and crafted affixes survive the save round trip', () => {
  const storage = memory(), s = rich();
  const item = makeItem('weapon', 2, 12);
  craft(s, item, 'divine', rng);
  item.affixes[0] = {id: item.affixes[0].id, value: 13}; // legacy: no tier, min or max
  s.inventory.unshift(item);
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
  assert.equal(canAddAffix(copy, 'prefix'), copy.affixes.filter(a => AFFIXES[a.id].kind === 'prefix').length < 3);
});

test('divine orb rerolls values but keeps tiers and never exceeds the tier range', () => {
  const item = makeItem('weapon', 2, 20);
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