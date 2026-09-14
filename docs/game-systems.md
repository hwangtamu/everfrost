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
| attack | `9 + 3·level + gear.attack + 3·might + affix.attack` | — |
| defense | `2 + level + gear.defense + 2·guard + affix.defense` | — |
| maxHp | `90 + 15·level + gear.maxHp + 18·vigor + affix.maxHp` | — |
| crit | `8% + 1.5%·fortune + affix.critical/100` | 75% |
| critMultiplier | `1.8 + affix.criticalMultiplier/100` | 4.0× |
| attackSpeed | `(1 + haste/100) / 1.1` | haste ≤150% |
| moveSpeed | `5.8 · (1 + movement/100)` | movement ≤100% |
| attackRange | `1.9 + reach` | 6 tiles |
| resist / leech / regen | affix-driven | 65% / 15% / — |

`combatStats` layers in chill (−25% speed & attack speed when `effects.chill>0`)
and computes `averageHit` and `dps` (with the equipped unique "echo" at 125%).
`equipmentChanges` in combat-ui compares `stats` around an item swap so a
temporary chill cannot distort an upgrade decision.

## Expedition maps (`world.js`)

- Fixed 46×34 tile grid; `tiles[i]` 0 = wall, 1 = walkable.
- 9 clearings in a 3×3 grid, carved with sizes/positions from the seed,
  connected by a randomly selected Hamiltonian route. The intermediate room graph is a simple
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
    Frenzy, or Burning aura) flanked by a group of 4–6 normal minions
    (5–7 total);
  - the second room (or 23% of others) is a **magic pack** of 3–5 magic foes
    (1 shared modifier);
  - the rest are **normal packs** of 4–6 enemies.
- A **unique guardian** spawns in the boss room. `bosses.js` selects one of six identities, each with its own silhouette, palette, two modifiers, and two alternating telegraphed skills.
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
| Runic cleave (key 1) | 1 | 9 s | 3× attack damage, range = attackRange + 1.1 tiles |
| Forest blessing (key 2) | 3 | 18 s | Heal 45% max HP + remove chill (Wildheart equipment → 60%) |
| Thunderstrike (key 3) | 5 | 25 s | 5× attack as lightning, all visible enemies within 6 tiles |

Skills respect cooldowns, unlock levels, and the completed-map state; the UI
disables them with "No targets in range" when nothing is reachable.

## Loot & crafting

### Drops

| Enemy tier | Drop chance | Guaranteed floor | Modifier count |
|---|---|---|---|
| normal | 30% | — | 0 |
| magic | 70% | — | 1–2 |
| rare | 100% | modified equipment | 4–6 |
| unique (guardian) | 100% | two modified drops | 3 + 3 |

`lootRarity` still rolls an internal normal/magic/rare/unique tier, but that
tier now only decides **how many explicit modifiers** an item rolls — it is
never stored on the item. Rare leaders & guardians keep the equipment economy
flowing with guaranteed modified gear.

### Explicit modifiers (`loot.js`)

PoE-style rules:

- Every affix is a **prefix** or **suffix**; each side holds at most **3**.
- **Roll-time tier ⇒ mod count**: normal 0 · magic 1–2 · rare 4–6 (2–3
  prefixes, 2–3 suffixes) · unique 3+3.
- Each family defines **9 tiers**; Tier 1 is strongest (grade S) and requires
  item level 160, Tier 9 rolls at level 1 (gates: 1/4/8/13/19/35/60/100/160).
  Values roll uniformly inside the tier's range.
- **Item grade** is the highest modifier grade among an item's affixes, into
  the bins `D → C → B → A → AA → AAA → AAAA → AAAAA → S` (`ITEM_GRADES`). An
  item with no affixes is grade D. Grade drives the loot filter, cleanup,
  beams and salvage yield.
- `makeAffix` weights tiers toward the weaker end; high item levels can roll
  the best tiers.
- Item level = stage of the drop.

### Crafting orbs (`crafting.js`)

Orbs can only be found by defeating enemies (`defeatEnemy` rolls per-tier
drops: normals and magics have a chance at common orbs, rare leaders drop a
regal-tier orb, and stage guardians drop two divine-tier orbs). Applying an orb
consumes one copy plus `gold` (scaling with item level) and mutates in place.
`craftEligibility` enforces each rule; invalid attempts fail without charging:

| Orb | Rule | Base gold cost |
|---|---|---|
| Transmutation | reroll into 1–2 modifiers | 20 |
| Augmentation | fewer than 2 modifiers → +1 | 35 |
| Regal | fewer than 4 modifiers → +1 | 90 |
| Alchemy | fewer than 3 → reroll into 3–6 | 110 |
| Chaos | more than 3 → reroll into exactly 6 | 150 |
| Exalted | fewer than 6 → add an open prefix or suffix | 240 |
| Scouring | remove every explicit modifier | 30 |
| Divine | reroll every value; keep types & tiers; rerolls implicits | 70 |

