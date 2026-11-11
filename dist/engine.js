import {makeKeystone,validKeystone,rollKeystone,riftBonuses,rewardQuantity,makeRiftMap,RIFT_WAVES,KEYSTONE_RECIPES} from './keystones.js';
import {GEAR,GEAR_SLOTS,RING_SLOTS,LEGACY_SLOTS,BASES,baseOf,baseBonuses,canonicalSlot,rollImplicits,implicitStats,migrateGear} from './gear.js';
import {generateMap, seededRandom, distance, walkable, findPath, moveAlong, reveal, hasLineOfSight} from './world.js';
import {AFFIXES, UNIQUE_EFFECTS, rollAffixes, affixBonuses, lootRarity, uniquesForSlot, uniqueBonuses, retier} from './loot.js';
import {ENEMY_TIERS, MODIFIERS, rollModifiers} from './monsters.js';
import {normalizeLootFilter,matchesLootFilter} from './loot-filter.js';
import {CRAFT_OPERATIONS} from './crafting.js';
import {SKILLS,SKILL_BY_ID,skillParams,skillRank,zeroCooldowns,defaultSkills,normalizeSkills} from './skills.js';
import {treeBonuses,normalizeTree,allocate} from './tree.js';
export {SKILLS} from './skills.js';

// Keep the original storage key so existing characters migrate in place.
export const SAVE_KEY = 'everfrost.save.v1';
export const REGIONS = [
  {name:'Mistwood', subtitle:'The wilds are waking.', start:1, color:'#829f7c', foes:['Mossfang Wolf','Wild Bristleback','Thorn Sprite'], boss:'The Hollow Guardian'},
  {name:'Frostfall Ridge', subtitle:'Follow the northern wind.', start:6, color:'#9bbdce', foes:['Frost Wolf','Icebound Wraith','Snow Stalker'], boss:'Hrim, the Frostborn'},
  {name:'Ember Hollow', subtitle:'Something stirs beneath the ash.', start:11, color:'#d4936f', foes:['Cinder Hound','Ash Wraith','Emberling'], boss:'The Ashen King'},
  {name:'The Starless Wild', subtitle:'Beyond the edge of every map.', start:16, color:'#aa97cc', foes:['Void Stalker','Moon Wraith','Dusk Serpent'], boss:'The Forgotten One'}
];
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
// Crafting orbs are a per-type count. They can only be obtained by defeating
// enemies (see rollOrbs / offlineOrbs); applying one also costs gold.
const zeroOrbs = () => Object.fromEntries(Object.keys(CRAFT_OPERATIONS).map(k => [k, 0]));
export const regionIndex = s => Math.floor(((s.stage-1)%20)/5);
export const journey = s => Math.floor((s.stage-1)/20)+1;
export const region = s => REGIONS[regionIndex(s)];
export const xpRequired = level => Math.round(45 * Math.pow(level, 1.38));
export const BASE_COMBAT = {movementSpeed:5.8, attackInterval:.85, attackRange:1.9, critMultiplier:1.8, splash:.5, potionHeal:.4, potionCharges:3};
export const POTION_KILLS = 14;
export const IGNITE_RATE = .5, SHOCK_CHANCE = .15;
// Enemy scaling outpaces raw levels, so later stages ask for upgrades, crafting and a build.
export const enemyBaseLife = stage => (14 + 20 * Math.pow(stage,1.4)) * Math.pow(1.055,stage-1);
export const enemyBaseDamage = stage => (2 + 1.5 * Math.pow(stage,1.2)) * Math.pow(1.042,stage-1);
// Armor mitigates a share of each physical hit; big hits punch through more of it.
export const armorReduction = (defense,amount) => defense <= 0 ? 0 : Math.min(.85, defense / (defense + 3 * Math.max(1,amount)));
const hasUnique = (s,key) => Object.values(s.equipment).some(i=>i?.unique===key);

export function stats(s) {
  const eq = Object.values(s.equipment), a = affixBonuses(eq), u = uniqueBonuses(eq), t = treeBonuses(s);
  for (const stat in u) a[stat] = (a[stat]||0) + u[stat];
  const b = baseBonuses(eq);
  for (const stat in b) a[stat] = (a[stat]||0) + b[stat];
  for (const stat of ['critical','criticalMultiplier','haste','movement','leech','resist']) a[stat] = (a[stat]||0) + (t[stat]||0);
  if (s.effects?.soulgorge > 0) { a.haste += 25; a.movement += 25; }
  if (s.effects?.warcry > 0) a.haste += 20;
  const bonus = stat => eq.reduce((n,item) => Math.round((n+(implicitStats(item)[stat]||0))*10)/10,0);
  const pct = (value, percent) => percent ? Math.round(value * (1 + percent/100) * 10) / 10 : value;
  const attackSpeed = (1 + Math.min(150, a.haste) / 100) / BASE_COMBAT.attackInterval;
  const maxHp = Math.round(pct(90 + s.level * 15 + bonus('maxHp') + a.maxHp, t.lifePct) * (1 - (t.lifeLess||0)/100));
  return {
    attack: pct(9 + s.level * 3 + bonus('attack') + a.attack, t.attackPct),
    defense: pct(2 + s.level + bonus('defense') + a.defense, t.defensePct),
    maxHp,
    crit: Math.min(.75, .08 + a.critical / 100),
    critMultiplier: Math.min(5, BASE_COMBAT.critMultiplier + a.criticalMultiplier / 100),
    movementSpeed: BASE_COMBAT.movementSpeed * (1 + Math.min(100, a.movement) / 100),
    attackRange: Math.min(6, BASE_COMBAT.attackRange + a.reach),
    attackSpeed, attackInterval: 1 / attackSpeed,
    fire: a.fire, cold: a.cold, lightning: a.lightning, resist: Math.min(75, a.resist),
    leech: Math.min(15, a.leech), regen: a.regen + maxHp * (t.regenPct||0) / 100, haste: Math.min(150, a.haste),
    maxMana: 40 + s.level * 3 + (t.manaMax||0) + (a.mana||0), manaRegen: (2.2 + s.level * .1) * (1 + ((t.manaRegen||0)+(a.manaRegen||0))/100),
    splash: BASE_COMBAT.splash * (1 + ((t.splash||0)+(a.splash||0))/100),
    skillDamage: 1 + ((t.skillDamage||0)+(a.skillDamage||0))/100, cooldownRate: 1 + ((t.cooldown||0)+(a.cooldown||0))/100,
    goldFind: Math.min(300, a.goldFind||0), magicFind: Math.min(300, a.magicFind||0), allSkills: a.allSkills||0,
    damageMore: (1 + (t.damageMore||0)/100) * (1 - (t.damageLess||0)/100),
    damageTaken: (1 + (t.takenMore||0)/100) * (1 - (t.takenLess||0)/100),
    nonCritMultiplier: 1 - (t.nonCritLess||0)/100, bloodMagic: !!t.bloodMagic,
    potionCharges: BASE_COMBAT.potionCharges + (t.potionCharges||0), potionHeal: BASE_COMBAT.potionHeal * (1 + ((t.potionPower||0)+(a.potion||0))/100)
  };
}

// Live values share one calculation across simulation, character UI and tooltips.
export function combatStats(s) {
  const p = stats(s), chill = s.effects?.chill > 0 ? .75 : 1;
  p.movementSpeed *= chill; p.attackSpeed *= chill; p.attackInterval = 1 / p.attackSpeed;
  p.outgoing = p.damageMore * (s.effects?.warcry > 0 ? 1 + (s.effects.warcryPower||.3) : 1);
  p.averageHit = (p.attack+p.fire+p.cold+p.lightning) * ((1-p.crit)*p.nonCritMultiplier + p.crit*p.critMultiplier) * p.outgoing;
  p.dps = p.averageHit * p.attackSpeed * (hasUnique(s,'echo')?1.25:1);
  // A rough survivability figure: health scaled by armor and resistance.
  p.toughness = p.maxHp / (1 - armorReduction(p.defense,enemyBaseDamage(s.maxStage||s.stage))) * (1 + p.resist/200) / p.damageTaken;
  return p;
}

export function enemyStats(s,e) {
  const zone=s.location==='rift'?riftBonuses(s.rift.keystone):{speed:0,critical:0};
  const frenzy = activeAuras(s,e).some(a=>a.modifier==='hasteAura');
  const hasted = e.modifiers.includes('hasted'), deadly = e.modifiers.includes('deadly');
  const chilled = e.chilled>0 ? .8 : 1;
  const attackSpeed = (1/2.3)*(hasted?1.3:1)*(frenzy?1.25:1)*chilled*(1+zone.speed/100);
  return {
    attack:e.baseDamage*(e.modifiers.includes('empowered')?1.4:1)*(frenzy?1.25:1)*(s.effects?.intimidate>0?.8:1),
    movementSpeed:2.1*(hasted?1.25:1)*chilled*(1+zone.speed/100),
    attackSpeed,attackInterval:1/attackSpeed,attackRange:e.kind==='sprite'?3.5:1.5,
    crit:({normal:.03,magic:.05,rare:.08,unique:.10}[e.tier]||0)+(deadly?.2:0)+zone.critical/100,
    critMultiplier:1.5+(deadly?.5:0)
  };
}

export const withinReach = (s,from,to,range) => distance(from,to)<=range && hasLineOfSight(s.map,from,to);
export const skillRange = (s,id) => { const p = skillParams(s,id,stats(s).attackRange); return p.radius || p.range || 0; };
export function skillTargets(s,id) {
  const def = SKILL_BY_ID[id]; if (!def) return [];
  const p = skillParams(s,id,stats(s).attackRange), alive = livingEnemies(s);
  if (id === 'leap' || id === 'meteor') { const e = s.enemy; return e?.hp > 0 && alive.includes(e) && withinReach(s,s.player,e,p.range) ? [e] : []; }
  if (id === 'whirl') return alive.filter(e => withinReach(s,s.player,e,p.radius+1.5));
  if (def.kind === 'attack' || def.kind === 'spell') return alive.filter(e => withinReach(s,s.player,e,p.radius));
  return [];
}

