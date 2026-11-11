import test from 'node:test';
import assert from 'node:assert/strict';
import {GEAR,GEAR_SLOTS,BASES,baseOf,baseBonuses,implicitStats,implicitMarkup} from '../dist/gear.js';
import {createGame,makeItem,stats,equip,saveGame,loadGame,SAVE_KEY,dropItem,collectLoot} from '../dist/engine.js';
import {seededRandom} from '../dist/world.js';
import {craft,benchCraft} from '../dist/crafting.js';
import {normalizeLootFilter,matchesLootFilter} from '../dist/loot-filter.js';
import {salvage,salvageGold,merge} from '../dist/engine.js';
import {AFFIXES,UNIQUE_EFFECTS,uniquesForSlot,uniqueBonuses} from '../dist/loot.js';
import {paperDoll,bagPanel,itemDetail,itemTile,inventoryItems,salvageCandidates,lootFilterForm} from '../dist/panels.js';

test('44 unique items double each slot pool and all remain obtainable and saveable',()=>{
 const definitions=Object.values(UNIQUE_EFFECTS),items=new Map();
 assert.equal(definitions.length,44);
 assert.equal(new Set(definitions.map(u=>u.name)).size,44);
 for(const [id,u] of Object.entries(UNIQUE_EFFECTS))assert.equal(id,u.id);
 for(const slot of GEAR_SLOTS){
  const pool=uniquesForSlot(slot);
  assert.equal(pool.length,['hand','neck'].includes(slot)?6:4,slot);
  for(const [index,u] of pool.entries()){
   const item=makeItem(slot,3,10,()=>(index+.5)/pool.length);
   assert.equal(item.unique,u.id);assert(item.name.startsWith(u.name));
   items.set(u.id,item);
   if(u.stats){
    const expected=Object.fromEntries(Object.entries(u.stats).map(([key,value])=>[key,Math.round((typeof value==='number'?value:value.perLevel*10)*10)/10]));
    assert.deepEqual(uniqueBonuses([item]),expected,u.id);
    const s=createGame();s.equipment=Object.fromEntries(GEAR_SLOTS.map(slot=>[slot,null]));
    const base=stats(s);s.equipment[slot]={...item,affixes:[],implicits:{}};
    const p=stats(s),fields={haste:'haste',movement:'movementSpeed',reach:'attackRange',critical:'crit',criticalMultiplier:'critMultiplier'};
    for(const key of Object.keys(expected))assert(p[fields[key]||key]>base[fields[key]||key],`${u.id}: ${key}`);
   }
  }
 }
 assert.equal(items.size,44);
 const s=createGame(1000,42);s.auto=false;s.inventory=[...items.values()];
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert(saveGame(s,storage,1000));const loaded=loadGame(storage,1000);
 assert(!loaded.recovered);assert.deepEqual(loaded.state.inventory,s.inventory);
});

test('inventory cleanup respects filters and protects valuable or upgraded gear',()=>{
 const s=createGame();s.inventory=[];
 for(const slot of ['hand','leftRing','rightRing'])for(let rarity=0;rarity<4;rarity++)s.inventory.push(makeItem(slot,rarity,10,()=>.5));
 const upgraded=makeItem('leftRing',1,20,()=>.5);upgraded.upgrade=1;s.inventory.push(upgraded);
 const before=structuredClone(s.inventory),gold=s.gold,candidates=salvageCandidates(s,'rings');
 assert.equal(candidates.length,4);assert(candidates.every(i=>i.slot.endsWith('Ring')&&i.rarity<2&&!i.upgrade));
 assert.equal(inventoryItems(s,'rings').length,9);
 assert.equal(inventoryItems(s,'all','level')[0].id,upgraded.id);
 assert.equal(inventoryItems(s,'all','rarity')[0].rarity,3);
 assert.deepEqual(s.inventory,before);
 const ids=candidates.map(i=>i.id),value=candidates.reduce((n,i)=>n+salvageGold(i),0);
 const late=makeItem('leftRing',0,10,()=>.5);s.inventory.push(late);
 for(const id of ids)assert(salvage(s,id));
 assert(s.inventory.includes(late));assert(s.inventory.includes(upgraded));
 assert.equal(s.gold,gold+value);assert.equal(s.inventory.filter(i=>i.rarity>=2).length,6);
 assert(salvageCandidates(s,'head').length===0);
});

