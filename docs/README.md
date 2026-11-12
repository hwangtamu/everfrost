# Everfrost — Codebase Documentation

An idle hack-and-slash built without frameworks or build tooling: vanilla ES
modules served statically. This index maps the system; each page goes deeper.

| Doc | Contents |
|---|---|
| [architecture.md](architecture.md) | Module map, import graph, runtime loop, events, UI layout |
| [game-systems.md](game-systems.md) | Combat, skills, passive tree, maps, loot, crafting, rifts, balance |
| [save-format.md](save-format.md) | State schema, validation, migration, cloud saves |
| [extending.md](extending.md) | How to add skills, passives, affixes, monster modifiers, quests |

## Layout

```
├── server.mjs              Local static server (port 5173)
├── dist/                   The complete browser app (no build step)
│   ├── index.html          Static HUD skeleton; loads game.css + app.js
│   ├── game.css            All styles: HUD, dock, sheet, panels, dialogs
│   ├── app.js              Shell: HUD updates, input, sheets, save loop, cloud
│   ├── panels.js           Panel/dialog markup (pure functions of state)
│   ├── engine.js           Rules, simulation, persistence (DOM-free)
│   ├── skills.js           Skill definitions, ranks, runes, slots
│   ├── tree.js             Passive tree graph, allocation, bonuses
│   ├── world.js            Seeded map generation, pathfinding, fog
│   ├── monsters.js         Enemy tiers and modifiers
│   ├── loot.js             Affixes, tiers, uniques, rolling
│   ├── gear.js             Slots, bases and implicit stats
│   ├── gems.js             Sockets, gem data, combining and socketing
│   ├── sets.js             Item sets and their bonuses
│   ├── crafting.js         Orbs and the bench
│   ├── keystones.js        Rift keystones and arena
│   ├── loot-filter.js      Filter rules
│   ├── cloud-saves.js      Revision-checked account saves
│   ├── firebase.js         Lazy Firebase adapter
│   ├── renderer.js         Canvas battlefield, camera, effects, minimap
│   ├── actors.js           Procedural sprites
│   ├── icons.js            Inline SVG icons
│   └── manifest.webmanifest, icon*.png|svg   Home-screen install
└── tests/                  Node test runner; 123 tests
```

## Design principles

- **DOM-free core.** Everything except `app.js` and `renderer.js` runs under
  Node, including the panel markup.
- **One source of truth for stats.** `stats(s)` / `combatStats(s)` feed the
  simulation, the hero sheet and item comparisons alike.
- **Event-driven combat.** `tick(s, dt)` returns flat `{type, …}` events that
  the shell turns into canvas effects, banners, the loot feed and sound.
- **The game is the screen.** The battlefield is always visible; panels slide
  over part of it and the camera re-centres on what is left.
- **Safe persistence.** Saves are validated field by field; a corrupt save
  recovers to a fresh game, and build data (tree, ranks, slots) is repaired.

```sh
node server.mjs              # http://localhost:5173
node --test tests/*.test.mjs
```