export function makeItem(slot, rarity = 0, stage = 1, rng = Math.random, baseId) {
  slot=canonicalSlot(slot);
  if(!GEAR[slot])throw new Error('Unknown gear slot');
  stage=Number.isSafeInteger(stage)&&stage>0?stage:1;
  // Drops roll one of the slot's three bases; pass a base id to force one.
  const base=BASES[slot].find(b=>b.id===baseId)||(baseId===undefined?BASES[slot][Math.floor(rng()*BASES[slot].length)]:BASES[slot][0]);
  const implicits=rollImplicits(slot,stage,rng,base);
  const affixes = rollAffixes(slot, rarity, stage, rng);
  const pool = rarity === 3 ? uniquesForSlot(slot) : [];
  const unique = pool.length ? pool[Math.floor(rng()*pool.length)] : null;
  const prefix = affixes.find(a => AFFIXES[a.id].kind === 'prefix');
  const suffix = affixes.find(a => AFFIXES[a.id].kind === 'suffix');
  const name = unique ? unique.name+' '+base.name : `${prefix ? AFFIXES[prefix.id].name + ' ' : ''}${base.name}${suffix ? ' ' + AFFIXES[suffix.id].name : ''}`;
  return {id:id(), slot, base:base.id, rarity, name, itemLevel:stage, implicits, upgrade:0, affixes, unique:unique?unique.id:null};
}

export function createGame(now = Date.now(), seed = Math.floor(Math.random() * 4294967296)) {
  const s = {
    version:5, name:'Wanderer', level:1, xp:0, gold:120, stage:1, maxStage:1,
    killsInStage:0, kills:0, bosses:0, crafted:0, hp:105, auto:true, advance:true, speed:1,
    inventory:[], orbs:zeroOrbs(), equipment:{...Object.fromEntries(GEAR_SLOTS.map(slot=>[slot,null])),hand:makeItem('hand',0,1,Math.random,'gauntlets'),chest:makeItem('chest',0,1,Math.random,'cuirass')},
    points:0, skillPoints:0, tree:[], skills:defaultSkills(), mana:43, potion:{charges:BASE_COMBAT.potionCharges,progress:0,lock:0}, deathStreak:0, castLock:0, cooldowns:zeroCooldowns(),
    enemy:null, enemies:[], attackTimer:0, attackCount:0, respawn:0, log:[], claimed:[],
    lastSave:now, playTime:0, runNumber:0, riftsCleared:0, tierKills:{normal:0,magic:0,rare:0,unique:0},
    settings:{sound:false,motion:true,autoPotion:true,autoEquip:false}, hazards:[], effects:{chill:0}, died:false,
    groundLoot:[],lootFilter:normalizeLootFilter(),location:'expedition',returnPortal:false,expedition:null,keystones:[],riftPortal:null,rift:null,lastRift:null
  };
  s.inventory = [makeItem('hand',1,1,Math.random,'gauntlets'), makeItem('neck',0,1,Math.random,'pendant'), makeItem('chest',1,1,Math.random,'cuirass')];
  startExpedition(s, seed);
  addLog(s,'Cut through the packs to break the guardian\u2019s seal.','system');
  return s;
}

export function addLog(s, text, type = 'combat') {
  s.log.unshift({id:id(), text, type, time:Date.now()}); s.log = s.log.slice(0,30);
}

export function makeEnemy(s, tier, position, roomId, rng = Math.random, forcedMods) {
  const r = region(s), t = ENEMY_TIERS[tier], species = Math.floor(rng() * 3);
  const modifiers = forcedMods || rollModifiers(tier, rng);
  const maxHp = Math.round(enemyBaseLife(s.stage) * t.life);
  const baseName = r.foes[species];
  const name = tier === 'unique' ? r.boss : tier === 'rare' ? `${['Briarwrath','Dreadmaw','Ashbound','Nightclaw'][Math.floor(rng()*4)]}, ${baseName}` : baseName;
  return {id:id(), name, kind:tier === 'unique' ? 'guardian' : ['wolf','boar','sprite'][species],
    tier, maxHp, hp:maxHp, boss:tier === 'unique', level:s.stage, modifiers,
    x:position.x, y:position.y, home:{...position}, roomId, path:[], pathTimer:0,
    attackTimer:0, slamTimer:5, chilled:0, awakened:false,
    baseDamage:enemyBaseDamage(s.stage) * t.damage, points:t.points, stunned:0, shocked:0};
}

export function startExpedition(s, seed = (Math.floor(Math.random()*4294967296) ^ (s.runNumber + 1) * 2654435761) >>> 0) {
  if(s.location==='rift')return false;
  // Leaving a map never loses earned drops, even when battle is paused.
  for(const drop of [...(s.groundLoot||[])])collectLoot(s,drop.id);
  s.groundLoot=[];
  s.runNumber++; s.map = generateMap(seed, s.stage); s.enemies = []; s.hazards = [];
  s.player = {...s.map.entrance, path:[], pathTimer:0, manual:false, targetId:null};
  s.killsInStage = 0; s.attackTimer = 0; s.respawn = 0; s.effects = {chill:0}; s.died = false;
  s.hp = stats(s).maxHp; s.mana = stats(s).maxMana;
  const rng = seededRandom(seed ^ 0xfaceb00c);
  const rooms = s.map.rooms.filter(r => r.role === 'encounter');
  // Every expedition contains normal packs, a magic pack, and a rare aura bearer.
  const order = [...rooms].sort((a,b) => a.order - b.order);
  const rareAt = 2 + Math.floor(rng() * 3);
  order.forEach((room,index) => {
    const tier = index === rareAt ? 'rare' : index === 1 || rng() < .23 ? 'magic' : 'normal';
    const shared = rollModifiers(tier, rng);
    if (tier === 'rare') {
      const aura = ['guardAura','hasteAura','burningAura'][Math.floor(rng()*3)];
      shared[0] = aura;
      if (shared[1] === aura) shared[1] = 'empowered';
    }
    // Hack-and-slash packs: normal groups of 6–9, a magic group of 4–6, and a
    // rare leader with normal minions (7–9 total). Six encounter rooms peak at
    // 55 enemies per map, under the 64-enemy save cap.
    const count = tier === 'normal' ? 6 + Math.floor(rng()*4) : tier === 'magic' ? 4 + Math.floor(rng()*3) : 7 + Math.floor(rng()*3);
    for (let i = 0; i < count; i++) {
      // Spread the pack in a 3-wide block around the clearing's center, all
      // inside the walkable room (rx is 3–4, ry is 2–3).
      const position = {x:room.x + (i % 3) - 1, y:room.y + Math.floor(i / 3)};
      const actualTier = tier === 'rare' && i > 0 ? 'normal' : tier;
      s.enemies.push(makeEnemy(s, actualTier, position, room.id, rng, actualTier === tier ? shared : []));
    }
  });
  const bossRoom = s.map.rooms.find(r => r.id === s.map.bossRoomId);
  const guardian = makeEnemy(s, 'unique', {x:bossRoom.x,y:bossRoom.y}, bossRoom.id, rng);
  // Each region's guardian fights differently; later journeys add a second trait.
  const trait = [null,'chilling','burningAura','hasted'][regionIndex(s)];
  if (trait) guardian.modifiers = [...guardian.modifiers, trait];
  if (journey(s) > 1) guardian.modifiers = [...guardian.modifiers, ['regenerating','deadly','vampiric','armored'][(journey(s)+regionIndex(s)) % 4]];
  s.enemies.push(guardian);
  s.map.goal = s.enemies.reduce((n,e) => n + e.points,0);
  selectTarget(s);
  return s.map;
}

// Retained export for integrations using the original engine API.
export function spawnEnemy(s) { return startExpedition(s); }
export function livingEnemies(s) { return s.enemies.filter(e => e.hp > 0 && (!e.boss || s.map.bossUnlocked)); }
function selectTarget(s) {
  const alive = livingEnemies(s), selected = alive.find(e => e.id === s.player.targetId);
  s.enemy = selected || alive.sort((a,b) => s.map.rooms[a.roomId].order - s.map.rooms[b.roomId].order || distance(a,s.player) - distance(b,s.player))[0] || s.enemies.find(e => e.boss);
  s.player.targetId = s.enemy?.hp > 0 ? s.enemy.id : null;
  return s.enemy;
}

export function movePlayer(s, x, y, targetId = null) {
  if(s.location==='village')return false;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !walkable(s.map,x,y) || s.map.completed) return false;
  const target = targetId && livingEnemies(s).find(e => e.id === targetId);
  if (targetId && !target) return false;
  const to = target || {x,y};
  const path = findPath(s.map,s.player,to);
  if (!path.length && distance(s.player,to) > 1.5) return false;
  s.player.path = path; s.player.manual = !target;
  s.player.targetId = target?.id || null; s.player.pathTimer = .7;
  if (target) s.enemy = target;
  return true;
}

export function gainXp(s,amount,events = []) {
  s.xp += amount;
  while (s.xp >= xpRequired(s.level)) {
    s.xp -= xpRequired(s.level); s.level++; s.points++; s.skillPoints++;
    const p = stats(s); s.hp = p.maxHp; s.mana = p.maxMana;
    events.push({type:'level',value:s.level}); addLog(s,`Reached level ${s.level}. A passive point and a skill point await.`,'level');
    for (const skill of SKILLS) if (skill.level === s.level) {
      const free = s.skills.slots.indexOf(null);
      if (!s.skills.slots.includes(skill.id) && free >= 0) s.skills.slots[free] = skill.id;
      events.push({type:'unlock',skill:skill.id,name:skill.name}); addLog(s,`New skill unlocked: ${skill.name}.`,'level');
    }
  }
}

export function activeAuras(s, target) {
  return s.enemies.filter(e => e.hp > 0 && (!e.boss || s.map.bossUnlocked) && distance(e,target) <= 4)
    .flatMap(e => e.modifiers.filter(m => MODIFIERS[m]?.kind === 'aura').map(modifier => ({source:e,modifier})));
}

