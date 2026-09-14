# Everfrost — Codebase Documentation

> An original single-player idle RPG built without frameworks or build tooling:
> vanilla ES modules served statically to the browser. This index maps the
> system; each page below goes deeper.

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | Module map, import graph, runtime data flow, event pipeline |
| [game-systems.md](game-systems.md) | Combat loop, maps, loot & crafting, progression, persistence |
| [save-format.md](save-format.md) | Full state schema, validation rules, save migration & recovery |
| [extending.md](extending.md) | How to add affixes, monster modifiers, regions, skills, quests |

## High-level shape

```
game/
├── server.mjs            Local static server (port 5173); the deployable app is dist/
├── package.json          type:module; scripts: dev / start / test
├── README.md             Player-facing overview and system list
├── docs/                 ← this documentation
├── dist/                 The complete browser app (no build step)
│   ├── index.html        Boots /style.css + /expedition.css + /app.js
│   ├── app.js            UI shell: views, dialogs, input, persistence loop
│   ├── engine.js         Game rules + save/load (DOM-free, unit tested)
│   ├── world.js          Seeded linear map generation + pathfinding
│   ├── loot.js           Tiered prefix/suffix modifier definitions + rolling
│   ├── monsters.js       Enemy tiers + combat modifiers
│   ├── crafting.js       PoE-style orb services + eligibility rules
│   ├── essences.js       Essence recovery, stacking and slam crafting
│   ├── crafting-ui.js    Forge crafting + essence panel markup
│   ├── combat-ui.js      Live combat attribute panel + equip comparisons
│   ├── loot-filter.js    Persistent loot-filter rules + matching
│   ├── loot-filter-ui.js Loot-filter editor form + preview
│   ├── world-ui.js       Bounded world-map pagination for endless journeys
│   ├── expedition-ui.js  Guardian progress, dossiers, map overview, item details
│   ├── renderer.js       Canvas battlefield, camera, minimap, effects
│   ├── actors.js         Procedural canvas sprites
│   ├── icons.js          Inline SVG icon table
│   ├── style.css         Desktop-first theme + responsive rules
│   ├── expedition.css    Expedition/forge/crafting-specific styles
│   └── assets/mistwood.png  Generated forest texture
├── tests/
│   ├── engine.test.mjs       15 tests: rules, economy, sanity bounds
│   ├── expedition.test.mjs   16 tests: maps, combat, loot, migration
│   ├── combat-loot.test.mjs   9 tests: attributes, filters, drops, journeys
│   ├── crafting.test.mjs     11 tests: tiers, grades, orb rules, round-trips
│   ├── essences.test.mjs      6 tests: recovery odds, stacking, slam crafting
│   ├── gear.test.mjs         12 tests: slots, implicits, uniques, panels
│   ├── refinements.test.mjs   7 tests: maps, bosses, HUD, locked gear
│   ├── rift.test.mjs         12 tests: keystones, arena waves, rewards
│   └── cloud.test.mjs        10 tests: cloud-save sync and conflicts
└── .openai/hosting.json    Static hosting manifest (serves dist/)
```

## Design principles

- **DOM-free core.** `engine.js`, `world.js`, `loot.js`, `monsters.js`,
  `crafting.js`, `loot-filter.js` never touch `document`, so the entire rules
  layer runs under Node's built-in test runner.
- **Single source of truth for stats.** `stats(s)` / `combatStats(s)` compute
  live combat values once; simulation, character UI and tooltips all share
  them.
- **Deterministic seeds.** Mulberry-style `seededRandom` drives maps, enemy
  packs, modifiers, drops and affix gear. `generateMap(42)` is reproducible and
  tested.
- **Event-driven combat.** `tick(s, dt)` returns a list of flat `{type, ...}`
  events that the UI consumes (sound, toasts, canvas effects, re-renders).
- **Safe persistence.** Saves validate every field before trusting them;
  corrupt saves recover to a fresh game without crashing.

## Quick run

```sh
node server.mjs              # http://localhost:5173
node --test tests/*.test.mjs # run the 106 tests
```
