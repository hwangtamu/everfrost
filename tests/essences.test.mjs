import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,makeItem,saveGame,loadGame} from '../dist/engine.js';
import {AFFIXES,ITEM_GRADES,affixGrade,tierOf} from '../dist/loot.js';
import {ESSENCE_RECOVERY,ESSENCE_SUCCESS,essenceKey,essenceCount,validEssence,normalizeEssences,recoverEssences,applyEssence,essenceEligibility,discardEssence} from '../dist/essences.js';
import {normalizeLootFilter} from '../dist/loot-filter.js';
import {craftingPanel,selectEssenceFilter} from '../dist/crafting-ui.js';

test('recovery odds decline as modifier grade rises and each essence holds one modifier', () => {
  assert(ESSENCE_RECOVERY.every((rate, i) => i === 0 || rate < ESSENCE_RECOVERY[i - 1]));
  const s = createGame(1000, 42), item = makeItem('hand', 2, 10, () => .5);
  const all = recoverEssences(s, item, () => 0);            // rng below every rate
  assert.equal(all.recovered.length, item.affixes.length);
  for (const e of all.recovered) {
    assert(validEssence(e));
    assert.equal(e.count, 1);
    assert.equal(e.affix.id, e.id.split(':')[0]);
  }
  const none = recoverEssences(s, item, () => .999);        // rng above every rate
  assert.equal(none.recovered.length, 0);
  assert.equal(essenceCount(s), item.affixes.length);
});

test('identical essences stack and normalizeEssences deduplicates, validates and caps', () => {
  const entry = (tier, value) => { const a = {id: 'might', tier, value, min: tierOf(AFFIXES.might, tier).minVal, max: tierOf(AFFIXES.might, tier).maxVal}; return {id: essenceKey(a), affix: a, count: 1}; };
  const merged = normalizeEssences([entry(9, 3), entry(9, 3), entry(6, 12), entry(5, 15)]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(e => e.affix.tier === 9).count, 2);
  assert(merged.every(validEssence));
  const corrupt = normalizeEssences([
    {id: 'bogus', affix: {id: 'nope', tier: 9, value: 3}, count: 1},
    {id: 'x', affix: {id: 'might', tier: 9, value: 99}, count: 1},           // out of tier range
    {id: 'y', affix: {id: 'might', tier: 9, value: 3}, count: .5},           // non-integer count
    {id: 'z', affix: {id: 'might', tier: 0, value: 3}, count: 1}             // invalid tier
  ]);
  assert.equal(corrupt.length, 0);
});

test('the loot filter minimum essence grade suppresses low-grade recovery', () => {
  const s = createGame(1000, 42);
  s.lootFilter = normalizeLootFilter({minEssenceGrade: 5});
  const item = makeItem('hand', 1, 5, () => .5);             // tier 8–9 rolls → grades 0–1
  const low = recoverEssences(s, item, () => 0);
  assert.equal(low.recovered.length, 0);
  assert.equal(low.ignored, item.affixes.length);
  s.lootFilter = normalizeLootFilter({minEssenceGrade: 0});
  const all = recoverEssences(s, item, () => 0);
  assert.equal(all.recovered.length, item.affixes.length);
});

test('essences fill open slots or replace weaker modifiers; failure still consumes one', () => {
  const s = createGame(1000, 42);
  const item = makeItem('neck', 0, 20, () => .5); s.inventory = [item];
  const make = (tier, value, min, max) => { const a = {id: 'might', tier, value, min, max}; return {id: essenceKey(a), affix: a, count: 1}; };
  // Wrong gear slot is rejected and the essence is not consumed.
  item.slot = 'chest'; s.essences = [make(9, 3, 2, 4)];
  assert(!applyEssence(s, item, s.essences[0].id, () => 0).ok);
  assert.equal(s.essences.length, 1);
  // Open prefix slot → applied.
  item.slot = 'neck';
  const r1 = applyEssence(s, item, s.essences[0].id, () => 0);
  assert(r1.ok && r1.success && r1.affix.id === 'might');
  assert.equal(s.essences.length, 0);
  assert.equal(item.affixes.length, 1);
  assert.equal(item.affixes[0].tier, 9);
  assert.equal(s.crafted, 1);                                // counts toward the forge quest
  // A weaker essence cannot replace a stronger modifier of the same family.
  const weaker = make(5, 15, 12, 18); s.essences = [weaker];
  item.affixes = [{id: 'might', tier: 3, value: 28, min: 23, max: 34}];
  assert(essenceEligibility(item, weaker));
  assert(!applyEssence(s, item, weaker.id, () => 0).ok);
  // A stronger essence replaces the weaker modifier, keeping one slot.
  const upgrade = make(3, 28, 23, 34); s.essences = [upgrade];
  item.affixes = [{id: 'might', tier: 5, value: 15, min: 12, max: 18}];
  assert(!essenceEligibility(item, upgrade));
  const r2 = applyEssence(s, item, upgrade.id, () => 0);
  assert(r2.ok && r2.success);
  assert.equal(item.affixes.length, 1);
  assert.equal(item.affixes[0].tier, 3);
  // Failure consumes the essence and leaves the item unchanged.
  const fails = make(9, 3, 2, 4); s.essences = [fails];
  item.affixes = [{id: 'guard', tier: 5, value: 5, min: 4, max: 6}]; // 'might' stays an open prefix
  const snapshot = JSON.stringify(item);
  const r3 = applyEssence(s, item, fails.id, () => .999);    // above grade 0's 95% chance
  assert(r3.ok && !r3.success);
  assert.equal(s.essences.length, 0);
  assert.equal(JSON.stringify(item), snapshot);
});