export function effectiveDamage(s, enemy, physical, elemental = 0) {
  const armor = enemy.modifiers.includes('armored') ? .7 : 1;
  const resist = enemy.modifiers.includes('resistant') ? .55 : 1;
  const guarded = activeAuras(s,enemy).some(a => a.modifier === 'guardAura') ? .75 : 1;
  return Math.max(1, Math.round((physical * armor + elemental * resist) * guarded * (s.location==='rift'?1-riftBonuses(s.rift.keystone).reduction/100:1)));
}

function giveItem(s,item,events) {
  if(item.kind==='keystone'){if(!s.keystones.some(k=>k.id===item.id)){s.keystones.unshift(item);events.push({type:'keystone',item});addLog(s,`${item.name} added to your keystone pouch.`,'loot');}return;}
  // The filter can spare anything that would make the hero stronger right now.
  if(s.lootFilter&&!matchesLootFilter(item,s.lootFilter)&&!(s.lootFilter.keepUpgrades&&isUpgrade(bestComparison(s,item)))){
    const gold=salvageGold(item);s.gold+=gold;
    addLog(s,`Filter salvaged ${item.name} · +${gold} gold.`,'salvage');
    events.push({type:'filteredLoot',item,gold});return;
  }
  if (s.inventory.length < 48) {
    s.inventory.unshift(item); events.push({type:'loot',item}); addLog(s,`Found ${item.name}.`,'loot');
    if (s.settings?.autoEquip) { const c = bestComparison(s,item); if (isUpgrade(c) && equip(s,item.id,c.slot)) { events.push({type:'autoEquip',item}); addLog(s,`Equipped ${item.name}.`,'loot'); } }
  } else { const gold=salvageGold(item); s.gold+=gold; addLog(s,`Satchel full. New equipment salvaged for ${gold} gold.`,'salvage'); }
}

export function dropItem(s,item,position,events=[]) {
  s.groundLoot??=[];
  if(s.groundLoot.length>=64)collectLoot(s,s.groundLoot[0].id,events);
  const drop={id:item.id,item,x:position.x,y:position.y,age:0};
  s.groundLoot.push(drop);events.push({type:'drop',item,x:drop.x,y:drop.y});
  return drop;
}

export function collectLoot(s,dropId,events=[]) {
  const index=s.groundLoot?.findIndex(d=>d.id===dropId)??-1;
  if(index<0)return false;
  const [drop]=s.groundLoot.splice(index,1);
  giveItem(s,drop.item,events);return true;
}

function advanceLoot(s,dt,events) {
  for(const drop of [...(s.groundLoot||[])]){
    drop.age+=dt;
    if(drop.age>=2.4)collectLoot(s,drop.id,events);
  }
}

// Crafting orbs only come from defeating foes; higher tiers drop better orbs.
function rollOrbs(tier, rng) {
  const common = ['transmute', 'augment'], out = [];
  if (tier === 'normal' && rng() < .12) out.push(common[Math.floor(rng()*2)]);
  if (tier === 'magic' && rng() < .40) out.push(['transmute','augment','scour'][Math.floor(rng()*3)]);
  if (tier === 'rare') {
    out.push(['regal','alchemy','chaos'][Math.floor(rng()*3)]);
    if (rng() < .40) out.push(common[Math.floor(rng()*2)]);
  }
  if (tier === 'unique') {
    out.push(['alchemy','chaos','exalt','divine'][Math.floor(rng()*4)]);
    out.push(['alchemy','chaos','exalt','divine'][Math.floor(rng()*4)]);
    if (rng() < .50) out.push(common[Math.floor(rng()*2)]);
  }
  return out;
}

// Approximate orb drops across simulated offline kills (common ~1 in 8, rare ~1
// in 7, divine-tier ~1 in 29).
function offlineOrbs(kills, rng = Math.random) {
  const common = ['transmute', 'augment'], out = [];
  for (let i = 0; i < kills; i++) {
    if (rng() < .12) out.push(common[Math.floor(rng()*2)]);
    if (i % 7 === 6) out.push(['regal','alchemy','chaos'][Math.floor(rng()*3)]);
    if (i % 29 === 28) out.push(['alchemy','chaos','exalt','divine'][Math.floor(rng()*4)]);
  }
  return out;
}

export function defeatEnemy(s,enemy,events = [],rng = Math.random) {
  if (enemy.rewarded) return;
  enemy.hp = 0; enemy.rewarded = true;
  const reward = ENEMY_TIERS[enemy.tier].reward * (1 + enemy.modifiers.length * .15);
  const finds = stats(s);
  const gold = Math.round((6+s.stage*2) * reward * (1 + finds.goldFind/100)), xp = Math.round((7+s.stage*2) * reward);
  s.gold += gold; s.kills++; s.killsInStage++; s.tierKills[enemy.tier]++;
  for (const orb of rollOrbs(enemy.tier, rng)) {
    s.orbs[orb] = (s.orbs[orb] || 0) + 1;
    events.push({type:'orb', orb, name: CRAFT_OPERATIONS[orb].name});
    addLog(s, `${CRAFT_OPERATIONS[orb].name} dropped.`,'loot');
  }
  gainXp(s,xp,events);
  const hero = stats(s);
  s.hp = Math.min(hero.maxHp,s.hp + hero.maxHp*(.012+(hasUnique(s,'gravebind')?.06:0)));
  s.mana = Math.min(hero.maxMana,(s.mana||0) + 2);
  s.potion.progress += enemy.boss ? POTION_KILLS : (enemy.points || 1);
  while (s.potion.progress >= POTION_KILLS) { s.potion.progress -= POTION_KILLS; if (s.potion.charges < hero.potionCharges) { s.potion.charges++; events.push({type:'potionCharge'}); } }
  if (hasUnique(s,'soulgorge')) s.effects.soulgorge = 6;
  events.push({type:'kill',gold,xp,boss:enemy.boss,tier:enemy.tier,x:enemy.x,y:enemy.y});
  addLog(s,`${ENEMY_TIERS[enemy.tier].label} ${enemy.name} defeated · +${gold} gold · +${xp} XP`);
  const dropChance = {normal:.14,magic:.5,rare:1,unique:1}[enemy.tier];
  const bonus=s.location==='rift'?riftBonuses(s.rift.keystone):{quantity:0,rarity:0,itemLevel:0};
  const quantity = rewardQuantity(enemy.tier === 'unique' ? 2 : 1,bonus.quantity,rng);
  if (rng() < dropChance) for (let i = 0; i < quantity; i++) {
    const rarity = lootRarity(enemy.tier,()=>rng()/(1+(bonus.rarity+finds.magicFind)/100));
    dropItem(s,makeItem(GEAR_SLOTS[Math.floor(rng()*GEAR_SLOTS.length)],rarity,s.stage+bonus.itemLevel,rng),enemy,events);
  }
  const keystone=rollKeystone(enemy.tier,s.stage,rng);
  if(keystone)dropItem(s,keystone,enemy,events);
  if(s.location==='rift'){
    if(enemy.boss){
      s.rift.status='cleared';s.riftsCleared=(s.riftsCleared||0)+1;s.map.completed=true;s.hazards=[];s.rift.clearedAt=Date.now();
      events.push({type:'riftComplete'});addLog(s,'Rift conquered. Collect your spoils and return to the Village.','system');
    }else if(s.enemies.every(e=>e.hp<=0))spawnRiftWave(s,s.rift.wave+1,events,rng);
    return;
  }
  if (!enemy.boss) {
    s.map.progress = Math.min(s.map.goal,s.map.progress+enemy.points);
    if (s.map.progress >= s.map.goal && !s.map.bossUnlocked) {
      s.map.bossUnlocked = true; events.push({type:'bossReady'}); addLog(s,'The guardian is revealed. Follow the orange marker to the sanctum.','system');
      reveal(s.map,s.enemies.find(e => e.boss),4);
    }
    if (enemy.modifiers.includes('volatile')) s.hazards.push({kind:'volatile',x:enemy.x,y:enemy.y,radius:2.5,remaining:1.4,total:1.4,damage:enemy.baseDamage*3,element:'fire'});
  } else {
    s.bosses++; s.deathStreak = 0; s.map.completed = true; s.maxStage = Math.max(s.maxStage,s.stage+1); s.respawn = 3;
    s.hazards = []; events.push({type:'complete',stage:s.stage}); addLog(s,`Stage ${s.stage} cleared. The road ahead is open.`,'system');
  }
}

function hitEnemy(s,enemy,physical,elemental,events,rng,critical = false,opts = {}) {
  if (enemy.hp <= 0 || (enemy.boss && !s.map.bossUnlocked)) return;
  let dealt = effectiveDamage(s,enemy,physical,elemental);
  if (enemy.shocked > 0) dealt = Math.round(dealt * 1.2);
  const actual = Math.min(enemy.hp,dealt);
  enemy.hp = Math.max(0,enemy.hp-dealt); enemy.awakened = true;
  events.push({type:'hit',value:dealt,x:enemy.x,y:enemy.y,critical,splash:!!opts.splash,skill:opts.skill||null});
  const p = stats(s); if (p.cold || opts.chill) enemy.chilled = Math.max(enemy.chilled||0, opts.chill ? 3 : 2);
  // Elemental identity: cold chills, fire ignites, lightning can shock.
  if (p.fire && !opts.dot) { enemy.burn = Math.max(enemy.burnTime > 0 ? enemy.burn : 0, p.fire * IGNITE_RATE * (critical ? 2 : 1)); enemy.burnTime = 3; }
  if (opts.shock || (p.lightning && !opts.dot && rng() < SHOCK_CHANCE)) enemy.shocked = 4;
  if (opts.stun && !enemy.boss) enemy.stunned = 1.5;
  const leech = p.leech + (opts.leech||0);
  if (leech) s.hp = Math.min(p.maxHp,s.hp+actual*leech/100);
  if (enemy.hp <= 0) defeatEnemy(s,enemy,events,rng);
}

