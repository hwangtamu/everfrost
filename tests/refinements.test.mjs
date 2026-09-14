import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,makeItem,setItemLocked,salvage,equip,saveGame,loadGame,tick,stats} from '../dist/engine.js';
import {generateMap,seededRandom,walkable} from '../dist/world.js';
import {BOSSES,BOSS_SKILLS,bossIdentity,castBossSkill,hazardHits,finishBossHazard} from '../dist/bosses.js';
import {MODIFIERS} from '../dist/monsters.js';
import {salvageCandidates,inventoryCard} from '../dist/inventory-ui.js';
import {playerModifierIcons,enemyModifierIcons} from '../dist/hud-ui.js';

test('map themes, clearing shapes, widths and route orders vary deterministically',()=>{
 const themes=new Set(),shapes=new Set(),routes=new Set(),widths=new Set();
 for(let seed=0;seed<200;seed++){
  const m=generateMap(seed);themes.add(m.theme);widths.add(m.trailWidth);routes.add(m.route.join(','));
  m.rooms.forEach(r=>shapes.add(r.shape));assert.deepEqual(m,generateMap(seed));
 }
 assert.equal(themes.size,4);assert.equal(shapes.size,4);assert.equal(widths.size,2);assert(routes.size>20);
});

test('locked gear survives salvage, bulk cleanup, equipping and saves',()=>{
 const s=createGame(1000,42);s.auto=false;s.gold=1000;s.inventory=[];
 for(let rarity=0;rarity<4;rarity++){
  const item=makeItem('hand',rarity,5,()=>.5);s.inventory.push(item);assert(setItemLocked(s,item.id,true));
  const snapshot=JSON.stringify(s);assert(!salvage(s,item.id));assert.equal(JSON.stringify(s),snapshot);
  assert(inventoryCard(item,s).includes('aria-pressed="true"'));
 }
 assert.equal(salvageCandidates(s).length,0);
 const locked=s.inventory[0];s.inventory.push(makeItem('hand',0,5),makeItem('hand',0,5));
 assert.equal(salvageCandidates(s).length,2);
 assert(equip(s,locked.id));assert(s.equipment.hand.locked);
 const storage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}};
 assert(saveGame(s,storage,1000));const restored=loadGame(storage,1000);assert(!restored.recovered);
 assert(restored.state.equipment.hand.locked);assert(restored.state.inventory.filter(i=>i.locked).length===3);
 const unique=restored.state.inventory.find(i=>i.unique);
 assert(setItemLocked(restored.state,unique.id,false));assert(salvage(restored.state,unique.id));
 assert(!setItemLocked(s,'missing',true));assert(!setItemLocked(s,locked.id,'false'));
});

function arena(){const s=createGame(1000,42);s.map={...s.map,width:24,height:18,tiles:Array(432).fill(1),seen:Array(432).fill(1),bossUnlocked:true};s.player={x:12.5,y:10.5,path:[],manual:true,pathTimer:0};s.hazards=[];return s;}

test('all six boss identities have valid modifiers, distinct skill pairs and persisted appearances',()=>{
 const found=new Set(),skills=new Set();
 for(let seed=0;seed<100;seed++){
  const s=createGame(1000,seed),boss=s.enemies.find(e=>e.boss);found.add(boss.bossId);
  assert.equal(boss.kind,BOSSES[boss.bossId].kind);assert(boss.modifiers.every(id=>MODIFIERS[id]));
  for(const skill of BOSSES[boss.bossId].skills){assert(BOSS_SKILLS[skill]);skills.add(skill);}
  s.auto=false;const storage={getItem:()=>JSON.stringify(s)};const loaded=loadGame(storage,1000);
  assert(!loaded.recovered);assert.equal(loaded.state.enemies.find(e=>e.boss).bossId,boss.bossId);
 }
 assert.equal(found.size,6);assert.equal(skills.size,7);
 assert.equal(new Set(Object.values(BOSSES).map(b=>b.skills.join(','))).size,6);
});

test('boss casts alternate their own skills, create finite telegraphs and lock target coordinates',()=>{
 const ids=Object.keys(BOSSES);
 for(let i=0;i<ids.length;i++){
  const s=arena(),e={id:'boss',x:10.5,y:10.5,hp:100,...bossIdentity(()=>(i+.5)/ids.length)};
  s.enemies=[e];
  for(let j=0;j<4;j++){
   s.hazards=[];const skill=castBossSkill(s,e,10);assert.equal(skill,BOSSES[e.bossId].skills[j%2]);
   assert(s.hazards.length>0);assert(s.hazards.every(h=>h.kind===skill&&h.damage>0&&h.remaining>0&&h.total===h.remaining));
   const hazards=JSON.stringify(s.hazards);s.player.x+=.1;assert.equal(JSON.stringify(s.hazards),hazards);
  }
 }
});

test('charge lanes, safe ring centers and circular impact areas use matching hit geometry',()=>{
 const line={kind:'charge',x:2,y:2,endX:8,endY:2,radius:.85};
 assert(hazardHits(line,{x:5,y:2.8}));assert(!hazardHits(line,{x:5,y:3}));assert(!hazardHits(line,{x:10,y:2}));
 const ring={kind:'nova',x:5,y:5,radius:4,innerRadius:1.5};
 assert(!hazardHits(ring,{x:5,y:5}));assert(hazardHits(ring,{x:7,y:5}));assert(!hazardHits(ring,{x:10,y:5}));
 assert(hazardHits({kind:'frost',x:5,y:5,radius:2},{x:5,y:5}));
 const s=arena(),e={id:'boss',x:2,y:2,hp:100,path:[{x:3,y:2}]};s.enemies=[e];
 finishBossHazard(s,{...line,sourceId:e.id});assert.equal(e.x,8);assert.deepEqual(e.path,[]);assert(walkable(s.map,e.x,e.y));
 s.map.tiles[2*s.map.width+4]=0;e.x=2;finishBossHazard(s,{...line,sourceId:e.id});assert.equal(e.x,2);
});

test('boss hazards deal damage and chill through the combat loop while safe zones avoid hits',()=>{
 for(const hit of [true,false]){
  const s=arena();s.enemies.forEach(e=>{e.hp=0;e.rewarded=true});s.hp=stats(s).maxHp;s.respawn=0;
  const before=s.hp;s.hazards=[{kind:'frost',x:s.player.x+(hit?0:8),y:s.player.y,radius:2,remaining:.05,total:1,damage:30,element:'cold',chill:4}];
  tick(s,.1,()=>.5);assert.equal(s.hazards.length,0);
  if(hit){assert(s.hp<before);assert(s.effects.chill>0);}else{assert.equal(s.hp,before);assert(!s.effects.chill);}
 }
});

test('compact modifier icons expose descriptions and inspection actions',()=>{
 const s=createGame(1000,42);s.effects.chill=3;s.effects.soulgorge=4;
 const player=playerModifierIcons(s),enemy=enemyModifierIcons(s.enemies.find(e=>e.boss));
 assert(player.includes('aria-label="Chilled:'));assert(player.includes('data-view="hero"'));
 assert(enemy.includes('data-action="enemy-info"'));assert(enemy.includes('hud-skill'));
 assert(!enemy.includes('modifier-tag'));
});
