import {icon} from './icons.js';
import {stats,livingEnemies} from './engine.js';
import {distance} from './world.js';
import {ENEMY_TIERS,MODIFIERS} from './monsters.js';
import {ITEM_RARITIES,affixText,UNIQUE_EFFECTS} from './loot.js';
import {drawMinimap} from './renderer.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cache=new Map();
function html(id,value){if(cache.get(id)!==value){$(id).innerHTML=value;cache.set(id,value);}}

export function mountExpedition(){
  $('battlefield').insertAdjacentHTML('beforebegin',`<section class="stage-objective" aria-label="Stage guardian progress"><div class="objective-heading"><span class="objective-emblem">${icon('lock')}</span><div><span class="objective-eyebrow">STAGE OBJECTIVE</span><h2 id="objective-title">Reveal the guardian</h2></div><strong id="objective-percent">0%</strong></div><div id="guardian-progress" class="guardian-progress" role="progressbar" aria-label="Progress toward the stage guardian" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="guardian-progress-fill"></i><span class="boss-gate">${icon('trophy')}</span></div><div class="objective-detail"><span id="objective-description">Defeat enemies to break the seal.</span><span id="objective-counter">0 / 0</span></div></section>`);
  $('enemy-card').insertAdjacentHTML('afterbegin',`<div class="enemy-tier-line"><span id="enemy-tier" class="tier-chip">NORMAL</span><span id="enemy-distance"></span><button class="icon-button" data-action="enemy-info" aria-label="Inspect targeted enemy">${icon('info')}</button></div>`);
  $('enemy-card').insertAdjacentHTML('beforeend',`<div id="enemy-mods" class="enemy-mods"></div>`);
  $('battlefield').insertAdjacentHTML('beforeend',`<button class="minimap-control" data-action="expedition-map" aria-label="Open expedition map"><canvas id="minimap" width="184" height="136" aria-hidden="true"></canvas><span>${icon('map')} Expedition map</span></button><div id="combat-statuses" class="combat-statuses"></div>`);
  $('battlefield').insertAdjacentHTML('afterend',`<div class="expedition-meta"><div><strong id="expedition-name"></strong><span id="map-seed"></span></div><button class="text-button" data-action="reroll-map">${icon('compass')} New map</button></div><div class="threat-legend">${Object.entries(ENEMY_TIERS).map(([id,t])=>`<button data-action="threat-guide" class="threat-key" style="--tier-color:${t.color}"><i></i>${t.label}<small>${id==='unique'?'BOSS':'+'+t.points}</small></button>`).join('')}</div>`);
  $('battle-canvas').setAttribute('aria-label','Procedural expedition map. Click the ground to follow a walkable path, or click an enemy to target it. Use arrow keys while the map is focused.');
}

