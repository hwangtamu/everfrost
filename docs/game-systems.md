# Game systems

## Stages and progression

- Four regions — Mistwood, Frostfall Ridge, Ember Hollow, The Starless Wild —
  of five stages each form a 20-stage **journey**; journeys repeat without end.
  `regionIndex = floor(((stage−1) mod 20) / 5)`.
- `maxStage` gates travel. With **auto-advance** on, clearing a guardian moves
  to the next stage; off, the same stage is replayed on a fresh map (farming).
- **XP**: `xpRequired(level) = round(45 · level^1.38)`. Each level grants one
  passive point and one skill point, and refills health and mana.
- **Enemy scaling** (`enemyBaseLife`, `enemyBaseDamage`):
  `life = (14 + 20·stage^1.4) · 1.055^(stage−1)`,
  `damage = (2 + 1.5·stage^1.2) · 1.042^(stage−1)`, then multiplied per tier.
  The exponential term outruns levels alone: a hero who never equips or
  allocates anything stalls near stage 5, and a well-built one meets real
  resistance in the third journey.

| Tier | Life | Damage | Seal points | Reward |
|---|---|---|---|---|
| Normal | ×1 | ×1 | 1 | ×1 |
| Magic | ×2.4 | ×1.2 | 2 | ×1.8 |
| Rare | ×7 | ×1.5 | 5 | ×3.5 |
| Unique (guardian) | ×26 | ×2 | — | ×8 |

## Hero stats (`stats`, `combatStats`)

| Stat | Formula | Cap |
|---|---|---|
| attack | `(9 + 3·level + gear + affixes) · (1 + tree attack%)` | — |
| defense (armor) | `(2 + level + gear + affixes) · (1 + tree armor%)` | — |
| maxHp | `(90 + 15·level + gear + affixes) · (1 + tree life%) · (1 − Momentum 15%)` | — |
| crit chance | `8% + affixes + tree` | 75% |
| crit multiplier | `180% + affixes + tree` | 500% |
| attack speed | `(1 + haste%) / 0.85 s` | haste ≤150% |
| movement | `5.8 · (1 + movement%)` | movement ≤100% |
| attack range | `1.9 + reach` | 6 tiles |
| resistance / leech | affixes + tree | 75% / 15% |
| mana | `40 + 3·level + tree`; regen `(2.2 + 0.1·level) · (1 + tree%)`; +2 per kill | — |

- **Armor** reduces each physical hit by `armor / (armor + 3·hit)`, at most
  85% — strong against swarms, weaker against heavy blows.
- **Resistance** reduces fire, cold and lightning damage by its percentage.
- `combatStats` adds chill (−25% speed), the Battle Cry bonus, average hit
  (crit-weighted), `dps`, and `toughness` (health scaled by mitigation against
  an on-level hit). Item comparisons use the change in `dps` and `toughness`.
- **Ailments**: any fire damage ignites (burns for 50% of your fire damage per
  second for 3 s; doubled by a critical); any cold damage chills (−20% enemy
  speed); lightning has a 15% chance to shock (+20% damage taken for 4 s).

## Combat loop (`advanceStep`)

```
cooldowns, cast lock, potion lock decay
if paused: stop
effects tick (whirlwind hits, ward, cry, renewal)
map complete? → countdown → next stage or fresh map
regen health and mana → auto-potion below 35% → pick target → auto-cast
dodge hostile ground attacks → path to target → move
shrine (full heal, mana, potion charges) / cache
basic attack: target at 100%, up to three foes within 1.8 tiles of it at splash% (50% base)
each awakened enemy: status timers, burn, stun, regen, chase, attack, auras, slam
separate overlapping enemies
hazards: enemy slams/volatile hurt the hero; meteors hurt enemies; burning ground ticks
death → recover at camp (second death on a map: retreat a stage, auto-advance off)
```

`tick` splits time into ≤0.1 s steps so 2× speed stays stable and testable.

## Skills (`skills.js`, `castSkill`)

