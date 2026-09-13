export const SAVE_KEY = 'everfrost.save.v1';
export const REGIONS = [
  {name:'Mistwood', subtitle:'The wilds are waking.', start:1, color:'#829f7c', foes:['Mossfang Wolf','Wild Bristleback','Thorn Sprite'], boss:'The Hollow Guardian'},
  {name:'Frostfall Ridge', subtitle:'Follow the northern wind.', start:6, color:'#9bbdce', foes:['Frost Wolf','Icebound Wraith','Snow Stalker'], boss:'Hrim, the Frostborn'},
  {name:'Ember Hollow', subtitle:'Something stirs beneath the ash.', start:11, color:'#d4936f', foes:['Cinder Hound','Ash Wraith','Emberling'], boss:'The Ashen King'},
  {name:'The Starless Wild', subtitle:'Beyond the edge of every map.', start:16, color:'#aa97cc', foes:['Void Stalker','Moon Wraith','Dusk Serpent'], boss:'The Forgotten One'}
];
export const SKILLS = [
  {id:'cleave', name:'Runic cleave', icon:'swords', key:'1', level:1, cooldown:9, description:'Strike for 3× your attack damage.'},
  {id:'mend', name:'Forest blessing', icon:'leaf', key:'2', level:3, cooldown:18, description:'Restore 45% of your maximum health.'},
  {id:'storm', name:'Thunderstrike', icon:'zap', key:'3', level:5, cooldown:25, description:'Call down lightning for 7× attack damage.'}
];
const NAMES = {weapon:['Iron Longsword','Warden’s Blade','Moonsteel Edge','Dawnbreaker'],armor:['Traveler’s Tunic','Ranger’s Mail','Runebound Armor','Vestment of Dawn'],charm:['Carved Antler','Mistwood Talisman','Starlit Pendant','Heart of the Wild']};
export function stats(s) {
  const eq = Object.values(s.equipment);
  const bonus = type => eq.filter(x=>x && x.slot===type).reduce((n,x)=>n+x.power+x.upgrade*3,0);
  return {attack:9+s.level*3+bonus('weapon')+s.talents.might*3, defense:2+s.level+bonus('armor')+s.talents.guard*2, maxHp:90+s.level*15+bonus('charm')*3+s.talents.vigor*18, crit:Math.min(.75,0.08+s.talents.fortune*0.015)};
}
export function xpRequired(level) {return Math.round(45*Math.pow(level,1.38));}
export function region(s) {return [...REGIONS].reverse().find(r=>s.stage>=r.start);}
export function makeItem(slot, rarity=0, stage=1, rng=Math.random) {
  return {id:globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${rng()}`,slot,rarity,name:NAMES[slot][rarity],power:Math.round((slot==='weapon'?4:2)+stage*1.6+rarity*(5+stage)),upgrade:0};
}
export function createGame(now=Date.now()) {
  const s={version:1,name:'Wanderer',level:1,xp:0,gold:120,shards:8,stage:1,maxStage:1,killsInStage:0,kills:0,bosses:0,crafted:0,hp:120,auto:true,advance:true,speed:1,inventory:[],equipment:{weapon:makeItem('weapon'),armor:makeItem('armor'),charm:null},talents:{might:0,guard:0,vigor:0,fortune:0},points:0,cooldowns:{cleave:0,mend:0,storm:0},enemy:null,attackTimer:0,enemyTimer:0,respawn:0,log:[],claimed:[],lastSave:now,playTime:0,settings:{sound:false,motion:true}};
  s.inventory=[makeItem('weapon',1),makeItem('charm',0),makeItem('armor',1)];
  s.hp=stats(s).maxHp;
  spawnEnemy(s); addLog(s,'Your journey begins in Mistwood.','system'); return s;
}
export function addLog(s,text,type='combat') {s.log.unshift({id:`${Date.now()}-${Math.random()}`,text,type,time:Date.now()});s.log=s.log.slice(0,30);}
export function spawnEnemy(s) {
  const r=region(s), boss=s.stage%5===0;
  const maxHp=Math.round((28+Math.pow(s.stage,1.35)*12)*(boss?4:1));
  s.enemy={name:boss?r.boss:r.foes[s.kills%3],kind:boss?'guardian':['wolf','boar','sprite'][s.kills%3],maxHp,hp:maxHp,boss,level:s.stage};
  s.attackTimer=0; s.enemyTimer=0;
}
export function gainXp(s, amount, events=[]) {
  s.xp+=amount;
  while(s.xp>=xpRequired(s.level)) {s.xp-=xpRequired(s.level);s.level++;s.points++;s.hp=stats(s).maxHp;events.push({type:'level',value:s.level});addLog(s,`Reached level ${s.level}. A mastery point awaits.`, 'level');}
}
function defeated(s,events,rng) {
  const boss=s.enemy.boss;
  const gold=Math.round((7+s.stage*3)*(boss?5:1)); const xp=Math.round((8+s.stage*3)*(boss?4:1));
  s.gold+=gold;s.kills++;s.killsInStage++; if(boss)s.bosses++;
  gainXp(s,xp,events); s.hp=Math.min(stats(s).maxHp,s.hp+stats(s).maxHp*.07);
  events.push({type:'kill',gold,xp,boss});
  addLog(s,`${s.enemy.name} defeated · +${gold} gold · +${xp} XP`);
  if(s.kills%2===0||boss) {
    const roll=rng(); const rarity=roll<.03?3:roll<.14?2:roll<.47?1:0;
    const item=makeItem(['weapon','armor','charm'][Math.floor(rng()*3)],rarity,s.stage,rng);
    if(s.inventory.length<48) {s.inventory.unshift(item);events.push({type:'loot',item});addLog(s,`Found ${item.name}.`,'loot');}
    else {s.shards+=rarity+1;addLog(s,'Satchel full. Found equipment salvaged into essence.','loot');}
  }
  s.shards+=boss?5:1;
  if(boss || s.killsInStage>=5) {s.maxStage=Math.max(s.maxStage,s.stage+1);if(s.advance){s.stage++;events.push({type:'stage',value:s.stage});} s.killsInStage=0;}
  s.respawn=1.1; s.enemy.hp=0;
}
function damage(s,amount,events,rng) {
  if(!s.enemy||s.enemy.hp<=0)return;
  s.enemy.hp=Math.max(0,s.enemy.hp-amount);events.push({type:'hit',value:amount});
  if(s.enemy.hp<=0)defeated(s,events,rng);
}
export function tick(s,dt,rng=Math.random) {
  const events=[]; if(!Number.isFinite(dt)||dt<=0)return events;
  dt=Math.min(dt,.5)*s.speed;s.playTime+=dt;
  for(const skill of SKILLS)s.cooldowns[skill.id]=Math.max(0,s.cooldowns[skill.id]-dt);
  if(s.respawn>0){s.respawn-=dt;if(s.respawn<=0)spawnEnemy(s);return events;}
  if(!s.auto)return events;
  s.attackTimer+=dt;s.enemyTimer+=dt;
  if(s.attackTimer>=1.1){s.attackTimer-=1.1;const p=stats(s),crit=rng()<p.crit;damage(s,Math.round(p.attack*(crit?1.8:1)),events,rng);}
  if(s.enemy.hp>0&&s.enemyTimer>=1.8){s.enemyTimer-=1.8;const p=stats(s),hit=Math.max(2,Math.round(5+s.stage*3.3+(s.enemy.boss?s.stage*2:0)-p.defense*.7));s.hp=Math.max(0,s.hp-hit);events.push({type:'hurt',value:hit});}
  if(s.hp<=0){s.hp=stats(s).maxHp;s.respawn=4;s.killsInStage=0;s.auto=false;events.push({type:'death'});addLog(s,'You returned to camp. Upgrade your gear or explore an earlier stage.','system');}
  return events;
}
export function useSkill(s,id,rng=Math.random) {
  const def=SKILLS.find(x=>x.id===id);if(!def||s.level<def.level||s.cooldowns[id]>0||s.respawn>0)return [];
  const events=[{type:'skill',id}];s.cooldowns[id]=def.cooldown;
  if(id==='mend'){s.hp=Math.min(stats(s).maxHp,s.hp+stats(s).maxHp*.45);events.push({type:'heal'});}
  else damage(s,Math.round(stats(s).attack*(id==='storm'?7:3)),events,rng);
  return events;
}
export function equip(s,id) {const i=s.inventory.findIndex(x=>x.id===id);if(i<0)return false;const item=s.inventory.splice(i,1)[0],old=s.equipment[item.slot];s.equipment[item.slot]=item;if(old)s.inventory.push(old);s.hp=Math.min(s.hp,stats(s).maxHp);return true;}
export function salvage(s,id) {const i=s.inventory.findIndex(x=>x.id===id);if(i<0)return false;const item=s.inventory.splice(i,1)[0];s.shards+=2+item.rarity*3+item.upgrade;return true;}
export function upgradeCost(item) {return {gold:40*(item.upgrade+1),shards:3+item.upgrade*2};}
export function upgrade(s,slot) {const item=s.equipment[slot];if(!item)return false;const cost=upgradeCost(item);if(s.gold<cost.gold||s.shards<cost.shards)return false;s.gold-=cost.gold;s.shards-=cost.shards;item.upgrade++;s.crafted++;return true;}
export function merge(s,slot,rarity) {if(!['weapon','armor','charm'].includes(slot)||!Number.isInteger(rarity)||rarity<0||rarity>2)return false;const items=s.inventory.filter(x=>x.slot===slot&&x.rarity===rarity).slice(0,3);if(items.length<3||s.gold<75)return false;const ids=new Set(items.map(x=>x.id));s.inventory=s.inventory.filter(x=>!ids.has(x.id));const item=makeItem(slot,rarity+1,s.stage);item.power=Math.max(item.power,...items.map(x=>x.power+x.upgrade*3))+3;s.inventory.unshift(item);s.gold-=75;s.crafted++;addLog(s,`Forged ${item.name} from three pieces of equipment.`,'loot');return item;}
export function learn(s,id) {if(s.points<=0||!(id in s.talents))return false;s.points--;s.talents[id]++;return true;}
export function travel(s,stage) {if(!Number.isInteger(stage)||stage<1||stage>s.maxStage)return false;s.stage=stage;s.killsInStage=0;s.respawn=0;s.hp=stats(s).maxHp;spawnEnemy(s);return true;}
export const QUESTS=[{id:'first',name:'Into the wild',description:'Defeat 10 creatures',target:10,value:s=>s.kills,gold:150,shards:5},{id:'forge',name:'A sharper edge',description:'Upgrade equipment 3 times',target:3,value:s=>s.crafted,gold:200,shards:10},{id:'guardian',name:'The forest remembers',description:'Defeat your first guardian',target:1,value:s=>s.bosses,gold:400,shards:15}];
export function claimQuest(s,id) {const q=QUESTS.find(q=>q.id===id);if(!q||s.claimed.includes(id)||q.value(s)<q.target)return false;s.claimed.push(id);s.gold+=q.gold;s.shards+=q.shards;return true;}
export function offlineRewards(s,now=Date.now()) {
  const seconds=Math.min(28800,Math.max(0,(now-s.lastSave)/1000));s.lastSave=now;
  if(seconds<60||!s.auto)return null;
  const p=stats(s),enemyHealth=(28+Math.pow(s.stage,1.35)*12)*(s.stage%5===0?4:1);
  const kills=Math.floor(seconds/(enemyHealth/(p.attack/1.1)+1.1)*.5);
  const gold=kills*(7+s.stage*3),xp=kills*(8+s.stage*3),shards=Math.floor(kills/3);
  s.gold+=gold;s.shards+=shards;gainXp(s,xp);s.hp=stats(s).maxHp;
  return {seconds,kills,gold,xp,shards};
}
export function saveGame(s,storage=globalThis.localStorage,now=Date.now()) {try{s.lastSave=now;storage.setItem(SAVE_KEY,JSON.stringify(s));return true;}catch{return false;}}
export function loadGame(storage=globalThis.localStorage,now=Date.now()) {
  try {const raw=storage.getItem(SAVE_KEY);if(!raw)return {state:createGame(now),offline:null};const data=JSON.parse(raw);
    if(data.version!==1||!Number.isFinite(data.level)||data.level<1||!Number.isFinite(data.stage)||data.stage<1||!Array.isArray(data.inventory)||!data.equipment||!data.talents)throw Error('Invalid save');
    const validItem=i=>i&&typeof i.id==='string'&&typeof i.name==='string'&&['weapon','armor','charm'].includes(i.slot)&&Number.isInteger(i.rarity)&&i.rarity>=0&&i.rarity<=3&&Number.isFinite(i.power)&&i.power>=0&&Number.isInteger(i.upgrade)&&i.upgrade>=0;
    if(!data.inventory.every(validItem)||!Object.entries(data.equipment).every(([slot,item])=>['weapon','armor','charm'].includes(slot)&&(item===null||(validItem(item)&&item.slot===slot))))throw Error('Invalid equipment');
    if(typeof data.name!=='string'||!data.name.trim()||!Array.isArray(data.log)||!data.log.every(x=>x&&typeof x.text==='string'&&Number.isFinite(x.time))||!Array.isArray(data.claimed))throw Error('Invalid hero');
    if(!['might','guard','vigor','fortune'].every(k=>Number.isInteger(data.talents[k])&&data.talents[k]>=0))throw Error('Invalid mastery');
    const s={...createGame(now),...data,name:data.name.slice(0,20),settings:{sound:false,motion:true,...data.settings}};
    for(const key of ['gold','xp','shards','hp','maxStage','kills','points','lastSave'])if(!Number.isFinite(s[key])||s[key]<0)throw Error('Invalid save');
    s.speed=s.speed===2?2:1;s.auto=!!s.auto;s.advance=!!s.advance;s.inventory=s.inventory.slice(0,48);s.cooldowns={cleave:0,mend:0,storm:0};s.respawn=0;s.hp=Math.min(s.hp,stats(s).maxHp);spawnEnemy(s);
    return {state:s,offline:offlineRewards(s,now)};
  }catch{return {state:createGame(now),offline:null,recovered:true};}
}
