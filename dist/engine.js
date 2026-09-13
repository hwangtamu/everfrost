import {generateMap, seededRandom, distance, walkable, findPath, moveAlong, reveal, hasLineOfSight} from './world.js';
import {AFFIXES, UNIQUE_EFFECTS, rollAffixes, affixBonuses, lootRarity} from './loot.js';
import {ENEMY_TIERS, MODIFIERS, rollModifiers} from './monsters.js';
import {normalizeLootFilter,matchesLootFilter} from './loot-filter.js';

// Keep the original storage key so existing characters migrate in place.
export const SAVE_KEY = 'everfrost.save.v1';
export const REGIONS = [
  {name:'Mistwood', subtitle:'The wilds are waking.', start:1, color:'#829f7c', foes:['Mossfang Wolf','Wild Bristleback','Thorn Sprite'], boss:'The Hollow Guardian'},
  {name:'Frostfall Ridge', subtitle:'Follow the northern wind.', start:6, color:'#9bbdce', foes:['Frost Wolf','Icebound Wraith','Snow Stalker'], boss:'Hrim, the Frostborn'},
  {name:'Ember Hollow', subtitle:'Something stirs beneath the ash.', start:11, color:'#d4936f', foes:['Cinder Hound','Ash Wraith','Emberling'], boss:'The Ashen King'},
  {name:'The Starless Wild', subtitle:'Beyond the edge of every map.', start:16, color:'#aa97cc', foes:['Void Stalker','Moon Wraith','Dusk Serpent'], boss:'The Forgotten One'}
];
export const SKILLS = [
  {id:'cleave', name:'Runic cleave', icon:'swords', key:'1', level:1, cooldown:9, description:'Deal 3× weapon damage within your attack range + 1.1 tiles. Each target can be critically struck.'},
  {id:'mend', name:'Forest blessing', icon:'leaf', key:'2', level:3, cooldown:18, description:'Restore 45% of your maximum health and remove chill.'},
  {id:'storm', name:'Thunderstrike', icon:'zap', key:'3', level:5, cooldown:25, description:'Strike visible enemies within 6 tiles for 5× attack as lightning damage. Each target can be critically struck.'}
];
const NAMES = {weapon:['Iron Longsword','Warden’s Blade','Moonsteel Edge','Dawnbreaker'],armor:['Traveler’s Tunic','Ranger’s Mail','Runebound Armor','Vestment of Dawn'],charm:['Carved Antler','Mistwood Talisman','Starlit Pendant','Heart of the Wild']};
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
export const regionIndex = s => Math.floor(((s.stage-1)%20)/5);
export const journey = s => Math.floor((s.stage-1)/20)+1;
export const region = s => REGIONS[regionIndex(s)];
export const xpRequired = level => Math.round(45 * Math.pow(level, 1.38));
export const BASE_COMBAT = {movementSpeed:5.8, attackInterval:1.1, attackRange:1.9, critMultiplier:1.8};

export function stats(s) {
  const eq = Object.values(s.equipment), a = affixBonuses(eq);
  const bonus = slot => eq.filter(x => x?.slot === slot).reduce((n,x) => n + x.power + x.upgrade * 3, 0);
  const attackSpeed = (1 + Math.min(150, a.haste) / 100) / BASE_COMBAT.attackInterval;
  return {
    attack: 9 + s.level * 3 + bonus('weapon') + s.talents.might * 3 + a.attack,
    defense: 2 + s.level + bonus('armor') + s.talents.guard * 2 + a.defense,
    maxHp: 90 + s.level * 15 + bonus('charm') * 3 + s.talents.vigor * 18 + a.maxHp,
    crit: Math.min(.75, .08 + s.talents.fortune * .015 + a.critical / 100),
    critMultiplier: Math.min(4, BASE_COMBAT.critMultiplier + a.criticalMultiplier / 100),
    movementSpeed: BASE_COMBAT.movementSpeed * (1 + Math.min(100, a.movement) / 100),
    attackRange: Math.min(6, BASE_COMBAT.attackRange + a.reach),
    attackSpeed, attackInterval: 1 / attackSpeed,
    fire: a.fire, cold: a.cold, lightning: a.lightning, resist: Math.min(65, a.resist),
    leech: Math.min(15, a.leech), regen: a.regen, haste: Math.min(150, a.haste)
  };
}

