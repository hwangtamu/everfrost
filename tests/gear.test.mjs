import test from 'node:test';
import assert from 'node:assert/strict';
import {GEAR,GEAR_SLOTS,implicitStats,implicitMarkup} from '../dist/gear.js';
import {createGame,makeItem,stats,equip,saveGame,loadGame,SAVE_KEY,dropItem,collectLoot} from '../dist/engine.js';
import {seededRandom} from '../dist/world.js';
import {craft,benchCraft} from '../dist/crafting.js';
import {normalizeLootFilter,matchesLootFilter} from '../dist/loot-filter.js';
import {lootFilterPanel} from '../dist/loot-filter-ui.js';

test('all nine slots roll proportional implicits within 5%, regardless of rarity',()=>{
 assert.deepEqual(GEAR_SLOTS,['head','neck','shoulder','chest','wrist','hand','belt','leg','foot']);
 const rng=seededRandom(42);
 for(const slot of GEAR_SLOTS)for(const level of [1,10,100,20001])for(let rarity=0;rarity<4;rarity++){
  const item=makeItem(slot,rarity,level,rng);
  for(const [stat,rate] of Object.entries(GEAR[slot].rates)){
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
 item.rarity=1;assert(benchCraft(s,item,'swiftness',1,()=>.4).ok);
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
 assert.equal(migrated.version,4);assert.deepEqual(Object.keys(migrated.equipment),GEAR_SLOTS);
 assert.equal(migrated.equipment.hand.id,'w');assert.equal(migrated.equipment.chest.id,'a');assert.equal(migrated.equipment.neck.id,'c');
 assert.equal(migrated.equipment.hand.upgrade,3);assert.equal(migrated.equipment.hand.affixes[0].value,3);
 assert.equal(migrated.inventory[0].slot,'chest');assert.equal(migrated.groundLoot[0].item.slot,'neck');
 assert.equal(migrated.lootFilter.slots.length,9);assert(collectLoot(migrated,'ground'));
 const base=structuredClone(migrated.equipment.hand.implicits);saveGame(migrated,storage,1000);
 const twice=loadGame(storage,1000).state;assert.deepEqual(twice.equipment.hand.implicits,base);
 assert.equal(twice.inventory.filter(i=>i.id==='ground').length,1);assert.equal(twice.groundLoot.length,0);
});

test('loot filters select each new slot and serialize nine independent choices',()=>{
 for(const slot of GEAR_SLOTS){
  const filter=normalizeLootFilter({slots:[slot]});
  for(const other of GEAR_SLOTS)assert.equal(matchesLootFilter(makeItem(other),filter),other===slot);
 }
 const panel=lootFilterPanel(createGame());
 assert.equal((panel.match(/name="slots"/g)||[]).length,9);
});