function strikeEnemy(s,enemy,physical,elemental,events,rng,opts = {}) {
  const p=combatStats(s),critical=rng()<p.crit,multiplier=(critical?p.critMultiplier:p.nonCritMultiplier)*p.outgoing;
  if (hasUnique(s,'stormbrand')) elemental += physical*.3;
  if (hasUnique(s,'executioner') && enemy.hp <= enemy.maxHp*.35) { physical *= 1.8; elemental *= 1.8; }
  hitEnemy(s,enemy,physical*multiplier,elemental*multiplier,events,rng,critical,opts);
}

export function hurtHero(s,amount,element = 'physical',events = [],critical = false) {
  const p = stats(s);
  let damage = element === 'physical' ? amount*(1-armorReduction(p.defense,amount)) : amount*(1-p.resist/100);
  if (hasUnique(s,'lastLight') && s.hp < p.maxHp*.35) damage *= .75;
  if (hasUnique(s,'stoneheart')) damage *= .88;
  if (element !== 'physical' && hasUnique(s,'emberwalk')) damage *= .8;
  damage *= p.damageTaken;
  if (s.effects?.ward > 0 && s.effects.wardHp > 0) {
    const absorbed = Math.min(s.effects.wardHp,damage);
    s.effects.wardHp -= absorbed; damage -= absorbed;
    if (s.effects.wardHp <= 0) s.effects.ward = 0;
    if (absorbed >= 1) events.push({type:'absorb',value:Math.ceil(absorbed),x:s.player.x,y:s.player.y});
  }
  s.hp = Math.max(0,s.hp-damage);
  if (damage >= 1) events.push({type:'hurt',value:Math.ceil(damage),x:s.player.x,y:s.player.y,element,critical});
  return damage;
}

export function usePotion(s,events = []) {
  const p = stats(s);
  if (s.location === 'village' || !s.potion || s.potion.charges <= 0 || s.potion.lock > 0 || s.hp <= 0 || s.hp >= p.maxHp || s.map.completed) return false;
  s.potion.charges--; s.potion.lock = 1.2;
  s.hp = Math.min(p.maxHp,s.hp + p.maxHp*p.potionHeal);
  events.push({type:'potion',x:s.player.x,y:s.player.y});
  return true;
}

// Idle play: slotted skills with auto-cast enabled fire when they are useful.
function autoCast(s,p,events,rng) {
  if (s.castLock > 0) return;
  const alive = livingEnemies(s).filter(e => e.awakened), target = s.enemy?.hp > 0 ? s.enemy : null;
  const near = alive.filter(e => distance(e,s.player) <= 4.5).length;
  const elite = target && target.tier !== 'normal';
  for (const id of s.skills.slots) {
    if (!id || s.skills.auto[id] === false || s.cooldowns[id] > 0 || skillRank(s,id) < 1) continue;
    const sp = skillParams(s,id,p.attackRange);
    if (p.bloodMagic ? s.hp <= sp.mana * 2.5 : s.mana < sp.mana) continue;
    const hits = skillTargets(s,id);
    let wanted = false;
    if (id === 'mend') wanted = s.hp < p.maxHp * .55;
    else if (id === 'ward') wanted = near > 0 && s.hp < p.maxHp * .8;
    else if (id === 'warcry') wanted = near >= 4 || (elite && target.awakened && distance(target,s.player) <= 5);
    else if (id === 'leap') wanted = hits.length > 0 && distance(target,s.player) > 2.5;
    else if (id === 'meteor') wanted = hits.length > 0 && (elite || alive.filter(e => distance(e,target) <= sp.radius).length >= 3);
    else if (id === 'whirl') wanted = hits.filter(e => distance(e,s.player) <= sp.radius).length >= 3 || (elite && hits.includes(target) && distance(target,s.player) <= sp.radius);
    else wanted = hits.length >= 2 || (hits.length === 1 && (hits[0].tier !== 'normal' || hits[0].hp > p.averageHit * 1.5));
    if (!wanted) continue;
    const cast = castSkill(s,id,rng);
    if (cast.length) { events.push(...cast); s.castLock = .35; return; }
  }
}

function advanceEffects(s,dt,p,events,rng) {
  const fx = s.effects;
  for (const key of ['chill','soulgorge','warcry','intimidate','ward','renew']) if (fx[key]) fx[key] = Math.max(0,fx[key]-dt);
  if (!fx.ward) fx.wardHp = 0;
  if (fx.renew > 0) s.hp = Math.min(p.maxHp,s.hp + p.maxHp*.04*dt);
  if (fx.whirl > 0) {
    fx.whirl = Math.max(0,fx.whirl-dt); fx.whirlTick = (fx.whirlTick||0) - dt;
    if (fx.whirlTick <= 0) {
      fx.whirlTick += .25;
      const sp = skillParams(s,'whirl',p.attackRange), mult = sp.mult * p.skillDamage * (hasUnique(s,'spellweave')?1.25:1);
      for (const e of livingEnemies(s).filter(e => withinReach(s,s.player,e,sp.radius))) strikeEnemy(s,e,p.attack*mult,(p.fire+p.cold+p.lightning)*mult,events,rng,{skill:'whirl',leech:sp.leech||0});
      events.push({type:'whirl',x:s.player.x,y:s.player.y,radius:sp.radius});
    }
  }
}