// Live values share one calculation across simulation, character UI and tooltips.
export function combatStats(s) {
  const p = stats(s), chill = s.effects?.chill > 0 ? .75 : 1;
  p.movementSpeed *= chill; p.attackSpeed *= chill; p.attackInterval = 1 / p.attackSpeed;
  p.averageHit = (p.attack+p.fire+p.cold+p.lightning) * (1+p.crit*(p.critMultiplier-1));
  p.dps = p.averageHit * p.attackSpeed * (s.equipment.weapon?.unique==='echo'?1.25:1);
  return p;
}

export function enemyStats(s,e) {
  const frenzy = activeAuras(s,e).some(a=>a.modifier==='hasteAura');
  const hasted = e.modifiers.includes('hasted'), deadly = e.modifiers.includes('deadly');
  const chilled = e.chilled>0 ? .8 : 1;
  const attackSpeed = (1/2.3)*(hasted?1.3:1)*(frenzy?1.25:1)*chilled;
  return {
    attack:e.baseDamage*(e.modifiers.includes('empowered')?1.4:1)*(frenzy?1.25:1),
    movementSpeed:2.1*(hasted?1.25:1)*chilled,
    attackSpeed,attackInterval:1/attackSpeed,attackRange:e.kind==='sprite'?3.5:1.5,
    crit:({normal:.03,magic:.05,rare:.08,unique:.10}[e.tier]||0)+(deadly?.2:0),
    critMultiplier:1.5+(deadly?.5:0)
  };
}

export const withinReach = (s,from,to,range) => distance(from,to)<=range && hasLineOfSight(s.map,from,to);
export const skillRange = (s,id) => id==='cleave'?stats(s).attackRange+1.1:id==='storm'?6:0;
export const skillTargets = (s,id) => livingEnemies(s).filter(e=>withinReach(s,s.player,e,skillRange(s,id)));

export function makeItem(slot, rarity = 0, stage = 1, rng = Math.random) {
  const affixes = rollAffixes(slot, rarity, stage, rng);
  const prefix = affixes.find(a => AFFIXES[a.id].kind === 'prefix');
  const suffix = affixes.find(a => AFFIXES[a.id].kind === 'suffix');
  const name = rarity === 3 ? NAMES[slot][3] : `${prefix ? AFFIXES[prefix.id].name + ' ' : ''}${NAMES[slot][rarity]}${suffix ? ' ' + AFFIXES[suffix.id].name : ''}`;
  return {id:id(), slot, rarity, name, itemLevel:stage, power:Math.round((slot === 'weapon' ? 4 : 2) + stage * 1.6 + rarity * (5 + stage)), upgrade:0, affixes, unique:rarity === 3 ? UNIQUE_EFFECTS[slot].id : null};
}

export function createGame(now = Date.now(), seed = Math.floor(Math.random() * 4294967296)) {
  const s = {
    version:2, name:'Wanderer', level:1, xp:0, gold:120, shards:8, stage:1, maxStage:1,
    killsInStage:0, kills:0, bosses:0, crafted:0, hp:105, auto:true, advance:true, speed:1,
    inventory:[], equipment:{weapon:makeItem('weapon'),armor:makeItem('armor'),charm:null},
    talents:{might:0,guard:0,vigor:0,fortune:0}, points:0, cooldowns:{cleave:0,mend:0,storm:0},
    enemy:null, enemies:[], attackTimer:0, attackCount:0, respawn:0, log:[], claimed:[],
    lastSave:now, playTime:0, runNumber:0, tierKills:{normal:0,magic:0,rare:0,unique:0},
    settings:{sound:false,motion:true}, hazards:[], effects:{chill:0}, died:false,
    groundLoot:[],lootFilter:normalizeLootFilter()
  };
  s.inventory = [makeItem('weapon',1), makeItem('charm'), makeItem('armor',1)];
  startExpedition(s, seed);
  addLog(s,'Explore the connected clearings. Defeat enemies to reveal the stage guardian.','system');
  return s;
}

export function addLog(s, text, type = 'combat') {
  s.log.unshift({id:id(), text, type, time:Date.now()}); s.log = s.log.slice(0,30);
}

