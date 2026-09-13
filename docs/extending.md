# Extending Everfrost

All content is data-driven. There is no build step: edit the ES modules in
`dist/`, then run `node --test tests/*.test.mjs` (and reload the page).

## Add an affix (modifier family)

`dist/loot.js`, `AFFIXES`:

```js
// A new prefix usable by weapons and charms, 5 tiers.
arcane: {
  name: 'Arcane', label: 'spell damage', stat: 'arcane',   // key of a stats() bonus
  kind: 'prefix', slots: ['weapon', 'charm'],
  tiers: T([1, 3, 6], [4, 5, 9], [8, 8, 13], [13, 11, 17], [19, 15, 22]),
},
```

- `T([minLevel, minVal, maxVal], ...)` builds tier rows ascending **weakest →
  strongest**; display tier = `tiers.length - index` (T1 = best).
- `decimals: 1` for fractional values (reach/leech/regen).
- Suffix names use the "of …" convention (`of Haste`); prefixes use plain
  names (`Forceful`); `makeItem` places them accordingly.
- The stat must exist in `affixBonuses` and in `stats()` (see below) or it
  becomes decorative text.

### Wire the stat through

1. `loot.js::affixBonuses` — add `stat: 0` to the bonuses object.
2. `engine.js::stats()` — consume `a[stat]` with an appropriate cap:
   ```js
   arcane: a.arcane,  // then fold into averageHit/dps if it should deal damage
   ```
3. `combat-ui.js::equipmentChanges` — add a `[label, key]` pair so item
   inspections compare it.
4. `expedition-ui.js::modDictionary` updates automatically.

## Add a monster modifier

`dist/monsters.js`, `MODIFIERS`:

```js
nightmare: {
  name: 'Nightmare', description: 'Deals 10% of your maximum health on hit as chaos damage.', kind: 'elemental', icon: 'star',
},
```

Then apply the behavior in `engine.js`. Three kinds of hooks exist:

- **Stat modifiers**: `enemyStats()` (e.g. `hasted`, `deadly`).
- **Per-hit effects**: the enemy attack block in `advanceStep` (e.g. `vampiric`
  heals the attacker, `chilling` applies chill to the hero).
- **Timers/telegraphed attacks**: `earthshatter` drives the `slamTimer`
  hazard. `rollModifiers` decides which pools grant it — give your modifier a
  `kind` any of `enhancement | defense | aura | elemental | on death | boss
  skill` for the roster UI.

Aura modifiers additionally need `kind:'aura'` + `radius` + `color`; engine
`activeAuras()` picks them up automatically.

## Add a region

`dist/engine.js`, `REGIONS`:

```js
{name:'Sunken Bracken', subtitle:'The old marsh remembers.', start:21,
 color:'#7baa8f', foes:['Bog Husk','Marsh Viper','Lily Skulk'], boss:'The Drowned Diadem'},
```

- `start` = first stage number; display numbering follows `(stage-1)/5`.
- Palette index for the battlefield is `floor((stage-1)/5)` in
  `renderer.js::PALETTES` — add the 5th palette there.
- The world-map dialog renders regions from the table; stage buttons fill from
  `start` with 5 buttons (last region is dynamic).

## Add a skill

`dist/engine.js`, `SKILLS` plus logic in `useSkill` and `skillTargets`:

```js
{id:'ward', name:'Warden’s Vigil', icon:'shield', key:'4', level:7,
 cooldown:30, description:'Grant an absorb shield equal to 30% of your maximum health for 10 seconds.'},
```

Add the effect in `useSkill`, a state field for the shield in `createGame`
(e.g. `shield: 0`), decay/damage handling in `advanceStep` (`hurtHero`), and a
UI status chip in `combat-statuses` (expedition-ui `updateExpedition`).

## Add a quest

`dist/engine.js`, `QUESTS`:

```js
{id:'warden', name:'The long watch', description:'Clear 3 expeditions',
 target:3, value:s => s.bosses, gold:600, shards:25},
```

`value(s)` reads any live counter (`kills`, `crafted`, `bosses`, …). The
journal, quest preview and claim logic need no other changes.

## Add a crafting orb

`dist/crafting.js`, `CRAFT_OPERATIONS`:

```js
mirror: {name:'Orb of Mirrors', flavor:'Duplicates the target item.', icon:'star', gold:9999, shards:999},
```

Implement the mutation branch in `craft(s, item, opId, rng)`, add its
prerequisite in `crafting-ui.js::applicable`, and (recommended) a test in
`tests/crafting.test.mjs`.

## Change balance knobs

| Knob | Location |
|---|---|
| Enemy HP/damage scaling | `makeEnemy` (`18 + stage^1.18 · 6`, `2.8 + stage·1.25`) |
| Base combat values | `BASE_COMBAT` (engine.js) |
| XP curve | `xpRequired` |
| Drop chances | `defeatEnemy` + `lootRarity` |
| Offline scale | `offlineRewards` (`.5` factor, 28 800 s cap) |
| Crafting prices | `crafting.js` bases and `scale` multiplier |
| Tier gates & ranges | `AFFIXES[].tiers` |
| Map size/route | `MAP_WIDTH/HEIGHT`, `route` in `generateMap` |

## Testing conventions

- The rules layer is DOM-free; every new engine/crafting behavior should get a
  deterministic test using `seededRandom`.
- `tests/engine.test.mjs` — economy, invariants, milestones.
- `tests/expedition.test.mjs` — maps (500 seeds), combat integrity (100 seeds),
  save/migration.
- `tests/crafting.test.mjs` — tier gating, orb transitions, bench validation.
- Run: `node --test tests/*.test.mjs`. Keep `pass` at 36+.