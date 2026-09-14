# Architecture

## Module responsibilities

### Core rules (DOM-free, unit-tested)

**`dist/engine.js`** — the game rules and persistence.

| Export | Purpose |
|---|---|
| `REGIONS`, `SKILLS`, `QUESTS` | Static content tables (see game-systems.md) |
| `createGame()` | Fresh hero + `startExpedition`; all state fields |
| `stats()`, `combatStats()` | Derived combat attributes; the live numbers |
| `tick(s, dt)` | Advance simulation in ≤0.1s steps, returns events |
| `useSkill()`, `movePlayer()` | Player actions |
| `equip`, `salvage`, `upgrade`, `merge`, `learn`, `travel` | Resource-mutating services |
| `defeatEnemy`, `hurtHero`, `effectiveDamage` | Combat math hooks |
| `saveGame()`, `loadGame()`, `offlineRewards()` | Persistence & offline progression |
| `startExpedition`, `spawnEnemy` | Expedition/layout setup |

**`dist/world.js`** — maps, movement, lines of sight.

| Export | Purpose |
|---|---|
| `seededRandom(seed)` | Deterministic PRNG (mulberry32-style) |
| `generateMap(seed, stage)` | 46×34 tile grid, 9 clearings, 1 winding route |
| `walkable`, `distance`, `hasLineOfSight` | Collision & reach checks |
| `findPath(map, from, to)` | BFS on the tile grid |
| `moveAlong(actor, dt, speed)` | Step an actor along its path |
| `reveal(map, pos, radius)` | Fog-of-war discovery |

**`dist/loot.js`** — gear modifiers (the expansion in v2.2).

| Export | Purpose |
|---|---|
| `AFFIXES`, `ITEM_RARITIES`, `AFFIX_LIMIT` | Modifier definitions & rarity names |
| `rollAffixes(slot, rarity, itemLevel, rng)` | Rarity-based modifier roll (prefix/suffix caps) |
| `makeAffix(id, ilvl, rng, forcedTier)` | One modifier: weighted tier + in-range value |
| `addAffix`, `randomSideAffix`, `rerollItem`, `rerollValues` | Crafting primitives |
| `affixSlots`, `canAddAffix` | Prefix/suffix occupancy bookkeeping |
| `affixText` | Display text (`+8% attack speed`) |
| `lootRarity(tier, rng)` | Drop-quality roll per enemy tier |
| `affixBonuses(items)` | Sum affix stats into a flat bonuses object |

**`dist/monsters.js`** — enemy tiers & modifiers.

| Export | Purpose |
|---|---|
| `ENEMY_TIERS` | normal/magic/rare/unique: life, damage, points, reward, color |
| `MODIFIERS` | 13 combat modifiers with descriptions, icons, auras |
| `rollModifiers(tier, rng)` | Modifier pools per tier |

**`dist/crafting.js`** — PoE-style currency services (v2.2).

| Export | Purpose |
|---|---|
| `CRAFT_OPERATIONS` | 8 orbs: transmute, augment, regal, alchemy, chaos, exalt, scour, divine |
| `craft(s, item, opId, rng)` | Apply an orb with cost checks; returns `{ok, reason}` |
| `benchCraft(s, item, affixId, tier, rng)` | Deterministic bench: chosen modifier at chosen tier |
| `craftCost`, `benchCost` | Gold pricing scaled by item level; orbs are consumed on use |
| `craftTarget(s, id)` | Resolve an id to inventory-or-equipped item |

### Browser layer

**`dist/app.js`** — glue. Owns the hero state loaded from storage, five views
(adventure / hero / inventory / forge / journal), dialogs, toasts, keyboard
shortcuts, the 100 ms simulation loop, autosave, sound blips, and the optional
WebMCP tool registry.

**`dist/combat-ui.js`** — live combat attribute grid and per-equip delta
comparisons (`equipmentChanges` compares `stats` before/after a hypothetical
swap).

**`dist/expedition-ui.js`** — per-screen chrome: guardian progress bar,
enemy dossier, threat guide, expedition overview + minimap, item detail sheets
(roll quality for every modifier), and the `modDictionary` reference.

