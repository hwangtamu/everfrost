import {icon} from './icons.js';
import {MODIFIERS} from './monsters.js';
import {AFFIXES,affixText,UNIQUE_EFFECTS,uniqueDescription} from './loot.js';
import {BOSSES,BOSS_SKILLS} from './bosses.js';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function badge(image,label,action,style=''){
 return `<button class="hud-mod ${style}" ${action} title="${esc(label)}" aria-label="${esc(label)}">${icon(image)}</button>`;
}
export function enemyModifierIcons(e){
 return e.modifiers.map(id=>{const m=MODIFIERS[id];return m?badge(m.icon,m.name+': '+m.description,'data-action="enemy-info"',m.kind==='aura'?'hud-aura':''):'';}).join('')+
 (BOSSES[e.bossId]?.skills||[]).map(id=>{const skill=BOSS_SKILLS[id];return badge(skill.icon,skill.name+': '+skill.description,'data-action="enemy-info"','hud-skill');}).join('');
}
export function playerModifierIcons(s){
 const list=[];
 if(s.effects.chill>0)list.push(badge('gem','Chilled: movement and attack speed reduced by 25% for '+Math.ceil(s.effects.chill)+'s.','data-view="hero"','hud-debuff'));
 if(s.effects.soulgorge>0)list.push(badge('star','Soulgorge active: '+Math.ceil(s.effects.soulgorge)+'s remaining.','data-view="hero"','hud-buff'));
 const affixes=new Map(),uniques=new Set();
 for(const item of Object.values(s.equipment).filter(Boolean)){
  for(const affix of item.affixes||[])if(AFFIXES[affix.id])affixes.set(affix.id,{...affix,value:(affixes.get(affix.id)?.value||0)+affix.value});
  if(item.unique&&UNIQUE_EFFECTS[item.unique])uniques.add(item.unique);
 }
 for(const id of uniques){const u=UNIQUE_EFFECTS[id];list.push(badge('star',u.name+': '+uniqueDescription(Object.values(s.equipment).find(i=>i?.unique===id)),'data-view="hero"','hud-unique'));}
 for(const a of affixes.values())list.push(badge(AFFIXES[a.id].icon||({attack:'sword',defense:'shield',maxHp:'heart',movement:'compass',haste:'zap'}[AFFIXES[a.id].stat]||'sparkles'),affixText(a),'data-view="hero"'));
 return list.slice(0,5).join('')+(list.length>5?`<button class="hud-mod" data-view="hero" title="View all character modifiers" aria-label="View ${list.length-5} more modifiers">+${list.length-5}</button>`:'');
}
