import test from 'node:test';
import assert from 'node:assert/strict';
import {HERO_CLASSES,skillsFor,createGame,makeItem,stats,useSkill,chooseClass,teleportVillage,resumeExpedition,saveGame,loadGame,SAVE_KEY} from '../dist/engine.js';
import {WEAPON_TYPES,WEAPON_TYPE_IDS,gearDefinition} from '../dist/gear.js';
import {normalizeLootFilter,matchesLootFilter} from '../dist/loot-filter.js';
import {lootFilterPanel} from '../dist/loot-filter-ui.js';
import {equippedPanel,inventoryCard} from '../dist/inventory-ui.js';

const fixed=()=>.5;
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),data};};

test('four weapon types roll distinct bases and drive actual speed, range, critical, and elemental stats',()=>{
 assert.deepEqual(WEAPON_TYPE_IDS,['sword','greatsword','bow','staff']);
 const rolled=new Set([.01,.26,.51,.76].map(roll=>makeItem('hand',0,1,()=>roll).weaponType));
 assert.deepEqual([...rolled],WEAPON_TYPE_IDS);
 const items=Object.fromEntries(WEAPON_TYPE_IDS.map(type=>[type,makeItem('hand',0,10,fixed,type)]));
 for(const [type,item] of Object.entries(items)){
  assert.equal(item.weaponType,type);assert.equal(item.name,WEAPON_TYPES[type].name);
  assert.deepEqual(gearDefinition(item),WEAPON_TYPES[type]);
 }
 assert(items.greatsword.implicits.attack>items.sword.implicits.attack);
 const s=createGame(1000,42);
 s.equipment.hand=items.sword;const sword=stats(s);
 s.equipment.hand=items.greatsword;const greatsword=stats(s);
 s.equipment.hand=items.bow;const bow=stats(s);
 items.staff.affixes=[{id:'fire',tier:9,value:10,min:2,max:5}];s.equipment.hand=items.staff;const staff=stats(s);
 assert(greatsword.attack>sword.attack);assert(greatsword.attackSpeed<sword.attackSpeed);assert(greatsword.attackRange>sword.attackRange);
 assert(bow.attackRange>greatsword.attackRange);assert(bow.attackSpeed>sword.attackSpeed);assert(Math.abs(bow.crit-sword.crit-.04)<1e-9);
 assert.equal(staff.attackRange,WEAPON_TYPES.staff.attackRange);assert.equal(staff.fire,12);
});

test('Vanguard, Ranger, and Mage have distinct combat profiles and three active skills each',()=>{
 const s=createGame(1000,42),profiles={};
 for(const classId of Object.keys(HERO_CLASSES)){
  s.heroClass=classId;profiles[classId]=stats(s);
  const skills=skillsFor(s);assert.equal(skills.length,3);assert.deepEqual(skills.map(x=>x.key),['1','2','3']);assert(skills.every(x=>x.classId===classId));
 }
 assert(profiles.vanguard.maxHp>profiles.ranger.maxHp&&profiles.ranger.maxHp>profiles.mage.maxHp);
 assert(profiles.vanguard.defense>profiles.ranger.defense&&profiles.ranger.defense>profiles.mage.defense);
 assert(profiles.ranger.movementSpeed>profiles.vanguard.movementSpeed);assert(profiles.ranger.crit>profiles.vanguard.crit);
});

test('the Village trainer changes class, refreshes abilities, and preserves progression and gear',()=>{
 const s=createGame(1000,42),weapon=s.equipment.hand.id;s.level=8;s.gold=999;s.points=4;
 assert(!chooseClass(s,'ranger'));assert(teleportVillage(s));
 assert(chooseClass(s,'ranger'));assert.equal(s.heroClass,'ranger');assert.equal(s.equipment.hand.id,weapon);assert.equal(s.level,8);assert.equal(s.gold,999);assert.equal(s.points,4);
 assert(skillsFor(s).some(x=>x.id==='volley'));assert(!chooseClass(s,'bad'));assert(!chooseClass(s,'ranger'));
 assert(resumeExpedition(s));assert(!chooseClass(s,'mage'));
});

test('each class can use its own damage and recovery skills while other class skills stay unavailable',()=>{
 for(const [classId,damageId,healId] of [['vanguard','cleave','mend'],['ranger','volley','secondWind'],['mage','arcaneNova','manaWard']]){
  const s=createGame(1000,42);s.heroClass=classId;s.level=5;
  const enemy=s.enemies.find(e=>!e.boss);Object.assign(s.player,{x:enemy.x,y:enemy.y,path:[],manual:true});s.enemy=enemy;s.player.targetId=enemy.id;enemy.hp=enemy.maxHp=1e6;
  assert(useSkill(s,damageId,fixed).some(e=>e.type==='hit'),classId);
  s.hp=1;assert(useSkill(s,healId,fixed).some(e=>e.type==='heal'),classId);assert(s.hp>1);
  assert.equal(useSkill(s,classId==='vanguard'?'volley':'cleave',fixed).length,0);
 }
});

test('weapon type filters, inventory icons, and v5 save migration preserve older heroes',()=>{
 const bow=makeItem('hand',1,10,fixed,'bow'),staff=makeItem('hand',1,10,fixed,'staff');
 const filter=normalizeLootFilter({slots:['hand'],weaponTypes:['bow'],alwaysShowUnique:false});
 assert(matchesLootFilter(bow,filter));assert(!matchesLootFilter(staff,filter));
 const s=createGame(1000,42);s.inventory=[bow,staff];s.lootFilter=filter;
 assert(inventoryCard(bow,s).includes('<svg'));assert(equippedPanel({...s,heroClass:'ranger'}).includes('RANGER'));
 const filterUi=lootFilterPanel(s);assert.equal((filterUi.match(/name="weaponTypes"/g)||[]).length,4);assert(filterUi.includes('Two-hand melee'));
 const old=createGame(1000,42);old.version=5;delete old.heroClass;delete old.equipment.hand.weaponType;old.inventory.forEach(item=>delete item.weaponType);
 const storage=memory();storage.setItem(SAVE_KEY,JSON.stringify(old));const restored=loadGame(storage,1000);
 assert(!restored.recovered);assert.equal(restored.state.version,6);assert.equal(restored.state.heroClass,'vanguard');assert.equal(restored.state.equipment.hand.weaponType,'sword');
 saveGame(restored.state,storage,1000);assert.equal(loadGame(storage,1000).state.equipment.hand.weaponType,'sword');
});
