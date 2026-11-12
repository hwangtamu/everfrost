import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,offlineRewards,stats,combatStats,tick,useSkill,usePotion,hurtHero,makeEnemy,gainXp,xpRequired,learn,saveGame,loadGame,SAVE_KEY,travel,armorReduction,enemyBaseLife,enemyBaseDamage,claimQuest,QUESTS,POTION_KILLS,defeatEnemy} from '../dist/engine.js';
import {SKILLS,SKILL_SLOTS,MAX_SKILL_RANK,RUNE_RANK,skillRank,skillParams,investSkill,chooseRune,slotSkill,resetSkills,activeRune} from '../dist/skills.js';
import {TREE_NODES,TREE_BY_ID,allocate,canAllocate,respec,respecCost,treeBonuses,normalizeTree} from '../dist/tree.js';
import {heroPanel,bagPanel,skillsPanel,treePanel,forgePanel,worldPanel,lootFilterForm,offlineSummary,helpContent,enemyDossier,bestComparison,isUpgrade} from '../dist/panels.js';

const fixed=()=>.6;
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
function arena(count=4,level=30){
  const s=createGame(1000,42);s.level=level;
  for(let y=10;y<=22;y++)for(let x=13;x<=28;x++)s.map.tiles[y*s.map.width+x]=1;
  Object.assign(s.player,{x:20.5,y:16.5,manual:true,path:[]});
  const boss=s.enemies.find(e=>e.boss);
  s.enemies=Array.from({length:count},(_,i)=>{const e=makeEnemy(s,'normal',{x:21.5+(i%2),y:16.5+Math.floor(i/2)},s.map.route[0],fixed,[]);e.hp=e.maxHp=1e6;e.baseDamage=0;e.awakened=true;return e;});
  s.enemies.push(boss);s.enemy=s.enemies[0];s.player.targetId=s.enemy.id;
  s.mana=stats(s).maxMana;s.hp=stats(s).maxHp;
  return s;
}

test('the passive tree is one connected graph with six keystones',()=>{
  assert.equal(TREE_NODES.length,61);
  const seen=new Set(['start']),queue=['start'];
  while(queue.length)for(const l of TREE_BY_ID[queue.pop()].links)if(!seen.has(l)){seen.add(l);queue.push(l);}
  assert.equal(seen.size,TREE_NODES.length);
  assert.equal(TREE_NODES.filter(n=>n.type==='keystone').length,6);
  for(const n of TREE_NODES){assert(n.links.length>=1);for(const l of n.links)assert(TREE_BY_ID[l].links.includes(n.id));assert(n.description.length>3);}
  const positions=new Set(TREE_NODES.map(n=>n.x+','+n.y));assert.equal(positions.size,TREE_NODES.length);
});

test('passives must connect, change real stats, and respec refunds for gold',()=>{
  const s=createGame(1000,42);s.points=4;const before=stats(s);
  assert(!canAllocate(s,'guard-1'));assert(!allocate(s,'guard-n'));
  assert(allocate(s,'guard-0'));assert(allocate(s,'guard-1'));assert(allocate(s,'guard-2'));
  const after=stats(s);
  assert.equal(after.maxHp,Math.round(Math.round(before.maxHp*1.1*10)/10));assert(after.defense>before.defense);
  assert(!allocate(s,'guard-0'),'already owned');assert.equal(s.points,1);
  assert.deepEqual(treeBonuses(s),{lifePct:10,defensePct:10});
  const cost=respecCost(s);s.gold=cost-1;assert(!respec(s));s.gold=cost;assert(respec(s));
  assert.equal(s.gold,0);assert.equal(s.points,4);assert.deepEqual(s.tree,[]);assert.equal(stats(s).maxHp,before.maxHp);
  assert.deepEqual(normalizeTree(['guard-1','guard-0','nope','war-3','guard-0']),['guard-0','guard-1']);
});

test('keystones trade one strength for another',()=>{
  const base=arena(),berserk=arena(),stone=arena(),blood=arena();
  berserk.tree=['war-0','war-1','war-2','war-n','war-3','war-4','war-k'];
  stone.tree=['guard-0','guard-1','guard-2','guard-n','guard-3','guard-4','guard-k'];
  blood.tree=['myst-0','myst-1','myst-2','myst-n','myst-3','myst-4','myst-k'];
  assert(Math.abs(stats(berserk).damageMore-1.35)<1e-9);assert(Math.abs(stats(berserk).damageTaken-1.15)<1e-9);
  assert(combatStats(berserk).dps>combatStats(base).dps*1.5);
  const a=hurtHero(base,50,'fire'),b=hurtHero(berserk,50,'fire'),c=hurtHero(stone,50,'fire');
  assert(b>a&&c<a);
  const hp=blood.hp,mana=blood.mana;assert(useSkill(blood,'cleave',fixed).length);
  assert.equal(blood.mana,mana);assert(blood.hp<hp,'Blood Rite spends health');
});