test('equipment and inventory panels expose accessible inspection and cleanup controls',()=>{
 const s=createGame();const ring=makeItem('leftRing',1,10,()=>.5);ring.name='<script>unsafe</script>';s.inventory=[ring];
 const ui={bagFilter:'rings',bagSort:'level'};
 const doll=paperDoll(s),panel=bagPanel(s,ui),card=itemDetail(s,ring),tile=itemTile(ring);
 assert.equal((doll.match(/<button /g)||[]).length,11);
 assert.equal((doll.match(/data-act="empty-slot"/g)||[]).length,9);assert.equal((doll.match(/data-act="equipped"/g)||[]).length,2);
 assert(!doll.includes('data-act="salvage"'));assert(!card.includes('<script>'));assert(!tile.includes('<script>'));
 assert(card.includes('&lt;script&gt;'));assert(card.includes('data-slot="leftRing"'));assert(card.includes('data-slot="rightRing"'));
 assert(card.includes('data-act="salvage" data-arg="'+ring.id+'"'));assert(tile.includes('aria-label="&lt;script&gt;'));
 assert(panel.includes('value="level" selected'));assert(panel.includes('data-act="salvage-junk"'));
 assert(panel.includes('Salvage 1 ·'));assert(panel.includes('data-act="item" data-arg="'+ring.id+'"'));
 assert(!bagPanel(s,{bagFilter:'head',bagSort:'recent'}).includes('data-act="item"'));
 s.inventory=[];assert(bagPanel(s,{bagFilter:'all',bagSort:'recent'}).includes('Nothing here yet'));
});

test('rings fit either finger, contribute stats, craft and survive a save',()=>{
 const s=createGame(1000,42);s.auto=false;s.gold=10000;
 const left=makeItem('leftRing',0,10,()=>.5,'band'),right=makeItem('rightRing',3,10,()=>.5,'band');
 const base=stats(s);s.inventory=[left,right];
 assert(equip(s,left.id,'rightRing'));assert.equal(left.slot,'rightRing');
 assert(equip(s,right.id,'leftRing'));assert.equal(right.slot,'leftRing');
 assert(stats(s).attack>base.attack);assert(stats(s).maxHp>base.maxHp);
 assert(!equip(s,s.equipment.hand.id,'leftRing'));
 const other=makeItem('leftRing',1,10,()=>.5);s.inventory.push(other);
 assert(!equip(s,other.id,'head'));assert(s.inventory.includes(other));
 assert(equip(s,other.id,'rightRing'));assert(s.inventory.includes(left));
 assert(benchCraft(s,left,'might',5,()=>.5).ok===false);
 s.orbs.alchemy=1;assert(craft(s,left,'alchemy',()=>.5).ok);
 assert(left.affixes.every(a=>AFFIXES[a.id].slots.includes(left.slot)));
 s.inventory.push(...Array.from({length:3},()=>makeItem('leftRing',2,10,()=>.5)));
 assert(merge(s,'leftRing',2).unique);
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 saveGame(s,storage,1000);const loaded=loadGame(storage,1000);
 assert(!loaded.recovered);assert.deepEqual(loaded.state.equipment,s.equipment);
 assert.deepEqual(loaded.state.inventory,s.inventory);
});

test('old all-slot filters include rings, while custom filters remain restricted',()=>{
 for(const custom of [false,true]){
  const s=createGame(1000,42);s.auto=false;
  delete s.equipment.leftRing;delete s.equipment.rightRing;
  s.lootFilter.slots=custom?['hand']:Object.keys(s.equipment);
  const before=structuredClone(s.equipment);
  const loaded=loadGame({getItem:()=>JSON.stringify(s)},1000);
  assert(!loaded.recovered);assert.equal(loaded.state.equipment.leftRing,null);assert.equal(loaded.state.equipment.rightRing,null);
  for(const slot in before)assert.deepEqual(loaded.state.equipment[slot],before[slot]);
  assert.equal(matchesLootFilter(makeItem('leftRing'),loaded.state.lootFilter),!custom);
 }
});

test('salvage pays once and cannot remove equipped gear',()=>{
 const s=createGame();const item=makeItem('rightRing',1,10,()=>.5);s.inventory=[item];
 const gold=s.gold;assert(salvage(s,item.id));assert.equal(s.gold,gold+salvageGold(item));
 assert(!salvage(s,item.id));assert(!salvage(s,s.equipment.hand.id));
 assert.equal(s.gold,gold+salvageGold(item));
});

test('duplicate unique ring powers use only the strongest item-level bonus',()=>{
 const a=makeItem('leftRing',3,10,()=>0),b=makeItem('rightRing',3,20,()=>0);
 assert.equal(a.unique,b.unique);
 assert.deepEqual(uniqueBonuses([a,b]),uniqueBonuses([b]));
});