export function makeEnemy(s, tier, position, roomId, rng = Math.random, forcedMods) {
  const r = region(s), t = ENEMY_TIERS[tier], species = Math.floor(rng() * 3);
  const modifiers = forcedMods || rollModifiers(tier, rng);
  const maxHp = Math.round((18 + Math.pow(s.stage,1.18) * 6) * t.life);
  const baseName = r.foes[species];
  const name = tier === 'unique' ? r.boss : tier === 'rare' ? `${['Briarwrath','Dreadmaw','Ashbound','Nightclaw'][Math.floor(rng()*4)]}, ${baseName}` : baseName;
  return {id:id(), name, kind:tier === 'unique' ? 'guardian' : ['wolf','boar','sprite'][species],
    tier, maxHp, hp:maxHp, boss:tier === 'unique', level:s.stage, modifiers,
    x:position.x, y:position.y, home:{...position}, roomId, path:[], pathTimer:0,
    attackTimer:0, slamTimer:5, chilled:0, awakened:false,
    baseDamage:(2.8 + s.stage * 1.25) * t.damage, points:t.points};
}

export function startExpedition(s, seed = (Math.floor(Math.random()*4294967296) ^ (s.runNumber + 1) * 2654435761) >>> 0) {
  // Leaving a map never loses earned drops, even when battle is paused.
  for(const drop of [...(s.groundLoot||[])])collectLoot(s,drop.id);
  s.groundLoot=[];
  s.runNumber++; s.map = generateMap(seed, s.stage); s.enemies = []; s.hazards = [];
  s.player = {...s.map.entrance, path:[], pathTimer:0, manual:false, targetId:null};
  s.killsInStage = 0; s.attackTimer = 0; s.respawn = 0; s.effects = {chill:0}; s.died = false;
  s.hp = stats(s).maxHp;
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
    const count = tier === 'normal' ? 2 + Math.floor(rng()*2) : tier === 'magic' ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const position = {x:room.x + [0,-1,1][i],y:room.y + (i === 2 ? 1 : 0)};
      const actualTier = tier === 'rare' && i > 0 ? 'normal' : tier;
      s.enemies.push(makeEnemy(s, actualTier, position, room.id, rng, actualTier === tier ? shared : []));
    }
  });
  const bossRoom = s.map.rooms.find(r => r.id === s.map.bossRoomId);
  s.enemies.push(makeEnemy(s, 'unique', {x:bossRoom.x,y:bossRoom.y}, bossRoom.id, rng));
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
    s.xp -= xpRequired(s.level); s.level++; s.points++; s.hp = stats(s).maxHp;
    events.push({type:'level',value:s.level}); addLog(s,`Reached level ${s.level}. A mastery point awaits.`,'level');
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
  return Math.max(1, Math.round((physical * armor + elemental * resist) * guarded));
}