test('skills unlock by level, cost mana, and rank up with points',()=>{
  const s=arena(4,1);
  assert.equal(skillRank(s,'cleave'),1);assert.equal(skillRank(s,'mend'),0);
  const mana=s.mana;assert(useSkill(s,'cleave',fixed).some(e=>e.type==='hit'));
  assert.equal(s.mana,mana-6);assert.equal(s.cooldowns.cleave,3);
  s.mana=2;s.cooldowns.cleave=0;assert.equal(useSkill(s,'cleave',fixed).length,0,'not enough mana');
  assert(!investSkill(s,'cleave'),'no points');s.skillPoints=20;
  assert(!investSkill(s,'storm'),'locked skills cannot be ranked');
  const low=skillParams(s,'cleave').mult;for(let i=0;i<20;i++)investSkill(s,'cleave');
  assert.equal(skillRank(s,'cleave'),MAX_SKILL_RANK);assert.equal(s.skillPoints,11);
  assert(Math.abs(skillParams(s,'cleave').mult/low-(1+.12*9))<1e-9);
  assert.equal(resetSkills(s),9);assert.equal(s.skillPoints,20);assert.equal(skillRank(s,'cleave'),1);
});

test('runes need rank four and reshape the skill',()=>{
  const s=arena(4,30);s.skillPoints=10;
  assert(!chooseRune(s,'cleave','rending'));
  for(let i=1;i<RUNE_RANK;i++)investSkill(s,'cleave');
  const before=skillParams(s,'cleave',1.9);
  assert(!chooseRune(s,'cleave','static'));assert(chooseRune(s,'cleave','sweeping'));
  assert.equal(activeRune(s,'cleave').id,'sweeping');assert.equal(skillParams(s,'cleave',1.9).radius,before.radius+1.2);
  useSkill(s,'cleave',fixed);assert(s.enemies[0].chilled>0);
  chooseRune(s,'cleave','rending');assert(Math.abs(skillParams(s,'cleave',1.9).mult/before.mult-1.4)<1e-9);
});

test('four slots hold distinct skills and swapping keeps them unique',()=>{
  const s=arena(4,30);
  assert.deepEqual(s.skills.slots,['cleave','mend','storm','leap']);
  assert(slotSkill(s,0,'whirl'));assert.deepEqual(s.skills.slots,['whirl','mend','storm','leap']);
  assert(slotSkill(s,3,'whirl'),'moving a slotted skill swaps');assert.deepEqual(s.skills.slots,['leap','mend','storm','whirl']);
  assert(!slotSkill(s,SKILL_SLOTS,'cleave'));assert(!slotSkill(s,0,'nope'));
  s.level=1;assert(!slotSkill(s,0,'meteor'),'locked');
  assert.equal(useSkill(s,'cleave',fixed).length,0,'unslotted skills cannot be cast');
});

test('every skill does what it says',()=>{
  const s=arena(4,30);s.skills.slots=['leap','whirl','warcry','ward'];for(const id in s.skills.auto)s.skills.auto[id]=false;
  s.enemies[0].x=26.5;s.enemy=s.enemies[0];
  assert(useSkill(s,'leap',fixed).some(e=>e.type==='hit'));assert(Math.hypot(s.player.x-26.5,s.player.y-16.5)<1.01);assert(s.enemies[0].chilled>0);
  const hp0=s.enemies[0].hp;assert(useSkill(s,'whirl',fixed).length);for(let i=0;i<10;i++)tick(s,.1,fixed);
  assert(s.effects.whirl>0);assert(s.enemies[0].hp<hp0);
  const dps=combatStats(s).dps;assert(useSkill(s,'warcry',fixed).length);assert(combatStats(s).dps>dps*1.5);
  assert(useSkill(s,'ward',fixed).length);const before=s.hp;hurtHero(s,40,'fire');assert.equal(s.hp,before,'the ward absorbs the hit');
  s.skills.slots=['meteor','mend','storm','cleave'];s.mana=999;
  const target=s.enemy.hp;assert(useSkill(s,'meteor',fixed).length);assert.equal(s.enemy.hp,target,'the star takes a moment to land');
  for(let i=0;i<9;i++)tick(s,.1,fixed);assert(s.enemy.hp<target);
});

test('auto-cast spends mana on packs, heals when hurt, and respects the toggle',()=>{
  const s=arena(4,30);s.attackTimer=-99;
  const events=tick(s,.1,fixed);assert(events.some(e=>e.type==='skill'));
  const off=arena(4,30);off.attackTimer=-99;for(const id in off.skills.auto)off.skills.auto[id]=false;
  for(let i=0;i<20;i++)assert(!tick(off,.1,fixed).some(e=>e.type==='skill'));
  const hurt=arena(1,30);hurt.attackTimer=-99;hurt.hp=stats(hurt).maxHp*.4;
  let healed=false;for(let i=0;i<10;i++)healed||=tick(hurt,.1,fixed).some(e=>e.type==='skill'&&e.id==='mend');assert(healed);
});

test('basic attacks splash onto neighbors of the target',()=>{
  const s=arena(4,30);for(const id in s.skills.auto)s.skills.auto[id]=false;s.attackTimer=10;
  const hits=tick(s,.1,()=>.99).filter(e=>e.type==='hit');
  assert.equal(hits.length,4);assert.equal(hits.filter(e=>e.splash).length,3);
  assert(Math.abs(hits.find(e=>e.splash).value-hits.find(e=>!e.splash).value*.5)<=1);
});