The 3-prefix / 3-suffix caps always hold. Orbs never remove a unique power;
only Divine rerolls implicit base values and variable unique powers. Every
successful craft increments `state.crafted`, feeding the forge quest.

### Essences (`essences.js`)

Salvaging equipment gives each explicit modifier an independent chance to be
recovered as an **essence** — one modifier per essence, carrying its exact
grade and value. Recovery odds fall with grade (40% D → 1% S). The loot
filter's minimum essence grade makes lower essences vanish during recovery
instead of entering the pouch.

Applying an essence targets an open prefix/suffix slot, or replaces a weaker
modifier of the same family (the essence tier must beat the existing tier).
Slam success also falls with grade (95% D → 15% S); a failed attempt consumes
the essence and leaves the item unchanged. The forge uses selectable modifier
cards with live search and filters for grade, prefix, suffix, and compatibility.
Incompatible cards explain why they cannot be applied. Identical modifiers
stack in the pouch (≤512 stacks) and survive saves. Players may discard one
copy immediately or review and discard an entire stack to free a stack slot.

### Forge & salvage

- **Upgrade**: each rank costs `40·(n+1)` gold and adds 10% of the original implicit stats.
- **Salvage**: gold = `round((2 + 3·grade + uniqueBonus + upgrade) · (1 + ilvl·0.25))`;
  unique items salvage into gold like any other item, and each explicit
  modifier gets a chance to be recovered as an essence. A full 48-slot satchel
  auto-salvages new drops the same way.
- The old 3-for-1 merge recipe has been removed.

## Quests

| Quest | Condition | Reward |
|---|---|---|
| Into the wild | 10 kills | 150 gold |
| A sharper edge | 3 upgrades/crafts/essences | 200 gold |
| The forest remembers | 1 guardian | 400 gold |

Claiming is one-time (`state.claimed`) and validated against the live value.

## Offline rewards

- On return, `max(0, now − lastSave)` capped at **8 hours** (28 800 s);
  requires `auto === true` and ≥60 s away.
- Modeled at **50% combat efficiency**: estimated kill time =
  `averageHealth/DPS + travelTime`, then `kills = floor(elapsed / killTime · 0.5)`.
- Grants gold, XP (+level-ups), and randomly rolled orbs (common ~1-in-8
  simulated kills, regal-tier ~1-in-7, divine-tier ~1-in-29). **Never advances
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

`defeatEnemy` and chests call `dropItem`, creating an entry in `groundLoot` rather than placing equipment directly in the inventory. Canvas labels use grade colors, with beams for grade B+ and unique equipment. Drops auto-collect after 2.4 game seconds while battle is active. Clicking a label or Collect now calls `collectLoot` immediately. Map changes collect outstanding drops first, and pending drops survive saves.

`loot-filter.js` evaluates a minimum equipment grade (D–S), permitted slots, minimum item level, and an OR match across selected affix families; these groups combine with AND. A separate minimum essence grade filters which lower essences are recovered from salvage. `alwaysShowUnique` bypasses those conditions. The filter gates pickups: unmatched drops convert to gold (the normal salvage value) and are logged separately, while matching drops enter the satchel. Existing inventory items are never processed retroactively. Inventory capacity remains 48 with automatic salvage on overflow.

## Eleven-slot gear and implicit stats

Equipment slots: head, neck, shoulder, chest, wrist, hand, belt, leg, foot, leftRing, rightRing. Runic Bands fit either finger and share attack/life implicits and affix pools. `gear.js` defines each slot's damage, armor, and life rates. Each implicit rolls `rate × itemLevel × uniform(0.95, 1.05)`, rounded to one decimal. Rarity does not multiply base stats. All equipped implicits contribute to combat along with explicit modifiers. Each forge rank adds 10% of the original base values; orbs and essences change only explicits, while Divine can reroll implicit base values and variable unique rolls. Unique powers work in any applicable slot and do not stack duplicate powers. `UNIQUE_EFFECTS` in `loot.js` holds a pool of named powers per slot — each unique drop rolls one power from its slot's pool, and the item name is `power name + base name`. Powers either carry `stats` (flat or per-item-level bonuses folded into `stats()` like affixes) or a special mechanic applied by id in the engine:

The catalog contains 44 distinct uniques: six each for hand and neck, four for each other gear type. Both fingers share the same four ring uniques. Unique rarity drop chances are unchanged; selection within each slot pool is uniform.

