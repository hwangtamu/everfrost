import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stats,combatStats,tick,useSkill,usePotion,hurtHero,makeEnemy,gainXp,xpRequired,learn,saveGame,loadGame,SAVE_KEY,travel,armorReduction,enemyBaseLife,enemyBaseDamage,claimQuest,QUESTS,POTION_KILLS,defeatEnemy} from '../dist/engine.js';
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
