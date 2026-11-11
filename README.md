# Everfrost

An original idle hack-and-slash for phone and desktop browsers. Your hero carves through packs on their own; you shape the build — skills and runes, a passive tree, gear, crafting — and push deeper. Inspired by the loot and build depth of Diablo II and Path of Exile, with an original setting, interface and artwork.

Plays full-screen in portrait or landscape. No install, no build step, no dependencies.

## Play locally

Requires Node.js 20 or newer.

```sh
node server.mjs
```

Open http://localhost:5173. For a phone on the same network, open the computer's local IP on port 5173. On a phone, "Add to Home Screen" launches it full-screen.

## How it plays

- **It fights for you.** The hero hunts through each map, swings in arcs that splash onto neighbouring foes, and casts slotted skills automatically. Tap the ground to move, tap an enemy to focus it, tap a skill to cast it yourself. Telegraphed boss slams are sidestepped automatically.
- **Health, mana, potions.** Skills cost mana and have short cooldowns. A potion with charges refills from kills and is drunk automatically at 35% health.
- **Break the seal.** Each stage is a generated map of packs: normal, magic, and a rare aura leader. Killing them fills the seal; then the guardian appears. Guardians carry a trait per region and gain another on later journeys.
- **Idle-friendly defeat.** Dying sends the hero back to camp and the fight continues. A second death on one map retreats a stage and switches to farming until you turn auto-advance back on.
- **Endless stages.** Four regions repeat in 20-stage journeys. Enemy life and damage grow faster than raw levels, so later stages ask for a real build.

## Build depth

- **Eight skills, four slots.** Runic Cleave, Forest Blessing, Thunderstrike, Frost Leap, Whirlwind, Battle Cry, Emberfall, Stone Ward. Each unlocks by level, gains 12% per rank from skill points (ten ranks), and at rank 4 takes one of two runes that reshape it. Every skill can be set to auto-cast or manual.
- **Passive tree.** 61 nodes on six paths — Warrior, Assassin, Stalker, Guardian, Warden, Mystic — joined by hybrid clusters. One point per level; nodes must connect. Each path ends in a keystone that trades one strength for another (Berserker, Perfect Strike, Momentum, Unbreakable, Alchemist, Blood Rite). Respec for gold.
- **Gear.** Eleven slots, four rarities, implicit stats that scale with item level, and prefix/suffix modifiers in five tiers. 44 uniques with their own powers. Fire ignites, cold chills, lightning can shock.
- **Bag.** A 48-slot grid. ▲ marks anything that would raise your damage or toughness; one tap equips every upgrade. A loot filter turns unwanted drops into gold.
- **Forge.** Temper equipped gear with gold, apply eight kinds of orbs (transmute, augment, regal, alchemy, chaos, exalted, scouring, divine), pick an exact modifier at the bench, or merge three matching items into the next rarity.
- **Rifts.** Cut keystones from orbs in the Village and open a rift: five waves and a boss, with modifiers that raise both danger and reward. One entry.
- **Quests.** Sixteen deeds paying gold and orbs.
- **Away.** With the fight running you earn gold, experience, orbs and a few items for up to eight hours while the game is closed.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move / target | Tap ground / tap enemy | Arrow keys (battlefield focused) |
| Skills | Tap a skill button | `1`–`4` |
| Potion | Tap the flask | `Q` |
| Pause | Pause button | `Space` |
| Panels | Dock buttons | `C` hero, `I` bag, `S` skills, `P` passives, `F` forge, `M` world, `Esc` close |

The top bar holds the stage chip (opens the world panel), the auto-advance / farm toggle, gold, 1×/2× speed, pause and the menu (sound, motion, auto-potion, loot filter, battle log, account).

## Saves

Progress saves to `localStorage` automatically. Optional Google sign-in syncs one save per account through Firebase (revision-checked, with conflict resolution); guest play needs no account and works offline. Older saves migrate in place: heroes from before the passive tree get every point refunded to spend again.

```sh
firebase deploy --only firestore:rules,hosting   # uses .firebaserc
```

`firebase.json` serves `dist/` on Hosting. `.github/workflows/pages.yml` publishes `dist/` to GitHub Pages on push.

## Tests and structure

```sh
node --test tests/*.test.mjs
```

102 tests cover map generation (500 seeds), automatic expeditions (100 seeds), combat math, skills and runes, auto-cast, the passive tree, potions, ailments, loot and filters, crafting, rifts, panels, save migration and cloud sync.

- `dist/engine.js` — game rules, simulation and persistence (DOM-free).
- `dist/skills.js`, `dist/tree.js` — skill and passive-tree data and rules.
- `dist/world.js`, `dist/monsters.js`, `dist/loot.js`, `dist/gear.js`, `dist/crafting.js`, `dist/keystones.js`, `dist/loot-filter.js` — maps, enemies, items, crafting, rifts.
- `dist/panels.js` — panel and dialog markup as pure functions of state.
- `dist/app.js` — HUD, input, panels, save loop, cloud sync.
- `dist/renderer.js`, `dist/actors.js`, `dist/icons.js` — canvas battlefield, sprites, icons.
- `dist/game.css` — the whole interface.

Developer documentation lives in [`docs/`](docs/README.md).
