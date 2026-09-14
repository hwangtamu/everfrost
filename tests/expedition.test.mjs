import {GEAR_SLOTS} from '../dist/gear.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,findPath,walkable,seededRandom,distance} from '../dist/world.js';
import {createGame,tick,stats,startExpedition,defeatEnemy,effectiveDamage,activeAuras,hurtHero,useSkill,movePlayer,saveGame,loadGame,SAVE_KEY,makeItem,collectLoot} from '../dist/engine.js';
import {AFFIXES,rollAffixes,lootRarity} from '../dist/loot.js';
import {MODIFIERS} from '../dist/monsters.js';
import {enemyDetails,expeditionOverview,itemAffixDetails} from '../dist/expedition-ui.js';

const fixed=()=>.6;
function memory(){const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};}

test('500 generated maps have one connected linear route with no bypassed clearings',()=>{
  const layouts=new Set();
  for(let seed=1;seed<=500;seed++){
    const m=generateMap(seed),boss=m.rooms[m.bossRoomId];
    layouts.add(m.tiles.join(''));
    assert.equal(m.edges.length,8);
    assert.equal(new Set(m.route).size,9);
    assert.equal(m.rooms[m.route[0]].role,'entrance');
    assert.equal(boss.id,m.route.at(-1));
    for(const room of m.rooms){
      const degree=m.edges.filter(e=>e.includes(room.id)).length;
      assert.equal(degree,room.order===0||room.order===8?1:2);
    }
    const start=Math.floor(m.entrance.y)*m.width+Math.floor(m.entrance.x),seen=new Set([start]),queue=[start];
    for(let i=0;i<queue.length;i++){
      const x=queue[i]%m.width,y=Math.floor(queue[i]/m.width);
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        const at=ny*m.width+nx;
        if(walkable(m,nx,ny)&&!seen.has(at)){seen.add(at);queue.push(at);}
      }
    }
    assert.equal(seen.size,m.tiles.filter(Boolean).length,`isolated terrain in seed ${seed}`);
    assert(findPath(m,m.entrance,boss).length>70);
    // Removing any intermediate clearing must sever the entrance-to-boss path.
    for(const id of m.route.slice(1,-1)){
      const r=m.rooms[id],blocked={...m,tiles:[...m.tiles]};
      for(let y=Math.floor(r.y)-r.ry;y<=Math.floor(r.y)+r.ry;y++)
        for(let x=Math.floor(r.x)-r.rx;x<=Math.floor(r.x)+r.rx;x++)blocked.tiles[y*m.width+x]=0;
      assert.equal(findPath(blocked,m.entrance,boss).length,0,`shortcut in seed ${seed}, clearing ${id}`);
    }
  }
  assert.equal(layouts.size,500);
  assert.deepEqual(generateMap(42),generateMap(42));
});

test('100 expeditions complete automatically while actors stay on walkable terrain',()=>{
  for(let seed=1;seed<=100;seed++){
    const s=createGame(1000,seed);
    for(let i=0;i<1800&&s.stage===1&&s.auto;i++){
      tick(s,.1,fixed);
      assert(walkable(s.map,s.player.x,s.player.y),`hero crossed wall in seed ${seed}`);
      assert(s.enemies.every(e=>walkable(s.map,e.x,e.y)),`enemy crossed wall in seed ${seed}`);
    }
    assert.equal(s.stage,2,`hero stuck or defeated in seed ${seed}`);
    assert.equal(s.bosses,1);
  }
});

test('auto targeting follows route order, with a manual target override',()=>{
  const s=createGame(1000,13);
  const first=s.enemies.filter(e=>!e.boss).sort((a,b)=>s.map.rooms[a.roomId].order-s.map.rooms[b.roomId].order)[0];
  assert.equal(s.enemy.roomId,first.roomId);
  const later=s.enemies.find(e=>!e.boss&&s.map.rooms[e.roomId].order>=6);
  assert(movePlayer(s,later.x,later.y,later.id));tick(s,.1,fixed);
  assert.equal(s.enemy.id,later.id);
  const before=JSON.stringify(s.player);
  assert(!movePlayer(s,0,0));assert.equal(JSON.stringify(s.player),before);
  const boss=s.enemies.find(e=>e.boss);
  assert(!movePlayer(s,boss.x,boss.y,boss.id));
});

test('each map includes four tiers, distinct modifiers and an aura leader',()=>{
  for(let seed=0;seed<100;seed++){
    const s=createGame(1000,seed);
    assert.equal(new Set(s.enemies.map(e=>e.tier)).size,4);
    const rare=s.enemies.find(e=>e.tier==='rare');
    assert(rare.modifiers.some(m=>MODIFIERS[m].kind==='aura'));
    for(const e of s.enemies){
      assert.equal(new Set(e.modifiers).size,e.modifiers.length);
      assert.equal(e.modifiers.length,e.tier==='normal'?0:e.tier==='magic'?1:2);
    }
  }
});

