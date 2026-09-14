import {distance,walkable,hasLineOfSight} from './world.js';

export const BOSS_SKILLS={
 slam:{name:'Earthshatter',icon:'hammer',description:'A heavy impact at your last position. Leave the marked circle.',cooldown:6},
 roots:{name:'Briar snare',icon:'leaf',description:'Three bramble patches erupt and slow anyone caught in them.',cooldown:7},
 charge:{name:'Rending charge',icon:'arrow',description:'Rushes along the marked lane. Step sideways before the charge.',cooldown:6},
 frost:{name:'Glacial burst',icon:'gem',description:'Cold erupts at your last position, dealing damage and chilling you.',cooldown:6},
 fire:{name:'Cinder eruption',icon:'flame',description:'Two burning circles erupt in succession. Keep moving.',cooldown:7},
 lightning:{name:'Storm cascade',icon:'zap',description:'Three staggered lightning strikes track the position where you were standing.',cooldown:6},
 nova:{name:'Hollow nova',icon:'sparkles',description:'An expanding ring detonates. Move beyond it or into the safe inner circle.',cooldown:7}
};
export const BOSSES={
 thorn:{name:'Elder Thornmaw',title:'Briar Sovereign',kind:'guardian',hue:0,size:1.1,color:'#b9d290',skills:['roots','slam'],modifiers:['armored','regenerating']},
 frost:{name:'Skadi, the Pale Fang',title:'Winter Huntress',kind:'wolf',hue:135,size:1.3,color:'#a0ddf4',skills:['charge','frost'],modifiers:['chilling','hasted']},
 ember:{name:'Gorath, Ashen Tusk',title:'Cinder Behemoth',kind:'boar',hue:330,size:1.4,color:'#edaa75',skills:['fire','charge'],modifiers:['empowered','volatile']},
 storm:{name:'Aeralis, Stormcaller',title:'Tempest Herald',kind:'sprite',hue:165,size:1.4,color:'#d5c4ff',skills:['lightning','nova'],modifiers:['resistant','hasteAura']},
 void:{name:'Nyx, the Hollow Queen',title:'Void Matriarch',kind:'sprite',hue:230,size:1.15,color:'#dca9e5',skills:['nova','roots'],modifiers:['vampiric','deadly']},
 stone:{name:'Korr, the Unbroken',title:'Stone Colossus',kind:'guardian',hue:75,size:1.3,color:'#c3cbd4',skills:['slam','lightning'],modifiers:['armored','empowered']}
};
export function bossIdentity(rng=Math.random){const ids=Object.keys(BOSSES),bossId=ids[Math.floor(rng()*ids.length)],b=BOSSES[bossId];return {bossId,name:b.name,kind:b.kind,modifiers:[...b.modifiers],abilityTimer:4,abilityIndex:0};}

export function castBossSkill(s,e,attack){
 const b=BOSSES[e.bossId];if(!b)return;
 const skill=b.skills[(e.abilityIndex||0)%b.skills.length];e.abilityIndex=(e.abilityIndex||0)+1;e.abilityTimer=BOSS_SKILLS[skill].cooldown;
 const target={x:s.player.x,y:s.player.y};
 const circle=(kind,position,radius,delay,damage,element='physical',extra={})=>s.hazards.push({kind,...position,radius,remaining:delay,total:delay,damage:attack*damage,element,sourceId:e.id,...extra});
 if(skill==='slam')circle(skill,target,2.7,1.6,2.5);
 if(skill==='frost')circle(skill,target,2.2,1.4,1.9,'cold',{chill:4});
 if(skill==='roots')for(const dx of [-2.4,0,2.4])circle(skill,{x:target.x+dx,y:target.y},1.15,1.5,1.25,'physical',{chill:2});
 if(skill==='fire')for(let i=0;i<2;i++)circle(skill,{x:target.x+(i?2.6:0),y:target.y},2,1.4+i*.65,1.8,'fire');
 if(skill==='lightning')for(let i=0;i<3;i++)circle(skill,{x:target.x+(i-1)*2,y:target.y+(i%2)*1.8},1.3,1.2+i*.45,1.5,'lightning');
 if(skill==='nova')circle(skill,{x:e.x,y:e.y},4,1.8,2.3,'lightning',{innerRadius:1.5});
 if(skill==='charge'){
  if(hasLineOfSight(s.map,e,target))s.hazards.push({kind:skill,x:e.x,y:e.y,endX:target.x,endY:target.y,radius:.85,remaining:1.3,total:1.3,damage:attack*2.1,element:'physical',sourceId:e.id});
 }
 return skill;
}
export function hazardHits(h,p){
 if(h.kind==='charge'){
  const dx=h.endX-h.x,dy=h.endY-h.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-h.x)*dx+(p.y-h.y)*dy)/length)):0;
  return distance(p,{x:h.x+t*dx,y:h.y+t*dy})<=h.radius;
 }
 const d=distance(p,h);return d<=h.radius&&d>=(h.innerRadius||0);
}
export function finishBossHazard(s,h){
 if(h.kind!=='charge')return;
 const e=s.enemies.find(e=>e.id===h.sourceId&&e.hp>0);
 if(e&&walkable(s.map,h.endX,h.endY)&&hasLineOfSight(s.map,e,{x:h.endX,y:h.endY})){e.x=h.endX;e.y=h.endY;e.path=[];}
}
