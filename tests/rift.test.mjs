import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,teleportVillage,resumeExpedition,startVillageStage,craftKeystone,openRiftPortal,enterRift,defeatEnemy,tick,travel,startExpedition,useSkill,offlineRewards,stats,enemyStats,effectiveDamage,saveGame,loadGame,SAVE_KEY,makeItem,dropItem,collectLoot} from '../dist/engine.js';
import {makeKeystone,validKeystone,riftBonuses,RIFT_MODIFIERS,rollKeystone} from '../dist/keystones.js';
import {seededRandom,walkable} from '../dist/world.js';
import {matchesLootFilter,normalizeLootFilter} from '../dist/loot-filter.js';
import {villagePanel,keystoneDetails} from '../dist/village-ui.js';
const fixed=()=>.6;
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
function rift(rarity=0,seed=42){const s=createGame(1000,seed);teleportVillage(s);const key=makeKeystone(rarity,1,fixed);s.keystones.push(key);assert(openRiftPortal(s,key.id));assert(enterRift(s,fixed));return s;}

test('Village teleport freezes the map and resumes position, enemies, timers and guardian progress',()=>{
 const s=createGame(1000,42);tick(s,.5,fixed);s.enemy.hp-=2;defeatEnemy(s,s.enemies[1],[],fixed);
 const world=JSON.stringify({map:s.map,enemies:s.enemies,player:s.player,hp:s.hp,cooldowns:s.cooldowns,attackTimer:s.attackTimer});
 assert(teleportVillage(s));assert(!teleportVillage(s));assert.equal(s.location,'village');
 for(let i=0;i<100;i++)assert.deepEqual(tick(s,.5),[]);
 assert.deepEqual(useSkill(s,'mend'),[]);assert.equal(offlineRewards(s,1000+3600000),null);
 assert(resumeExpedition(s));assert(!resumeExpedition(s));
 assert.equal(JSON.stringify({map:s.map,enemies:s.enemies,player:s.player,hp:s.hp,cooldowns:s.cooldowns,attackTimer:s.attackTimer}),world);
 teleportVillage(s);s.maxStage=9;assert(!startVillageStage(s,10));assert(startVillageStage(s,9));
 assert.equal(s.stage,9);assert.equal(s.map.progress,0);assert.equal(s.returnPortal,false);
});

test('all keystone rarities roll the correct distinct modifiers with tangible rewards',()=>{
 const rng=seededRandom(9);
 for(let rarity=0;rarity<4;rarity++)for(let i=0;i<50;i++){
  const k=makeKeystone(rarity,30,rng);assert(validKeystone(k));const b=riftBonuses(k);
  assert.equal(new Set(k.modifiers.map(m=>m.id)).size,k.modifiers.length);
  if(rarity){assert(b.itemLevel>0);assert(b.quantity>0);assert(b.rarity>0);}
 }
 for(const id of Object.keys(RIFT_MODIFIERS)){
  const b=riftBonuses({modifiers:[{id,roll:.5}]});assert(b[RIFT_MODIFIERS[id].stat]>0);
 }
 const empty=normalizeLootFilter({slots:[],minRarity:3,alwaysShowUnique:false});
 assert(matchesLootFilter(makeKeystone(0),empty));
 const counts={normal:0,magic:0,rare:0,unique:0};
 for(const tier of Object.keys(counts))for(let n=0;n<2000;n++)if(rollKeystone(tier,5,rng))counts[tier]++;
 assert(counts.normal>0&&counts.normal<30);assert(counts.unique>counts.rare&&counts.rare>counts.magic&&counts.magic>counts.normal);
});

test('the altar modifies found keystones with one orb and never creates keystones from currency',()=>{
 const s=createGame(),low=()=>.1;s.orbs=Object.fromEntries(Object.keys(s.orbs).map(id=>[id,2]));
 assert(!craftKeystone(s,'missing','transmute',low).ok);teleportVillage(s);
 const before=JSON.stringify(s.orbs);assert(!craftKeystone(s,'missing','alchemy',low).ok);assert.equal(JSON.stringify(s.orbs),before);assert.equal(s.keystones.length,0);
 const key=makeKeystone(0,12,low);s.keystones.push(key);const id=key.id;
 assert(craftKeystone(s,id,'transmute',low).ok);assert.equal(key.rarity,1);assert.equal(key.modifiers.length,1);assert.equal(s.orbs.transmute,1);
 assert(craftKeystone(s,id,'augment',low).ok);assert.equal(key.modifiers.length,2);assert.equal(s.orbs.augment,1);
 assert(craftKeystone(s,id,'regal',low).ok);assert.equal(key.rarity,2);assert.equal(key.modifiers.length,3);assert.equal(s.orbs.regal,1);
 assert(craftKeystone(s,id,'exalt',low).ok);assert.equal(key.modifiers.length,4);assert.equal(s.orbs.exalt,1);
 const types=key.modifiers.map(m=>m.id);assert(craftKeystone(s,id,'divine',fixed).ok);assert.deepEqual(key.modifiers.map(m=>m.id),types);assert(key.modifiers.every(m=>m.roll===.6));
 assert(craftKeystone(s,id,'chaos',low).ok);assert.equal(key.rarity,2);assert([3,4].includes(key.modifiers.length));
 assert(craftKeystone(s,id,'scour',low).ok);assert.equal(key.rarity,0);assert.equal(key.modifiers.length,0);assert.equal(key.id,id);assert.equal(key.itemLevel,12);assert.equal(s.keystones.length,1);
 assert(craftKeystone(s,id,'alchemy',low).ok);assert.equal(key.rarity,2);assert.equal(key.modifiers.length,3);
 const unique=makeKeystone(3,12,low);s.keystones.push(unique);assert(!craftKeystone(s,unique.id,'scour',low).ok);assert.equal(unique.rarity,3);
});