test('essence application respects the 3 prefix / 3 suffix caps', () => {
  const s = createGame(1000, 42);
  const item = {id: 'x', slot: 'neck', name: 'Blessed Neck', itemLevel: 20, implicits: {attack: 4, maxHp: 9}, upgrade: 0, affixes: [
    {id: 'guard', tier: 5, value: 5, min: 4, max: 6},
    {id: 'life', tier: 5, value: 50, min: 40, max: 65},
    {id: 'fire', tier: 5, value: 12, min: 12, max: 22},
    {id: 'swiftness', tier: 5, value: 12, min: 12, max: 20},
    {id: 'resist', tier: 5, value: 9, min: 9, max: 15},
    {id: 'regeneration', tier: 5, value: 3, min: 3, max: 6}
  ]};
  s.inventory = [item];
  const a = {id: 'might', tier: 9, value: 3, min: 2, max: 4}; // a prefix absent from the item
  const essence = {id: essenceKey(a), affix: a, count: 1}; s.essences = [essence];
  assert(essenceEligibility(item, essence));
  assert(!applyEssence(s, item, essence.id, () => 0).ok);
  assert.equal(s.essences.length, 1);                       // never consumed when ineligible
});

test('players can discard essences in whole stacks or exact amounts', () => {
  const s = createGame(1000, 42);
  const a = {id: 'might', tier: 9, value: 3, min: 2, max: 4}, b = {id: 'cold', tier: 4, value: 20, min: 17, max: 31};
  s.essences = [{id: essenceKey(a), affix: {...a}, count: 7}, {id: essenceKey(b), affix: {...b}, count: 1}];
  assert.equal(discardEssence(s, 'missing'), 0);               // unknown stack is a no-op
  assert.equal(discardEssence(s, essenceKey(a), 0), 0);        // zero discards nothing
  assert.equal(discardEssence(s, essenceKey(a), -2), 0);       // negative discards nothing
  assert.equal(discardEssence(s, essenceKey(a), 3), 3);        // exact partial amount
  assert.equal(s.essences.find(x => x.id === essenceKey(a)).count, 4);
  assert.equal(discardEssence(s, essenceKey(a)), 4);           // no amount → whole stack
  assert.equal(s.essences.length, 1);
  assert.equal(discardEssence(s, essenceKey(b), 99), 1);       // over-amount → everything available
  assert.equal(s.essences.length, 0);
  assert.equal(essenceCount(s), 0);
});

test('crafting UI uses selectable essence cards with filters and discard controls', () => {
  const s=createGame(1000,42),item=makeItem('hand',0,20,()=>.5);s.inventory=[item];
  const prefix={id:'might',tier:9,value:3,min:2,max:4},suffix={id:'haste',tier:8,value:8,min:5,max:9};
  s.essences=[{id:essenceKey(prefix),affix:prefix,count:2},{id:essenceKey(suffix),affix:suffix,count:1}];
  let html=craftingPanel(s);
  assert(!html.includes('id="craft-essence"'));
  assert.equal((html.match(/data-essence="/g)||[]).length,2);
  assert(html.includes('data-essence-grade="D"'));assert(html.includes('data-essence-kind="compatible"'));
  assert(html.includes('id="essence-search"'));assert(html.includes('data-discard-essence-one='));assert(html.includes('data-discard-essence='));
  assert(html.includes('95% success'));
  selectEssenceFilter('kind','suffix');html=craftingPanel(s);
  assert.equal((html.match(/data-essence="/g)||[]).length,1);assert(html.includes('of Haste'));
  selectEssenceFilter('kind','all');selectEssenceFilter('grade','D');html=craftingPanel(s);
  assert.equal((html.match(/data-essence="/g)||[]).length,1);assert(html.includes('Forceful'));
  selectEssenceFilter('grade','all');
});

test('essences survive the save round trip with exact values and stacks', () => {
  const s = createGame(1000, 42), a = {id: 'might', tier: 9, value: 3, min: 2, max: 4};
  s.essences = [{id: essenceKey(a), affix: {...a}, count: 2}];
  const data = new Map(), storage = {getItem: k => data.get(k), setItem: (k, v) => data.set(k, v)};
  assert(saveGame(s, storage, 1000));
  const loaded = loadGame(storage, 1001);
  assert(!loaded.recovered);
  assert.equal(loaded.state.essences.length, 1);
  assert.equal(loaded.state.essences[0].count, 2);
  assert(validEssence(loaded.state.essences[0]));
  assert.equal(loaded.state.essences[0].affix.value, 3);
  assert.equal(ITEM_GRADES[affixGrade(loaded.state.essences[0].affix)], 'D');
});
