import {GEAR_SLOTS} from '../dist/gear.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateMap,findPath,walkable,seededRandom,distance} from '../dist/world.js';
import {createGame,tick,stats,startExpedition,defeatEnemy,effectiveDamage,activeAuras,hurtHero,useSkill,movePlayer,saveGame,loadGame,SAVE_KEY,makeItem,makeEnemy,collectLoot} from '../dist/engine.js';
import {AFFIXES,rollAffixes,lootRarity,UNIQUE_EFFECTS,uniquesForSlot,uniqueBonuses} from '../dist/loot.js';
import {MODIFIERS} from '../dist/monsters.js';
import {enemyDossier,itemDetail} from '../dist/panels.js';

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
  s.level=3;s.equipment.neck=makeItem('neck',3,1,fixed);s.equipment.neck.unique='wildheart';s.hp=1;s.effects.chill=3;
  useSkill(s,'mend',fixed);assert.equal(s.effects.chill,0);assert.equal(s.hp,1+stats(s).maxHp*.5);
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
  assert(enemyDossier(s).includes('&lt;script&gt;'));assert(!enemyDossier(s).includes('<script>'));
  for(const mod of s.enemy.modifiers)assert(enemyDossier(s).includes(MODIFIERS[mod].name));
  const item=makeItem('hand',3,1,fixed);
  const esc=t=>t.replace(/’/g,'’').replace(/'/g,'&#39;');
  assert(itemDetail(s,item).includes(esc(UNIQUE_EFFECTS[item.unique].description)));
  assert(itemDetail(s,item).includes('vs hand'));assert(itemDetail(s,item).includes('data-act="equip"'));
  assert(!itemDetail(s,item,{equipped:true}).includes('data-act="salvage"'));
});

// Bare unique item: no implicits or affixes, so assertions isolate the power.
const uniq=(slot,key,itemLevel=10)=>({id:`u-${key||'none'}-${slot}`,slot,rarity:3,name:key?UNIQUE_EFFECTS[key].name+' '+slot:slot,itemLevel,implicits:{},upgrade:0,affixes:[],unique:key});
// Starting hand/chest roll with Math.random, so paired states must be normalized first.
const clearGear=g=>{g.equipment=Object.fromEntries(GEAR_SLOTS.map(slot=>[slot,null]));return g;};

test('unique items roll a slot-appropriate power and apply their stats',()=>{
  const rng=seededRandom(7),seen=new Set();
  for(const slot of GEAR_SLOTS){
    const pool=uniquesForSlot(slot);
    assert(pool.length>=2,`${slot} should offer multiple unique powers`);
    for(let i=0;i<40;i++){
      const it=makeItem(slot,3,10,rng);
      assert(pool.some(u=>u.id===it.unique));seen.add(it.unique);
      assert(it.name.startsWith(UNIQUE_EFFECTS[it.unique].name));
    }
  }
  assert(seen.size>=12);

  const s=clearGear(createGame(1000,42)),base=stats(s);
  s.equipment.neck=uniq('neck','tempestEye');
  s.equipment.leg=uniq('leg','titanplate');
  s.equipment.foot=uniq('foot','windrunner');
  assert.equal(uniqueBonuses([s.equipment.neck]).resist,15);
  assert.equal(stats(s).resist,base.resist+15);
  assert.equal(stats(s).crit,base.crit+.08);
  assert.equal(stats(s).defense,base.defense+20);assert.equal(stats(s).maxHp,base.maxHp+60);
  assert(Math.abs(stats(s).movementSpeed-base.movementSpeed*1.45)<1e-9);
});