test('portal consumes one keystone on opening and one entry on use, while preserving the expedition',()=>{
 const s=createGame(1000,42);s.enemy.hp-=3;const original=s.enemy.hp,seed=s.map.seed;
 const item=makeItem('hand');dropItem(s,item,s.player);teleportVillage(s);
 const a=makeKeystone(0),b=makeKeystone(1);s.keystones=[a,b];
 assert(openRiftPortal(s,a.id));assert(!openRiftPortal(s,b.id));assert.equal(s.keystones.length,1);
 assert(enterRift(s,fixed));assert(!enterRift(s,fixed));assert.equal(s.riftPortal,null);
 assert(!travel(s,1));assert(!startExpedition(s));assert(!resumeExpedition(s));
 assert(teleportVillage(s));assert.equal(s.lastRift.status,'abandoned');assert(!enterRift(s));
 assert.equal(s.map.seed,seed);assert.equal(s.enemy.hp,original);assert.equal(s.groundLoot[0].id,item.id);
 assert(resumeExpedition(s));assert.equal(s.location,'expedition');
});

test('waves advance immediately and the final boss completes only the rift, once',()=>{
 const s=rift(2),max=s.maxStage,bosses=s.bosses;
 for(let wave=1;wave<=4;wave++){
  assert.equal(s.rift.wave,wave);assert(s.enemies.length>=5);
  for(const e of [...s.enemies])defeatEnemy(s,e,[],fixed);
  assert.equal(s.rift.wave,wave+1);
 }
 assert.equal(s.enemies.length,1);const boss=s.enemies[0];assert(boss.boss);assert(s.map.bossUnlocked);
 assert(boss.maxHp>100);defeatEnemy(s,boss,[],fixed);const gold=s.gold;defeatEnemy(s,boss,[],fixed);assert.equal(s.gold,gold);
 assert(s.map.completed);assert.equal(s.rift.status,'cleared');assert.equal(s.maxStage,max);assert.equal(s.bosses,bosses);
 for(let i=0;i<100;i++)tick(s,.5,fixed);
 assert.equal(s.location,'rift');assert.equal(s.rift.wave,5);
 teleportVillage(s);assert.equal(s.lastRift.status,'cleared');assert(!enterRift(s));
});

test('death returns to Village permanently closing the rift, including after reload',()=>{
 const s=rift(3);s.hp=0;for(const e of s.enemies)e.hp=e.maxHp=1e7;
 const events=tick(s,.1,fixed);assert(events.some(e=>e.type==='riftFailed'));
 assert.equal(s.location,'village');assert.equal(s.lastRift.status,'failed');assert.equal(s.rift,null);assert.equal(s.riftPortal,null);
 assert(!enterRift(s));assert(s.returnPortal);
 const store=memory();saveGame(s,store,1000);const loaded=loadGame(store,1000);assert(!loaded.recovered);assert.equal(loaded.state.location,'village');assert(!enterRift(loaded.state));
});

test('active rifts reload without another entry, duplicate rewards or losing expedition ground drops',()=>{
 const s=createGame(1000,42),store=memory();const item=makeItem('head',1);dropItem(s,item,s.player);
 const seed=s.map.seed;teleportVillage(s);const key=makeKeystone(2,3,fixed);s.keystones=[key];openRiftPortal(s,key.id);enterRift(s,fixed);
 for(const e of [...s.enemies])defeatEnemy(s,e,[],fixed);const wave=s.rift.wave;
 s.enemies[0].hp-=5;const hp=s.enemies[0].hp;saveGame(s,store,1000);
 const loaded=loadGame(store,1000);assert(!loaded.recovered);const restored=loaded.state;
 assert.equal(restored.location,'rift');assert.equal(restored.rift.wave,wave);assert.equal(restored.enemies[0].hp,hp);assert.equal(restored.riftPortal,null);assert(!enterRift(restored));
 const gold=restored.gold;assert.equal(offlineRewards(restored,1000+8*3600000),null);assert.equal(restored.gold,gold);
 teleportVillage(restored);assert.equal(restored.map.seed,seed);assert(restored.groundLoot.some(d=>d.id===item.id));
 collectLoot(restored,item.id);assert.equal(restored.inventory.filter(i=>i.id===item.id).length,1);
});

