import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,combatStats,enemyStats,tick,useSkill,makeEnemy,makeItem,dropItem,collectLoot,saveGame,loadGame,offlineRewards,region,journey,defeatEnemy,startExpedition,salvageGold} from '../dist/engine.js';
import {normalizeLootFilter,matchesLootFilter} from '../dist/loot-filter.js';
import {compareItem,heroPanel,worldPanel} from '../dist/panels.js';
import {distance} from '../dist/world.js';

const fixed=()=>.6;
function advance(s,seconds,rng=fixed){const events=[];for(let i=0;i<Math.round(seconds*10);i++)events.push(...tick(s,.1,rng));return events;}
function scene(offset=1){
  const s=createGame(1000,42),pos={x:20.5,y:16.5};
  for(let y=10;y<=22;y++)for(let x=13;x<=28;x++)s.map.tiles[y*s.map.width+x]=1;
  Object.assign(s.player,pos,{manual:true,path:[]});
  const enemy=makeEnemy(s,'normal',{x:pos.x+offset,y:pos.y},s.map.route[0],fixed,[]);
  enemy.kind='wolf';enemy.hp=enemy.maxHp=1000000;enemy.baseDamage=0;
  s.enemies=[enemy,s.enemies.find(e=>e.boss)];s.enemy=enemy;s.player.targetId=enemy.id;
  for(const id in s.skills.auto)s.skills.auto[id]=false; // these scenes measure exact basic-attack math
  return s;
}
function memory(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}

test('movement bonuses change distance traveled, and attack speed changes strike count',()=>{
  const slow=scene(),fast=scene();
  fast.equipment.chest.affixes=[{id:'swiftness',value:50}];
  for(const s of [slow,fast])s.player.path=[{x:s.player.x+3,y:s.player.y}];
  const from={x:slow.player.x,y:slow.player.y};tick(slow,.1,fixed);tick(fast,.1,fixed);
  assert(Math.abs(distance(fast.player,from)/distance(slow.player,from)-1.5)<1e-9);
  const normal=scene(),hasted=scene();hasted.equipment.hand.affixes=[{id:'haste',value:100}];
  const a=advance(normal,8.5).filter(e=>e.type==='hit'),b=advance(hasted,8.5).filter(e=>e.type==='hit');
  assert.equal(a.length,10);assert.equal(b.length,20);
});

test('reach changes attack distance and cleave area, while walls stop both',()=>{
  const normal=scene(3),long=scene(3);long.equipment.hand.affixes=[{id:'reach',value:2}];
  for(const s of [normal,long])s.attackTimer=10;
  assert(!tick(normal,.1,fixed).some(e=>e.type==='hit'));
  assert(tick(long,.1,fixed).some(e=>e.type==='hit'));
  const cleave=scene(4);assert.equal(useSkill(cleave,'cleave',fixed).length,0);
  cleave.equipment.hand.affixes=[{id:'reach',value:2}];assert(useSkill(cleave,'cleave',fixed).some(e=>e.type==='hit'));
  const blocked=scene(3);blocked.equipment.hand.affixes=[{id:'reach',value:2}];blocked.attackTimer=10;
  blocked.map.tiles[16*blocked.map.width+22]=0;
  assert(!tick(blocked,.1,fixed).some(e=>e.type==='hit'));
  assert.equal(useSkill(blocked,'cleave',fixed).length,0);
});

test('critical chance and multiplier apply to basic attacks and damaging skills',()=>{
  const s=scene();s.equipment.hand.affixes=[{id:'precision',value:50},{id:'ferocity',value:80}];
  s.attackTimer=10;const p=stats(s),hit=tick(s,.1,()=>.5).find(e=>e.type==='hit');
  assert(hit.critical);assert.equal(hit.value,Math.round(p.attack*p.critMultiplier));
  const skill=useSkill(s,'cleave',()=>.5).find(e=>e.type==='hit');
  assert(skill.critical);assert.equal(skill.value,Math.round(p.attack*2.2*p.critMultiplier));
  s.level=5;const storm=useSkill(s,'storm',()=>.5).find(e=>e.type==='hit');
  assert(storm.critical);assert.equal(storm.value,Math.round(stats(s).attack*3.5*p.critMultiplier));
  const ordinary=scene();ordinary.attackTimer=10;
  assert.equal(tick(ordinary,.1,()=>.5).find(e=>e.type==='hit').critical,false);
});