function advanceStep(s,dt,events,rng) {
  if(s.location==='village')return;
  s.playTime += dt;
  const base = stats(s), cooldownRate = (hasUnique(s,'sagesCrown') ? 1.3 : 1) * base.cooldownRate;
  for (const skill of SKILLS) s.cooldowns[skill.id] = Math.max(0,(s.cooldowns[skill.id]||0)-dt*cooldownRate);
  s.castLock = Math.max(0,(s.castLock||0)-dt); s.potion.lock = Math.max(0,s.potion.lock-dt);
  if (!s.auto) { for (const key of ['chill','soulgorge']) if (s.effects[key]) s.effects[key] = Math.max(0,s.effects[key]-dt); return; }
  advanceEffects(s,dt,base,events,rng);
  advanceLoot(s,dt,events);
  s.died = false;
  if (s.map.completed) {
    if(s.location==='rift')return;
    s.respawn = Math.max(0,s.respawn-dt);
    if (s.respawn <= 0) {
      if (s.advance) { s.stage++; events.push({type:'stage',value:s.stage}); }
      startExpedition(s); events.push({type:'newMap'});
    }
    return;
  }
  const p = combatStats(s), player = s.player;
  s.hp = Math.min(p.maxHp,s.hp+p.regen*dt); s.mana = Math.min(p.maxMana,(s.mana||0)+p.manaRegen*dt);
  if (s.settings.autoPotion !== false && s.hp > 0 && s.hp < p.maxHp*.35) usePotion(s,events);
  const enemy = selectTarget(s);
  autoCast(s,p,events,rng);
  player.pathTimer -= dt;
  if (!player.manual && !player.dodging && enemy?.hp > 0 && (!enemy.boss || s.map.bossUnlocked)) {
    const inPosition=withinReach(s,player,enemy,p.attackRange-.25);
    if (!inPosition && player.pathTimer <= 0) {
      player.path = findPath(s.map,player,enemy); player.pathTimer = .65;
    } else if (inPosition) player.path = [];
  }
  dodgeHazards(s,player);
  moveAlong(player,dt,p.movementSpeed);
  if (player.manual && !player.path.length) player.manual = false;
  reveal(s.map,player);
  if (!s.map.shrine.used && distance(player,s.map.shrine) < 1.7) {
    s.map.shrine.used = true; s.hp = p.maxHp; s.mana = p.maxMana; s.potion.charges = p.potionCharges; events.push({type:'heal',x:player.x,y:player.y}); addLog(s,'The healing shrine restores your strength.','system');
  }
  if (!s.map.chest.opened && distance(player,s.map.chest) < 1.4) {
    s.map.chest.opened = true; s.gold += 20+s.stage*4;
    dropItem(s,makeItem(GEAR_SLOTS[Math.floor(rng()*GEAR_SLOTS.length)],rng()<.2?2:1,s.stage,rng),s.map.chest,events);
    events.push({type:'chest'});
  }
  s.attackTimer = Math.min(s.attackTimer+dt,p.attackInterval+dt);
  if (enemy?.hp > 0 && (!enemy.boss||s.map.bossUnlocked) && withinReach(s,player,enemy,p.attackRange) && s.attackTimer+1e-9 >= p.attackInterval) {
    s.attackTimer = Math.max(0,s.attackTimer-p.attackInterval); s.attackCount++;
    const elemental = p.fire+p.cold+p.lightning;
    events.push({type:'swing',x:player.x,y:player.y,targetX:enemy.x,targetY:enemy.y});
    // Every swing carves into the pack: up to three foes beside the target take splash damage.
    const beside = livingEnemies(s).filter(e => e !== enemy && distance(e,enemy) <= 1.8 && withinReach(s,player,e,p.attackRange+.7)).slice(0,3);
    strikeEnemy(s,enemy,p.attack,elemental,events,rng);
    for (const e of beside) strikeEnemy(s,e,p.attack*p.splash,elemental*p.splash,events,rng,{splash:true});
    if (hasUnique(s,'echo') && s.attackCount%4 === 0 && enemy.hp > 0) strikeEnemy(s,enemy,p.attack,p.fire+p.cold+p.lightning,events,rng);
  }
  for (const e of livingEnemies(s)) {
    if (!e.awakened && withinReach(s,e,player,Math.max(5.5,p.attackRange+1))) e.awakened = true;
    if (!e.awakened) continue;
    e.chilled = Math.max(0,e.chilled-dt); e.shocked = Math.max(0,(e.shocked||0)-dt);
    if (e.burnTime > 0) { e.burnTime -= dt; e.hp -= effectiveDamage(s,e,0,e.burn) * dt; if (e.hp <= 0) { defeatEnemy(s,e,events,rng); continue; } }
    if (e.stunned > 0) { e.stunned -= dt; continue; }
    if (e.modifiers.includes('regenerating')) e.hp = Math.min(e.maxHp,e.hp+e.maxHp*.01*dt);
    const ep=enemyStats(s,e);
    e.pathTimer -= dt;
    const inRange=withinReach(s,e,player,ep.attackRange);
    if (!inRange && e.pathTimer<=0) { e.path=findPath(s.map,e,player);e.pathTimer=.9; }
    if (!inRange) moveAlong(e,dt,ep.movementSpeed); else e.path=[];
    e.attackTimer = Math.min(e.attackTimer+dt,ep.attackInterval+dt);
    if (withinReach(s,e,player,ep.attackRange) && e.attackTimer+1e-9>=ep.attackInterval) {
      e.attackTimer=Math.max(0,e.attackTimer-ep.attackInterval);
      const critical=rng()<ep.crit;
      const dealt=hurtHero(s,ep.attack*(critical?ep.critMultiplier:1),'physical',events,critical);
      if(dealt>0&&hasUnique(s,'spikeward'))hitEnemy(s,e,dealt*.35,0,events,rng);
      if(s.effects.ward>0&&s.effects.wardThorns&&e.hp>0)hitEnemy(s,e,p.attack,0,events,rng);
      if(e.modifiers.includes('vampiric'))e.hp=Math.min(e.maxHp,e.hp+dealt*.2);
      if(e.modifiers.includes('chilling')&&!hasUnique(s,'ironstride'))s.effects.chill=3;
      events.push({type:'enemyAttack',x:e.x,y:e.y,targetX:player.x,targetY:player.y,critical});
    }
    if(e.modifiers.includes('burningAura')&&distance(e,player)<3) hurtHero(s,(1+s.stage*.3)*dt,'fire');
    if(e.modifiers.includes('earthshatter')&&distance(e,player)<7) {
      e.slamTimer-=dt;
      if(e.slamTimer<=0){e.slamTimer=7;s.hazards.push({kind:'slam',x:player.x,y:player.y,radius:2.7,remaining:1.5,total:1.5,damage:ep.attack*3,element:'physical'});events.push({type:'warning',text:'Earthshatter! Move out of the marked circle.'});}
    }
  }
  separate(s);
  for(const hazard of s.hazards){
    hazard.remaining-=dt;
    if(hazard.kind==='burn'){
      hazard.tick=(hazard.tick||0)-dt;
      if(hazard.tick<=0){hazard.tick+=.5;for(const e of livingEnemies(s).filter(e=>distance(e,hazard)<=hazard.radius))strikeEnemy(s,e,0,hazard.damage*.5,events,rng,{skill:'meteor'});}
      continue;
    }
    if(hazard.remaining>0)continue;
    if(hazard.friendly){
      for(const e of livingEnemies(s).filter(e=>distance(e,hazard)<=hazard.radius))strikeEnemy(s,e,0,hazard.damage,events,rng,{skill:'meteor'});
      events.push({type:'explosion',x:hazard.x,y:hazard.y,radius:hazard.radius,friendly:true});
      if(hazard.burn)hazard.spawn={kind:'burn',friendly:true,x:hazard.x,y:hazard.y,radius:hazard.radius,remaining:4,total:4,damage:hazard.damage*.12,tick:.5};
    }else{
      if(distance(player,hazard)<=hazard.radius)hurtHero(s,hazard.damage,hazard.element,events);
      events.push({type:'explosion',x:hazard.x,y:hazard.y,radius:hazard.radius});
    }
  }
  s.hazards=s.hazards.flatMap(h=>h.remaining>0?[h]:h.spawn?[h.spawn]:[]);
  if(s.hp<=0&&s.location==='rift'){leaveRift(s,'failed');events.push({type:'riftFailed'});return;}
  if(s.hp<=0){
    // Idle-friendly defeat: the hero recovers at camp and keeps fighting. A second
    // fall on the same map retreats one stage and turns auto-advance off to farm.
    s.died=true;s.deathStreak=(s.deathStreak||0)+1;s.hazards=[];s.effects={chill:0};
    events.push({type:'death'});
    if(s.deathStreak>=2&&s.stage>1){
      s.deathStreak=0;s.stage--;s.advance=false;startExpedition(s);
      events.push({type:'retreat',stage:s.stage});addLog(s,`Overwhelmed. Fell back to stage ${s.stage} to gather strength; auto-advance is off.`,'system');
    }else{
      s.hp=p.maxHp;s.mana=p.maxMana;s.potion.charges=p.potionCharges;
      s.player={...s.map.entrance,path:[],pathTimer:0,manual:false,targetId:null};
      for(const e of livingEnemies(s)){e.x=e.home.x;e.y=e.home.y;e.hp=e.maxHp;e.path=[];e.awakened=false;e.attackTimer=0;e.stunned=0;}
      selectTarget(s);addLog(s,'Recovered at camp. Map progress is kept; surviving enemies healed.','system');
    }
    return;
  }
  if(s.enemy?.hp<=0&&!s.map.completed)selectTarget(s);
}

// Idle heroes sidestep telegraphed ground attacks on their own: it costs attack
// time rather than health. Chill or a late warning can still get them caught.
function dodgeHazards(s,player){
  const hazard=s.hazards.find(h=>!h.friendly&&h.remaining>0&&distance(player,h)<h.radius+.3);
  if(!hazard){if(player.dodging){player.dodging=false;player.path=[];player.pathTimer=0;}return;}
  if(player.dodging&&player.path.length)return;
  const base=Math.atan2(player.y-hazard.y,player.x-hazard.x)||0;
  for(const turn of [0,.6,-.6,1.2,-1.2,2,-2,Math.PI]){
    const x=hazard.x+Math.cos(base+turn)*(hazard.radius+1),y=hazard.y+Math.sin(base+turn)*(hazard.radius+1);
    if(!walkable(s.map,x,y))continue;
    const path=findPath(s.map,player,{x,y});
    if(path.length&&path.length<12){player.path=path;player.pathTimer=hazard.remaining+.2;player.dodging=true;return;}
  }
}

// Keep packs readable: awakened enemies gently push apart instead of stacking.
function separate(s){
  const pack=s.enemies.filter(e=>e.hp>0&&e.awakened&&(!e.boss||s.map.bossUnlocked));
  for(let i=0;i<pack.length;i++)for(let j=i+1;j<pack.length;j++){
    const a=pack[i],b=pack[j];let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=.8)continue;
    if(d<.01){const angle=(i*2.399+j)%6.283;dx=Math.cos(angle);dy=Math.sin(angle);d=1;}
    const push=(.8-d)/2*.6,ux=dx/d*push,uy=dy/d*push;
    if(!a.boss&&walkable(s.map,a.x-ux,a.y-uy)){a.x-=ux;a.y-=uy;}
    if(!b.boss&&walkable(s.map,b.x+ux,b.y+uy)){b.x+=ux;b.y+=uy;}
  }
}

export function tick(s,dt,rng=Math.random){
  const events=[];if(!Number.isFinite(dt)||dt<=0)return events;
  let remaining=Math.min(.5,dt)*s.speed;
  while(remaining>1e-8){const step=Math.min(.1,remaining);advanceStep(s,step,events,rng);remaining-=step;}
  return events;
}

// Manual casts and auto-casts share one path: checks, cost, cooldown, effect.
function castSkill(s,id,rng=Math.random){
  const def=SKILL_BY_ID[id];
  if(s.location==='village'||!def||s.level<def.level||s.cooldowns[id]>0||s.map.completed||!s.skills.slots.includes(id))return [];
  const p=combatStats(s),sp=skillParams(s,id,p.attackRange),targets=skillTargets(s,id);
  if((def.kind==='attack'||def.kind==='spell')&&!targets.length)return [];
  if(p.bloodMagic){if(s.hp<=sp.mana)return [];s.hp-=sp.mana;}
  else{if((s.mana||0)<sp.mana)return [];s.mana-=sp.mana;}
  s.cooldowns[id]=sp.cooldown;
  const player=s.player,events=[{type:'skill',id,x:player.x,y:player.y,radius:sp.radius||3,color:def.color}];
  const mult=(sp.mult||0)*p.skillDamage*(hasUnique(s,'spellweave')?1.25:1),elemental=p.fire+p.cold+p.lightning;
  const heal=fraction=>{s.hp=Math.min(p.maxHp,s.hp+p.maxHp*fraction);events.push({type:'heal',x:player.x,y:player.y});};
  if(id==='mend'){heal(sp.heal+(hasUnique(s,'wildheart')?.15:0));s.effects.chill=0;if(sp.renew)s.effects.renew=5;}
  else if(id==='cleave')for(const e of targets)strikeEnemy(s,e,p.attack*mult,elemental*mult,events,rng,{skill:id,chill:sp.chill});
  else if(id==='storm')for(const e of targets)strikeEnemy(s,e,0,(p.attack+p.lightning)*mult,events,rng,{skill:id,shock:sp.shock});
  else if(id==='leap'){
    const target=targets[0],d=distance(player,target)||1,gap=Math.min(1,d);
    const land={x:target.x-(target.x-player.x)/d*gap,y:target.y-(target.y-player.y)/d*gap};
    const spot=walkable(s.map,land.x,land.y)?land:{x:target.x,y:target.y};
    events[0].fromX=player.x;events[0].fromY=player.y;player.x=spot.x;player.y=spot.y;player.path=[];player.manual=false;player.pathTimer=0;
    events[0].x=spot.x;events[0].y=spot.y;reveal(s.map,player);
    for(const e of livingEnemies(s).filter(e=>withinReach(s,player,e,sp.radius)))strikeEnemy(s,e,0,(p.attack+p.cold)*mult,events,rng,{skill:id,chill:true,stun:sp.stun});
  }
  else if(id==='whirl'){s.effects.whirl=sp.duration;s.effects.whirlTick=0;}
  else if(id==='warcry'){s.effects.warcry=sp.duration;s.effects.warcryPower=sp.power;if(sp.rally)heal(.15);if(sp.intimidate)s.effects.intimidate=sp.duration;for(const e of livingEnemies(s))if(withinReach(s,player,e,7))e.awakened=true;}
  else if(id==='meteor'){const target=targets[0];s.hazards.push({kind:'meteor',friendly:true,x:target.x,y:target.y,radius:sp.radius,remaining:.7,total:.7,damage:(p.attack+p.fire)*mult,burn:!!sp.burn});events[0].x=target.x;events[0].y=target.y;}
  else if(id==='ward'){s.effects.ward=sp.duration;s.effects.wardHp=p.maxHp*sp.shield;s.effects.wardThorns=!!sp.thorns;}
  if(!s.map.completed)selectTarget(s);
  return events;
}
export function useSkill(s,id,rng=Math.random){return castSkill(s,id,rng);}