test('keystone drops survive save/pickup and never compete with a full gear inventory',()=>{
 const s=createGame(1000),store=memory();s.inventory=Array.from({length:48},()=>makeItem('hand'));s.lootFilter=normalizeLootFilter({slots:[],alwaysShowUnique:false});
 const key=makeKeystone(0);dropItem(s,key,s.player);saveGame(s,store,1000);
 const loaded=loadGame(store,1000).state;assert(loaded.groundLoot.some(d=>d.id===key.id));
 assert(collectLoot(loaded,key.id));assert(!collectLoot(loaded,key.id));assert.equal(loaded.keystones.length,1);assert.equal(loaded.inventory.length,48);
});

test('a ready town portal survives reload, while a corrupt entered rift never grants re-entry',()=>{
 const s=createGame(1000,42),store=memory();teleportVillage(s);const key=makeKeystone(1);s.keystones=[key];openRiftPortal(s,key.id);
 saveGame(s,store,1000);let restored=loadGame(store,1000).state;
 assert.equal(restored.location,'village');assert.equal(restored.riftPortal.id,key.id);assert.equal(restored.keystones.length,0);
 assert(enterRift(restored,fixed));restored.map.tiles[0]=1;saveGame(restored,store,1000);
 const loaded=loadGame(store,1000);assert(!loaded.recovered);restored=loaded.state;
 assert.equal(restored.location,'village');assert.equal(restored.lastRift.status,'lost');assert.equal(restored.riftPortal,null);assert(!enterRift(restored));assert(resumeExpedition(restored));
});

test('rift modifiers change combat and actual loot levels, quantities and rarity outcomes',()=>{
 const normal=rift(0),unique=rift(3),b=riftBonuses(unique.rift.keystone);
 assert(unique.enemies[0].maxHp>normal.enemies[0].maxHp);assert(unique.enemies.length>normal.enemies.length);
 assert(enemyStats(unique,unique.enemies[0]).attackSpeed>enemyStats(normal,normal.enemies[0]).attackSpeed);
 assert(enemyStats(unique,unique.enemies[0]).crit>enemyStats(normal,normal.enemies[0]).crit);
 assert(effectiveDamage(unique,unique.enemies[0],100)<effectiveDamage(normal,normal.enemies[0],100));
 const finish=(s)=>{for(let wave=1;wave<=4;wave++)for(const e of [...s.enemies])defeatEnemy(s,e,[],()=>.2);s.groundLoot=[];defeatEnemy(s,s.enemies[0],[],()=>.2);return s.groundLoot.filter(d=>d.item.kind!=='keystone').map(d=>d.item);};
 const a=finish(normal),z=finish(unique);assert(z.length>a.length);assert(z.every(i=>i.itemLevel===1+b.itemLevel));assert(z.every(i=>i.affixes.length>=4));
});

test('automatic arena combat can finish all waves without teleport or terrain escapes',()=>{
 const s=rift(1);s.level=80;s.hp=stats(s).maxHp;
 for(let t=0;t<4000&&!s.map.completed&&s.location==='rift';t++){
  tick(s,.1,fixed);assert(walkable(s.map,s.player.x,s.player.y));
  for(const e of s.enemies)assert(walkable(s.map,e.x,e.y));
 }
 assert.equal(s.location,'rift');assert(s.map.completed);assert.equal(s.rift.wave,5);
});

test('Village renders loot-only keystone selection, orb crafting, and one-use rules',()=>{
 const s=rift(0);teleportVillage(s);const key=makeKeystone(3);s.keystones.push(key);
 const html=villagePanel(s);assert.match(html,/Expedition entrance/);assert.match(html,/Continue expedition/);assert.match(html,/keystone altar/);assert.match(html,/Orb of Transmutation/);
 assert.match(html,/Only monsters drop keystones/);assert.match(html,/No orb can create a keystone/);assert.doesNotMatch(html,/Craft normal keystone|keystone-level/);
 assert.match(keystoneDetails(key),/One entry/);assert.match(keystoneDetails(key),/Item quantity/);assert.match(keystoneDetails(key),/Item rarity/);
});
