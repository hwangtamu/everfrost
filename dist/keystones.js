import {ITEM_RARITIES} from './loot.js';

export const RIFT_WAVES=5;
export const RIFT_MODIFIERS={
  brutal:{name:'Brutal',label:'monster damage',min:18,max:35,stat:'damage',quantity:15,rarity:20},
  stalwart:{name:'Stalwart',label:'monster life',min:35,max:65,stat:'life',quantity:18,rarity:15},
  quickened:{name:'Quickened',label:'monster movement and attack speed',min:12,max:25,stat:'speed',quantity:15,rarity:25},
  crowded:{name:'Crowded',label:'monsters per wave',min:25,max:50,stat:'pack',quantity:12,rarity:15},
  warded:{name:'Warded',label:'monster damage reduction',min:12,max:25,stat:'reduction',quantity:20,rarity:20},
  ruinous:{name:'Ruinous',label:'monster critical chance (percentage points)',min:5,max:12,stat:'critical',quantity:15,rarity:30}
};
export const KEYSTONE_RECIPES=[
  {rarity:0,cost:{transmute:3},label:'Normal'},
  {rarity:1,cost:{transmute:3,augment:2},label:'Magic'},
  {rarity:2,cost:{alchemy:2,regal:1},label:'Rare'},
  {rarity:3,cost:{exalt:2,divine:2},label:'Unique'}
];
export const modifierValue=mod=>Math.round(RIFT_MODIFIERS[mod.id].min+(RIFT_MODIFIERS[mod.id].max-RIFT_MODIFIERS[mod.id].min)*mod.roll);
export function makeKeystone(rarity=0,itemLevel=1,rng=Math.random){
  const count=rarity===0?0:rarity===1?1+Math.floor(rng()*2):rarity===2?3+Math.floor(rng()*2):6;
  const pool=Object.keys(RIFT_MODIFIERS),modifiers=[];
  for(let i=0;i<count;i++)modifiers.push({id:pool.splice(Math.floor(rng()*pool.length),1)[0],roll:Math.round(rng()*100)/100});
  return {id:globalThis.crypto.randomUUID(),kind:'keystone',name:`${ITEM_RARITIES[rarity]} Rift Keystone`,rarity,itemLevel:Math.max(1,Math.floor(itemLevel)),modifiers};
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
export function rewardQuantity(base,bonus,rng=Math.random){const amount=base*(1+bonus/100);return Math.floor(amount)+(rng()<amount%1?1:0);}

export function makeRiftMap(seed,level){
  const width=24,height=18,tiles=Array(width*height).fill(0);
  for(let y=3;y<15;y++)for(let x=3;x<21;x++)tiles[y*width+x]=1;
  const entrance={x:12.5,y:13.5};
  return {seed:seed>>>0,stage:level,topology:'arena',name:'The Shattered Glade',width,height,tiles,seen:Array(width*height).fill(1),rooms:[{id:0,order:0,x:12.5,y:8.5,role:'boss'}],route:[0],edges:[],entrance,bossRoomId:0,shrine:{...entrance,used:true},chest:{...entrance,opened:true},progress:0,goal:4,bossUnlocked:false,completed:false};
}