test('potions heal, recharge from kills, and fire automatically at low health',()=>{
  const s=arena(1,30),p=stats(s);
  assert(!usePotion(s),'full health');s.hp=p.maxHp*.5;
  assert(usePotion(s));assert.equal(s.hp,p.maxHp*.9);assert.equal(s.potion.charges,2);
  s.hp=1;assert(!usePotion(s),'brief lockout');s.potion.lock=0;
  s.potion.charges=0;assert(!usePotion(s));
  s.potion.progress=POTION_KILLS-1;defeatEnemy(s,s.enemies[0],[],fixed);assert.equal(s.potion.charges,1);
  const auto=arena(1,30);auto.hp=stats(auto).maxHp*.2;auto.skills.auto.mend=false;
  assert(tick(auto,.1,fixed).some(e=>e.type==='potion'));
  const manual=arena(1,30);manual.settings.autoPotion=false;manual.hp=stats(manual).maxHp*.2;manual.skills.auto.mend=false;
  assert(!tick(manual,.1,fixed).some(e=>e.type==='potion'));
});

test('armor mitigates proportionally and enemies outscale raw levels',()=>{
  assert.equal(armorReduction(0,10),0);assert(armorReduction(100,10)>armorReduction(100,100));assert(armorReduction(1e9,1)<=.85);
  assert(enemyBaseLife(1)<40);assert(enemyBaseLife(50)/enemyBaseLife(25)>4);assert(enemyBaseDamage(50)/enemyBaseDamage(25)>3);
});

test('falling twice on a map retreats one stage and turns auto-advance off',()=>{
  const s=createGame(1000,42);s.maxStage=6;travel(s,6);
  const kill=()=>{s.hp=0;return tick(s,.1,fixed);};
  let events=kill();assert(events.some(e=>e.type==='death'));assert.equal(s.stage,6);assert(s.auto);assert.equal(s.hp,stats(s).maxHp);
  events=kill();assert(events.some(e=>e.type==='retreat'));assert.equal(s.stage,5);assert.equal(s.advance,false);assert.equal(s.maxStage,6);
  s.stage=1;s.deathStreak=1;s.hp=0;tick(s,.1,fixed);assert.equal(s.stage,1,'stage one never retreats');
});

test('leveling grants both point types and announces new skills',()=>{
  const s=createGame(1000,42),events=[];
  gainXp(s,xpRequired(1)+xpRequired(2),events);
  assert.equal(s.level,3);assert.equal(s.points,2);assert.equal(s.skillPoints,2);
  assert(events.some(e=>e.type==='unlock'&&e.skill==='mend'));assert.equal(s.mana,stats(s).maxMana);
});

test('builds survive a save, and corrupt build data is repaired',()=>{
  const storage=memory(),s=createGame(1000,42);s.level=20;s.points=15;s.skillPoints=10;
  allocate(s,'sin-0');allocate(s,'sin-1');for(let i=0;i<4;i++)investSkill(s,'cleave');chooseRune(s,'cleave','rending');
  slotSkill(s,2,'whirl');s.skills.auto.mend=false;s.potion.charges=1;saveGame(s,storage);
  const t=loadGame(storage,s.lastSave).state;
  assert.deepEqual(t.tree,['sin-0','sin-1']);assert.equal(t.points,13);assert.equal(t.skillPoints,6);
  assert.equal(skillRank(t,'cleave'),5);assert.equal(activeRune(t,'cleave').id,'rending');
  assert.equal(t.skills.slots[2],'whirl');assert.equal(t.skills.auto.mend,false);assert.equal(t.potion.charges,1);
  const bad=JSON.parse(storage.getItem(SAVE_KEY));
  bad.tree=['war-k','sin-0','sin-0'];bad.points=999;bad.skillPoints=999;bad.skills={ranks:{cleave:99,nope:3},slots:['cleave','cleave','x'],runes:{cleave:'static'}};
  storage.setItem(SAVE_KEY,JSON.stringify(bad));const fixedUp=loadGame(storage,s.lastSave).state;
  assert.deepEqual(fixedUp.tree,['sin-0']);assert.equal(fixedUp.points,18);
  assert.equal(skillRank(fixedUp,'cleave'),MAX_SKILL_RANK);assert.equal(fixedUp.skillPoints,10);
  assert.deepEqual(fixedUp.skills.slots,['cleave','mend','storm','leap']);assert.equal(activeRune(fixedUp,'cleave'),null);
});

test('version 4 heroes get every mastery point back for the new systems',()=>{
  const storage=memory(),s=createGame(1000,42);s.level=12;s.version=4;s.talents={might:5,guard:3,vigor:2,fortune:1};s.points=0;
  delete s.tree;delete s.skills;delete s.skillPoints;delete s.potion;delete s.mana;s.cooldowns={cleave:0,mend:0,storm:0};
  storage.setItem(SAVE_KEY,JSON.stringify(s));const t=loadGame(storage,s.lastSave);
  assert(!t.recovered);assert.equal(t.state.version,5);assert.equal(t.state.points,11);assert.equal(t.state.skillPoints,11);
  assert.deepEqual(t.state.tree,[]);assert.equal(t.state.talents,undefined);assert.equal(t.state.potion.charges,3);
  assert.equal(Object.keys(t.state.cooldowns).length,SKILLS.length);
});

test('quests pay gold and orbs exactly once',()=>{
  const s=createGame(1000,42);assert.equal(new Set(QUESTS.map(q=>q.id)).size,QUESTS.length);assert(QUESTS.length>=12);
  s.level=10;const gold=s.gold;assert(claimQuest(s,'level10'));assert.equal(s.gold,gold+600);assert.equal(s.orbs.transmute,3);assert.equal(s.orbs.augment,2);
  assert(!claimQuest(s,'level10'));assert(!claimQuest(s,'stage41'));
});

