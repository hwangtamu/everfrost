# Extending Everfrost

All content is data-driven. There is no build step: edit the ES modules in
`dist/`, then run `node --test tests/*.test.mjs` (and reload the page).

## Add an affix (modifier family)

`dist/loot.js`, `AFFIXES`:

```js
// A new prefix usable by hand, wrist and neck gear, 5 tiers.
arcane: {
  name: 'Arcane', label: 'spell damage', stat: 'arcane',   // key of a stats() bonus
  kind: 'prefix', slots: ['hand', 'wrist', 'neck'],
  tiers: T([1, 3, 6], [4, 5, 9], [8, 8, 13], [13, 11, 17], [19, 15, 22]),
},
```

- `T([minLevel, minVal, maxVal], ...)` builds the first five tier rows ascending
  **weakest → strongest**; `deepen` appends three more at item levels 28/40/55
  (`growth: 'flat' | 'percent' | 'slight'`, or `fixedTiers: true` to opt out).
  Display tier = `tiers.length - index` (T1 = best).
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
3. If it is a utility stat that damage/toughness comparisons cannot show,
   add it to `UTILITY` in `panels.js` so item details list the change.

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

`dist/skills.js`, `SKILLS`:

```js
{id:'quake', name:'Quake', icon:'hammer', key:'9', level:28, cooldown:12, mana:24, kind:'attack', color:'#c9a36a',
  mult:4, radius:3.5, description:'Split the ground around you.',
  detail:p=>`${Math.round(p.mult*100)}% attack damage within ${p.radius.toFixed(1)} tiles.`,
  runes:[{id:'fissure', name:'Fissure', description:'+1 tile radius.', mods:{radiusAdd:1}},
         {id:'tremor', name:'Tremor', description:'Stuns enemies hit.', mods:{stun:true}}]}
```

1. `skillParams` already scales `mult`, `radius`, `cooldown`, `mana`, `heal`,
   `duration`, `power`, `shield` and passes rune flags through.
2. Add the effect branch in `engine.js::castSkill` (use `strikeEnemy` with
   `{skill:id, chill, shock, stun, leech}` options).
3. Teach `autoCast` when it is worth casting, and `skillTargets` if it needs
   something other than "enemies within radius".
4. Optional: a dedicated visual in `renderer.js` (`effects` of type `skill`).

`kind` is `attack`/`spell` (needs a target), `heal` or `buff`.

## Add a passive

`dist/tree.js` builds the graph from `PATHS` (five small nodes, a notable and a
keystone each) and `BRIDGES` (two small nodes and a notable between
neighbouring paths). Stats are plain keys summed by `treeBonuses`; a new key
needs a line in `STAT_TEXT` and a consumer in `engine.js::stats()`.

## Add a gem or a set

- `dist/gems.js`, `GEMS`: `{name, color, weapon:[stat, [five values]], armor:[stat, [five values]]}`.
  The stat must be one `stats()` reads from gear, and have a label in `STAT_NAMES`.
- `dist/sets.js`, `SETS`: `pieces` maps a slot (or `ring`) to `[piece name, base id]`;
  `bonuses` is `[[piecesNeeded, {stat: value}, text], …]`. Gear-style stats listed
  in `engine.js::SET_GEAR_STATS` add like affixes; anything else is treated as
  a passive-tree key (`lifePct`, `damageMore`, `takenLess`, …).

## Add a quest

`dist/engine.js`, `QUESTS`:

```js
{id:'warden', name:'The long watch', description:'Clear 3 expeditions',
 target:3, value:s => s.bosses, gold:600},
```

`value(s)` reads any live counter (`kills`, `crafted`, `bosses`, …). Add `orbs:{chaos:1}` for an orb reward. The
quest list and claim logic need no other changes.

## Add a crafting orb

`dist/crafting.js`, `CRAFT_OPERATIONS`:

```js
mirror: {name:'Orb of Mirrors', flavor:'Duplicates the target item.', icon:'star', gold:9999},
```

Implement the mutation branch in `craft(s, item, opId, rng)` and add a test in
`tests/crafting.test.mjs`. The forge panel lists every operation automatically.

## Change balance knobs

| Knob | Location |
|---|---|
| Enemy life/damage scaling | `enemyBaseLife`, `enemyBaseDamage` (engine.js) |
| Armor curve | `armorReduction` |
| Pack sizes | `startExpedition` |
| Skill numbers | `SKILLS`, `RANK_BONUS` (skills.js) |
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
- `tests/build.test.mjs` — skills, runes, auto-cast, passive tree, potions,
  ailments, migration, panel rendering.
- Run: `node --test tests/*.test.mjs`. Keep `pass` at 36+.