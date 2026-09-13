import {combatStats,stats} from './engine.js';
import {icon} from './icons.js';

export const number = value => Number(value.toFixed(2)).toLocaleString('en-US',{maximumFractionDigits:2});

export function combatMetrics(s) {
  const p=combatStats(s);
  return [
    {id:'movement',label:'Movement speed',value:number(p.movementSpeed),unit:'tiles / sec',icon:'compass'},
    {id:'speed',label:'Attack speed',value:number(p.attackSpeed),unit:'attacks / sec',icon:'zap'},
    {id:'range',label:'Attack range',value:number(p.attackRange),unit:'tiles',icon:'swords'},
    {id:'critical',label:'Critical strike chance',value:number(p.crit*100)+'%',unit:'chance per strike',icon:'star'},
    {id:'multiplier',label:'Critical strike multiplier',value:number(p.critMultiplier*100)+'%',unit:number(p.critMultiplier)+'× hit damage',icon:'sparkles'},
    {id:'dps',label:'Average attack DPS',value:number(p.dps),unit:'before enemy defenses',icon:'sword'}
  ];
}

export function combatPanel(s) {
  return `<section class="panel secondary-panel combat-attributes"><div class="view-section-title"><h2>Combat attributes</h2><span id="combat-condition" class="combat-condition">${s.effects.chill>0?'Chilled · speed reduced':'Live combat values'}</span></div><dl class="combat-attribute-grid">${combatMetrics(s).map(m=>`<div>${icon(m.icon)}<dt>${m.label}</dt><dd><strong id="combat-value-${m.id}">${m.value}</strong><span id="combat-unit-${m.id}">${m.unit}</span></dd></div>`).join('')}</dl><p class="combat-explanation">Critical strikes multiply physical and elemental hit damage. Attack range needs a clear line of sight. DPS averages basic attacks, including critical strikes and unique weapon effects; travel and skills change your actual damage over time.</p><p class="combat-explanation">Reach bonuses also extend Runic cleave. Thunderstrike has a fixed 6-tile radius. Attack speed affects basic attacks; skills use their own cooldowns.</p></section>`;
}

export function updateCombatPanel(s) {
  if(!document.getElementById('combat-condition'))return;
  document.getElementById('combat-condition').textContent=s.effects.chill>0?'Chilled · speed reduced':'Live combat values';
  for(const m of combatMetrics(s)){
    document.getElementById('combat-value-'+m.id).textContent=m.value;
    document.getElementById('combat-unit-'+m.id).textContent=m.unit;
  }
}

export function equipmentChanges(item,s) {
  // Compare permanent equipment values so a temporary chill cannot distort a swap.
  const before=stats(s),after=stats({...s,equipment:{...s.equipment,[item.slot]:item}});
  const fields=[
    ['Attack','attack'],['Defense','defense'],['Maximum health','maxHp'],
    ['Movement speed','movementSpeed',' tiles/s'],['Attack speed','attackSpeed',' attacks/s'],
    ['Attack range','attackRange',' tiles'],['Critical strike chance','crit',' percentage points',100],
    ['Critical strike multiplier','critMultiplier',' percentage points',100],
    ['Fire damage','fire'],['Cold damage','cold'],['Lightning damage','lightning'],
    ['Elemental resistance','resist',' percentage points'],['Life leech','leech',' percentage points'],
    ['Life regeneration','regen',' life/s']
  ];
  return fields.map(([label,key,unit='',scale=1])=>({label,delta:Number(((after[key]-before[key])*scale).toFixed(2)),unit})).filter(c=>c.delta!==0);
}