function giveItem(s,item,events) {
  if(s.lootFilter?.salvageHidden&&!matchesLootFilter(item,s.lootFilter)){
    const essence=2+item.rarity*3+item.upgrade;s.shards+=essence;
    addLog(s,`Filter salvaged ${item.name} · +${essence} essence.`,'salvage');
    events.push({type:'filteredLoot',item,essence});return;
  }
  if (s.inventory.length < 48) {
    s.inventory.unshift(item); events.push({type:'loot',item}); addLog(s,`Found ${item.name}.`,'loot');
  } else { s.shards += 2 + item.rarity * 3; addLog(s,'Satchel full. New equipment salvaged into essence.','salvage'); }
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

export function defeatEnemy(s,enemy,events = [],rng = Math.random) {
  if (enemy.rewarded) return;
  enemy.hp = 0; enemy.rewarded = true;
  const reward = ENEMY_TIERS[enemy.tier].reward * (1 + enemy.modifiers.length * .15);
  const gold = Math.round((6+s.stage*2) * reward), xp = Math.round((7+s.stage*2) * reward);
  s.gold += gold; s.kills++; s.killsInStage++; s.tierKills[enemy.tier]++;
  s.shards += enemy.boss ? 6 : enemy.tier === 'rare' ? 3 : 1;
  gainXp(s,xp,events); s.hp = Math.min(stats(s).maxHp,s.hp + stats(s).maxHp*.035);
  events.push({type:'kill',gold,xp,boss:enemy.boss,tier:enemy.tier,x:enemy.x,y:enemy.y});
  addLog(s,`${ENEMY_TIERS[enemy.tier].label} ${enemy.name} defeated · +${gold} gold · +${xp} XP`);
  const dropChance = {normal:.30,magic:.70,rare:1,unique:1}[enemy.tier];
  const quantity = enemy.tier === 'unique' ? 2 : 1;
  if (rng() < dropChance) for (let i = 0; i < quantity; i++) {
    const rarity = lootRarity(enemy.tier,rng);
    dropItem(s,makeItem(['weapon','armor','charm'][Math.floor(rng()*3)],rarity,s.stage,rng),enemy,events);
  }
  if (!enemy.boss) {
    s.map.progress = Math.min(s.map.goal,s.map.progress+enemy.points);
    if (s.map.progress >= s.map.goal && !s.map.bossUnlocked) {
      s.map.bossUnlocked = true; events.push({type:'bossReady'}); addLog(s,'The guardian is revealed. Follow the orange marker to the sanctum.','system');
      reveal(s.map,s.enemies.find(e => e.boss),4);
    }
    if (enemy.modifiers.includes('volatile')) s.hazards.push({kind:'volatile',x:enemy.x,y:enemy.y,radius:2.5,remaining:1.4,total:1.4,damage:enemy.baseDamage*3,element:'fire'});
  } else {
    s.bosses++; s.map.completed = true; s.maxStage = Math.max(s.maxStage,s.stage+1); s.respawn = 3;
    s.hazards = []; events.push({type:'complete',stage:s.stage}); addLog(s,`Stage ${s.stage} cleared. The road ahead is open.`,'system');
  }
}

function hitEnemy(s,enemy,physical,elemental,events,rng,critical = false) {
  if (enemy.hp <= 0 || (enemy.boss && !s.map.bossUnlocked)) return;
  const dealt = effectiveDamage(s,enemy,physical,elemental), actual = Math.min(enemy.hp,dealt);
  enemy.hp = Math.max(0,enemy.hp-dealt);
  events.push({type:'hit',value:dealt,x:enemy.x,y:enemy.y,critical});
  const p = stats(s); if (p.cold) enemy.chilled = 2;
  if (p.leech) s.hp = Math.min(p.maxHp,s.hp+actual*p.leech/100);
  if (enemy.hp <= 0) defeatEnemy(s,enemy,events,rng);
}

function strikeEnemy(s,enemy,physical,elemental,events,rng) {
  const p=stats(s),critical=rng()<p.crit,multiplier=critical?p.critMultiplier:1;
  hitEnemy(s,enemy,physical*multiplier,elemental*multiplier,events,rng,critical);
}

export function hurtHero(s,amount,element = 'physical',events = [],critical = false) {
  const p = stats(s);
  let damage = element === 'physical' ? Math.max(.2,amount-p.defense*.30) : amount*(1-p.resist/100);
  if (s.equipment.armor?.unique === 'lastLight' && s.hp < p.maxHp*.35) damage *= .75;
  s.hp = Math.max(0,s.hp-damage);
  if (damage >= 1) events.push({type:'hurt',value:Math.ceil(damage),x:s.player.x,y:s.player.y,element,critical});
  return damage;
}

function advanceStep(s,dt,events,rng) {
  s.playTime += dt;
  for (const skill of SKILLS) s.cooldowns[skill.id] = Math.max(0,s.cooldowns[skill.id]-dt);
  s.effects.chill = Math.max(0,s.effects.chill-dt);
  if (!s.auto) return;
  advanceLoot(s,dt,events);
  s.died = false;
  if (s.map.completed) {
    s.respawn = Math.max(0,s.respawn-dt);
    if (s.respawn <= 0) {
      if (s.advance) { s.stage++; events.push({type:'stage',value:s.stage}); }
      startExpedition(s); events.push({type:'newMap'});
    }
    return;
  }
  const p = combatStats(s), player = s.player;
  s.hp = Math.min(p.maxHp,s.hp+p.regen*dt);
  const enemy = selectTarget(s);
  player.pathTimer -= dt;
  if (!player.manual && enemy?.hp > 0 && (!enemy.boss || s.map.bossUnlocked)) {
    const inPosition=withinReach(s,player,enemy,p.attackRange-.25);
    if (!inPosition && player.pathTimer <= 0) {
      player.path = findPath(s.map,player,enemy); player.pathTimer = .65;
    } else if (inPosition) player.path = [];
  }
  moveAlong(player,dt,p.movementSpeed);
  if (player.manual && !player.path.length) player.manual = false;
  reveal(s.map,player);
  if (!s.map.shrine.used && distance(player,s.map.shrine) < 1.7) {
    s.map.shrine.used = true; s.hp = p.maxHp; events.push({type:'heal',x:player.x,y:player.y}); addLog(s,'The healing shrine restores your strength.','system');
  }
  if (!s.map.chest.opened && distance(player,s.map.chest) < 1.4) {
    s.map.chest.opened = true; s.gold += 20+s.stage*4;
    dropItem(s,makeItem(['weapon','armor','charm'][Math.floor(rng()*3)],rng()<.2?2:1,s.stage,rng),s.map.chest,events);
    events.push({type:'chest'});
  }
  s.attackTimer = Math.min(s.attackTimer+dt,p.attackInterval+dt);
  if (enemy?.hp > 0 && (!enemy.boss||s.map.bossUnlocked) && withinReach(s,player,enemy,p.attackRange) && s.attackTimer+1e-9 >= p.attackInterval) {
    s.attackTimer = Math.max(0,s.attackTimer-p.attackInterval); s.attackCount++;
    strikeEnemy(s,enemy,p.attack,p.fire+p.cold+p.lightning,events,rng);
    if (s.equipment.weapon?.unique === 'echo' && s.attackCount%4 === 0 && enemy.hp > 0) strikeEnemy(s,enemy,p.attack,p.fire+p.cold+p.lightning,events,rng);
  }
  for (const e of livingEnemies(s)) {
    if (!e.awakened && withinReach(s,e,player,Math.max(5.5,p.attackRange+1))) e.awakened = true;
    if (!e.awakened) continue;
    e.chilled = Math.max(0,e.chilled-dt);
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
      if(e.modifiers.includes('vampiric'))e.hp=Math.min(e.maxHp,e.hp+dealt*.2);
      if(e.modifiers.includes('chilling'))s.effects.chill=3;
      events.push({type:'enemyAttack',x:e.x,y:e.y,targetX:player.x,targetY:player.y,critical});
    }
    if(e.modifiers.includes('burningAura')&&distance(e,player)<3) hurtHero(s,(1+s.stage*.3)*dt,'fire');
    if(e.modifiers.includes('earthshatter')&&distance(e,player)<7) {
      e.slamTimer-=dt;
      if(e.slamTimer<=0){e.slamTimer=7;s.hazards.push({kind:'slam',x:player.x,y:player.y,radius:2.7,remaining:1.5,total:1.5,damage:ep.attack*3,element:'physical'});events.push({type:'warning',text:'Earthshatter! Move out of the marked circle.'});}
    }
  }
  for(const hazard of s.hazards){hazard.remaining-=dt;if(hazard.remaining<=0){if(distance(player,hazard)<=hazard.radius)hurtHero(s,hazard.damage,hazard.element,events);events.push({type:'explosion',x:hazard.x,y:hazard.y});}}
  s.hazards=s.hazards.filter(h=>h.remaining>0);
  if(s.hp<=0){s.hp=p.maxHp;s.auto=false;s.died=true;s.hazards=[];s.player={...s.map.entrance,path:[],pathTimer:0,manual:false,targetId:null};for(const e of livingEnemies(s)){e.x=e.home.x;e.y=e.home.y;e.hp=e.maxHp;e.path=[];e.awakened=false;e.attackTimer=0;}selectTarget(s);events.push({type:'death'});addLog(s,'Returned to camp. Your map progress is preserved; surviving enemies recovered.','system');}
  if(s.enemy?.hp<=0&&!s.map.completed)selectTarget(s);
}

