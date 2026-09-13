# Save format & persistence

Storage: **localStorage**, key `everfrost.save.v1` (kept even at v2 so old
heroes migrate in place). Saves are origin-scoped; local and hosted URLs have
separate saves. Clearing browser data removes progress.

## State schema (`createGame`)

```js
{
  version: 2,
  name: 'Wanderer',            // ≤20 chars
  level: 1, xp: 0,             // xp vs xpRequired(level)
  gold: 120, shards: 8,        // currency: gold / essence
  stage: 1, maxStage: 1,       // maxStage gates world-map travel
  killsInStage: 0, kills: 0,   // wave track + lifetime stat
  bosses: 0, crafted: 0,       // quest counters
  hp: 105,                     // current (clamped to current maxHp at load)
  auto: true, advance: true, speed: 1|2,
  inventory: [item...],        // ≤48
  equipment: {weapon, armor, charm},  // item | null
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
  slot: 'weapon'|'armor'|'charm',
  rarity: 0-3,      // Normal/Magic/Rare/Unique
  name,             // e.g. "Forceful Iron Longsword of Haste"
  itemLevel,        // stage of the drop / highest merged contributor
  power,            // base slotted power; +3 per upgrade
  upgrade: 0..,     // forge level
  affixes: [{id, tier, value, min, max}],  // tier 1 = strongest; min/max from the tier
  unique: 'echo'|'lastLight'|'wildheart'|null
}
```

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

1. `version ∈ {1, 2}`; integer level ≥1; stage ≥1; arrays/talents exist.
2. Every inventory & equipment item passes `validItem` (id/name strings, valid
   slot, rarity 0–3, finite power ≥0, integer upgrade ≥0).
3. `name` is non-empty, `log[]` entries have text + finite time, `claimed`
   is an array, talents are non-negative integers.
4. All numeric resources (`gold, xp, shards, hp, maxStage, kills, points,
   lastSave, bosses, crafted`) are finite and ≥0.
5. Then normalization runs (see below) and the map is restored.

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
  stamps `tier/min/max`. New-format rolls keep their tier (clamped 1..5).
- `itemLevel` defaults to 1 when missing.
- Unknown unique effects are stripped.

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
## Combat and loot additions

Combat attributes are derived from equipment, talents, and temporary effects, not independently persisted totals. New `lootFilter` settings default to all rarities and slots, minimum item level 1, no required affixes, unique override on, and automatic filter salvage off. `groundLoot` stores `{ id, item, x, y, age }` for each pending drop. Load validation discards malformed or duplicate pending records and preserves valid items; map changes and offline collection settle pending rewards once. Saves lacking these fields receive their defaults without resetting the character or map.