test('every panel renders for new, mid-game, village and rift heroes without unsafe markup',()=>{
  const ui={bagFilter:'all',bagSort:'recent',skillSlot:0,treeZoom:1,treeNode:'war-k',forgeItem:null,forgeTab:'upgrade',benchAffix:null,benchTier:null,worldTab:'map',mapCycle:null};
  const s=createGame(1000,42);s.name='<img src=x onerror=alert(1)>';s.level=25;s.points=3;s.skillPoints=3;allocate(s,'war-0');
  for(const item of s.inventory)item.name='<b>x</b>';
  const all=()=>[heroPanel(s),bagPanel(s,ui),skillsPanel(s,ui),treePanel(s,ui),...['upgrade','orbs','bench'].map(forgeTab=>forgePanel(s,{...ui,forgeTab})),...['map','rifts','quests'].map(worldTab=>worldPanel(s,{...ui,worldTab})),lootFilterForm(s),enemyDossier(s),helpContent(),offlineSummary(s,{seconds:4000,kills:10,gold:5,xp:6,orbs:['chaos']})];
  for(const html of all()){assert(html.length>50);assert(!html.includes('<img src=x'));assert(!html.includes('<b>x</b>'));assert(!html.includes('undefined'));assert(!html.includes('NaN'));}
  assert.equal((treePanel(s,ui).match(/data-node=/g)||[]).length,61);
  assert.equal((skillsPanel(s,ui).match(/class="skill-card/g)||[]).length,SKILLS.length);
  assert(treePanel(s,ui).includes('Berserker'));
  const better={...s.equipment.hand,id:'x',itemLevel:30,implicits:{attack:200,defense:10,maxHp:50}};
  assert(isUpgrade(bestComparison(s,better)));assert(!isUpgrade(bestComparison(s,{...s.equipment.hand,id:'y',implicits:{attack:0,defense:0,maxHp:0}})));
});

test('idle heroes step out of telegraphed slams; friendly meteors are ignored',()=>{
  const s=arena(1,30);for(const id in s.skills.auto)s.skills.auto[id]=false;s.player.manual=false;
  s.hazards.push({kind:'slam',x:s.player.x,y:s.player.y,radius:2.7,remaining:1.5,total:1.5,damage:1e6,element:'physical'});
  const hp=s.hp;for(let i=0;i<16;i++)tick(s,.1,fixed);
  assert.equal(s.hazards.length,0);assert(s.hp>=hp-1,'the slam missed');assert(!s.player.dodging);
  const t=arena(1,30);for(const id in t.skills.auto)t.skills.auto[id]=false;t.player.manual=false;
  const at={x:t.player.x,y:t.player.y};t.hazards.push({kind:'meteor',friendly:true,x:at.x,y:at.y,radius:3,remaining:.7,total:.7,damage:10});
  tick(t,.1,fixed);assert(!t.player.dodging);
});

test('fire ignites and lightning can shock',()=>{
  const s=arena(1,30);for(const id in s.skills.auto)s.skills.auto[id]=false;
  s.equipment.hand.affixes=[{id:'fire',value:40}];s.attackTimer=10;
  tick(s,.1,()=>.99);const e=s.enemies[0];assert.equal(e.burn,20);assert(e.burnTime>2.8);
  const hp=e.hp;s.attackTimer=-99;for(let i=0;i<10;i++)tick(s,.1,()=>.99);assert(Math.abs(hp-e.hp-20)<1,'burns for half the fire damage each second');
  const l=arena(1,30);for(const id in l.skills.auto)l.skills.auto[id]=false;l.equipment.hand.affixes=[{id:'lightning',value:10}];
  l.attackTimer=10;tick(l,.1,()=>.99);assert.equal(l.enemies[0].shocked||0,0);
  l.attackTimer=10;tick(l,.1,()=>.1);assert(l.enemies[0].shocked>3);
});

test('guardians carry a regional trait, and a second one on later journeys',()=>{
  const boss=stage=>{const s=createGame(1000,42);s.maxStage=stage;travel(s,stage);return s.enemies.find(e=>e.boss).modifiers;};
  assert.deepEqual(boss(1),['earthshatter','empowered']);
  assert.deepEqual(boss(6),['earthshatter','empowered','chilling']);
  assert.deepEqual(boss(11),['earthshatter','empowered','burningAura']);
  assert.equal(boss(16)[2],'hasted');assert.equal(boss(26).length,4);
});

test('time away brings back a few items without overfilling the bag',()=>{
  const s=createGame(1_000_000,42),held=s.inventory.length;
  const r=offlineRewards(s,1_000_000+8*3600*1000,fixed);
  assert(r.kills>=320);assert.equal(r.items.length,8);assert.equal(s.inventory.length,held+8);
  assert(r.items.every(i=>i.rarity>=1&&i.itemLevel===s.stage));
  const full=createGame(1_000_000,42);while(full.inventory.length<47)full.inventory.push({...full.inventory[0],id:'x'+full.inventory.length});
  assert.equal(offlineRewards(full,1_000_000+8*3600*1000,fixed).items.length,1);assert.equal(full.inventory.length,48);
});

// ---------- Gear and loot depth ----------
import {makeItem,equip,salvage,salvageGold,toggleLock,merge,gamble,gambleCost,equipUpgrades,dropItem,collectLoot} from '../dist/engine.js';
import {BASES,baseOf,baseBonuses,bonusLines} from '../dist/gear.js';
import {AFFIXES,makeAffix,retier,rollAffixes} from '../dist/loot.js';
import {normalizeLootFilter,matchesLootFilter} from '../dist/loot-filter.js';
import {itemDetail,itemTile,utilityChanges,inventoryItems,salvageCandidates} from '../dist/panels.js';

test('every slot has three bases; the first keeps the classic profile and bonuses reach real stats',()=>{
  for(const [slot,bases] of Object.entries(BASES)){
    assert.equal(bases.length,3);assert.equal(new Set(bases.map(b=>b.id)).size,3);assert(!bases[0].bonus,slot);
    for(const b of bases)assert.equal(bonusLines(b).length,Object.keys(b.bonus||{}).length);
  }
  const seen=new Set();for(let i=0;i<60;i++)seen.add(makeItem('hand',0,5).base);assert.equal(seen.size,3);
  assert.equal(makeItem('hand',0,5,fixed,'claws').base,'claws');assert.equal(makeItem('hand',0,5,fixed,'nope').base,'gauntlets');
  const s=createGame(1000,42),before=stats(s);
  s.equipment.hand=makeItem('hand',0,1,fixed,'claws');
  assert(Math.abs(stats(s).crit-before.crit-.05)<1e-9);assert(stats(s).attackSpeed>before.attackSpeed);
  s.equipment.leftRing=makeItem('leftRing',0,1,fixed,'gilded');
  assert.equal(stats(s).goldFind,12);assert.equal(stats(s).magicFind,8);
  assert.deepEqual(baseBonuses([s.equipment.hand,s.equipment.leftRing,null]),{critical:5,haste:8,goldFind:12,magicFind:8});
  assert(s.equipment.hand.name.includes('Reaver Claws'));
});

test('bases survive a save; unknown bases fall back without rerolling valid implicits',()=>{
  const storage=memory(),s=createGame(1000,42);s.auto=false;
  const claws=makeItem('hand',2,9,fixed,'claws'),odd=makeItem('chest',1,9,fixed,'cuirass');odd.base='gone';
  s.inventory=[claws,odd];const rolled=structuredClone(claws.implicits),kept=structuredClone(odd.implicits);
  saveGame(s,storage);const t=loadGame(storage,s.lastSave).state;
  assert.equal(t.inventory[0].base,'claws');assert.deepEqual(t.inventory[0].implicits,rolled);
  assert.equal(baseOf(t.inventory[1]).id,'cuirass');assert.deepEqual(t.inventory[1].implicits,kept);
});

test('new modifiers change mana, skills, splash, cooldowns and what drops',()=>{
  const s=arena(1,30),p=stats(s);
  s.equipment.hand.affixes=[{id:'runed',value:20},{id:'sweeping',value:40}];
  s.equipment.chest.affixes=[{id:'lucid',value:30},{id:'clarity',value:50}];
  s.equipment.neck=makeItem('neck',0,30,fixed,'pendant');s.equipment.neck.affixes=[{id:'tempo',value:10},{id:'greed',value:100},{id:'fortune',value:400}];
  const q=stats(s);
  assert.equal(q.maxMana,p.maxMana+30);assert(Math.abs(q.manaRegen/p.manaRegen-1.5)<1e-9);assert(Math.abs(q.skillDamage-1.2)<1e-9);
  assert(Math.abs(q.splash-.7)<1e-9);assert(Math.abs(q.cooldownRate-1.1)<1e-9);assert.equal(q.goldFind,100);assert.equal(q.magicFind,300,'capped');
  const rich=arena(1,30),poor=arena(1,30);rich.equipment=s.equipment;
  const a=[],b=[];defeatEnemy(rich,rich.enemies[0],a,fixed);defeatEnemy(poor,poor.enemies[0],b,fixed);
  assert.equal(a.find(e=>e.type==='kill').gold,b.find(e=>e.type==='kill').gold*2);
  // Item rarity turns a magic-tier roll into a unique one.
  const roll=()=>.2,lucky=arena(1,30),plain=arena(1,30);lucky.equipment=s.equipment;
  for(const g of [lucky,plain]){g.enemies[0].tier='rare';g.lootFilter=normalizeLootFilter();}
  const la=[],pa=[];defeatEnemy(lucky,lucky.enemies[0],la,roll);defeatEnemy(plain,plain.enemies[0],pa,roll);
  assert(la.find(e=>e.type==='drop').item.rarity>pa.find(e=>e.type==='drop').item.rarity);
});

test('"+ to all skill ranks" lifts unlocked skills past their trained rank',()=>{
  const s=arena(1,30);s.skillPoints=20;const base=skillParams(s,'cleave').mult;
  s.equipment.head=makeItem('head',0,40,fixed,'helm');s.equipment.head.affixes=[{id:'mastery',value:2}];
  assert.equal(skillRank(s,'cleave'),3);assert(Math.abs(skillParams(s,'cleave').mult/base-1.24)<1e-9);
  s.level=1;assert.equal(skillRank(s,'mend'),0,'locked skills stay locked');s.level=30;
  for(let i=0;i<20;i++)investSkill(s,'cleave');assert.equal(skillRank(s,'cleave'),MAX_SKILL_RANK+2);assert.equal(s.skillPoints,11);
  assert(!rollAffixes('head',3,5,()=>.99).some(a=>a.id==='mastery'),'mastery cannot roll below item level 13');
  assert.equal(makeAffix('mastery',45,()=>.99).value,2);
});

test('saved tier numbers follow the longer tier lists',()=>{
  const storage=memory(),s=createGame(1000,42);s.auto=false;
  const top=AFFIXES.might.tiers[4]; // the old Tier 1 row
  s.equipment.hand.affixes=[{id:'might',tier:1,value:15,min:top.minVal,max:top.maxVal},{id:'haste',value:4}];
  saveGame(s,storage);const [might,haste]=loadGame(storage,s.lastSave).state.equipment.hand.affixes;
  assert.equal(might.tier,4);assert.equal(might.value,15);assert.equal(haste.tier,8);assert.equal(haste.min,3);
  assert.equal(retier({id:'might',value:9999}).tier,1);
});

test('locked items cannot be salvaged or merged, and salvaging fine gear can free an orb',()=>{
  const s=createGame(1000,42);const rare=makeItem('head',2,5,fixed),unique=makeItem('head',3,5,fixed);
  s.inventory=[rare,unique,...Array.from({length:3},()=>makeItem('foot',0,5,fixed,'boots'))];
  assert(toggleLock(s,rare.id));assert(rare.locked);assert(!salvage(s,rare.id));assert(!salvageCandidates(s).some(i=>i.id===rare.id));
  s.inventory[2].locked=true;s.gold=500;assert(!merge(s,'foot',0),'a locked piece is never consumed');
  assert(itemTile(rare).includes('tile-lock'));assert(itemDetail(s,rare).includes('data-act="salvage" data-arg="'+rare.id+'" disabled'));
  assert(toggleLock(s,rare.id));assert.equal(rare.locked,undefined);
  const orbs=()=>Object.values(s.orbs).reduce((a,b)=>a+b,0),before=orbs(),gold=s.gold;
  assert(salvage(s,unique.id,fixed));assert.equal(orbs(),before+1);assert.equal(s.gold,gold+salvageGold(unique));
  assert(salvage(s,rare.id,()=>.1));assert.equal(orbs(),before+2);assert(!toggleLock(s,'missing'));
  assert(toggleLock(s,s.equipment.hand.id),'equipped gear can be locked too');
});

test('gambling charges once, respects bag space and rolls the promised rarities',()=>{
  const s=createGame(1000,42);s.maxStage=20;s.inventory=[];s.gold=gambleCost(s)*2+5;
  const a=gamble(s,'ring',()=>.01);assert(a.ok);assert.equal(a.item.rarity,3);assert.equal(a.item.itemLevel,20);assert.equal(a.item.slot,'leftRing');
  const b=gamble(s,'chest',()=>.3);assert.equal(b.item.rarity,2);assert.equal(s.gold,5);
  assert(!gamble(s,'chest').ok);s.gold=1e9;assert.equal(gamble(s,'hand',()=>.9).item.rarity,1);assert(!gamble(s,'nope').ok);
  while(s.inventory.length<48)s.inventory.push(makeItem('foot'));const gold=s.gold;assert(!gamble(s,'hand').ok);assert.equal(s.gold,gold);
});

test('the filter spares upgrades, and auto-equip wears them on pickup',()=>{
  const s=createGame(1000,42);s.auto=false;s.lootFilter=normalizeLootFilter({minRarity:3});assert.equal(s.lootFilter.keepUpgrades,true);
  const strong={...makeItem('hand',0,40,fixed,'gauntlets')},weak=makeItem('hand',0,1,()=>0,'gauntlets');
  assert(isUpgrade(bestComparison(s,strong)));assert(!isUpgrade(bestComparison(s,weak)));
  const count=s.inventory.length,events=[];
  dropItem(s,weak,s.player);collectLoot(s,weak.id,events);assert(events.some(e=>e.type==='filteredLoot'));assert.equal(s.inventory.length,count);
  dropItem(s,strong,s.player);collectLoot(s,strong.id,events);assert.equal(s.inventory.length,count+1,'kept although it is not unique');
  const auto=createGame(1000,42);auto.auto=false;auto.settings.autoEquip=true;const old=auto.equipment.hand.id,ev=[];
  const drop=makeItem('hand',0,40,fixed,'gauntlets');dropItem(auto,drop,auto.player);collectLoot(auto,drop.id,ev);
  assert.equal(auto.equipment.hand.id,drop.id);assert(auto.inventory.some(i=>i.id===old));assert(ev.some(e=>e.type==='autoEquip'));
  const many=createGame(1000,42);many.inventory=[makeItem('hand',0,30,fixed,'gauntlets'),makeItem('chest',0,30,fixed,'cuirass'),makeItem('hand',0,1,()=>0,'gauntlets')];
  assert.equal(equipUpgrades(many),2);assert.equal(many.equipment.hand.itemLevel,30);
});

test('item details show the base, the piece being replaced and utility changes',()=>{
  const s=createGame(1000,42),item=makeItem('chest',1,3,fixed,'vestment');
  const html=itemDetail(s,item);
  assert(html.includes('Sage’s Vestment'));assert(html.includes('+10% skill damage'));assert(html.includes('<details><summary>Replaces'));
  assert(html.includes(s.equipment.chest.name));assert(html.includes('skill damage</span>'));
  assert(utilityChanges(s,item).some(c=>c.label==='skill damage'&&c.diff>0));
  assert.equal(inventoryItems({...s,inventory:[makeItem('hand',0,1,()=>0,'gauntlets'),makeItem('hand',0,50,fixed,'gauntlets')]},'all','upgrade')[0].itemLevel,50);
});

test('the forge explains why an orb does not apply and only offers modifiers that fit',async()=>{
  const {craftBlock,craft}=await import('../dist/crafting.js');
  const s=createGame(1000,42);s.gold=1e6;for(const k in s.orbs)s.orbs[k]=5;
  const item=makeItem('hand',0,20,fixed,'gauntlets');s.inventory=[item];
  for(const id of Object.keys(s.orbs)){const item2=structuredClone(item);assert.equal(craftBlock(item2,id)==='',craft(s,item2,id,fixed).ok,id+' on a normal item');}
  const rare=makeItem('hand',2,20,fixed,'gauntlets');rare.affixes=['might','fire','cold'].map(id=>makeAffix(id,20,fixed));s.inventory=[rare];
  assert.equal(craftBlock(rare,'transmute'),'Needs a normal item');assert.equal(craftBlock(rare,'exalt'),'');
  const ui={forgeItem:rare.id,forgeTab:'bench',benchAffix:null,benchTier:null};
  const bench=forgePanel(s,ui);assert(!bench.includes('value="lightning"'),'prefixes are full');assert(bench.includes('value="haste"'));
  assert(forgePanel(s,{...ui,forgeTab:'orbs'}).includes('Needs a normal item'));
  assert(forgePanel(s,{...ui,forgeTab:'gamble'}).includes('data-act="gamble" data-arg="ring"'));
});

// ---------- Sockets, gems and sets ----------
import {makeSetItem} from '../dist/engine.js';
import {GEMS,GEM_GRADES,gemKey,gemStat,gemName,rollSockets,rollGem,maxSockets,combineGems,socketGem,unsocketGem,unsocketCost,addSocket,socketCost,gemBonuses} from '../dist/gems.js';
import {SETS,setCounts,setBonuses,setPiece,setsForSlot,randomSetPiece} from '../dist/sets.js';

test('gems give one stat in hand pieces and another in armor, and reach real stats',()=>{
  assert.equal(Object.keys(GEMS).length,6);assert.equal(GEM_GRADES.length,5);
  for(const [type,def] of Object.entries(GEMS))for(const side of [def.weapon,def.armor]){assert.equal(side[1].length,5);for(let i=1;i<5;i++)assert(side[1][i]>side[1][i-1],type);}
  assert.deepEqual(gemStat('ruby2','hand'),{stat:'fire',value:18});assert.deepEqual(gemStat('ruby2','chest'),{stat:'maxHp',value:58});
  assert.equal(gemStat('nope1','hand'),null);assert.equal(gemName('topaz4'),'Perfect Topaz');
  const s=createGame(1000,42),before=stats(s);
  s.equipment.hand.sockets=['ruby2','diamond0',null];s.equipment.chest.sockets=['ruby2'];
  const after=stats(s);
  assert.equal(after.fire,before.fire+18);assert.equal(after.attack,before.attack+3);assert.equal(after.maxHp,before.maxHp+58);
  assert.deepEqual(gemBonuses([s.equipment.hand,s.equipment.chest]),{fire:18,attack:3,maxHp:58});
});

test('sockets roll within slot limits; jewelry never has any',()=>{
  for(const slot of ['neck','leftRing','rightRing']){assert.equal(maxSockets(slot),0);assert.deepEqual(rollSockets(slot,0,()=>0),[]);}
  assert.equal(rollSockets('hand',0,()=>0).length,1);assert.equal(rollSockets('chest',0,()=>.34).length,2);assert.deepEqual(rollSockets('chest',2,()=>.34),[]);
  let most=0;for(let i=0;i<400;i++){const item=makeItem('hand',0,5);most=Math.max(most,item.sockets?.length||0);assert((item.sockets?.length||0)<=3);}
  assert.equal(most,3);
});

test('gems socket, pull, combine and come back when the item is destroyed',()=>{
  const s=createGame(1000,42);s.gold=1e6;s.gems={ruby0:7,topaz1:1};
  const item=makeItem('chest',1,10,fixed,'cuirass');item.sockets=[null];s.inventory=[item];
  assert(combineGems(s,'ruby0'));assert(combineGems(s,'ruby0'));assert(!combineGems(s,'ruby0'));assert.deepEqual(s.gems,{ruby0:1,ruby1:2,topaz1:1});
  assert(!combineGems(s,'topaz1'));s.gems.ruby4=3;assert(!combineGems(s,'ruby4'),'perfect is the top grade');delete s.gems.ruby4;
  assert(socketGem(s,item,'topaz1'));assert.deepEqual(item.sockets,['topaz1']);assert.equal(s.gems.topaz1,undefined);
  assert(!socketGem(s,item,'ruby1'),'no empty socket');assert(!socketGem(s,item,'emerald0'),'none held');
  const cost=socketCost(item),gold=s.gold;assert(addSocket(s,item));assert.equal(s.gold,gold-cost);assert.equal(item.sockets.length,2);assert(socketCost(item)>cost);
  assert(addSocket(s,item));assert(!addSocket(s,item),'chest holds three');
  const g2=s.gold;assert(unsocketGem(s,item,0));assert.equal(s.gold,g2-unsocketCost(item));assert.equal(s.gems.topaz1,1);assert(!unsocketGem(s,item,0));
  socketGem(s,item,'ruby1');socketGem(s,item,'ruby1');assert.equal(s.gems.ruby1,undefined);
  assert(salvage(s,item.id,fixed));assert.equal(s.gems.ruby1,2,'salvage returns the gems');
  const ring=makeItem('leftRing',0,5,fixed,'band');assert(!addSocket(s,ring));
});

test('gems drop more from tougher enemies and improve with stage',()=>{
  assert.equal(rollGem('normal',1,()=>.5),null);assert.equal(rollGem('unique',1,()=>.5),'emerald0');
  assert.equal(rollGem('unique',60,()=>.7),'diamond4');assert.equal(rollGem('unique',60,()=>.5),'emerald3');
  const s=arena(1,30);s.enemies[0].tier='unique';const events=[];defeatEnemy(s,s.enemies[0],events,fixed);
  assert.equal(events.filter(e=>e.type==='gem').length,1);assert.equal(Object.values(s.gems).reduce((a,b)=>a+b,0),1);
});

test('sets: five sets of four pieces on fixed bases, with bonuses at two, three and four',()=>{
  assert.equal(Object.keys(SETS).length,5);
  for(const [id,set] of Object.entries(SETS)){
    assert.equal(Object.keys(set.pieces).length,4);assert.deepEqual(set.bonuses.map(b=>b[0]),[2,3,4]);
    for(const [slot,[,base]] of Object.entries(set.pieces))assert(BASES[slot==='ring'?'leftRing':slot].some(b=>b.id===base),id+' '+slot);
  }
  const piece=makeSetItem('wolfpack','hand',12,fixed);
  assert.equal(piece.set,'wolfpack');assert.equal(piece.name,'Wolfpack Fang');assert.equal(piece.rarity,2);assert.equal(piece.base,'claws');assert(piece.affixes.length>=4);
  assert.throws(()=>makeSetItem('wolfpack','chest'));assert.equal(setPiece('wolfpack','rightRing')[0],'Howl');
  assert(setsForSlot('leftRing').length>=3);assert.equal(randomSetPiece(fixed,'chest').setId,'frostwarden');assert.equal(randomSetPiece(fixed,'leg').slot,'leg');
});

test('set bonuses unlock by distinct pieces worn and change real stats',()=>{
  const s=createGame(1000,42);const bare=p=>{const i=makeSetItem(...p,1,fixed);i.affixes=[];i.implicits=Object.fromEntries(Object.keys(i.implicits).map(k=>[k,0]));delete i.sockets;return i;};
  const base=stats(s),hasteOf=()=>stats(s).haste;
  s.equipment.foot=bare(['wolfpack','foot']);assert.deepEqual(setCounts(Object.values(s.equipment)),{wolfpack:1});assert.deepEqual(setBonuses(Object.values(s.equipment)),{});
  s.equipment.leftRing=bare(['wolfpack','leftRing']);s.equipment.rightRing=bare(['wolfpack','rightRing']);
  assert.equal(setCounts(Object.values(s.equipment)).wolfpack,2,'two rings of a set count once');
  assert.equal(hasteOf(),base.haste+12);
  s.equipment.belt=bare(['wolfpack','belt']);assert.equal(stats(s).leech,base.leech+2+.8*2,'three pieces, plus two bloodstone bases');
  s.equipment.hand=bare(['wolfpack','hand']);assert(Math.abs(stats(s).splash-.5*1.6)<1e-9);
  const storm=createGame(1000,42);storm.level=30;for(const slot of ['head','neck','wrist','leftRing'])storm.equipment[slot]=bare(['stormcaller',slot]);
  assert.equal(skillRank(storm,'cleave'),3);assert(Math.abs(stats(storm).skillDamage-1.2)<1e-9);
  const ward=createGame(1000,42);for(const slot of ['head','chest','shoulder','leg'])ward.equipment[slot]=bare(['frostwarden',slot]);
  assert(Math.abs(stats(ward).damageTaken-.9)<1e-9);
});

test('set pieces and sockets survive saves, pass the unique filter rule, and show in item details',()=>{
  const storage=memory(),s=createGame(1000,42);s.auto=false;
  const piece=makeSetItem('executioner','neck',9,fixed),bad=makeItem('chest',0,9,fixed,'cuirass');bad.set='executioner';bad.sockets=['ruby1','junk',null,null,null];
  s.inventory=[piece,bad];s.gems={ruby1:2,junk:5,topaz0:-1};saveGame(s,storage);
  const t=loadGame(storage,s.lastSave).state;
  assert.equal(t.inventory[0].set,'executioner');assert.equal(t.inventory[1].set,undefined,'a chest is not an executioner piece');
  assert.deepEqual(t.inventory[1].sockets,['ruby1',null,null]);assert.deepEqual(t.gems,{ruby1:2});
  assert(matchesLootFilter(piece,normalizeLootFilter({minRarity:3})));assert(!matchesLootFilter(piece,normalizeLootFilter({minRarity:3,alwaysShowUnique:false})));
  const html=itemDetail(t,t.inventory[0]);assert(html.includes('Ashen Executioner set'));assert(html.includes('Deal 20% more damage'));assert(html.includes('0/4 worn'));
  assert(itemDetail(t,t.inventory[1]).includes('Empty socket'));assert(itemTile(t.inventory[1]).includes('tile-sockets'));assert(itemTile(piece).includes(' set '));
  t.equipment.neck=t.inventory[0];assert(heroPanel(t).includes('Ashen Executioner · 1/4'));
  const gems=forgePanel(t,{forgeItem:t.inventory[1].id,forgeTab:'gems'});assert(gems.includes('data-act="gem-socket" data-arg="ruby1"'));assert(gems.includes('data-act="gem-pull" data-arg="0"'));
  assert(forgePanel(t,{forgeItem:t.inventory[0].id,forgeTab:'gems'}).includes('Jewelry cannot hold gems'));
});