export function tick(s,dt,rng=Math.random){
  const events=[];if(!Number.isFinite(dt)||dt<=0)return events;
  let remaining=Math.min(.5,dt)*s.speed;
  while(remaining>1e-8){const step=Math.min(.1,remaining);advanceStep(s,step,events,rng);remaining-=step;}
  return events;
}

export function useSkill(s,id,rng=Math.random){
  const def=SKILLS.find(x=>x.id===id);
  if(!def||s.level<def.level||s.cooldowns[id]>0||s.map.completed)return [];
  const p=stats(s),targets=skillTargets(s,id);
  if(id!=='mend'&&!targets.length)return [];
  s.cooldowns[id]=def.cooldown;
  const events=[{type:'skill',id,x:s.player.x,y:s.player.y}];
  if(id==='mend'){s.hp=Math.min(p.maxHp,s.hp+p.maxHp*(s.equipment.charm?.unique==='wildheart'?.60:.45));s.effects.chill=0;events.push({type:'heal',x:s.player.x,y:s.player.y});}
  else for(const enemy of targets){if(id==='storm')strikeEnemy(s,enemy,0,p.attack*5+p.lightning*5,events,rng);else strikeEnemy(s,enemy,p.attack*3,(p.fire+p.cold+p.lightning)*3,events,rng);}
  if(!s.map.completed)selectTarget(s);
  return events;
}