test('chill, enemy enhancements, and live metrics share the actual combat formulas',()=>{
  const s=scene(),p=stats(s);s.effects.chill=3;
  const chilled=combatStats(s);assert.equal(chilled.movementSpeed,p.movementSpeed*.75);assert.equal(chilled.attackSpeed,p.attackSpeed*.75);
  assert.equal(chilled.attackInterval,1/chilled.attackSpeed);
  s.enemy.modifiers=['hasted','hasteAura','deadly'];const enemy=enemyStats(s,s.enemy);
  assert.equal(enemy.movementSpeed,2.1*1.25);assert.equal(enemy.attackSpeed,(1/2.3)*1.3*1.25);
  assert.equal(enemy.crit,.03+.2);assert.equal(enemy.critMultiplier,2);
  assert(heroPanel(s).includes('<span>Critical multiplier</span><b>180%</b>'));
  // Comparisons ignore temporary chill and report real damage and toughness changes.
  const better={...s.equipment.hand,id:'better',affixes:[{id:'precision',value:20},{id:'ferocity',value:40}]};
  const gain=compareItem(s,better);assert(gain.dps>5);assert.equal(Math.round(gain.tough),0);
  const tougher={...s.equipment.chest,id:'tough',affixes:[{id:'life',value:60}]};
  const defense=compareItem(s,tougher);assert(defense.tough>5);assert.equal(Math.round(defense.dps),0);
});

test('offline rewards respond to movement speed and critical damage',()=>{
  const base=createGame(1000,42),fast=structuredClone(base),crit=structuredClone(base);
  fast.equipment.chest.affixes=[{id:'swiftness',value:100}];
  crit.equipment.hand.affixes=[{id:'precision',value:50},{id:'ferocity',value:100}];
  const ordinary=offlineRewards(base,3601000);
  assert(offlineRewards(fast,3601000).gold>ordinary.gold);assert(offlineRewards(crit,3601000).gold>ordinary.gold);
});

test('loot filter combines rarity, slot, level, and any selected modifier with an optional unique override',()=>{
  const filter=normalizeLootFilter({minRarity:2,slots:['hand'],minItemLevel:10,affixes:['reach','haste']});
  const item=makeItem('hand',2,10,fixed);item.affixes=[{id:'reach',value:.5}];
  assert(matchesLootFilter(item,filter));
  assert(!matchesLootFilter({...item,rarity:1},filter));assert(!matchesLootFilter({...item,slot:'chest'},filter));
  assert(!matchesLootFilter({...item,itemLevel:9},filter));assert(!matchesLootFilter({...item,affixes:[]},filter));
  const unique=makeItem('neck',3,1,fixed);assert(matchesLootFilter(unique,filter));
  assert(!matchesLootFilter(unique,{...filter,alwaysShowUnique:false}));
  assert.deepEqual(normalizeLootFilter({slots:['hand','hand','bad'],affixes:['bad']} ).slots,['hand']);
});

test('drops stay on the ground before pickup; hidden drops convert to gold, visible ones are kept',()=>{
  const s=scene(),item=makeItem('hand',0),count=s.inventory.length,gold=s.gold;
  s.lootFilter=normalizeLootFilter({minRarity:2});dropItem(s,item,s.player);
  assert.equal(s.groundLoot.length,1);assert.equal(s.inventory.length,count);
  advance(s,1);assert.equal(s.groundLoot.length,1);
  advance(s,1.5);assert.equal(s.groundLoot.length,0);
  assert.equal(s.inventory.length,count);assert.equal(s.gold,gold+salvageGold(item)); // below filter -> gold
  assert(!collectLoot(s,item.id));
  const rare=makeItem('hand',2),before=s.inventory.length;
  dropItem(s,rare,s.player);assert(collectLoot(s,rare.id));assert.equal(s.inventory.length,before+1);
  const unique=makeItem('neck',3,1,fixed);dropItem(s,unique,s.player);collectLoot(s,unique.id);
  assert(s.inventory.some(i=>i.id===unique.id));
});

test('pending drops and filter settings survive reload and map changes without duplicates',()=>{
  const s=createGame(1000,42),storage=memory(),item=makeItem('chest',1,1,fixed);
  s.lootFilter=normalizeLootFilter({minRarity:1});dropItem(s,item,s.player);
  saveGame(s,storage,1000);const copy=loadGame(storage,1001).state;
  assert.equal(copy.groundLoot[0].id,item.id);assert.deepEqual(copy.lootFilter,s.lootFilter);
  const before=copy.inventory.length;startExpedition(copy,99);
  assert.equal(copy.groundLoot.length,0);assert.equal(copy.inventory.length,before+1);
  assert.equal(copy.inventory.filter(i=>i.id===item.id).length,1);
});

test('endless journeys cycle biomes and unlock stages beyond the original regions',()=>{
  assert.equal(region({stage:1}).name,region({stage:21}).name);
  assert.equal(region({stage:16}).name,region({stage:10016}).name);
  assert.equal(journey({stage:20001}),1001);
  const s=createGame(1000,42);s.stage=s.maxStage=20000;startExpedition(s,99);
  const hp=s.enemies[0].maxHp;assert(hp>100000);
  for(const e of s.enemies.filter(e=>!e.boss))defeatEnemy(s,e,[],fixed);
  defeatEnemy(s,s.enemies.find(e=>e.boss),[],fixed);assert.equal(s.maxStage,20001);
  advance(s,3.2);assert.equal(s.stage,20001);assert.equal(region(s).name,'Mistwood');
  const markup=worldPanel(s,{worldTab:'map'});assert.equal((markup.match(/aria-label="Stage /g)||[]).length,20);
  assert(markup.includes('Journey 1001'));assert(markup.includes('20001'));
});