test('all eleven slots roll proportional implicits within 5%, regardless of rarity',()=>{
 assert.deepEqual(GEAR_SLOTS,['head','neck','shoulder','chest','wrist','hand','belt','leg','foot','leftRing','rightRing']);
 const rng=seededRandom(42);
 for(const slot of GEAR_SLOTS)for(const level of [1,10,100,20001])for(let rarity=0;rarity<4;rarity++){
  const item=makeItem(slot,rarity,level,rng);
  assert(BASES[slot].some(b=>b.id===item.base));assert.deepEqual(Object.keys(item.implicits),Object.keys(baseOf(item).rates));
  for(const [stat,rate] of Object.entries(baseOf(item).rates)){
   assert(item.implicits[stat]>=Math.round(rate*level*.95*10)/10);
   assert(item.implicits[stat]<=Math.round(rate*level*1.05*10)/10);
  }
  assert.equal(item.power,undefined);
  assert.deepEqual(makeItem(slot,rarity,level,()=>.5).implicits,makeItem(slot,0,level,()=>.5).implicits);
  assert.match(implicitMarkup(item),/Implicit base stats/);
 }
 const a=makeItem('hand',0,10,()=>.5),b=makeItem('hand',0,20,()=>.5);
 assert.equal(b.implicits.attack,a.implicits.attack*2);
});

test('each equipment slot contributes every implicit to live combat and swaps conserve items',()=>{
 const s=createGame();s.equipment=Object.fromEntries(GEAR_SLOTS.map(slot=>[slot,null]));s.inventory=[];
 const before=stats(s),totals={attack:0,defense:0,maxHp:0};
 for(const slot of GEAR_SLOTS){
  const item=makeItem(slot,0,10,()=>.5);item.upgrade=2;s.inventory.push(item);
  for(const [stat,value] of Object.entries(implicitStats(item)))totals[stat]+=value;
  assert(equip(s,item.id));assert.equal(s.equipment[slot].id,item.id);
 }
 for(const stat of Object.keys(totals))assert(Math.abs(stats(s)[stat]-before[stat]-totals[stat])<1e-8);
 assert.equal(s.inventory.length,0);
});

test('explicit crafting leaves the rolled base and upgrade rank unchanged',()=>{
 const s=createGame();s.gold=1e8;s.orbs={alchemy:1,divine:1,scour:1};
 const item=makeItem('foot',0,20,()=>.73);item.upgrade=3;
 const original=structuredClone(item.implicits);
 assert(craft(s,item,'alchemy',()=>.3).ok);
 assert(craft(s,item,'divine',()=>.9).ok);
 assert(craft(s,item,'scour').ok);
 item.rarity=1;assert(benchCraft(s,item,'swiftness',4,()=>.4).ok);
 assert.deepEqual(item.implicits,original);assert.equal(item.upgrade,3);
});

test('v2 equipped gear, inventory, ground loot and category filters migrate once without item loss',()=>{
 const s=createGame(1000,42);s.version=2;s.auto=false;
 const legacy=(slot,id)=>({id,name:'Old '+slot,slot,rarity:1,itemLevel:12,power:40,upgrade:3,affixes:[{id:'might',tier:5,value:3,min:2,max:4}],unique:null});
 s.equipment={weapon:legacy('weapon','w'),armor:legacy('armor','a'),charm:legacy('charm','c')};
 s.inventory=[legacy('armor','bag')];const ground=legacy('charm','ground');
 s.groundLoot=[{id:ground.id,item:ground,...s.map.entrance,age:0}];
 s.lootFilter={slots:['weapon','armor','charm']};
 const data=new Map([[SAVE_KEY,JSON.stringify(s)]]),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const loaded=loadGame(storage,1000);assert(!loaded.recovered);const migrated=loaded.state;
 assert.equal(migrated.version,5);assert.deepEqual(Object.keys(migrated.equipment),GEAR_SLOTS);
 assert.equal(migrated.equipment.hand.id,'w');assert.equal(migrated.equipment.chest.id,'a');assert.equal(migrated.equipment.neck.id,'c');
 assert.equal(migrated.equipment.hand.upgrade,3);assert.equal(migrated.equipment.hand.affixes[0].value,3);
 assert.equal(migrated.inventory[0].slot,'chest');assert.equal(migrated.groundLoot[0].item.slot,'neck');
 assert.equal(migrated.lootFilter.slots.length,11);assert(collectLoot(migrated,'ground'));
 const base=structuredClone(migrated.equipment.hand.implicits);saveGame(migrated,storage,1000);
 const twice=loadGame(storage,1000).state;assert.deepEqual(twice.equipment.hand.implicits,base);
 assert.equal(twice.inventory.filter(i=>i.id==='ground').length,1);assert.equal(twice.groundLoot.length,0);
});

test('loot filters select each new slot and serialize eleven independent choices',()=>{
 for(const slot of GEAR_SLOTS){
  const filter=normalizeLootFilter({slots:[slot]});
  for(const other of GEAR_SLOTS)assert.equal(matchesLootFilter(makeItem(other),filter),other===slot);
 }
 const panel=lootFilterForm(createGame());
 assert.equal((panel.match(/name="slots"/g)||[]).length,11);
});