export function equip(s,id){const i=s.inventory.findIndex(x=>x.id===id);if(i<0)return false;const item=s.inventory.splice(i,1)[0],old=s.equipment[item.slot];s.equipment[item.slot]=item;if(old)s.inventory.push(old);s.hp=Math.min(s.hp,stats(s).maxHp);return true;}
export function salvage(s,id){const i=s.inventory.findIndex(x=>x.id===id);if(i<0)return false;const item=s.inventory.splice(i,1)[0];s.shards+=2+item.rarity*3+item.upgrade;return true;}
export function upgradeCost(item){return {gold:40*(item.upgrade+1),shards:3+item.upgrade*2};}
export function upgrade(s,slot){const item=s.equipment[slot];if(!item)return false;const cost=upgradeCost(item);if(s.gold<cost.gold||s.shards<cost.shards)return false;s.gold-=cost.gold;s.shards-=cost.shards;item.upgrade++;s.crafted++;return true;}
export function merge(s,slot,rarity){if(!['weapon','armor','charm'].includes(slot)||!Number.isInteger(rarity)||rarity<0||rarity>2)return false;const items=s.inventory.filter(x=>x.slot===slot&&x.rarity===rarity).slice(0,3);if(items.length<3||s.gold<75)return false;const ids=new Set(items.map(x=>x.id));s.inventory=s.inventory.filter(x=>!ids.has(x.id));const item=makeItem(slot,rarity+1,s.stage);item.itemLevel=Math.max(item.itemLevel,...items.map(x=>x.itemLevel||s.stage));item.power=Math.max(item.power,...items.map(x=>x.power+x.upgrade*3))+3;s.inventory.unshift(item);s.gold-=75;s.crafted++;addLog(s,`Forged ${item.name} from three pieces of equipment.`,'loot');return item;}
export function learn(s,id){if(s.points<=0||!Object.hasOwn(s.talents,id))return false;s.points--;s.talents[id]++;return true;}
export function travel(s,stage){if(!Number.isInteger(stage)||stage<1||stage>s.maxStage)return false;s.stage=stage;startExpedition(s);return true;}
export const QUESTS=[
  {id:'first',name:'Into the wild',description:'Defeat 10 creatures',target:10,value:s=>s.kills,gold:150,shards:5},
  {id:'forge',name:'A sharper edge',description:'Upgrade or merge equipment 3 times',target:3,value:s=>s.crafted,gold:200,shards:10},
  {id:'guardian',name:'The forest remembers',description:'Defeat your first stage guardian',target:1,value:s=>s.bosses,gold:400,shards:15}
];
export function claimQuest(s,id){const q=QUESTS.find(q=>q.id===id);if(!q||s.claimed.includes(id)||q.value(s)<q.target)return false;s.claimed.push(id);s.gold+=q.gold;s.shards+=q.shards;return true;}

export function offlineRewards(s,now=Date.now()){
  const seconds=Math.min(28800,Math.max(0,(now-s.lastSave)/1000));s.lastSave=now;
  if(seconds>=60)for(const drop of [...(s.groundLoot||[])])collectLoot(s,drop.id);
  if(seconds<60||!s.auto)return null;
  const p=combatStats({...s,effects:{chill:0}}),dps=p.dps;
  const averageHealth=(18+Math.pow(s.stage,1.18)*6)*1.7;
  const travelTime=3*BASE_COMBAT.movementSpeed/p.movementSpeed;
  const kills=Math.floor(seconds/(averageHealth/dps+travelTime)*.5);
  const gold=kills*(6+s.stage*2),xp=kills*(7+s.stage*2),shards=Math.floor(kills/3);
  s.gold+=gold;s.shards+=shards;gainXp(s,xp);s.hp=stats(s).maxHp;s.hazards=[];
  return {seconds,kills,gold,xp,shards};
}