export function updateExpedition(s){
  const m=s.map,e=s.enemy,p=stats(s),t=ENEMY_TIERS[e.tier];
  const percent=Math.min(100,Math.round(m.progress/m.goal*100)),remaining=s.enemies.filter(x=>!x.boss&&x.hp>0).length;
  $('objective-title').textContent=m.completed?'Expedition cleared':m.bossUnlocked?'Defeat the stage guardian':'Reveal the guardian';
  $('objective-percent').textContent=m.completed?'CLEARED':`${percent}%`;
  $('guardian-progress').setAttribute('aria-valuenow',String(percent));
  $('guardian-progress').setAttribute('aria-valuetext',m.completed?'Guardian defeated':m.bossUnlocked?'Guardian unlocked':`${m.progress} of ${m.goal} progress. ${remaining} enemies remain.`);
  $('guardian-progress-fill').style.width=`${percent}%`;
  $('guardian-progress').classList.toggle('unlocked',m.bossUnlocked);
  $('objective-description').textContent=m.completed?(s.advance?'The next expedition begins shortly.':'A new map of this stage begins shortly.'):m.bossUnlocked?s.enemies.find(e=>e.boss).name:`${remaining} enemies remain · stronger foes grant more progress`;
  $('objective-counter').textContent=m.completed?`${s.killsInStage} defeated`:m.bossUnlocked?'SEAL BROKEN':`${m.progress} / ${m.goal}`;
  $('expedition-name').textContent=m.name;
  $('map-seed').textContent=`SEED ${m.seed.toString(16).toUpperCase().padStart(8,'0')} · LINEAR TRAIL`;
  $('field-location').textContent=m.bossUnlocked?'THE GUARDIAN’S SANCTUM':m.name.toUpperCase();
  $('enemy-tier').textContent=e.boss?'UNIQUE · STAGE BOSS':t.label.toUpperCase();
  $('enemy-tier').style.color=t.color;$('enemy-card').style.setProperty('--enemy-color',t.color);
  $('enemy-distance').textContent=e.hp<=0?'Defeated':`${Math.round(distance(e,s.player))} tiles away`;
  $('enemy-name').textContent=e.name;$('enemy-level').textContent=`Lv. ${e.level}`;
  $('enemy-hp').style.background=t.color;
  html('enemy-mods',e.modifiers.length?e.modifiers.map(id=>`<button data-action="enemy-info" class="modifier-tag ${MODIFIERS[id].kind==='aura'?'aura-tag':''}" title="${esc(MODIFIERS[id].description)}">${icon(MODIFIERS[id].icon)}${MODIFIERS[id].name}</button>`).join(''):'<span class="no-modifiers">No special modifiers</span>');
  $('enemy-card').hidden=m.completed;
  $('wave-count').textContent=`${s.killsInStage} defeated`;
  $('battle-status').textContent=m.completed?'Stage complete':!s.auto?'Battle paused':s.player.manual?'Following your path':distance(e,s.player)>2?'Exploring the next clearing':`Fighting ${t.label.toLowerCase()} enemies`;
  $('field-hint').textContent='Tap ground to move · tap a foe to target';
  for(const id of ['cleave','storm']){
    const level=id==='cleave'?1:5,range=id==='cleave'?3:6;
    if(s.level>=level&&s.cooldowns[id]<=0&&!m.completed&&!livingEnemies(s).some(e=>distance(e,s.player)<=range)){
      document.querySelector(`[data-skill="${id}"]`).disabled=true;$(`skill-${id}-status`).textContent='No targets in range';
    }
  }
  $('field-hp-text').textContent=`${Math.ceil(s.hp)} / ${p.maxHp}`;
  html('combat-statuses',`${s.effects.chill>0?`<span class="chilled-status">${icon('gem')} Chilled ${Math.ceil(s.effects.chill)}s</span>`:''}${s.hazards.length?`<span class="danger-status">${icon('zap')} Move out of the marked area</span>`:''}`);
  if(!s.auto&&s.died){
    if($('battle-overlay').querySelector('h3')?.textContent!=='Back at camp.')$('battle-overlay').innerHTML=`<div>${icon('shield')}<h3>Back at camp.</h3><p>Your map progress is safe.<br>Improve your gear or return to an earlier stage.</p><button class="button gold-button" data-action="auto">${icon('play')} Return to the hunt</button></div>`;
  }
  if(m.completed){
    $('battle-overlay').hidden=false;
    if($('battle-overlay').querySelector('h3')?.textContent!=='Guardian defeated.')$('battle-overlay').innerHTML=`<div>${icon('trophy')}<h3>Guardian defeated.</h3><p>Stage ${s.stage} cleared.<br>${s.advance?'The next expedition awaits.':'Preparing a fresh map of this stage.'}</p></div>`;
  }
  drawMinimap($('minimap'),s);
  drawMinimap($('expedition-overview'),s,true);
}

export function enemyDetails(s){
  const e=s.enemy,t=ENEMY_TIERS[e.tier],multiplier=t.reward*(1+e.modifiers.length*.15);
  return `<div class="enemy-inspection" style="--enemy-color:${t.color}"><span class="inspection-tier">${t.label}${e.boss?' · Stage guardian':''} · Level ${e.level}</span><h3>${esc(e.name)}</h3><div class="enemy-stat-line"><span>${icon('heart')} ${Math.ceil(e.hp)} / ${e.maxHp} life</span><span>${icon('swords')} ${e.baseDamage.toFixed(1)} base attack</span></div><div class="enemy-reward-line">${icon('coin')} ${multiplier.toFixed(1)}× gold & experience <span>${e.boss?'2 rare-or-better drops':e.tier==='rare'?'Guaranteed magic-or-better loot':e.tier==='magic'?'70% equipment drop chance':'30% equipment drop chance'}</span></div>${e.modifiers.length?`<h4>Combat modifiers</h4><div class="modifier-details">${e.modifiers.map(id=>`<div>${icon(MODIFIERS[id].icon)}<section><strong>${MODIFIERS[id].name}<small>${MODIFIERS[id].kind}</small></strong><p>${MODIFIERS[id].description}</p></section></div>`).join('')}</div>`:'<p class="dialog-description">A normal enemy with no special modifiers. Defeating it adds 1 point toward revealing the guardian.</p>'}</div>`;
}

