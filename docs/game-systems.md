# Game systems

## Regions, stages, progression

```js
REGIONS = [
  Mistwood          · start 1  · Mistwood foes        · boss "The Hollow Guardian"
  Frostfall Ridge   · start 6  · Frost foes           · boss "Hrim, the Frostborn"
  Ember Hollow      · start 11 · Cinder foes          · boss "The Ashen King"
  The Starless Wild · start 16 · Void foes            · boss "The Forgotten One"
]
```

- Display numbering uses the absolute stage and journey: `journey = floor((stage-1)/20)+1`. There is no final-stage cap.
- `region(s)` uses `floor(((stage-1)%20)/5)` so each new journey repeats the four regions at a higher stage level. World-map pages contain 20 stages and support direct travel to any unlocked stage.
- `maxStage` gates travel between unlocked stages (via the World Map dialog);
  each stage can be farmed with auto-advance off ("New map" rerolls the layout
  of the current stage).
- **XP curve**: `xpRequired(level) = round(45 · level^1.38)`; every level grants
  one mastery point. Talents: might (+3 attack), guard (+2 defense),
  vigor (+18 max HP), fortune (+1.5% crit chance per point).

## Character math (`stats` / `combatStats`)

Base values, then equipment power, then talents and affixes, then caps:

| Stat | Formula (condensed) | Cap |
|---|---|---|
| attack | `9 + 3·level + weapon.power+3·upgrade + 3·might + affix.attack` | — |
| defense | `2 + level + armor.power+3·upgrade + 2·guard + affix.defense` | — |
| maxHp | `90 + 15·level + 3·(charm.power) + 18·vigor + affix.maxHp` | — |
| crit | `8% + 1.5%·fortune + affix.critical/100` | 75% |
| critMultiplier | `1.8 + affix.criticalMultiplier/100` | 4.0× |
| attackSpeed | `(1 + haste/100) / 1.1` | haste ≤150% |
| moveSpeed | `5.8 · (1 + movement/100)` | movement ≤100% |
| attackRange | `1.9 + reach` | 6 tiles |
| resist / leech / regen | affix-driven | 65% / 15% / — |

`combatStats` layers in chill (−25% speed & attack speed when `effects.chill>0`)
and computes `averageHit` and `dps` (with the weapon unique "echo" at 125%).
`equipmentChanges` in combat-ui compares `stats` around an item swap so a
temporary chill cannot distort an upgrade decision.

## Expedition maps (`world.js`)

- Fixed 46×34 tile grid; `tiles[i]` 0 = wall, 1 = walkable.
- 9 clearings in a 3×3 grid, carved with sizes/positions from the seed,
  connected by one serpentine route. The intermediate room graph is a simple
  path (degree ≤2), so there are **no loops and no shortcuts** — the 500-seed
  test removes each interior clearing and asserts the entrance→boss path dies.
- Roles: entrance (route[0]), boss sanctum (route[8]), a shrine + chest near
  `route[3 + rand(3)]`, the remainder encounters.
- Fog of war: `map.seen[]` revealed with `reveal()` around the hero (radius 7)
  and around the boss display when unlocked (radius 4). A live minimap draws
  seen tiles, hero, enemies, shrine, chest.

## Enemy formation (`startExpedition`)

- Encounter rooms are visited in route order; tiers per room:
  - one random room (`2 + rand(3)`) hosts a **rare aura leader** (Guardian,
    Frenzy, or Burning aura) flanked by two normal minions;
  - the second room (or 23% of others) is a **magic pack** (1 shared modifier);
  - the rest are **normal packs** (2–3 enemies).
- A **unique guardian** always spawns in the boss room with `earthshatter +
  empowered`.
- Guardian bar: normal kills +1, magic +2, rare +5. Reaching `map.goal` breaks
  the seal (`bossUnlocked`), reveals the guardian, and opens the sanctum.
  Defeating the guardian sets `map.completed`, bumps `maxStage`, and (if auto
  advance) starts the next stage after 3 seconds.

## Combat loop (`advanceStep`)

```
cooldowns decay → if !auto return
if map.completed → respawn countdown → stage++ (advance?) → startExpedition
regen tick → selectTarget (route order, manual override preserved)
path to target (findPath) unless in reach; moveAlong
shrine heal / chest loot on proximity
attack timer → strikeEnemy (crit roll, effectiveDamage, cold chill, leech)
per awakened enemy:
  regenerate / chase / attack hero / vampiric / chill touch
  burning aura damage; earthshatter slam → telegraphed hazard
hazards tick (volatile & slam AoE damage)
hero death → respawn at camp, auto-pause, enemies recover HP/positions
```

The 100 ms tick is partitioned into ≤0.1 s steps so 2× speed stays stable and
testable (`tests` drive `tick(s, .1)` directly).

## Skills

| Skill | Level | Cooldown | Effect |
|---|---|---|---|
| Runic cleave (key 1) | 1 | 9 s | 3× weapon damage, range = attackRange + 1.1 tiles |
| Forest blessing (key 2) | 3 | 18 s | Heal 45% max HP + remove chill (Wildheart charm → 60%) |
| Thunderstrike (key 3) | 5 | 25 s | 5× attack as lightning, all visible enemies within 6 tiles |