export function saveGame(s,storage=globalThis.localStorage,now=Date.now()){
  try{s.lastSave=now;storage.setItem(SAVE_KEY,JSON.stringify(s));return true;}catch{return false;}
}

function restoreMap(s,data){
  const m=data.map;
  if(!m||m.width!==46||m.height!==34||m.tiles?.length!==1564||!m.tiles.every(t=>t===0||t===1)||m.seen?.length!==1564||!Array.isArray(m.rooms)||m.rooms.length!==9||!Array.isArray(data.enemies)||!data.enemies.length||data.enemies.length>40)return false;
  if(m.topology!=='linear'||!Array.isArray(m.route)||m.route.length!==9||new Set(m.route).size!==9||!m.route.every((id,order)=>Number.isInteger(id)&&id>=0&&id<9&&m.rooms[id].id===id&&m.rooms[id].order===order)||!data.enemies.every(e=>e&&Number.isInteger(e.roomId)&&m.rooms[e.roomId]))return false;
  if(![m.entrance,m.shrine,m.chest,...m.rooms].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&walkable(m,p.x,p.y)))return false;
  if(!data.enemies.every(e=>e&&typeof e.id==='string'&&typeof e.name==='string'&&ENEMY_TIERS[e.tier]&&Number.isFinite(e.hp)&&Number.isFinite(e.maxHp)&&e.maxHp>0&&e.hp>=0&&e.hp<=e.maxHp&&Number.isFinite(e.baseDamage)&&walkable(m,e.x,e.y)&&e.home&&walkable(m,e.home.x,e.home.y)&&Array.isArray(e.modifiers)&&e.modifiers.every(x=>MODIFIERS[x])))return false;
  if(data.enemies.filter(e=>e.boss).length!==1||!data.enemies.every(e=>e.boss===(e.tier==='unique')))return false;
  s.map=m;s.enemies=data.enemies;s.map.goal=s.enemies.filter(e=>!e.boss).reduce((n,e)=>n+ENEMY_TIERS[e.tier].points,0);
  s.map.progress=s.enemies.filter(e=>!e.boss&&e.hp<=0).reduce((n,e)=>n+ENEMY_TIERS[e.tier].points,0);
  s.map.bossUnlocked=s.map.progress>=s.map.goal;s.map.completed=s.enemies.find(e=>e.boss).hp<=0;
  for(const e of s.enemies){e.points=ENEMY_TIERS[e.tier].points;e.path=[];e.pathTimer=0;e.attackTimer=0;e.slamTimer=5;e.chilled=0;e.rewarded=e.hp<=0;}
  const p=data.player;
  s.player=p&&walkable(m,p.x,p.y)?{...p,path:[],pathTimer:0,manual:false}:{...m.entrance,path:[],pathTimer:0,manual:false,targetId:null};
  s.hazards=[];s.respawn=s.map.completed?3:0;selectTarget(s);return true;
}