test('mechanical unique powers change combat outcomes',()=>{
  // Damage-taken reductions.
  const s=createGame(1000,42);s.hp=1000;
  s.equipment.chest=uniq('chest',null);
  const phys=hurtHero(s,100,'physical');
  s.equipment.chest.unique='stoneheart';
  assert(Math.abs(hurtHero(s,100,'physical')-phys*.88)<1e-9);
  s.equipment.chest.unique=null;s.equipment.foot=uniq('foot','emberwalk');
  assert.equal(hurtHero(s,100,'fire'),80);

  // Soulgorge: a kill grants a 6-second speed buff that decays.
  const t=createGame(1000,7);t.equipment.belt=uniq('belt','soulgorge');
  const aspd=stats(t).attackSpeed;
  defeatEnemy(t,t.enemies.find(e=>e.tier==='normal'),[],fixed);
  assert(t.effects.soulgorge>0);assert(stats(t).attackSpeed>aspd);
  t.auto=false;for(let i=0;i<14;i++)tick(t,.5,fixed);
  assert(!t.effects.soulgorge);

  // Gravebind: kills restore extra health (identical states, no level-up).
  const g1=clearGear(createGame(1000,9)),g2=clearGear(createGame(1000,9));g1.level=g2.level=50;
  g2.equipment.belt=uniq('belt','gravebind');
  g1.hp=g2.hp=stats(g1).maxHp/2;
  defeatEnemy(g1,g1.enemies.find(e=>e.tier==='normal'),[],fixed);
  defeatEnemy(g2,g2.enemies.find(e=>e.tier==='normal'),[],fixed);
  assert(Math.abs(g2.hp-g1.hp-stats(g1).maxHp*.06)<1e-9);

  // Sage's Crown: cooldowns recover faster.
  const c1=createGame(1000,5),c2=createGame(1000,5);c1.auto=c2.auto=false;c1.level=c2.level=5;
  c2.equipment.head=uniq('head','sagesCrown');
  useSkill(c1,'mend',fixed);useSkill(c2,'mend',fixed);
  for(let i=0;i<10;i++){tick(c1,.1,fixed);tick(c2,.1,fixed);}
  assert(c1.cooldowns.mend-c2.cooldowns.mend>.29);

  // Stormbrand and Executioner's Oath: strikes hit harder.
  const a=clearGear(createGame(1000,17)),b=clearGear(createGame(1000,17));
  a.equipment.hand=uniq('hand',null);b.equipment.hand=uniq('hand','stormbrand');
  for(const g of [a,b]){const e=g.enemies.find(x=>x.tier==='normal');e.x=g.player.x+1;e.y=g.player.y;e.maxHp=e.hp=1e5;g.enemies=[e];}
  useSkill(a,'cleave',fixed);useSkill(b,'cleave',fixed);
  assert(1e5-b.enemies[0].hp>1e5-a.enemies[0].hp);
  const d=clearGear(createGame(1000,23)),x=clearGear(createGame(1000,23));
  d.equipment.hand=uniq('hand',null);x.equipment.hand=uniq('hand','executioner');
  for(const g of [d,x]){const e=g.enemies.find(y=>y.tier==='normal');e.x=g.player.x+1;e.y=g.player.y;e.maxHp=1e5;e.hp=3e4;g.enemies=[e];}
  useSkill(d,'cleave',fixed);useSkill(x,'cleave',fixed);
  assert(3e4-x.enemies[0].hp>(3e4-d.enemies[0].hp)*1.5);

  // Ironstride: chilling attackers cannot chill you. Spikeward reflects.
  const h1=clearGear(createGame(1000,11)),h2=clearGear(createGame(1000,11));
  h2.equipment.leg=uniq('leg','ironstride');
  const r1=clearGear(createGame(1000,13)),r2=clearGear(createGame(1000,13));
  r2.equipment.shoulder=uniq('shoulder','spikeward');
  for(const g of [h1,h2]){
    const e=makeEnemy(g,'normal',{x:g.player.x+1,y:g.player.y},g.map.rooms[0].id,fixed,['chilling']);
    e.maxHp=e.hp=1e6;e.baseDamage=1;g.enemies=[e];
  }
  for(const g of [r1,r2]){
    const e=makeEnemy(g,'normal',{x:g.player.x+1,y:g.player.y},g.map.rooms[0].id,fixed,[]);
    e.maxHp=e.hp=1e6;e.baseDamage=20;g.enemies=[e];
  }
  for(let i=0;i<40;i++){tick(h1,.1,fixed);tick(h2,.1,fixed);tick(r1,.1,fixed);tick(r2,.1,fixed);}
  assert(h1.effects.chill>0);assert(!h2.effects.chill);
  assert(r2.enemies[0].hp<r1.enemies[0].hp);
});
