# Architecture

## Modules

### Rules (DOM-free)

| Module | Role |
|---|---|
| `engine.js` | State, `stats`/`combatStats`, `tick`, skills casting, loot, village/rifts, save/load, offline rewards |
| `skills.js` | `SKILLS`, `skillParams(s,id)`, ranks, runes, slotting, normalization |
| `tree.js` | `TREE_NODES` (generated), `allocate`, `respec`, `treeBonuses`, normalization |
| `world.js` | `generateMap`, `findPath`, `moveAlong`, `reveal`, line of sight |
| `monsters.js` | `ENEMY_TIERS`, `MODIFIERS`, `rollModifiers` |
| `loot.js`, `gear.js` | Affixes and tiers, uniques, implicits |
| `crafting.js` | Orb operations and bench crafting |
| `keystones.js` | Keystone rolling, rift bonuses, arena map |
| `loot-filter.js` | Filter normalization and matching |
| `cloud-saves.js` | Account save protocol (revisions, conflicts, offline cache) |
| `panels.js` | HTML for every sheet and dialog, as pure functions `(state, ui) → string` |

### Browser

| Module | Role |
|---|---|
| `app.js` | Owns `state` and the `ui` view-state; HUD updates; one delegated click handler (`data-act`); sheets and dialogs; 100 ms simulation loop; autosave; cloud; WebMCP |
| `renderer.js` | `Battlefield`: prerendered terrain, zoomed camera with insets, actors, hazards, skill effects, particles, floating numbers, ground loot labels; `drawMinimap` |
| `actors.js`, `icons.js` | Sprites and icons |
| `firebase.js` | Loads the Firebase SDK on demand |

## Import graph

```
index.html ─ app.js
  ├─ engine.js ── skills.js, tree.js, world.js, loot.js, gear.js, monsters.js, keystones.js, loot-filter.js, crafting.js
  ├─ panels.js ── engine.js, skills.js, tree.js, loot.js, gear.js, monsters.js, crafting.js, keystones.js, loot-filter.js, icons.js
  ├─ renderer.js ── actors.js, world.js, monsters.js, engine.js, loot-filter.js
  ├─ cloud-saves.js ── engine.js      firebase.js ── cloud-saves.js
  └─ skills.js, tree.js, crafting.js, …
```

Acyclic; nothing imports `app.js`.

## Screen layout

`index.html` holds a static skeleton so the first paint is already the game:

```
#game
  canvas#battle-canvas        full screen
  #hud-top                    stage chip + seal bar · advance/farm · gold · speed · pause · menu
  #target, #minimap           current enemy plate · map thumbnail
  #banner, #feed, #overlay    announcements · loot feed · paused/village card
  #hud-bottom                 health orb · skill bar + potion + XP bar · mana orb
  #dock                       Hero · Bag · Skills · Passives · Forge · World
  #sheet                      the open panel
dialog#dialog                 item details, confirmations, menu, help
```

`game.css` has two arrangements, switched by `@media (min-aspect-ratio: 1/1)`:

- **Portrait** — dock along the bottom; the sheet slides up over the lower
  ~64% of the screen.
- **Landscape / desktop** — dock down the left edge; the sheet is a right-hand
  column (max 460 px); the HUD narrows to the remaining width. Short
  landscape phones (`max-height: 480px`) get smaller orbs and buttons.

`app.js::layout()` measures the HUD and sheet and hands the renderer
`insets`, so the camera keeps the hero centred in the uncovered area.

## Runtime loop

1. Boot: `loadGame()` → `state`; build `Battlefield`; `updateHud()`.
2. Every 100 ms: `processEvents(tick(state, dt))`, then `updateHud()` (cheap,
   cached DOM writes). Minimap redraws every 0.4 s. An open sheet re-renders
   at most every 0.6 s when marked dirty, and never while a form control in
   it has focus.
3. `requestAnimationFrame` drives `Battlefield.draw`.
4. Input: every button carries `data-act` (and `data-arg`); `act(name, el)`
   is the single dispatcher. Tree nodes use `data-node`. Canvas taps call
   `movePlayer`.
5. Persistence: every 5 s, on `visibilitychange` and `pagehide`. Returning to
   the tab grants `offlineRewards`.

## Events

`tick` and `useSkill` return flat event objects consumed by
`processEvents` (shell) and `Battlefield.event` (canvas):

| Event | Meaning |
|---|---|
| `swing`, `hit`, `hurt`, `absorb` | Basic attack arc; damage dealt (flags `critical`, `splash`, `skill`); damage taken; ward absorption |
| `skill`, `whirl`, `explosion` | Skill cast (id, position, radius, colour); whirlwind tick; hazard or meteor impact |
| `kill`, `drop`, `loot`, `filteredLoot`, `orb`, `keystone`, `chest` | Rewards |
| `heal`, `potion`, `potionCharge` | Recovery |
| `level`, `unlock` | Level gained; a skill became available |
| `bossReady`, `complete`, `stage`, `newMap` | Stage flow |
| `death`, `retreat` | Defeat and falling back a stage |
| `riftWave`, `riftComplete`, `riftFailed` | Rift flow |
| `enemyAttack`, `warning` | Enemy swing line; slam telegraph |