export function threatGuide(){
  return `<p class="dialog-description">Color identifies a monster’s rarity. Read its modifiers, then choose your target. Defeating an aura bearer removes its support from the pack.</p><div class="tier-guide">${Object.entries(ENEMY_TIERS).map(([id,t])=>`<div style="--enemy-color:${t.color}"><span>${t.label}</span><p>${id==='normal'?'Ordinary packs · no modifiers · +1 progress':id==='magic'?'Enchanted packs · 1 shared modifier · +2 progress each':id==='rare'?'Elite leaders · 2 modifiers · +5 progress': 'Named stage guardians · telegraphed area attacks · unlock the next stage'}</p></div>`).join('')}</div><h3 class="guide-heading">Know your enemy</h3><div class="modifier-details">${Object.values(MODIFIERS).map(m=>`<div>${icon(m.icon)}<section><strong>${m.name}<small>${m.kind}</small></strong><p>${m.description}</p></section></div>`).join('')}</div>`;
}

export function expeditionOverview(s){
  return `<div class="overview-caption"><span>${esc(s.map.name)}</span><span>Stage ${s.stage} · ${s.map.progress} / ${s.map.goal}</span></div><canvas id="expedition-overview" width="690" height="510" aria-label="Current map layout, discovered terrain, hero position, monsters, shrine and chest"></canvas><div class="overview-legend"><span class="legend-hero">● Hero</span><span class="legend-boss">● Guardian</span><span class="legend-shrine">● Healing shrine</span><span class="legend-cache">● Chest</span></div><p class="dialog-description">Follow one winding trail from camp to the final sanctum. Clearings and enemy packs change with every map. Tap the battlefield to move or focus an aura bearer.</p><button class="button" data-action="threat-guide">${icon('book')} Enemy tiers & modifiers</button>`;
}

export function itemAffixSummary(item){
  const count=item.affixes?.length||0;
  return count?`<span class="affix-summary">${icon('sparkles')} ${count} modifiers${item.unique?' · unique power':''}</span>`:'';
}

export function itemAffixDetails(item,s){
  const unique=Object.values(UNIQUE_EFFECTS).find(u=>u.id===item.unique),before=stats(s),after=stats({...s,equipment:{...s.equipment,[item.slot]:item}});
  const changes=[['Attack',after.attack-before.attack],['Defense',after.defense-before.defense],['Maximum health',after.maxHp-before.maxHp],['Elemental damage',after.fire+after.cold+after.lightning-before.fire-before.cold-before.lightning],['Attack speed',after.haste-before.haste,'%'],['Resistance',after.resist-before.resist,'%']].filter(([,delta])=>delta!==0);
  return `<div class="affix-detail"><div class="affix-detail-heading"><span>ITEM LEVEL ${item.itemLevel||1}</span><span>${ITEM_RARITIES[item.rarity]}</span></div>${item.affixes?.length?`<ul>${item.affixes.map(a=>`<li><span>${affixText(a)}</span><small>T${a.tier||5}</small></li>`).join('')}</ul>`:'<p>No rolled modifiers.</p>'}${unique?`<div class="unique-power">${icon('star')}<div><strong>${unique.name}</strong><p>${unique.description}</p></div></div>`:''}${changes.length?`<div class="equipment-comparison"><strong>If equipped</strong>${changes.map(([name,delta,unit=''])=>`<div><span>${name}</span><b class="${delta>0?'positive':'negative'}">${delta>0?'+':''}${delta}${unit}</b></div>`).join('')}</div>`:''}</div>`;
}