export function equip(s,id,slot){
 const i=s.inventory.findIndex(x=>x.id===id);if(i<0)return false;
 const item=s.inventory[i];slot??=item.slot;
 if(slot!==item.slot&&!(RING_SLOTS.includes(slot)&&RING_SLOTS.includes(item.slot)))return false;
 const old=s.equipment[slot];s.inventory.splice(i,1);item.slot=slot;s.equipment[slot]=item;
 if(old)s.inventory.push(old);s.hp=Math.min(s.hp,stats(s).maxHp);return true;
}
export function salvage(s,id,rng=Math.random){
  const i=s.inventory.findIndex(x=>x.id===id);if(i<0||s.inventory[i].locked)return false;
  const item=s.inventory.splice(i,1)[0];s.gold+=salvageGold(item);
  // Breaking down fine gear by hand can free an orb.
  const orb=item.rarity===3?['regal','alchemy','chaos'][Math.floor(rng()*3)]:item.rarity===2&&rng()<.3?['transmute','augment','scour'][Math.floor(rng()*3)]:null;
  if(orb){s.orbs[orb]=(s.orbs[orb]||0)+1;s.lastSalvageOrb=orb;addLog(s,`Salvage yielded ${CRAFT_OPERATIONS[orb].name}.`,'loot');}else s.lastSalvageOrb=null;
  return true;
}
export function toggleLock(s,id){
  const item=s.inventory.find(x=>x.id===id)||Object.values(s.equipment).find(x=>x?.id===id);
  if(!item)return false;item.locked=!item.locked;if(!item.locked)delete item.locked;return true;
}
// How a hypothetical swap changes damage and survivability, in percent.
export function compareItem(s,item,slot=item.slot){
  const before=combatStats({...s,effects:{chill:0}}),after=combatStats({...s,effects:{chill:0},equipment:{...s.equipment,[slot]:{...item,slot}}});
  return {slot,dps:(after.dps/before.dps-1)*100,tough:(after.toughness/before.toughness-1)*100};
}
// Rings are compared against whichever finger gains the most.
export function bestComparison(s,item){
  return (RING_SLOTS.includes(item.slot)?RING_SLOTS:[item.slot]).map(slot=>compareItem(s,item,slot)).sort((a,b)=>(b.dps+b.tough)-(a.dps+a.tough))[0];
}
export const isUpgrade=c=>c.dps+c.tough>1&&c.dps>-12&&c.tough>-12;
export function equipUpgrades(s){
  let count=0;
  for(let guard=0;guard<30;guard++){
    const best=s.inventory.map(item=>({item,c:bestComparison(s,item)})).filter(x=>isUpgrade(x.c)).sort((a,b)=>(b.c.dps+b.c.tough)-(a.c.dps+a.c.tough))[0];
    if(!best||!equip(s,best.item.id,best.c.slot))break;
    count++;
  }
  return count;
}
// A gold sink with a chance at greatness: buy an unidentified piece for a chosen slot.
export const gambleCost=s=>Math.round(150+45*s.maxStage);
export function gamble(s,slot,rng=Math.random){
  slot=slot==='ring'?'leftRing':slot;
  if(!GEAR[slot])return {ok:false,reason:'Choose a slot.'};
  if(s.inventory.length>=48)return {ok:false,reason:'Your bag is full.'};
  const cost=gambleCost(s);if(s.gold<cost)return {ok:false,reason:`Not enough gold (${cost}).`};
  s.gold-=cost;
  const roll=rng(),item=makeItem(slot,roll<.06?3:roll<.4?2:1,s.maxStage,rng);
  s.inventory.unshift(item);addLog(s,`Gambled for ${item.name}.`,'loot');
  return {ok:true,item,cost};
}
export function salvageGold(item){return Math.round((2+item.rarity*3+item.upgrade)*(1+(item.itemLevel||1)*.25));}
export function upgradeCost(item){return {gold:40*(item.upgrade+1)};}
export function upgrade(s,slot){const item=s.equipment[slot];if(!item)return false;const cost=upgradeCost(item);if(s.gold<cost.gold)return false;s.gold-=cost.gold;item.upgrade++;s.crafted++;return true;}
export function merge(s,slot,rarity){if(!GEAR_SLOTS.includes(slot)||!Number.isInteger(rarity)||rarity<0||rarity>2)return false;const items=s.inventory.filter(x=>x.slot===slot&&x.rarity===rarity&&!x.locked).slice(0,3);if(items.length<3||s.gold<75)return false;const ids=new Set(items.map(x=>x.id));s.inventory=s.inventory.filter(x=>!ids.has(x.id));const item=makeItem(slot,rarity+1,Math.max(s.stage,...items.map(x=>x.itemLevel||1)));item.upgrade=Math.max(...items.map(x=>x.upgrade));s.inventory.unshift(item);s.gold-=75;s.crafted++;addLog(s,`Forged ${item.name} from three pieces of equipment.`,'loot');return item;}
export function learn(s,id){return allocate(s,id);}
export function travel(s,stage){if(s.location==='rift')return false;if(s.location==='village')return startVillageStage(s,stage);if(!Number.isInteger(stage)||stage<1||stage>s.maxStage)return false;s.stage=stage;startExpedition(s);return true;}
export const QUESTS=[
  {id:'first',name:'Into the wild',description:'Defeat 10 creatures',target:10,value:s=>s.kills,gold:150},
  {id:'forge',name:'A sharper edge',description:'Temper, merge or craft equipment 3 times',target:3,value:s=>s.crafted,gold:200},
  {id:'guardian',name:'The forest remembers',description:'Defeat your first stage guardian',target:1,value:s=>s.bosses,gold:400},
  {id:'level10',name:'Seasoned',description:'Reach level 10',target:10,value:s=>s.level,gold:600,orbs:{transmute:3,augment:2}},
  {id:'stage6',name:'Northern wind',description:'Reach Frostfall Ridge (stage 6)',target:6,value:s=>s.maxStage,gold:800,orbs:{alchemy:1}},
  {id:'kills500',name:'Reaper of packs',description:'Defeat 500 creatures',target:500,value:s=>s.kills,gold:1500,orbs:{chaos:1}},
  {id:'tree10',name:'A chosen path',description:'Allocate 10 passive nodes',target:10,value:s=>s.tree.length,gold:1200,orbs:{regal:1}},
  {id:'rare25',name:'Leader hunter',description:'Defeat 25 rare leaders',target:25,value:s=>s.tierKills.rare,gold:2000,orbs:{alchemy:2}},
  {id:'stage11',name:'Beneath the ash',description:'Reach Ember Hollow (stage 11)',target:11,value:s=>s.maxStage,gold:2500,orbs:{chaos:2}},
  {id:'rift1',name:'Beyond the veil',description:'Conquer a rift',target:1,value:s=>s.riftsCleared||0,gold:3000,orbs:{exalt:1}},
  {id:'forge25',name:'Master smith',description:'Temper, merge or craft 25 times',target:25,value:s=>s.crafted,gold:3000,orbs:{divine:1}},
  {id:'stage21',name:'The second journey',description:'Reach stage 21',target:21,value:s=>s.maxStage,gold:8000,orbs:{exalt:1,divine:1}},
  {id:'bosses25',name:'Guardian bane',description:'Defeat 25 guardians',target:25,value:s=>s.bosses,gold:6000,orbs:{chaos:3}},
  {id:'kills5000',name:'Tide of steel',description:'Defeat 5,000 creatures',target:5000,value:s=>s.kills,gold:20000,orbs:{exalt:2}},
  {id:'rift5',name:'Riftwalker',description:'Conquer 5 rifts',target:5,value:s=>s.riftsCleared||0,gold:15000,orbs:{divine:2,exalt:1}},
  {id:'stage41',name:'The third journey',description:'Reach stage 41',target:41,value:s=>s.maxStage,gold:40000,orbs:{exalt:3,divine:3}}
];
export function claimQuest(s,id){
  const q=QUESTS.find(q=>q.id===id);if(!q||s.claimed.includes(id)||q.value(s)<q.target)return false;
  s.claimed.push(id);s.gold+=q.gold;
  for(const [orb,n] of Object.entries(q.orbs||{}))s.orbs[orb]=(s.orbs[orb]||0)+n;
  return true;
}

export function offlineRewards(s,now=Date.now(),rng=Math.random){
  const seconds=Math.min(28800,Math.max(0,(now-s.lastSave)/1000));s.lastSave=now;
  if(seconds>=60)for(const drop of [...(s.groundLoot||[])])collectLoot(s,drop.id);
  if(seconds<60||!s.auto||s.location==='village'||s.location==='rift')return null;
  const p=combatStats({...s,effects:{chill:0}}),dps=p.dps;
  const averageHealth=enemyBaseLife(s.stage)*1.6;
  const travelTime=3*BASE_COMBAT.movementSpeed/p.movementSpeed;
  const kills=Math.floor(seconds/(averageHealth/dps+travelTime)*.5);
  const gold=kills*(6+s.stage*2),xp=kills*(7+s.stage*2);
  const orbs=offlineOrbs(kills,rng);
  for(const orb of orbs)s.orbs[orb]=(s.orbs[orb]||0)+1;
  s.gold+=gold;gainXp(s,xp);s.hp=stats(s).maxHp;s.hazards=[];
  // A few finds come home too: one piece per 40 kills, as far as the bag has room.
  const items=[];
  for(let i=Math.min(8,Math.floor(kills/40),48-s.inventory.length);i>0;i--){
    const item=makeItem(GEAR_SLOTS[Math.floor(rng()*GEAR_SLOTS.length)],lootRarity(i%4===0?'rare':'magic',rng),s.stage,rng);
    if(s.lootFilter&&!matchesLootFilter(item,s.lootFilter)){s.gold+=salvageGold(item);continue;}
    s.inventory.unshift(item);items.push(item);
  }
  return {seconds,kills,gold,xp,orbs,items};
}

