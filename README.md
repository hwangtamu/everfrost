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
- Three switchable classes with complete ability sets: the durable Vanguard, mobile and accurate Ranger, and elemental Mage. The Village trainer changes class while preserving level, mastery, gear, and progression.
- Tap/click movement, pause/resume, 1×/2× combat, and optional automatic stage advancement.
- Seeded procedural maps with nine clearings along one winding linear route: entrance, enemy packs, a healing shrine and cache, and a final guardian. Room dimensions, bends, orientation, and packs vary between expeditions; no branches or loops.
- Tile-based movement and collision, route-ordered auto targeting, tap/click target selection, fog of war, and a live minimap. Arrow keys move when the battlefield has focus.
- Endless stage progression through repeating 20-stage journeys across four regions, with enemy strength and item level continuing to rise. Every stage ends in a guardian. Normal kills grant 1 progress, magic kills 2, and rare kills 5; clearing the packs breaks the boss seal. Defeating the boss opens the next stage. Disable auto advance to farm fresh maps of the current stage. World-map navigation pages through journeys and supports direct travel to unlocked stages.
- Normal, magic, rare, and unique enemies. Thirteen readable modifiers affect real combat, including armor, elemental resistance, regeneration, vampirism, chill, critical strikes, support auras, and telegraphed ground attacks. Defeating an aura bearer removes its support.
- Eleven equipment slots (head, neck, shoulder, chest, wrist, weapon, belt, leg, foot, and two rings), PoE-style explicit modifiers, stat comparisons, equipping, salvage, and a 48-item satchel. Weapons roll as one-hand swords, two-hand greatswords, bows, or staves, each with distinct damage, speed, range, critical, and elemental profiles. Every modifier is a prefix or suffix (three of each at most), defined across nine tiers gated by item level, with tier-specific value ranges; a Tier 1 roll is strongest and needs the highest item level. **Item grade follows the strongest modifier tier** — D → C → B → A → AA → AAA → AAAA → AAAAA → S — and drives the loot filter, cleanup, and salvage yield. Unique items keep a permanent implicit power that cannot be removed.
- A crafting bench modeled on POE currency orbs: Transmutation rerolls into 1–2 modifiers, Augmentation/Regal/Exalted add modifiers within the 3-prefix/3-suffix caps, Alchemy rerolls into 3–6, Chaos rerolls into exactly 6, Scouring strips every explicit modifier, and Divine rerolls every value while keeping types and tiers (it also rerolls implicit rolls). Orbs can only be obtained by defeating enemies, and each use spends one orb plus gold that scales with item level.
- Salvaging equipment gives each modifier a chance to be recovered as an **essence** — one modifier per essence, carrying its exact grade and value. Higher grades are rarer to recover, the loot filter can ignore low-grade essences, and each essence slams onto an open modifier slot or replaces a weaker modifier of the same family with a success chance that falls as the grade rises. The old 3-for-1 merge recipe is removed.
- Enemy rarity improves equipment drop chance and modifier count. Rare leaders guarantee modified equipment; stage guardians drop two modified items.
- Equipment drops appear on the battlefield with grade colors, name labels, and beams for grade-B+ and unique items. They auto-collect after 2.4 game seconds; tap a label or use Collect now for immediate collection. Uncollected drops save with the map and are collected before changing maps.
- A saved loot filter supports minimum equipment grade, equipment slots, individual weapon types, minimum item level, any selected affix family, and a separate minimum essence grade, and it truly filters pickups: unique items bypass filters by default, and any drop that doesn't match is converted into gold instead of entering your satchel. A full inventory retains its existing automatic-salvage behavior.
- Forge upgrades add 10% of an item's original implicit stats per rank.
- Level-based ability unlocks, mastery points, and three chapter quests with one-time rewards.
- Automatic localStorage saves, saved expedition layouts and kill progress, migration of existing heroes and gear, safe recovery from corrupt saves, and device-local offline rewards capped at eight hours.
- Mobile bottom navigation, desktop sidebar, keyboard focus, dialog focus containment, reduced-motion support, and optional synthesized audio.