test('weighted kills unlock the boss, and only boss defeat unlocks the next stage',()=>{
  const s=createGame(1000,42),boss=s.enemies.find(e=>e.boss),events=[];
  const mobs=s.enemies.filter(e=>!e.boss);let progress=0;
  for(const e of mobs){
    defeatEnemy(s,e,events,fixed);progress+=e.points;
    assert.equal(s.map.progress,progress);
    assert.equal(s.maxStage,1);assert.equal(s.map.completed,false);
  }
  assert.equal(s.map.progress,s.map.goal);assert(s.map.bossUnlocked);
  assert.equal(events.filter(e=>e.type==='bossReady').length,1);
  const gold=s.gold;defeatEnemy(s,mobs[0],events,fixed);assert.equal(s.gold,gold);
  for(const d of [...s.groundLoot])collectLoot(s,d.id);
  const count=s.inventory.length;defeatEnemy(s,boss,events,fixed);
  assert(s.map.completed);assert.equal(s.maxStage,2);assert.equal(s.bosses,1);
  assert.equal(s.groundLoot.length,2);for(const d of [...s.groundLoot])collectLoot(s,d.id);
  assert.equal(s.inventory.length,count+2);assert(s.inventory.slice(0,2).every(i=>i.rarity>=2));
  assert(events.some(e=>e.type==='complete'));
});

test('armor, elemental wards and aura removal change damage',()=>{
  const s=createGame(1000,42),target=s.enemies.find(e=>!e.boss),aura=s.enemies.find(e=>e.tier==='rare');
  for(const e of s.enemies)e.modifiers=[];
  target.modifiers=['armored','resistant'];aura.modifiers=['guardAura'];aura.x=target.x+1;aura.y=target.y;
  assert(activeAuras(s,target).length);assert.equal(effectiveDamage(s,target,100,100),94);
  aura.hp=0;assert.equal(activeAuras(s,target).length,0);assert.equal(effectiveDamage(s,target,100,100),125);
  target.modifiers=[];assert.equal(effectiveDamage(s,target,100,100),200);
});

test('telegraphed hazards damage inside their radius and can be avoided',()=>{
  const make=()=>{const s=createGame(1000,42);s.player.manual=true;s.player.path=[];return s;};
  const hit=make(),safe=make();
  for(const [s,offset] of [[hit,0],[safe,4]]){
    s.hazards=[{kind:'volatile',...s.player,x:s.player.x+offset,radius:2.5,remaining:.1,total:1.4,damage:30,element:'fire'}];
    tick(s,.1,fixed);assert.equal(s.hazards.length,0);
  }
  assert.equal(hit.hp,stats(hit).maxHp-30);assert.equal(safe.hp,stats(safe).maxHp);
});

test('item affixes are distinct, respect prefix/suffix caps and scale with item level',()=>{
  const rng=seededRandom(456);
  for(const slot of GEAR_SLOTS)for(let rarity=0;rarity<4;rarity++)for(let n=0;n<20;n++){
    const affixes=rollAffixes(slot,rarity,8,rng);
    assert.equal(new Set(affixes.map(a=>a.id)).size,affixes.length);
    assert(affixes.every(a=>AFFIXES[a.id].slots.includes(slot)&&a.value>0));
    const prefixes=affixes.filter(a=>AFFIXES[a.id].kind==='prefix'),suffixes=affixes.length-prefixes.length;
    if(rarity===0)assert.equal(affixes.length,0);
    if(rarity===1)assert.equal(prefixes.length,1);
    if(rarity===2)assert(prefixes.length>=2&&prefixes.length<=3&&suffixes>=2&&suffixes<=3);
    if(rarity===3)assert.equal(prefixes.length,3);
    assert(affixes.every(a=>{const t=AFFIXES[a.id].tiers[AFFIXES[a.id].tiers.length-a.tier];return t.minLevel<=8&&a.value>=t.minVal&&a.value<=t.maxVal&&a.tier>=3;}));
  }
  const averages=[];
  for(const tier of ['normal','magic','rare','unique']){
    const rolls=Array.from({length:1000},(_,i)=>lootRarity(tier,()=>i/1000));
    averages.push(rolls.reduce((a,b)=>a+b)/rolls.length);
    if(tier==='rare')assert(rolls.every(r=>r>=1));
    if(tier==='unique')assert(rolls.every(r=>r>=2));
  }
  assert(averages.every((v,i)=>!i||v>averages[i-1]));
});

