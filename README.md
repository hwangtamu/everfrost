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
- Tap/click movement, pause/resume, 1×/2× combat, and optional automatic stage advancement.
- Four regions, 5-encounter stages, a guardian every fifth stage, and ongoing stage scaling.
- Three equipment slots and four rarities, power comparisons, equipping, salvage, and a 48-item satchel.
- Forge upgrades and merging three matching unequipped items into a higher rarity.
- Level-based ability unlocks, mastery points, and three chapter quests with one-time rewards.
- Automatic localStorage saves, safe recovery from corrupt saves, and device-local offline rewards capped at eight hours.
- Mobile bottom navigation, desktop sidebar, keyboard focus, dialog focus containment, reduced-motion support, and optional synthesized audio.

Offline rewards approximate 50% of current attack efficiency. They grant gold, XP, and essence without advancing stages or quests. Progress is local to the browser and origin; local and hosted URLs have separate saves. Clearing browser data removes progress. This first version has one Vanguard class, solo play, and a shared painted environment with regional color treatments. It does not include accounts, cloud saves, multiplayer, or Nordicandia's complete content.

## Tests and structure

```sh
node --test tests/*.test.mjs
```

- `dist/engine.js`: dependency-free game rules and persistence, tested using Node's built-in runner.
- `dist/app.js`: UI state, views, dialogs, sound, and progressive WebMCP support.
- `dist/renderer.js`: canvas actors, floating combat feedback, and ambient particles.
- `dist/style.css`: responsive layout and visual theme.
- `dist/assets/mistwood.png`: original generated battlefield painting.
- `server.mjs`: local static server. The complete deployable app is in `dist/`.

Typography uses Google Fonts with system fallbacks. All gameplay and image assets are served locally. The optional WebMCP registry exposes a read-only adventure summary and a validated pause/resume control in supporting browsers.

Reference research: [Nordicandia official site](https://www.nordicandia.com/) and [official Steam listing](https://store.steampowered.com/app/1503790/Nordicandia/).