**`dist/crafting-ui.js`** — the forge crafting panel markup and its selection
state (module-level `craftSelected` / `benchAffix` / `benchTier`).

**`dist/renderer.js`** — `Battlefield` class: offscreen terrain prerender,
camera, actors, auras, telegraphed hazards, damage floats, requestAnimationFrame
loop, and `drawMinimap`.

**`dist/actors.js`** — `drawHero` / `drawMonster` procedural canvas sprites.

**`dist/icons.js`** — `icon(name)` inline SVG helper.

## Import graph

```
index.html
  └─ app.js
       ├─ engine.js ── world.js, loot.js, monsters.js
       ├─ icons.js
       ├─ renderer.js ── actors.js, world.js, monsters.js
       ├─ loot.js
       ├─ combat-ui.js ── engine.js, icons.js
       ├─ expedition-ui.js ── icons, engine, combat-ui, world, monsters, loot, renderer
       ├─ crafting-ui.js ── icons.js, loot.js, crafting.js
       └─ crafting.js ── loot.js
```

Acyclic. `engine.js` never imports UI modules, `crafting.js` never imports the
engine (it mutates `s` directly), and nothing imports `app.js`.

## Runtime loop

1. `app.js` boots: `loadGame()` → hero state, `mount()`, `new Battlefield(canvas, getState, onMove)`.
2. A **100 ms `setInterval`** runs `processEvents(tick(state, dt))`:
   - `tick` subdivides into ≤0.1 s `advanceStep` calls × `speed` (1×/2×).
   - Each event feeds `battle.event(e)` (floats/effects), toasts, and
     triggers UI refreshes (`update()` throttled to 4 Hz, panel re-renders on
     level-ups, loot, kills while browsing).
3. The **render loop** (`requestAnimationFrame` inside `Battlefield.draw`)
   interpolates the camera and paints the terrain, actors, hazards, and fog.
4. **Input**: canvas `pointerdown` converts screen→map coords, calls
   `movePlayer` through `onMove`; keys 1/2/3 cast skills, Space toggles pause;
   DOM buttons dispatch to engine services.
5. **Persistence**: `saveGame` every 5 s while visible, on
   `visibilitychange`/`pagehide`; returning to the tab grants `offlineRewards`.

## Event pipeline

All combat events are flat objects with a `type` discriminator produced by
`tick`. `processEvents` in app.js is the single consumer.

| Event | Payload | UI reaction |
|---|---|---|
| `hit` | value, critical, x, y | damage float + hit sound |
| `hurt` | value, x, y | hero damage float |
| `kill` | gold, xp, tier, boss, x, y | gold float, logout |
| `level` | value | toast + full re-render |
| `loot` | item | toast if rare+, bag refresh |
| `bossReady` | — | guardian-reveal toast |
| `complete` | stage | stage-clear toast |
| `stage` | value | toast |
| `newMap` | — | (map swap) |
| `heal` / `chest` / `death` | x, y / — | toasts, camp reset |
| `warning` | text | earthshatter/volatile warning |
| `explosion` | x, y | hazard blast effect |
| `enemyAttack` | x, y, targetX, targetY, critical | swing line effect |
| `skill` | id, x, y | skill ring effect + sound |

Color/position values are attached so the renderer never has to re-derive them.
## Endless progression and ground loot

`world-ui.js` renders only one 20-stage journey page at a time. `loot-filter.js` supplies pure filter normalization/matching and is shared by the engine and renderer. `loot-filter-ui.js` edits those rules and previews matches. The engine emits `drop` for ground equipment, then `loot` or `filteredLoot` on collection; the renderer paints labels and calls the supplied pickup callback. `combat-ui.js` uses the same derived stats as combat to render attributes and comparisons.

`keystones.js` defines rift modifiers, orb recipes, drop rules and the compact arena. `engine.js` owns location transitions, suspended expeditions, single-entry portals and waves. `village-ui.js` and `village.css` provide town services, keystone inspection and the paginated pouch.