- hand: Dawn's Echo (every fourth attack strikes twice), Stormbrand (+30% of attack as lightning on strikes), Executioner's Oath (+80% damage below 35% enemy health), Frostfang (cold damage and reach), Bloodreaver (attack and leech), Sunbreaker (fire damage and critical multiplier)
- neck: Wildheart (healing skills +15% max health), Eye of the Tempest (+15% resist, +8% crit), Crimson Chalice (4% leech, regen per item level), Winter Oracle (cold damage and resistance), Stormglass (lightning damage and attack speed), Oath of Giants (life and reach)
- head: Sage's Crown (cooldowns recover 30% faster), Starkonja's Pelt (+8% crit, +12% attack and movement speed), Ravenlord (critical chance and multiplier), Hollow Monarch (life and regeneration)
- shoulder: Spikeward (reflects 35% of physical damage taken), Aegis of Dawn (defense per item level, +10% resist), Ashwing (fire damage and movement), Glacial Bastion (cold damage and defense)
- chest: Last Light (25% less damage below 35% health), Stoneheart (12% less damage from all sources), Briarheart (life and regeneration), Void Carapace (defense and resistance)
- wrist: Warbringer (attack per item level, 3% leech), Spellweave (skills +25% damage), Duelist's Vow (attack speed and reach), Thundercoil (lightning damage and critical chance)
- belt: Soulgorge (+25% attack/movement speed for 6s on kill), Gravebind (+6% max health on kill), Serpent Coil (leech and attack speed), Hearthkeeper (regeneration and life)
- leg: Ironstride (chill immunity, +15% movement), Titanplate (defense and life per item level), Outrider (movement and attack), Duskwarden (resistance and life)
- foot: Windrunner (+45% movement speed), Emberwalk (20% less elemental damage taken), Ghoststep (movement and reach), Dawnmarch (movement, regeneration, and defense)
- either ring: Ember Signet (fire damage per level, +5% crit), Moonwell (regeneration per level, +12% resistance), Rimecircle (cold damage and critical multiplier), Stormknot (lightning damage and attack speed). Wearing two of the same power uses only the highest-item-level power; both rings still contribute implicits and affixes.

The equipment panel places eleven slots around a character portrait. The 48-slot bag exposes inspection and a lock toggle; inspection offers equip (either finger for rings) and immediate salvage. Sort by newest, grade, level, or slot. Bulk cleanup snapshots unlocked, unupgraded D/C-grade items in the current filter. `setItemLocked` works for equipped and bag gear. `salvage` enforces locks in the engine, and the optional boolean flag survives local and cloud saves. No salvage confirmation dialog is used.

## Village and keystone rifts

- Location is expedition, village, or rift. Teleport to the Village at any time. Normal maps retain the hero position, enemy health, progress, timers, and ground loot. Returning resumes that map; the entrance starts a new map of an unlocked stage and replaces the return point.
- Craft keystones only in town, choosing any level up to maxStage. Recipes consume orbs atomically: normal 3 Transmutation; magic 3 Transmutation + 2 Augmentation; rare 2 Alchemy + 1 Regal; unique 2 Exalted + 2 Divine.
- Keystone drop chances by enemy tier: normal 0.3%, magic 1%, rare 4%, unique 12%. Conditional keystone rarity weights: normal 45%, magic 37%, rare 15.5%, unique 2.5%. They use a separate, paginated pouch and bypass equipment filters.
- Keystone mod counts: normal 0, magic 1–2, rare 3–4, unique 6 distinct mods. Brutal adds monster damage, Stalwart life, Quickened speed, Crowded pack size, Warded damage reduction, and Ruinous critical chance. Every mod also increases reward item level, quantity, and rarity. Values are shown before portal opening.
- Opening consumes the keystone and creates one pending portal; entering consumes that portal. The ordinary expedition is suspended separately. Teleporting out or dying ends a rift permanently. The normal return point survives.
- The 24×18 arena spawns four packs, then a randomly selected Riftbound boss. The next wave is immediate after the last kill. Base monster life/damage are +20%/+10%; the boss additionally has 2.2× life and 1.5× damage. Rifts never advance maxStage or normal guardian achievements. The winner stays in the cleared arena to collect and return.
- Quantity multiplies equipment roll count, with a probabilistic extra roll for the fractional part. Rarity divides the rarity roll by 1 + bonus/100. Item level is keystone level + modifier bonuses. These bonuses do not alter already rolled items.
- Village and rifts grant no offline farming. An unfinished rift resumes after reload without another portal entry; death, entry, opening, and wave transitions persist immediately in the UI.

### Map variety, bosses and HUD

`MAP_THEMES` defines grove, ruins, marsh and ridge scenery; generated rooms choose oval, cross, terrace or diamond shapes. Every route still visits nine clearings once, with no shortcuts. Existing saved maps retain their terrain and progress.

`BOSSES` defines Thornmaw (roots/slam), Skadi (charge/frost), Gorath (fire/charge), Aeralis (lightning/nova), Nyx (nova/roots), and Korr (slam/lightning). `castBossSkill` snapshots positions and schedules hazards; `hazardHits` handles circles, charge capsules and rings with safe centers. Charges only traverse walkable sight lines. Chill immunity also applies to boss hazards. Boss identity and skill order persist; loading clears pending hazards and resets the cast timer.

`hud-ui.js` renders icon-only modifier buttons beneath player and foe HP bars, with accessible descriptions and inspection links. The map button lives outside the canvas. Loot, progress, death and offline rewards never open event pop-ups; the log and stage objective carry the information. Direct user actions receive inline status feedback. Account/conflict dialogs remain interactive.