export function saveGame(s,storage=globalThis.localStorage,now=Date.now()){
  try{s.lastSave=now;storage.setItem(SAVE_KEY,JSON.stringify(s));return true;}catch{return false;}
}

const EXPEDITION_FIELDS=['stage','map','enemies','enemy','player','hp','cooldowns','effects','hazards','attackTimer','attackCount','respawn','killsInStage','died','auto','groundLoot'];
function captureExpedition(s){return structuredClone(Object.fromEntries(EXPEDITION_FIELDS.map(key=>[key,s[key]])));}

export function teleportVillage(s){
  if(s.location==='village')return false;
  if(s.location==='rift'){leaveRift(s,s.map.completed?'cleared':'abandoned');return true;}
  s.location='village';s.returnPortal=true;
  addLog(s,'Teleported to the Village. Your expedition waits at the return portal.','system');return true;
}
export function resumeExpedition(s){
  if(s.location!=='village'||!s.returnPortal)return false;
  s.location='expedition';s.returnPortal=false;
  addLog(s,`Returned to ${s.map.name}, exactly where you left off.`,'system');return true;
}
export function startVillageStage(s,stage=s.maxStage){
  if(s.location!=='village'||!Number.isSafeInteger(stage)||stage<1||stage>s.maxStage)return false;
  s.location='expedition';s.returnPortal=false;s.stage=stage;s.auto=true;
  startExpedition(s);return true;
}
export function craftKeystone(s,rarity,rng=Math.random,itemLevel=s.maxStage){
  if(s.location!=='village')return {ok:false,reason:'Keystones can only be crafted in the Village.'};
  if(!Number.isSafeInteger(itemLevel)||itemLevel<1||itemLevel>s.maxStage)return {ok:false,reason:'Choose a level up to your highest unlocked stage.'};
  const recipe=KEYSTONE_RECIPES.find(r=>r.rarity===rarity);
  if(!recipe)return {ok:false,reason:'Choose a keystone rarity.'};
  if(Object.entries(recipe.cost).some(([orb,n])=>(s.orbs[orb]||0)<n))return {ok:false,reason:'You need more orbs for this recipe.'};
  const item=makeKeystone(rarity,itemLevel,rng);
  for(const [orb,n] of Object.entries(recipe.cost))s.orbs[orb]-=n;
  s.keystones.unshift(item);s.crafted++;
  addLog(s,`Crafted ${item.name} at level ${item.itemLevel}.`,'loot');return {ok:true,item};
}
export function openRiftPortal(s,keyId){
  if(s.location!=='village'||s.riftPortal)return false;
  const at=s.keystones.findIndex(k=>k.id===keyId);if(at<0)return false;
  const [key]=s.keystones.splice(at,1);s.riftPortal=key;
  addLog(s,'A rift portal is open. One entry only; the keystone is consumed.','system');return true;
}
export function enterRift(s,rng=Math.random){
  if(s.location!=='village'||!s.riftPortal)return false;
  const key=s.riftPortal;s.riftPortal=null; // Consume the entry before any monsters spawn.
  s.expedition=captureExpedition(s);s.location='rift';s.stage=key.itemLevel;
  s.rift={keystone:key,wave:0,status:'active'};
  s.map=makeRiftMap(Math.floor(rng()*4294967296),s.stage);s.enemies=[];
  s.player={...s.map.entrance,path:[],pathTimer:0,manual:false,targetId:null};
  s.hp=stats(s).maxHp;s.auto=true;s.killsInStage=0;s.attackTimer=0;s.respawn=0;s.died=false;
  s.effects={chill:0};s.cooldowns=zeroCooldowns();s.hazards=[];s.mana=stats(s).maxMana;s.potion.charges=stats(s).potionCharges;
  // Expedition ground loot stays with its map and is restored on return.
  s.expedition.groundLoot=s.groundLoot;s.groundLoot=[];
  spawnRiftWave(s,1,[],rng);return true;
}
function spawnRiftWave(s,wave,events=[],rng=Math.random){
  const b=riftBonuses(s.rift.keystone),boss=wave===RIFT_WAVES;
  s.rift.wave=wave;s.map.progress=wave-1;s.map.bossUnlocked=boss;s.hazards=[];
  const count=boss?1:Math.min(23,Math.ceil((6+wave*2)*(1+b.pack/100)));
  s.enemies=Array.from({length:count},(_,i)=>{
    const tier=boss?'unique':wave>=3&&i===0?'rare':wave>=2&&i%4===1?'magic':'normal';
    const positions=[{x:5.5+(i%6)*2,y:4.5+(i%2)},{x:5.5+(i%6)*2,y:10.5+(i%2)},{x:4.5+(i%2),y:5.5+i%8},{x:18.5+(i%2),y:5.5+i%8}];
    const e=makeEnemy(s,tier,boss?{x:12.5,y:5.5}:positions[i%4],0,rng);
    e.maxHp=Math.round(e.maxHp*(1+b.life/100)*(boss?2.2:1));e.hp=e.maxHp;
    e.baseDamage*= (1+b.damage/100)*(boss?1.5:1);e.awakened=true;
    if(boss){e.name='Vharos, the Riftbound';e.modifiers=['earthshatter','empowered'];}
    return e;
  });
  s.player.targetId=null;s.player.manual=false;s.player.path=[];selectTarget(s);
  events.push({type:'riftWave',wave});addLog(s,boss?'Vharos has arrived. Defeat the rift guardian.':`Rift wave ${wave} begins.`,'system');
}
function leaveRift(s,status){
  for(const d of [...s.groundLoot])collectLoot(s,d.id);
  const key=s.rift.keystone;
  s.lastRift={status,wave:s.rift.wave,itemLevel:key.itemLevel,rarity:key.rarity};
  const expedition=s.expedition;
  if(expedition)Object.assign(s,expedition);
  s.location='village';s.expedition=null;s.rift=null;s.riftPortal=null;
  if(!expedition){s.returnPortal=false;startExpedition(s);}
  if(status==='failed')s.hp=stats(s).maxHp;
  s.effects={chill:0};
  addLog(s,status==='failed'?'You fell in the rift. Its portal is gone.':status==='cleared'?'Rift conquered. Welcome back to the Village.':'You left the rift. Its single-use portal has closed.','system');
}
function restoreRift(s,data){
  const m=data.map,r=s.rift;
  if(!r||!Number.isInteger(r.wave)||r.wave<1||r.wave>RIFT_WAVES||!['active','cleared'].includes(r.status)||data.stage!==r.keystone.itemLevel)return false;
  const expected=makeRiftMap(m?.seed,data.stage);
  if(!m||m.topology!=='arena'||m.width!==24||m.height!==18||m.tiles?.length!==432||!m.tiles.every((t,i)=>t===expected.tiles[i])||!Array.isArray(data.enemies)||!data.enemies.length||data.enemies.length>24)return false;
  if(!data.enemies.every(e=>e&&typeof e.id==='string'&&typeof e.name==='string'&&ENEMY_TIERS[e.tier]&&e.roomId===0&&Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&e.maxHp>0&&e.hp>=0&&e.hp<=e.maxHp&&Number.isFinite(e.baseDamage)&&e.baseDamage>=0&&walkable(m,e.x,e.y)&&e.home&&walkable(m,e.home.x,e.home.y)&&Array.isArray(e.modifiers)&&e.modifiers.every(id=>MODIFIERS[id])))return false;
  if(r.wave===RIFT_WAVES?(data.enemies.length!==1||!data.enemies[0].boss||data.enemies[0].tier!=='unique'):data.enemies.some(e=>e.boss||e.tier==='unique'))return false;
  s.map={...expected,progress:r.wave-1,bossUnlocked:r.wave===RIFT_WAVES,completed:r.status==='cleared'};s.enemies=data.enemies;
  if(s.map.completed!==!!(r.wave===RIFT_WAVES&&s.enemies[0].hp<=0)||(!s.map.completed&&s.enemies.every(e=>e.hp<=0)))return false;
  for(const e of s.enemies){e.rewarded=e.hp<=0;e.path=[];e.pathTimer=0;e.awakened=true;e.attackTimer=0;e.slamTimer=5;e.chilled=0;e.stunned=0;e.shocked=0;}
  s.player=data.player&&walkable(s.map,data.player.x,data.player.y)?{...data.player,path:[],pathTimer:0,manual:false}:{...s.map.entrance,path:[],pathTimer:0,manual:false};
  s.hazards=[];s.respawn=0;selectTarget(s);return true;
}