export function loadGame(storage=globalThis.localStorage,now=Date.now()){
  try{
    const raw=storage.getItem(SAVE_KEY);if(!raw)return {state:createGame(now),offline:null};
    const data=JSON.parse(raw);
    if(![1,2].includes(data.version)||!Number.isInteger(data.level)||data.level<1||!Number.isInteger(data.stage)||data.stage<1||!Array.isArray(data.inventory)||!data.equipment||!data.talents)throw Error('Invalid save');
    const validItem=i=>i&&typeof i.id==='string'&&typeof i.name==='string'&&['weapon','armor','charm'].includes(i.slot)&&Number.isInteger(i.rarity)&&i.rarity>=0&&i.rarity<=3&&Number.isFinite(i.power)&&i.power>=0&&Number.isInteger(i.upgrade)&&i.upgrade>=0;
    if(!data.inventory.every(validItem)||!Object.entries(data.equipment).every(([slot,item])=>['weapon','armor','charm'].includes(slot)&&(item===null||(validItem(item)&&item.slot===slot))))throw Error('Invalid equipment');
    if(typeof data.name!=='string'||!data.name.trim()||!Array.isArray(data.log)||!data.log.every(x=>x&&typeof x.text==='string'&&Number.isFinite(x.time))||!Array.isArray(data.claimed))throw Error('Invalid hero');
    if(!['might','guard','vigor','fortune'].every(k=>Number.isInteger(data.talents[k])&&data.talents[k]>=0))throw Error('Invalid mastery');
    const fresh=createGame(now),s={...fresh,...data,version:2,name:data.name.slice(0,20),settings:{sound:false,motion:true,...data.settings}};
    for(const key of ['gold','xp','shards','hp','maxStage','kills','points','lastSave','bosses','crafted'])if(!Number.isFinite(s[key])||s[key]<0)throw Error('Invalid save');
    s.maxStage=Math.max(s.stage,Math.floor(s.maxStage));s.speed=s.speed===2?2:1;s.auto=!!s.auto;s.advance=!!s.advance;s.inventory=s.inventory.slice(0,48);
    s.equipment={weapon:null,armor:null,charm:null,...s.equipment};
    for(const item of [...s.inventory,...Object.values(s.equipment)].filter(Boolean)){
      const rawAffixes=Array.isArray(item.affixes)?item.affixes.filter(a=>a&&AFFIXES[a.id]&&Number.isFinite(a.value)&&a.value>=0):[];
      item.affixes=[];
      for(const a of rawAffixes){
        if(item.affixes.some(x=>x.id===a.id))continue;
        const def=AFFIXES[a.id],maxTier=def.tiers.length;
        if(!(Number.isFinite(a.min)&&Number.isFinite(a.max))){
          // Legacy affixes: place the value in the tier range that contains it.
          let idx=def.tiers.findIndex(t=>a.value>=t.minVal&&a.value<=t.maxVal);
          if(idx<0){let best=0,bestDist=Infinity;def.tiers.forEach((t,i)=>{const d=Math.abs(a.value-(t.minVal+t.maxVal)/2);if(d<bestDist){bestDist=d;best=i;}});idx=best;}
          const t=def.tiers[idx];
          a.tier=maxTier-idx;a.min=t.minVal;a.max=t.maxVal;
          if(a.value<t.minVal)a.value=t.minVal;if(a.value>t.maxVal)a.value=t.maxVal;
        }else{
          a.tier=Math.max(1,Math.min(maxTier,Math.round(Number(a.tier)||maxTier)));
        }
        item.affixes.push(a);
      }
      item.itemLevel=Number.isInteger(item.itemLevel)&&item.itemLevel>=1?item.itemLevel:1;
      if(!Object.values(UNIQUE_EFFECTS).some(u=>u.id===item.unique))item.unique=null;
    }
    s.cooldowns={cleave:0,mend:0,storm:0};s.effects={chill:0};s.tierKills={...fresh.tierKills,...data.tierKills};s.runNumber=Number.isInteger(data.runNumber)?data.runNumber:0;
    s.lootFilter=normalizeLootFilter(data.lootFilter);
    const ownedIds=new Set([...s.inventory,...Object.values(s.equipment)].filter(Boolean).map(i=>i.id));
    s.groundLoot=(Array.isArray(data.groundLoot)?data.groundLoot:[]).filter(d=>{
      if(!d||!validItem(d.item)||d.id!==d.item.id||ownedIds.has(d.id)||!Number.isFinite(d.x)||!Number.isFinite(d.y))return false;
      ownedIds.add(d.id);return true;
    }).slice(0,64).map(d=>({...d,age:Number.isFinite(d.age)?Math.max(0,d.age):0,item:{...d.item,affixes:(Array.isArray(d.item.affixes)?d.item.affixes:[]).filter(a=>a&&AFFIXES[a.id]&&Number.isFinite(a.value)&&a.value>=0)}}));
    const migrated=data.version===1;
    const restored=!migrated&&restoreMap(s,data);
    if(!restored)startExpedition(s);
    s.hp=Math.min(s.hp,stats(s).maxHp);
    return {state:s,offline:offlineRewards(s,now),migrated,mapRecovered:!migrated&&!restored};
  }catch{return {state:createGame(now),offline:null,recovered:true};}
}