Skills respect cooldowns, unlock levels, and the completed-map state; the UI
disables them with "No targets in range" when nothing is reachable.

## Loot & crafting

### Drops

| Enemy tier | Drop chance | Guaranteed floor | Always yields |
|---|---|---|---|
| normal | 30% | — | 1 item |
| magic | 70% | — | 1 item |
| rare | 100% | magic-or-better | 1 item |
| unique (guardian) | 100% | two rare-or-better | 2 items |

`lootRarity` maps an enemy roll to normal/magic/rare/unique with tuned
thresholds per tier. Rare leaders & guardians drive the equipment economy.

### Explicit modifiers (`loot.js`)

PoE-style rules (added in v2.2):

- Every affix is a **prefix** or **suffix**; each side holds at most **3**.
- **Rarity ⇒ mod count**: Normal 0 · Magic 1–2 · Rare 4–6 (2–3 prefixes, 2–3
  suffixes) · Unique 3+3.
- Each family has **5 tiers**; Tier 1 is strongest and requires item level 19,
  Tier 5 rolls at level 1 (gates: 1/4/8/13/19). Values roll uniformly inside
  the tier's range.
- `makeAffix` weights tiers toward the weaker end; high item levels can roll
  the best tiers.
- Item level = stage of the drop; `merge` carries the highest contributor's
  item level into the forged unique-family result.

### Crafting bench (`crafting.js`)

Orbs charge gold + essence (both scale with item level) and mutate in place:

| Orb | Effect | Base cost (gold/essence) |
|---|---|---|
| Transmutation | normal → magic (1–2 mods) | 20 / 1 |
| Augmentation | +1 mod to magic | 35 / 2 |
| Regal | magic → rare, +1 mod | 90 / 6 |
| Alchemy | normal → rare (full roll) | 110 / 8 |
| Chaos | reroll rare | 150 / 12 |
| Exalted | +1 mod to rare | 240 / 18 |
| Scouring | strip to normal | 30 / 2 |
| Divine | reroll values, keep tiers | 70 / 5 |

**Bench crafting** (deterministic): pick a modifier + tier on a magic/rare
item; enforces slot caps, duplicate bans, item-level gating, and a price that
rises with tier and item level. Every successful craft increments
`state.crafted`, feeding the forge quest.

### Forge & salvage

- **Upgrade**: equipped item +1 level; costs `40·(n+1)` gold and `3+2n`
  essence; +3 to that slot's base power per level.
- **Merge**: 3 unequipped items, same slot + rarity → next rarity (75 gold),
  power inherits the best invested item +3, item level inherits the max.
- **Salvage**: `2 + 3·rarity + upgrade` essence; a full 48-slot satchel
  auto-salvages new drops.

## Quests

| Quest | Condition | Reward |
|---|---|---|
| Into the wild | 10 kills | 150 gold · 5 essence |
| A sharper edge | 3 forges/merges/crafts | 200 gold · 10 essence |
| The forest remembers | 1 guardian | 400 gold · 15 essence |

Claiming is one-time (`state.claimed`) and validated against the live value.

## Offline rewards

- On return, `max(0, now − lastSave)` capped at **8 hours** (28 800 s);
  requires `auto === true` and ≥60 s away.
- Modeled at **50% combat efficiency**: estimated kill time =
  `averageHealth/DPS + travelTime`, then `kills = floor(elapsed / killTime · 0.5)`.
- Grants gold, XP (+level-ups), and `floor(kills/3)` essence. **Never advances
  maps, stages or quests.**

## Settings & accessibility

- Toggleable synthesized audio (WebAudio blips) and ambient motion; both honor
  `prefers-reduced-motion`.
- Keyboard: 1/2/3 skills, Space pause, arrows move when the canvas is focused.
- Mobile bottom nav + desktop sidebar; dialog focus containment; visible focus
  rings; save status indicator.

## WebMCP (progressive enhancement)

If the browser exposes `document.modelContext`, two page-scoped tools register
(aborted on pagehide): `read_adventure` (read-only hero/resource/expedition/
enemy snapshot) and `set_battle_active` (validated pause/resume mirroring the
UI control).
## Ground loot and customizable filters

`defeatEnemy` and chests call `dropItem`, creating an entry in `groundLoot` rather than placing equipment directly in the inventory. Canvas labels use rarity colors, with beams for rare and unique equipment. Drops auto-collect after 2.4 game seconds while battle is active. Clicking a label or Collect now calls `collectLoot` immediately. Map changes collect outstanding drops first, and pending drops survive saves.

`loot-filter.js` evaluates minimum rarity, permitted slots, minimum item level, and an OR match across selected affix families; these groups combine with AND. `alwaysShowUnique` bypasses those conditions. Unmatched drops hide their labels but still collect unless `salvageHidden` is enabled. Filter salvage grants the normal essence value and logs it separately. Existing inventory items are never processed retroactively. Inventory capacity remains 48 with automatic salvage on overflow.