function restoreMap(s,data){
  const m=data.map;
  if(!m||m.width!==46||m.height!==34||m.tiles?.length!==1564||!m.tiles.every(t=>t===0||t===1)||m.seen?.length!==1564||!Array.isArray(m.rooms)||m.rooms.length!==9||!Array.isArray(data.enemies)||!data.enemies.length||data.enemies.length>64)return false;
  if(m.topology!=='linear'||!Array.isArray(m.route)||m.route.length!==9||new Set(m.route).size!==9||!m.route.every((id,order)=>Number.isInteger(id)&&id>=0&&id<9&&m.rooms[id].id===id&&m.rooms[id].order===order)||!data.enemies.every(e=>e&&Number.isInteger(e.roomId)&&m.rooms[e.roomId]))return false;
  if(![m.entrance,m.shrine,m.chest,...m.rooms].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&walkable(m,p.x,p.y)))return false;
  if(!data.enemies.every(e=>e&&typeof e.id==='string'&&typeof e.name==='string'&&ENEMY_TIERS[e.tier]&&Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&e.maxHp>0&&e.hp>=0&&e.hp<=e.maxHp&&Number.isFinite(e.baseDamage)&&walkable(m,e.x,e.y)&&e.home&&walkable(m,e.home.x,e.home.y)&&Array.isArray(e.modifiers)&&e.modifiers.every(x=>MODIFIERS[x])))return false;
  if(data.enemies.filter(e=>e.boss).length!==1||!data.enemies.every(e=>e.boss===(e.tier==='unique')))return false;
  s.map=m;s.enemies=data.enemies;s.map.goal=s.enemies.filter(e=>!e.boss).reduce((n,e)=>n+ENEMY_TIERS[e.tier].points,0);
  s.map.progress=s.enemies.filter(e=>!e.boss&&e.hp<=0).reduce((n,e)=>n+ENEMY_TIERS[e.tier].points,0);
  s.map.bossUnlocked=s.map.progress>=s.map.goal;s.map.completed=s.enemies.find(e=>e.boss).hp<=0;
  for(const e of s.enemies){e.points=ENEMY_TIERS[e.tier].points;e.path=[];e.pathTimer=0;e.attackTimer=0;e.slamTimer=5;e.chilled=0;e.stunned=0;e.shocked=0;e.burnTime=0;e.rewarded=e.hp<=0;}
  const p=data.player;
  s.player=p&&walkable(m,p.x,p.y)?{...p,path:[],pathTimer:0,manual:false}:{...m.entrance,path:[],pathTimer:0,manual:false,targetId:null};
  s.hazards=[];s.respawn=s.map.completed?3:0;selectTarget(s);return true;
}

export function loadGame(storage=globalThis.localStorage,now=Date.now()){
  try{
    const raw=storage.getItem(SAVE_KEY);if(!raw)return {state:createGame(now),offline:null};
    const data=JSON.parse(raw);
    if(![1,2,3,4,5].includes(data.version)||!Number.isInteger(data.level)||data.level<1||!Number.isInteger(data.stage)||data.stage<1||!Array.isArray(data.inventory)||!data.equipment)throw Error('Invalid save');
    const validItem=i=>i&&typeof i.id==='string'&&typeof i.name==='string'&&GEAR_SLOTS.includes(canonicalSlot(i.slot))&&Number.isInteger(i.rarity)&&i.rarity>=0&&i.rarity<=3&&Number.isInteger(i.upgrade)&&i.upgrade>=0;
    if(!data.inventory.every(validItem)||!Object.entries(data.equipment).every(([slot,item])=>GEAR_SLOTS.includes(canonicalSlot(slot))&&(item===null||(validItem(item)&&item.slot===slot))))throw Error('Invalid equipment');
    if(typeof data.name!=='string'||!data.name.trim()||!Array.isArray(data.log)||!data.log.every(x=>x&&typeof x.text==='string'&&Number.isFinite(x.time))||!Array.isArray(data.claimed))throw Error('Invalid hero');
    const fresh=createGame(now),s={...fresh,...data,version:5,name:data.name.slice(0,20),settings:{sound:false,motion:true,autoPotion:true,autoEquip:false,...data.settings}};
    // v5 replaced the four masteries with the passive tree and skill ranks: older
    // heroes get every point back to spend again.
    delete s.talents;
    if(data.version<5){s.points=s.level-1;s.skillPoints=s.level-1;s.tree=[];s.skills=defaultSkills();}
    else{
      s.tree=normalizeTree(data.tree);s.skills=normalizeSkills(data.skills,s.level);
      s.points=Math.max(0,Math.min(s.level-1-s.tree.length,Math.floor(Number(data.points)||0)));
      const spent=Object.values(s.skills.ranks).reduce((a,b)=>a+b,0);
      s.skillPoints=Math.max(0,Math.min(s.level-1-spent,Math.floor(Number(data.skillPoints)||0)));
    }
    s.potion={charges:Math.max(0,Math.min(9,Math.floor(Number(data.potion?.charges??BASE_COMBAT.potionCharges))||0)),progress:Math.max(0,Math.min(POTION_KILLS,Number(data.potion?.progress)||0)),lock:0};
    s.riftsCleared=Number.isSafeInteger(data.riftsCleared)&&data.riftsCleared>0?data.riftsCleared:0;
    s.deathStreak=0;s.castLock=0;s.mana=Number.isFinite(data.mana)&&data.mana>=0?data.mana:fresh.mana;
    for(const key of ['gold','xp','hp','maxStage','kills','points','lastSave','bosses','crafted'])if(!Number.isFinite(s[key])||s[key]<0)throw Error('Invalid save');
    s.maxStage=Math.max(s.stage,Math.floor(s.maxStage));s.speed=s.speed===2?2:1;s.auto=!!s.auto;s.advance=!!s.advance;s.inventory=s.inventory.slice(0,48);
    s.equipment={...Object.fromEntries(GEAR_SLOTS.map(slot=>[slot,null])),...Object.fromEntries(Object.entries(s.equipment).map(([slot,item])=>[canonicalSlot(slot),item]))};
    for(const item of [...s.inventory,...Object.values(s.equipment)].filter(Boolean)){
      migrateGear(item);
      const rawAffixes=Array.isArray(item.affixes)?item.affixes.filter(a=>a&&AFFIXES[a.id]&&Number.isFinite(a.value)&&a.value>=0):[];
      item.affixes=[];
      for(const a of rawAffixes){
        if(item.affixes.some(x=>x.id===a.id))continue;
        retier(a);
        item.affixes.push(a);
      }
      item.itemLevel=Number.isInteger(item.itemLevel)&&item.itemLevel>=1?item.itemLevel:1;
      if(item.locked!==true)delete item.locked;
      if(!Object.values(UNIQUE_EFFECTS).some(u=>u.id===item.unique))item.unique=null;
    }
    s.cooldowns=zeroCooldowns();s.effects={chill:0};s.tierKills={...fresh.tierKills,...data.tierKills};s.runNumber=Number.isInteger(data.runNumber)?data.runNumber:0;
    s.orbs={...zeroOrbs(),...Object.fromEntries(Object.entries(data.orbs||{}).filter(([k,v])=>CRAFT_OPERATIONS[k]&&Number.isInteger(v)&&v>=0))};
    delete s.shards;
    s.lootFilter=normalizeLootFilter(data.lootFilter);
    if(!RING_SLOTS.some(slot=>Object.hasOwn(data.equipment,slot))&&GEAR_SLOTS.filter(slot=>!RING_SLOTS.includes(slot)).every(slot=>s.lootFilter.slots.includes(slot)))s.lootFilter.slots=[...GEAR_SLOTS];
    s.location=['village','rift'].includes(data.location)?data.location:'expedition';
    s.riftPortal=validKeystone(data.riftPortal)?data.riftPortal:null;
    s.rift=data.rift&&validKeystone(data.rift.keystone)?data.rift:null;
    const keyIds=new Set([s.riftPortal?.id,s.rift?.keystone.id].filter(Boolean));
    s.keystones=(Array.isArray(data.keystones)?data.keystones:[]).filter(k=>{if(!validKeystone(k)||keyIds.has(k.id))return false;keyIds.add(k.id);return true;});
    s.returnPortal=data.returnPortal===true;
    s.lastRift=data.lastRift&&['cleared','failed','abandoned','lost'].includes(data.lastRift.status)?data.lastRift:null;
    const ownedIds=new Set([...s.inventory,...Object.values(s.equipment)].filter(Boolean).map(i=>i.id).concat([...keyIds]));
    const normalizeDrops=drops=>(Array.isArray(drops)?drops:[]).filter(d=>{
      if(!d||!(validItem(d.item)||validKeystone(d.item))||d.id!==d.item.id||ownedIds.has(d.id)||!Number.isFinite(d.x)||!Number.isFinite(d.y))return false;
      ownedIds.add(d.id);return true;
    }).slice(0,64).map(d=>({...d,age:Number.isFinite(d.age)?Math.max(0,d.age):0,item:{...d.item,affixes:(Array.isArray(d.item.affixes)?d.item.affixes:[]).filter(a=>a&&AFFIXES[a.id]&&Number.isFinite(a.value)&&a.value>=0)}}));
    s.groundLoot=normalizeDrops(data.groundLoot);
    s.groundLoot.forEach(d=>{if(d.item.kind!=='keystone')migrateGear(d.item);});
    const migrated=data.version===1;
    let restored=false;
    if(s.location==='rift'){
      const prior={...s,...data.expedition};
      prior.groundLoot=normalizeDrops(data.expedition?.groundLoot);
      prior.groundLoot.forEach(d=>{if(d.item.kind!=='keystone')migrateGear(d.item);});
      s.expedition=data.expedition&&Number.isFinite(prior.hp)&&prior.hp>=0&&Number.isSafeInteger(prior.stage)&&prior.stage>=1&&restoreMap(prior,prior)?captureExpedition(prior):null;
      restored=!!s.expedition&&restoreRift(s,data);
      s.riftPortal=null;
      if(!restored){
        for(const d of [...s.groundLoot])collectLoot(s,d.id);
        if(s.expedition)Object.assign(s,s.expedition);
        s.location='village';s.rift=null;s.lastRift={status:'lost',wave:0};
        if(!s.expedition)startExpedition(s);
        s.returnPortal=!!s.expedition;s.expedition=null;
      }
    }else{
      s.rift=null;s.expedition=null;
      restored=!migrated&&restoreMap(s,data);
      if(!restored){startExpedition(s);s.returnPortal=false;}
    }
    s.hp=Math.min(s.hp,stats(s).maxHp);s.mana=Math.min(s.mana,stats(s).maxMana);s.potion.charges=Math.min(s.potion.charges,stats(s).potionCharges);
    return {state:s,offline:offlineRewards(s,now),migrated,refunded:data.version<5&&s.level>1,mapRecovered:!migrated&&!restored};
  }catch{return {state:createGame(now),offline:null,recovered:true};}
}
