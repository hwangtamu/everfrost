# Save format & persistence

Storage: **localStorage**, key `everfrost.save.v1` (kept even at v5 so old
heroes migrate in place). Saves are origin-scoped; local and hosted URLs have
separate saves. Clearing browser data removes progress.

## State schema (`createGame`)

```js
{
  version: 5,
  name: 'Wanderer',            // ≤20 chars
  level: 1, xp: 0,             // xp vs xpRequired(level)
  gold: 120, orbs: {transmute:0, augment:0, regal:0, alchemy:0, chaos:0, exalt:0, scour:0, divine:0}, // orbs only drop from kills
  stage: 1, maxStage: 1,       // maxStage gates world-map travel
  killsInStage: 0, kills: 0,   // wave track + lifetime stat
  bosses: 0, crafted: 0,       // quest counters
  hp: 105,                     // current (clamped to current maxHp at load)
  auto: true, advance: true, speed: 1|2,
  inventory: [item...],        // ≤48
  equipment: {head, neck, shoulder, chest, wrist, hand, belt, leg, foot, leftRing, rightRing},  // item | null
  essences: [{id, affix:{id, tier, value, min, max}, count}],  // recovered modifiers; identical ones stack
  talents: {might, guard, vigor, fortune},
  points: 0,
  cooldowns: {cleave, mend, storm},   // never persisted live; always reset to 0
  enemy: null, enemies: [],    // live expedition (persisted for v2)
  attackTimer: 0, attackCount: 0, respawn: 0,
  log: [{id, text, type, time}],  // ≤30
  claimed: ['first', ...],
  lastSave: 1688...,
  playTime: 0, runNumber: 0,
  tierKills: {normal, magic, rare, unique},
  settings: {sound: false, motion: true},
  hazards: [],                 // cleared on load
  effects: {chill: 0},         // reset on load
  died: false
}
```

### Item schema

```js
{
  id,               // crypto.randomUUID()
  slot: 'head'|'neck'|'shoulder'|'chest'|'wrist'|'hand'|'belt'|'leg'|'foot'|'leftRing'|'rightRing',
  name,             // e.g. "Forceful Iron Longsword of Haste"
  itemLevel,        // stage of the drop
  implicits,        // per-stat base rolls; +10% of base per upgrade
  upgrade: 0..,     // forge level
  affixes: [{id, tier, value, min, max}],  // tier 1 = strongest; min/max from the tier
  unique: <key of UNIQUE_EFFECTS in loot.js>|null,  // e.g. 'echo', 'soulgorge'
  uniqueRoll: 0.9–1.1,   // only for unique powers with variable stats
  locked: true|false,    // salvage protection
  modifierVersion: 2
}
```

Items no longer store a rarity tier: the roll-time tier only decides how many
explicit modifiers the item gets, and the visible **grade** is derived from the
strongest affix tier (D → C → B → A → AA → AAA → AAAA → AAAAA → S). Unique
powers are permanent implicits that cannot be removed; `uniqueRoll` (90–110%)
is only changeable with a Divine Orb.

Ring slots are added as `null` when loading older saves. A ring's `slot` becomes the selected finger when equipped; its identity, implicits, affixes, and upgrade rank are preserved. Older filters that selected every previous slot expand to include rings, while restricted filters retain their choices. No save-version reset is required.

### Enemy schema (in-flight expeditions)

```js
{ id, name, kind, tier, maxHp, hp, boss, level,
  modifiers: [modId...], x, y, home, roomId,
  path, pathTimer, attackTimer, slamTimer, chilled,
  awakened, rewarded?, baseDamage, points }
```

`points`, `rewarded`, timers, `chilled`, `awakened` are derived/rebuilt — they
are restored, not trusted.

## Validation on load (`loadGame`)

`loadGame` runs a whitelist of structural checks and **throws into the catch
path** on any violation, which yields a fresh `createGame()` with
`recovered: true`:

1. `version ∈ {1, 2, 3, 4, 5}`; integer level ≥1; stage ≥1; arrays/talents exist.
2. Every inventory & equipment item passes `validItem` (id/name strings, valid
   slot, finite power ≥0, integer upgrade ≥0).
3. `name` is non-empty, `log[]` entries have text + finite time, `claimed`
   is an array, talents are non-negative integers.
4. All numeric resources (`gold, xp, hp, maxStage, kills, points,
   lastSave, bosses, crafted`) are finite and ≥0; each `orbs[id]` is a
   non-negative integer.
5. `essences` are re-normalized (dedupe stacks by exact id, drop corrupt
   entries, cap stack count at 512) and the map is restored.

### Map restore validation (`restoreMap`)

A saved v2 map is only trusted in full:

- `map.width === 46`, `height === 34`, `tiles.length === 1564`, every tile 0/1,
  `seen.length === 1564`.
- `rooms.length === 9`; `topology === 'linear'`; `route.length === 9`, unique
  ids, each room's `id === index` and `order === position`.
- `enemies` is a non-empty array (≤40), every enemy has a valid `roomId`, hp
  bounds, walkable position + home, and valid modifier ids.