Skills unlock at a hero level at rank 1. Each extra rank (skill points, up to
rank 10) adds 12% to the skill's effect. Rank 4 opens a choice of two runes.
Four slots; a skill must be slotted to be cast.

| Skill | Lv | CD | Mana | Effect | Runes |
|---|---|---|---|---|---|
| Runic Cleave | 1 | 3 s | 6 | 220% attack to all within range + 1.1 | Rending (+40% damage) · Sweeping (+1.2 radius, chills) |
| Forest Blessing | 3 | 14 s | 14 | Heal 35% (+2.5%/rank), cleanse chill | Renewal (4%/s for 5 s) · Quickening (−35% cooldown) |
| Thunderstrike | 5 | 9 s | 20 | 350% attack as lightning within 6 | Overcharge (+50% damage, +50% cost) · Static Field (shock) |
| Frost Leap | 8 | 7 s | 12 | Leap ≤8 tiles, 260% as cold within 2.6, chill | Avalanche (+1 radius, +20%) · Aftershock (stun 1.5 s) |
| Whirlwind | 12 | 10 s | 18 | 3 s of 70% hits four times a second within 2.4 | Bloodstorm (6% leech) · Cyclone (+1.5 s) |
| Battle Cry | 16 | 22 s | 16 | 8 s: +30% damage (+2.5%/rank), +20% attack speed | Rallying (heal 15%) · Intimidate (enemies −20% damage) |
| Emberfall | 20 | 11 s | 28 | After 0.7 s, 700% as fire within 3 of the target | Cataclysm (+60%, +3 s) · Scorched Earth (burning ground) |
| Stone Ward | 24 | 18 s | 14 | Absorb 30% of max health for 6 s | Bulwark (+50%) · Thorns (attackers take 100% attack) |

Skill damage is further multiplied by tree skill damage and the Spellweave
unique. Cooldowns recover faster with Sage's Crown and tree cooldown recovery.

**Auto-cast** (`autoCast`) considers slotted skills in slot order, one cast per
0.35 s: attacks fire on two or more targets or one tough target; Blessing
below 55% health; Ward when hurt with enemies near; Battle Cry on four or more
nearby enemies or an elite; Leap to close distance; Emberfall on elites or
clusters; Whirlwind when three or more are in reach.

## Potions

Three charges (more from the tree). A charge restores 40% of maximum health,
with a 1.2 s lockout. Kills build progress — 1/2/5 per normal/magic/rare, a
full charge per guardian — and every 14 progress restores a charge. Shrines
and recovering at camp refill them. Auto-potion (a setting) drinks at 35%.

## Passive tree (`tree.js`)

61 nodes: an origin, six paths of five small nodes, a notable and a keystone,
and six hybrid bridges (two small nodes and a notable) linking neighbouring
paths at their third node. A node can be allocated when it touches an owned
node. `respecCost = 40 + nodes · 12 · max(1, floor(level/5))` gold.

| Path | Small nodes | Notable | Keystone |
|---|---|---|---|
| Warrior | attack %, splash | Butcher | **Berserker** — 35% more damage, 15% more damage taken |
| Assassin | crit chance, crit multiplier | Deadeye | **Perfect Strike** — +70% crit multiplier, non-crits deal 20% less |
| Stalker | attack speed, movement, leech | Predator | **Momentum** — +30% attack speed, 15% less health |
| Guardian | health %, armor % | Juggernaut | **Unbreakable** — 22% less damage taken, 12% less dealt |
| Warden | resistance, regeneration, potion power | Oathkeeper | **Alchemist** — +2 potion charges, potions 20% stronger |
| Mystic | mana, skill damage, cooldown | Runecaller | **Blood Rite** — skills cost health, +30% skill damage |

## Maps (`world.js`) and packs (`startExpedition`)

- A 46×34 grid with nine clearings on one winding route: entrance, six
  encounter rooms, a shrine room with a cache, and the guardian's sanctum.
- Encounter rooms hold a normal pack (6–9), a magic pack (4–6, one shared
  modifier), or a rare aura leader with 6–8 normal minions. At most 55 enemies.