test('affixes and unique powers affect actual hero stats and abilities',()=>{
  const s=createGame(1000,42),base=stats(s);
  s.equipment.hand.affixes=[{id:'might',value:8},{id:'haste',value:20},{id:'leech',value:3},{id:'fire',value:5}];
  assert.equal(stats(s).attack,base.attack+8);assert.equal(stats(s).fire,5);
  assert(stats(s).attackInterval<base.attackInterval);assert.equal(stats(s).leech,3);
  s.equipment.chest.unique='lastLight';s.hp=20;
  assert.equal(hurtHero(s,20,'fire'),15);
  s.level=3;s.equipment.neck=makeItem('neck',3,1,fixed);s.hp=1;s.effects.chill=3;
  useSkill(s,'mend',fixed);assert.equal(s.effects.chill,0);assert.equal(s.hp,1+stats(s).maxHp*.6);
});

test('a full inventory salvages guaranteed drops without exceeding capacity',()=>{
  const s=createGame(1000,42);s.inventory=Array.from({length:48},()=>makeItem('hand',0));
  const rare=s.enemies.find(e=>e.tier==='rare'),gold=s.gold,orbsBefore=Object.values(s.orbs).reduce((a,b)=>a+b,0);
  defeatEnemy(s,rare,[],fixed);for(const d of [...s.groundLoot])collectLoot(s,d.id);assert.equal(s.inventory.length,48);assert(s.gold>gold&&Object.values(s.orbs).reduce((a,b)=>a+b,0)>orbsBefore);
});

test('saving preserves the generated map, defeated enemies, exploration and hero position',()=>{
  const s=createGame(1000,42),storage=memory();
  for(let i=0;i<150;i++)tick(s,.1,fixed);
  const map=structuredClone(s.map),position={x:s.player.x,y:s.player.y};
  saveGame(s,storage,1000);const result=loadGame(storage,1001),copy=result.state;
  assert(!result.recovered);assert(!result.mapRecovered);
  assert.deepEqual(copy.map,map);assert.equal(copy.kills,s.kills);
  assert.equal(copy.enemies.filter(e=>e.hp===0).length,s.enemies.filter(e=>e.hp===0).length);
  assert.equal(distance(copy.player,position),0);
});

test('old saves retain character and equipment when moving to linear expeditions',()=>{
  for(const version of [1,2]){
    const storage=memory(),old=createGame(1000,42);old.version=version;old.map.topology='branching';
    old.gold=567;old.level=7;old.stage=4;old.maxStage=8;old.equipment.hand.upgrade=3;
    if(version===1){delete old.map;delete old.enemies;for(const i of [...old.inventory,...Object.values(old.equipment)].filter(Boolean))delete i.affixes;}
    const before=stats(old);storage.setItem(SAVE_KEY,JSON.stringify(old));
    const result=loadGame(storage,1001),s=result.state;
    assert.equal(s.gold,567);assert.equal(s.level,7);assert.equal(s.maxStage,8);assert.equal(s.stage,4);
    assert.equal(s.equipment.hand.id,old.equipment.hand.id);assert.equal(s.equipment.hand.upgrade,3);
    assert.deepEqual(stats(s),before);assert.equal(s.map.topology,'linear');
    assert(version===1?result.migrated:result.mapRecovered);
  }
});

test('map reroll keeps permanent progression but resets the expedition',()=>{
  const s=createGame(1000,42);defeatEnemy(s,s.enemy,[],fixed);
  const gold=s.gold,kills=s.kills,items=JSON.stringify(s.inventory),run=s.runNumber;
  startExpedition(s,99);
  assert.equal(s.map.seed,99);assert.equal(s.map.progress,0);assert.equal(s.runNumber,run+1);
  assert.equal(s.gold,gold);assert.equal(s.kills,kills);assert.equal(JSON.stringify(s.inventory),items);
});

test('enemy and loot dossiers describe the current rules and escape names',()=>{
  const s=createGame(1000,42);s.enemy=s.enemies.find(e=>e.tier==='rare');s.enemy.name='<script>bad</script>';
  assert(enemyDetails(s).includes('&lt;script&gt;'));assert(!enemyDetails(s).includes('<script>'));
  assert(enemyDetails(s).includes('Guaranteed magic-or-better loot'));
  assert(expeditionOverview(s).includes('one winding trail'));
  const item=makeItem('hand',3,1,fixed);
  assert(itemAffixDetails(item,s).includes('Every fourth basic attack'));
  assert(itemAffixDetails(item,s).includes('If equipped'));
});
