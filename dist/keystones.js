import {KEYSTONE_RARITIES} from './loot.js';

export const RIFT_WAVES=5;
export const RIFT_MODIFIERS={
  brutal:{name:'Brutal',label:'monster damage',min:18,max:35,stat:'damage',quantity:15,rarity:20},
  stalwart:{name:'Stalwart',label:'monster life',min:35,max:65,stat:'life',quantity:18,rarity:15},
  quickened:{name:'Quickened',label:'monster movement and attack speed',min:12,max:25,stat:'speed',quantity:15,rarity:25},
  crowded:{name:'Crowded',label:'monsters per wave',min:25,max:50,stat:'pack',quantity:12,rarity:15},
  warded:{name:'Warded',label:'monster damage reduction',min:12,max:25,stat:'reduction',quantity:20,rarity:20},
  ruinous:{name:'Ruinous',label:'monster critical chance (percentage points)',min:5,max:12,stat:'critical',quantity:15,rarity:30}
};
export const KEYSTONE_CRAFT_OPERATIONS=['transmute','augment','regal','alchemy','chaos','exalt','scour','divine'];
export const modifierValue=mod=>Math.round(RIFT_MODIFIERS[mod.id].min+(RIFT_MODIFIERS[mod.id].max-RIFT_MODIFIERS[mod.id].min)*mod.roll);
const rollKeystoneModifiers=(count,rng=Math.random,existing=[])=>{
  const used=new Set(existing.map(m=>m.id)),pool=Object.keys(RIFT_MODIFIERS).filter(id=>!used.has(id)),modifiers=[];
  for(let i=0;i<count&&pool.length;i++)modifiers.push({id:pool.splice(Math.floor(rng()*pool.length),1)[0],roll:Math.round(rng()*100)/100});
  return modifiers;
};
export function makeKeystone(rarity=0,itemLevel=1,rng=Math.random){
  const count=rarity===0?0:rarity===1?1+Math.floor(rng()*2):rarity===2?3+Math.floor(rng()*2):6;
  const modifiers=rollKeystoneModifiers(count,rng);
  return {id:globalThis.crypto.randomUUID(),kind:'keystone',name:`${KEYSTONE_RARITIES[rarity]} Rift Keystone`,rarity,itemLevel:Math.max(1,Math.floor(itemLevel)),modifiers};
}
export function validKeystone(k){
  return !!k&&k.kind==='keystone'&&typeof k.id==='string'&&typeof k.name==='string'&&Number.isSafeInteger(k.itemLevel)&&k.itemLevel>0&&Number.isInteger(k.rarity)&&k.rarity>=0&&k.rarity<=3&&Array.isArray(k.modifiers)&&
    k.modifiers.length<=[0,2,4,6][k.rarity]&&k.modifiers.length>=[0,1,3,6][k.rarity]&&new Set(k.modifiers.map(m=>m?.id)).size===k.modifiers.length&&k.modifiers.every(m=>m&&RIFT_MODIFIERS[m.id]&&Number.isFinite(m.roll)&&m.roll>=0&&m.roll<=1);
}
export function riftBonuses(key){
  const b={life:20,damage:10,speed:0,pack:0,reduction:0,critical:0,itemLevel:0,quantity:0,rarity:0};
  for(const m of key?.modifiers||[]){const d=RIFT_MODIFIERS[m.id];b[d.stat]+=modifierValue(m);b.itemLevel+=1+(m.roll>=.75?1:0);b.quantity+=Math.round(d.quantity*(1+m.roll*.5));b.rarity+=Math.round(d.rarity*(1+m.roll*.5));}
  return b;
}
export function rollKeystone(tier,itemLevel,rng=Math.random){
  if(rng()>={normal:.003,magic:.01,rare:.04,unique:.12}[tier])return null;
  const roll=rng(),rarity=roll<.025?3:roll<.18?2:roll<.55?1:0;
  return makeKeystone(rarity,itemLevel,rng);
}
export function keystoneCraftEligibility(opId,key){
  if(!validKeystone(key)||!KEYSTONE_CRAFT_OPERATIONS.includes(opId))return 'Choose a dropped keystone and an orb.';
  const count=key.modifiers.length;
  if(opId==='transmute'&&key.rarity!==0)return 'Orb of Transmutation requires a normal keystone.';
  if(opId==='augment'&&(key.rarity!==1||count>=2))return 'Orb of Augmentation requires a magic keystone with one modifier.';
  if(opId==='regal'&&(key.rarity!==1||count!==2))return 'Regal Orb requires a magic keystone with two modifiers.';
  if(opId==='alchemy'&&key.rarity!==0)return 'Orb of Alchemy requires a normal keystone.';
  if(opId==='chaos'&&key.rarity!==2)return 'Chaos Orb requires a rare keystone.';
  if(opId==='exalt'&&(key.rarity!==2||count>=4))return 'Exalted Orb requires a rare keystone with an open modifier.';
  if(opId==='scour'&&![1,2].includes(key.rarity))return key.rarity===3?'Unique keystones cannot be scoured.':'There are no modifiers to remove.';
  if(opId==='divine'&&!count)return 'Divine Orb requires a keystone with modifiers.';
  return '';
}
export function applyKeystoneOrb(key,opId,rng=Math.random){
  const reason=keystoneCraftEligibility(opId,key);if(reason)return {ok:false,reason};
  const next=structuredClone(key);
  if(opId==='transmute'){next.rarity=1;next.modifiers=rollKeystoneModifiers(1+Math.floor(rng()*2),rng);}
  if(opId==='augment')next.modifiers.push(...rollKeystoneModifiers(1,rng,next.modifiers));
  if(opId==='regal'){next.rarity=2;next.modifiers.push(...rollKeystoneModifiers(1,rng,next.modifiers));}
  if(opId==='alchemy'){next.rarity=2;next.modifiers=rollKeystoneModifiers(3+Math.floor(rng()*2),rng);}
  if(opId==='chaos')next.modifiers=rollKeystoneModifiers(3+Math.floor(rng()*2),rng);
  if(opId==='exalt')next.modifiers.push(...rollKeystoneModifiers(1,rng,next.modifiers));
  if(opId==='scour'){next.rarity=0;next.modifiers=[];}
  if(opId==='divine')next.modifiers=next.modifiers.map(m=>({...m,roll:Math.round(rng()*100)/100}));
  next.name=`${KEYSTONE_RARITIES[next.rarity]} Rift Keystone`;
  return validKeystone(next)?{ok:true,item:next,opId}:{ok:false,reason:'The keystone could not hold that modifier arrangement.'};
}
export function rewardQuantity(base,bonus,rng=Math.random){const amount=base*(1+bonus/100);return Math.floor(amount)+(rng()<amount%1?1:0);}

export function makeRiftMap(seed,level){
  const width=24,height=18,tiles=Array(width*height).fill(0);
  for(let y=3;y<15;y++)for(let x=3;x<21;x++)tiles[y*width+x]=1;
  const entrance={x:12.5,y:13.5};
  return {seed:seed>>>0,stage:level,topology:'arena',name:'The Shattered Glade',width,height,tiles,seen:Array(width*height).fill(1),rooms:[{id:0,order:0,x:12.5,y:8.5,role:'boss'}],route:[0],edges:[],entrance,bossRoomId:0,shrine:{...entrance,used:true},chest:{...entrance,opened:true},progress:0,goal:4,bossUnlocked:false,completed:false};
}