- Killing non-boss enemies adds their seal points; at the goal the guardian is
  revealed. Guardians always have Earthshatter and Empowered, plus a regional
  trait (Frostfall: Chilling Touch; Ember Hollow: Burning Aura; Starless Wild:
  Hasted) and one more from the second journey on.
- The hero sidesteps hostile ground attacks automatically (`dodgeHazards`).

## Loot

| Enemy tier | Drop chance | Notes |
|---|---|---|
| Normal | 14% | |
| Magic | 50% | |
| Rare | 100% | magic or better |
| Guardian | 100% | two items, rare or better |

- Items drop on the ground and are collected after 2.4 s (or on tap). Drops
  that fail the loot filter become gold. A full 48-slot bag salvages new
  drops.
- **Bases** (`gear.js::BASES`): each slot drops as one of three bases chosen
  at random. The first is the classic profile; the others have different
  implicit rates and a fixed bonus (critical chance, attack speed, movement,
  skill damage, mana regeneration, gold found, item rarity, potion strength…).
  `baseBonuses` folds those into `stats()`. Items remember `base`; older items
  without one count as the first base.
- **Implicits**: `rate × item level × (0.95–1.05)` per base stat; tempering
  adds 10% of the base per rank (`40·(rank+1)` gold).
- **Explicit modifiers**: prefixes and suffixes, three of each at most. Magic
  1–2, rare 4–6, unique 3+3 plus a named power. Most families have eight
  tiers gated by item level 1/4/8/13/19/28/40/55; a drop rolls among the best
  five tiers its level allows, weighted toward the weaker ones. Flat stats grow
  steeply in the deep tiers, percentages gently.
- **Families**: attack, armor (two), health (two), fire, cold, lightning,
  attack speed, critical chance, critical multiplier, movement, reach,
  resistance, leech, regeneration, plus maximum mana, skill damage, cooldown
  recovery, splash damage, mana regeneration, gold found, item rarity, and
  "+1/+2 to all skill ranks" (head and neck only, from item level 13/40).
- **Gold found** multiplies kill gold; **item rarity** divides the rarity roll
  like rift rarity does (both capped at 300%).
- **Locking** an item protects it from salvage, bulk salvage and merging.
- **Salvage** pays gold; by hand, a unique also yields a Regal, Alchemy or
  Chaos orb and a rare has a 30% chance of a common orb.
- **Gamble** (`gamble`): `150 + 45·maxStage` gold buys an item of the chosen
  slot at item level `maxStage` — 6% unique, 34% rare, otherwise magic.
- **Filter**: `keepUpgrades` (on by default) spares any drop that
  `isUpgrade(bestComparison(s, item))`. With the `autoEquip` setting, such a
  drop is worn on pickup.
- **Orbs** drop only from enemies (and quests): Transmutation, Augmentation,
  Regal, Alchemy, Chaos, Exalted, Scouring, Divine. Each use also costs gold.
- **Bench**: add a chosen modifier at a chosen tier for gold.
- **Merge**: three bag items of one slot and rarity → the next rarity, 75 gold.

## Village and rifts

- Teleporting to the Village freezes the expedition exactly; resuming returns
  to it. Keystones are cut and opened only in the Village.
- A keystone has a level and 0–6 modifiers by rarity (monster damage, life,
  speed, pack size, damage reduction, critical chance); each adds item level,
  quantity and rarity to the rewards.
- A rift is a 24×18 arena: four waves of `6 + 2·wave` enemies (more with
  Crowded), then Vharos. Death or leaving ends it; clearing it counts toward
  quests.

## Quests

Sixteen one-time deeds (`QUESTS`) tracking kills, guardians, level, highest
stage, crafting, passives and rifts. Rewards are gold and sometimes orbs.

## Offline rewards

Requires the fight to be running and at least 60 s away; capped at 8 hours and
modelled at half efficiency from current `dps`. Grants gold, experience, orbs
and one item per 40 kills (at most 8, and only into free bag space). Never
advances stages or quests. The Village and rifts earn nothing.