- Exactly **one boss**, and it is exactly the `unique` tier enemy.
- Entrance/shrine/chest/rooms are all walkable points.
- Recompute `goal`/`progress`/`bossUnlocked`/`completed` from surviving HP;
  reset timers, hazards, `rewarded` (from hp ≤0).

If restore fails (`mapRecovered: true`), the hero survives but a fresh
expedition is generated — terrain, enemies, and exploration are sacrificed,
never the character.

## Normalization & legacy migration

Runs over every item (inventory + equipped):

- **Affixes**: filters to known ids with finite non-negative values, dedupes
  by id, and for legacy rolls (no `min`/`max` stored) finds the tier whose
  range contains the value (nearest if none), clamps the value into it, and
  stamps `tier/min/max`. New-format rolls keep their tier (clamped 1..9).
- `itemLevel` defaults to 1 when missing.
- The roll-time `rarity` is deleted from items; unknown unique effects are
  stripped, and variable unique powers receive a clamped `uniqueRoll`.
- Essences carry one modifier each; identical stacks merge by exact
  `id` (affix id + tier + value), and malformed entries are dropped.

Version-1 saves (branching-era) have no map/enemies/affixes; `migrated: true`
and the character + gear are carried forward with a fresh linear expedition.
`settings` are merged over defaults (`{sound:false, motion:true}`); `speed`
collapses to 1 unless exactly 2; inventory truncates to 48; `maxStage` is
floored to `max(stage, maxStage)`.

## Persistence drivers

| Moment | Action |
|---|---|
| Every 5 s (visible) | `saveGame(state)` |
| `visibilitychange` → hidden | save immediately |
| `visibilitychange` → visible | `offlineRewards(state)` + modal + save |
| `pagehide` / WebMCP abort | save / deregister tools |

`saveGame` swallows storage failures (`quota`, private mode) and reports the
outcome through the sidebar indicator, so the game keeps running without
persistence.

## Cloud saves (Firebase)

Optional Google sign-in adds a second persistence layer (`dist/cloud-saves.js`,
`dist/firebase.js`). Each account owns one Firestore document,
`players/{uid}`:

```js
{version: 1, revision: <int>, payload: <save JSON string>, updatedAt: <timestamp>}
```

- `payload` is the exact same JSON that `saveGame` writes locally; it is
  validated with `validatePayload` before upload and goes through the normal
  `loadGame` whitelist + migration path on restore.
- `revision` starts at 1 and increments inside a transaction; writes include
  the expected revision, so a stale device gets a `SaveConflict` instead of
  clobbering newer progress. The player then chooses which copy continues.
- A per-account local mirror lives at `everfrost.cloud.<uid>` and carries a
  `dirty` flag for work uploaded late (offline play, dropped connection). On
  reconnect a dirty mirror is flushed, or surfaces as a conflict if the cloud
  moved ahead.
- The guest save (`everfrost.save.v1`) is never written while signed in, so it
  stays a genuine pre-sign-in backup. First sign-in on an account with no
  cloud save asks whether to import this device's progress or start fresh.
- Firestore rules (`firestore.rules`) allow only the owner to read/write their
  document, enforce `revision == old + 1`, cap payload size, and forbid
  deletes. Cloud saves are client-authoritative — they provide sync, not
  anti-cheat.
## Combat and loot additions

Combat attributes are derived from equipment, talents, and temporary effects, not independently persisted totals. New `lootFilter` settings default to all grades and slots, minimum item level 1, no required affixes, and unique override on; drops that don't match the filter are always converted to gold on pickup. `groundLoot` stores `{ id, item, x, y, age }` for each pending drop. Load validation discards malformed or duplicate pending records and preserves valid items; map changes and offline collection settle pending rewards once. Saves lacking these fields receive their defaults without resetting the character or map.

Version 3 migrates old weapon/armor/charm items into hand/chest/neck gear, preserving IDs, item levels, upgrades, and explicit modifiers. Legacy base stats receive deterministic middle rolls at their existing item level; saved v3 rolls survive reloads unchanged. Ground drops migrate too. Old filter categories expand to the corresponding new slots.

## Village and rift state (version 4)

Existing v1–v3 saves migrate to location expedition with an empty keystone pouch. Fields: location, returnPortal (ordinary expedition availability), keystones, riftPortal (committed keystone or null), rift ({keystone, wave, status}), expedition (suspended normal world while inside a rift), lastRift. Keystone shape: {id, kind:'keystone', name, rarity, itemLevel, modifiers:[{id,roll}]}. Rolls are 0–1 and modifier families cannot repeat.

The suspended world includes stage, map, monsters, position, health, cooldowns, combat timers, hazards, ground drops, and auto setting, but does not roll back gold, experience, equipment, or other permanent rewards. Arena validation checks the fixed collision map, wave bounds and boss state. Corrupt rifts close with no renewed entry while restoring the normal expedition when valid. Pouch, portal and ground-drop IDs are deduplicated during load.

Gear may include `locked: true` to prevent salvage consumption. Old items with no flag are unlocked. New linear maps also store `theme`, `trailWidth` and each room’s `shape`. Boss enemies store `bossId`, `abilityIndex` and `abilityTimer`; valid identities survive load, and timers reset to four seconds with pending hazards cleared. Older saved maps and bosses remain playable until the next expedition.
