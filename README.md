# Everfrost

An original single-player idle RPG for desktop and mobile browsers. Inspired by Nordicandia’s auto-combat, equipment, crafting, and progression loop. Original setting, interface, actors, and battlefield artwork.

## Play locally

Requires Node.js 20 or newer. No package installation is required.

```sh
node server.mjs
```

Open http://localhost:5173. For a phone on the same network, open the computer's local IP address with port 5173. The server binds to all interfaces for LAN testing; network firewall rules may apply.

## Game systems

- Automatic combat and optional manual skill use; keys 1/2/3 cast skills and Space pauses.
- Movement speed, attacks per second, attack range, critical strike chance, and critical multiplier drive combat. Equipment can improve each attribute. The character panel reports live values and average basic-attack DPS; item comparisons include every affected attribute.
- Tap/click movement, pause/resume, 1×/2× combat, and optional automatic stage advancement.
- Seeded procedural maps with nine clearings along one winding linear route: entrance, enemy packs, a healing shrine and cache, and a final guardian. Room dimensions, bends, orientation, and packs vary between expeditions; no branches or loops.
- Tile-based movement and collision, route-ordered auto targeting, tap/click target selection, fog of war, and a live minimap. Arrow keys move when the battlefield has focus.
- Endless stage progression through repeating 20-stage journeys across four regions, with enemy strength and item level continuing to rise. Every stage ends in a guardian. Normal kills grant 1 progress, magic kills 2, and rare kills 5; clearing the packs breaks the boss seal. Defeating the boss opens the next stage. Disable auto advance to farm fresh maps of the current stage. World-map navigation pages through journeys and supports direct travel to unlocked stages.
- Normal, magic, rare, and unique enemies. Thirteen readable modifiers affect real combat, including armor, elemental resistance, regeneration, vampirism, chill, critical strikes, support auras, and telegraphed ground attacks. Defeating an aura bearer removes its support.
- Three equipment slots, four rarities, Path-of-Exile-style explicit modifiers, stat comparisons, equipping, salvage, and a 48-item satchel. Every modifier is a prefix or suffix (three of each at most), defined across five tiers gated by item level, with tier-specific value ranges; a Tier 1 roll is strongest and needs the highest item level. Affixes include elemental damage, attack speed, critical chance, life leech, regeneration, and resistance. Unique items add a slot-specific power.
- A crafting bench modeled on POE currency orbs: Transmutation (normal → magic), Augmentation (add a modifier), Regal (magic → rare), Alchemy (normal → rare), Chaos (reroll rare), Exalted (add a modifier to rare), Scouring (strip to normal), and Divine (reroll values without changing tiers). Orbs can only be obtained by defeating enemies, and each use spends one orb plus gold that scales with item level. A deterministic bench crafts a chosen modifier at a chosen tier for gold only.
- Enemy rarity improves equipment drop chance and quality. Rare leaders guarantee magic-or-better equipment; stage guardians drop two rare-or-better items.
- Equipment drops appear on the battlefield with rarity colors, name labels, and beams for rare/unique items. They auto-collect after 2.4 game seconds; tap a label or use Collect now for immediate collection. Uncollected drops save with the map and are collected before changing maps.
- A saved loot filter supports minimum rarity, equipment slots, minimum item level, and any selected affix family, and it truly filters pickups: unique items bypass filters by default, and any drop that doesn't match is converted into gold instead of entering your satchel. A full inventory retains its existing automatic-salvage behavior.
- Forge upgrades and merging three matching unequipped items into a higher rarity.
- Level-based ability unlocks, mastery points, and three chapter quests with one-time rewards.
- Automatic localStorage saves, saved expedition layouts and kill progress, migration of existing heroes and gear, safe recovery from corrupt saves, and device-local offline rewards capped at eight hours.
- Mobile bottom navigation, desktop sidebar, keyboard focus, dialog focus containment, reduced-motion support, and optional synthesized audio.

Offline rewards approximate 50% of current attack efficiency, accounting for travel and stronger enemies. They grant gold, XP, and orbs without advancing maps, stages, or quests. Progress is local to the browser and origin; local and hosted URLs have separate saves. Clearing browser data removes progress. There is one Vanguard class, solo play, four regional palettes, three unique equipment powers, and a shared guardian slam pattern. This game does not include accounts, cloud saves, multiplayer, or the full content of its inspirations.

## Documentation

Developer documentation lives in [`docs/`](docs/README.md): architecture and import graph, game systems, save format & migration, and a how-to for extending content.

## Tests and structure

```sh
node --test tests/*.test.mjs
```

- `dist/engine.js`: dependency-free game rules and persistence, tested using Node's built-in runner.
- `dist/app.js`: UI state, views, dialogs, sound, and progressive WebMCP support.
- `dist/world.js`: deterministic linear map generation, paths, collision, and exploration.
- `dist/monsters.js` and `dist/loot.js`: monster tiers/modifiers, drop tables, and the tiered prefix/suffix modifier definitions.
- `dist/crafting.js` and `dist/crafting-ui.js`: POE-style orb services, the deterministic crafting bench, and its forge panel.
- `dist/renderer.js` and `dist/actors.js`: scrolling procedural terrain, actors, minimap, auras, and combat feedback.
- `dist/icons.js`: inline SVG icon set shared across every view.
- `dist/expedition-ui.js`: guardian progress, enemy dossiers, map overview, and equipment comparisons.
- `dist/combat-ui.js`: live combat metrics and equipment-stat comparisons.
- `dist/loot-filter.js` and `dist/loot-filter-ui.js`: persistent filter rules and the filter editor.
- `dist/world-ui.js`: bounded world-map pagination for endless journeys.
- `dist/style.css` and `dist/expedition.css`: responsive layout and visual theme.
- `dist/assets/mistwood.png`: original generated forest painting used as a terrain texture.
- `server.mjs`: local static server. The complete deployable app is in `dist/`.

Typography uses Google Fonts with system fallbacks. All gameplay and image assets are served locally. The optional WebMCP registry exposes a read-only adventure summary and a validated pause/resume control in supporting browsers.

The 45 tests in `tests/` cover 500 map seeds for connectivity and a linear route without shortcuts; 100 automatic expeditions for completion and terrain collision; and live combat attributes, movement/reach/crit formulas, loot filters, ground drops, endless journeys, boss gating, modifiers, loot quality, abilities, prefix/suffix caps, tier gating, orb and bench crafting, crafting costs, save migration, offline rewards, and resource limits.

Reference research: [Nordicandia official site](https://www.nordicandia.com/), [official Steam listing](https://store.steampowered.com/app/1503790/Nordicandia/), and Path of Exile's official [Monster Mods FAQ](https://www.pathofexile.com/forum/view-thread/3322408/filter-account-type/staff) and [Item Changes](https://www.pathofexile.com/forum/view-thread/3774647). Mechanics, numbers, setting, and assets here are original implementations.

Gear uses nine equipment slots with level-scaled implicit damage, armor, and life (±5% variance), separate from explicit affixes. Old gear saves migrate automatically.