Offline rewards approximate 50% of current attack efficiency, accounting for travel and stronger enemies. They grant gold, XP, and orbs without advancing maps, stages, or quests. Progress is local to the browser and origin; local and hosted URLs have separate saves. Clearing browser data removes progress. The game is single-player and does not include multiplayer or the full content of its inspirations.

## Cloud saves (Firebase)

The hosted build supports optional Google sign-in for cross-device saves, backed by Firebase Authentication and Cloud Firestore. Signing in is not required — the game always keeps a localStorage backup and plays fully offline.

- Each account owns one document, `players/{uid}`: `{version, revision, payload, updatedAt}`. `payload` is the same JSON save used locally.
- `revision` increments on every write inside a Firestore transaction, so two devices can never silently overwrite each other. On a mismatch the game asks which progress to keep.
- First sign-in offers to import the browser's progress or start fresh; a returning account's save replaces the guest session. Signing out never exposes account progress to the guest save.
- Security rules (`firestore.rules`) restrict each document to its owner, require `revision == old + 1`, cap payload size, and forbid deletes.
- Firebase web configuration lives in `dist/firebase.js`; the browser API key is a public identifier — access control is enforced by the rules.

### Firebase deployment

```sh
firebase deploy --only firestore:rules,hosting   # uses .firebaserc → everfrost-830cb
```

`firebase.json` serves `dist/` on Hosting with SPA rewrites. Enable the Google provider in Authentication and add any extra hosting domains (e.g. a GitHub Pages URL) under Authentication → Settings → Authorized domains.

## Documentation

Developer documentation lives in [`docs/`](docs/README.md): architecture and import graph, game systems, save format & migration, and a how-to for extending content.

## Tests and structure

```sh
node --test tests/*.test.mjs
```

- `dist/engine.js`: dependency-free game rules and persistence, tested using Node's built-in runner.
- `dist/app.js`: UI state, views, dialogs, sound, and progressive WebMCP support.
- `dist/cloud-saves.js` and `dist/firebase.js`: account save protocol (revision-checked records, conflict resolution, offline cache) and the lazily loaded Firebase adapter.
- `dist/world.js`: deterministic linear map generation, paths, collision, and exploration.
- `dist/monsters.js` and `dist/loot.js`: monster tiers/modifiers, drop tables, and the tiered prefix/suffix modifier definitions.
- `dist/crafting.js` and `dist/crafting-ui.js`: POE-style orb services, essence slam crafting, and the forge panel.
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

The 106 tests in `tests/` cover classes, weapon profiles, class abilities, weapon loot filters, save migration, 500 map seeds for connectivity and a linear route without shortcuts, 100 automatic expeditions, live combat attributes, loot, bosses, crafting, offline rewards, cloud-session recovery and conflicts, and resource limits.

Reference research: [Nordicandia official site](https://www.nordicandia.com/), [official Steam listing](https://store.steampowered.com/app/1503790/Nordicandia/), and Path of Exile's official [Monster Mods FAQ](https://www.pathofexile.com/forum/view-thread/3322408/filter-account-type/staff) and [Item Changes](https://www.pathofexile.com/forum/view-thread/3774647). Mechanics, numbers, setting, and assets here are original implementations.

Gear uses eleven equipment slots (including two rings) with level-scaled implicit damage, armor, and life (±5% variance), separate from explicit affixes. Old gear saves migrate automatically.

Visit the Village to resume a saved expedition, begin a fresh unlocked stage, or craft keystones using orbs. A keystone opens a single-entry rift: four monster waves followed by a randomly selected rift guardian. Death or leaving closes the run. Rift modifiers increase difficulty and equipment item level, quantity, and rarity.

Expeditions vary between ancient groves, ruined causeways, marsh trails, and rocky ridges. Routes use different nine-clearing paths, room shapes, and corridor widths while remaining linear. Six bosses each have a distinct appearance and two alternating abilities drawn from slams, brambles, charges, frost, fire, lightning, and ring attacks.

The battle HUD uses two health bars and inspectable modifier icons. Event rewards stay in the log with no pop-ups. The equipment paper doll and 48-slot bag support item inspection and persistent locks. Salvage is immediate for every unlocked item; locked items are excluded from salvage.
