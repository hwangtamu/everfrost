// Panel markup for the slide-over sheets and dialogs. Everything here is a pure
// function of game state (plus a small `ui` view-state object) returning HTML,
// so it can be rendered in the browser and exercised in Node tests alike.
import {REGIONS,QUESTS,stats,combatStats,enemyStats,region,journey,xpRequired,salvageGold,upgradeCost,skillRange,POTION_KILLS,compareItem,bestComparison,isUpgrade,gambleCost} from './engine.js';
import {GEAR,GEAR_SLOTS,RING_SLOTS,STAT_LABELS,BASES,baseOf,bonusLines,implicitStats} from './gear.js';
import {AFFIXES,UNIQUE_EFFECTS,ITEM_RARITIES,AFFIX_LIMIT,affixText,affixSlots,tierOf} from './loot.js';
import {ENEMY_TIERS,MODIFIERS} from './monsters.js';
import {CRAFT_OPERATIONS,craftCost,benchCost,craftBlock} from './crafting.js';
import {KEYSTONE_RECIPES,RIFT_MODIFIERS,RIFT_WAVES,modifierValue,riftBonuses} from './keystones.js';
import {SKILLS,SKILL_BY_ID,SKILL_SLOTS,MAX_SKILL_RANK,RUNE_RANK,skillRank,baseRank,gearRanks,skillParams,skillDetail,activeRune} from './skills.js';
import {TREE_NODES,TREE_BY_ID,TREE_EXTENT,TREE_PATHS,hasNode,canAllocate,respecCost,treeBonuses,describeStats} from './tree.js';
import {lootFilterSummary,matchesLootFilter} from './loot-filter.js';
import {GEMS,GEM_TYPES,GEM_GRADES,parseGem,gemKey,gemName,gemText,gemSummary,maxSockets,socketCost,unsocketCost} from './gems.js';
import {SETS,setCounts,setPiece} from './sets.js';
import {icon} from './icons.js';

export const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const fmt = n => { n = Math.floor(n); return n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e5 ? Math.round(n/1e3)+'k' : n.toLocaleString('en-US'); };
const num = (n, d = 1) => Number(n.toFixed(d)).toLocaleString('en-US');
export const SLOT_ICONS = {head:'helm',neck:'amulet',shoulder:'shoulder',chest:'armor',wrist:'bracer',hand:'sword',belt:'belt',leg:'legs',foot:'boots',leftRing:'ring',rightRing:'ring'};
const slotLabel = slot => RING_SLOTS.includes(slot) ? 'Ring' : GEAR[slot].label;
const sign = n => (n > 0 ? '+' : '') + n;

// ---------- Items ----------
export {compareItem, bestComparison, isUpgrade};
// Changes a swap makes that the damage/toughness figures do not capture.
const UTILITY = [['movementSpeed','movement speed',v=>num(v,2)+' tiles/s'],['attackRange','attack range',v=>num(v)+' tiles'],['maxMana','mana',v=>num(v,0)],['manaRegen','mana regen',v=>num(v)+'/s'],
  ['cooldownRate','cooldown recovery',v=>num(v*100,0)+'%'],['skillDamage','skill damage',v=>num(v*100,0)+'%'],['goldFind','gold found',v=>num(v,0)+'%'],['magicFind','item rarity',v=>num(v,0)+'%'],['allSkills','all skill ranks',v=>num(v,0)],['potionHeal','potion strength',v=>num(v*100,0)+'%']];
export function utilityChanges(s, item, slot = item.slot) {
  const before = stats({...s, effects:{chill:0}}), after = stats({...s, effects:{chill:0}, equipment:{...s.equipment, [slot]:{...item, slot}}});
  return UTILITY.map(([key, label, show]) => ({label, diff:after[key] - before[key], text:show(Math.abs(after[key] - before[key]))})).filter(c => Math.abs(c.diff) > 1e-6);
}

export function itemTile(item, {equipped = false, selected = false, upgrade = false, fresh = false, act = 'item'} = {}) {
  const pips = item.sockets?.length ? `<span class="tile-sockets">${item.sockets.map(k => `<i style="${k ? `background:${parseGem(k).def.color}` : ''}"></i>`).join('')}</span>` : '';
  return `<button class="tile r${item.rarity} ${item.set?'set':''} ${selected?'selected':''}" data-act="${act}" data-arg="${esc(item.id)}" ${equipped?'data-equipped="1"':''} aria-label="${esc(item.name)}, ${ITEM_RARITIES[item.rarity]} ${slotLabel(item.slot)}, item level ${item.itemLevel}${item.locked?', locked':''}${upgrade?', upgrade':''}">${icon(SLOT_ICONS[item.slot])}<span class="tile-level">${item.itemLevel}</span>${item.upgrade?`<span class="tile-plus">+${item.upgrade}</span>`:''}${upgrade?'<span class="tile-up" title="Upgrade">▲</span>':''}${item.locked?`<span class="tile-lock">${icon('lock')}</span>`:''}${fresh?'<span class="tile-new"></span>':''}${pips}</button>`;
}
function affixLines(item) {
  if (!item.affixes?.length) return '';
  return item.affixes.map(a => {
    const def = AFFIXES[a.id], span = a.max - a.min, quality = span > 0 ? Math.round((a.value - a.min) / span * 100) : 100;
    const best = def.tiers.length - def.tiers.findLastIndex(t => t.minLevel <= item.itemLevel);
    return `<li class="${def.kind}"><span>${esc(affixText(a))}</span><small class="${a.tier <= best ? 'top' : ''}" title="Tier ${a.tier} of ${def.tiers.length} · rolls ${a.min}–${a.max} · best tier at this item level: ${best}">${def.kind==='prefix'?'P':'S'} · T${a.tier} · ${quality}%</small></li>`;
  }).join('');
}
const baseLines = item => bonusLines(baseOf(item)).map(line => `<li class="base-bonus"><span>${esc(line)}</span><small>base</small></li>`).join('');
const socketLines = item => (item.sockets || []).map(key => key ? `<li class="gem"><span><i class="gem-dot" style="background:${parseGem(key).def.color}"></i>${esc(gemText(key, item.slot))}</span><small>${esc(gemName(key))}</small></li>` : '<li class="gem empty"><span><i class="gem-dot"></i>Empty socket</span><small>gem</small></li>').join('');
// The set block lists every piece and bonus; pass the wearer's state to mark what is active.
function setBlock(item, s) {
  const set = SETS[item.set]; if (!set) return '';
  const worn = s ? setCounts(Object.values(s.equipment))[item.set] || 0 : 0;
  const has = slot => s && Object.values(s.equipment).some(i => i?.set === item.set && (slot === 'ring' ? RING_SLOTS.includes(i.slot) : i.slot === slot));
  return `<div class="set-block" style="--c:${set.color}"><b>${esc(set.name)} set${s ? ` · ${worn}/4 worn` : ''}</b><p>${Object.entries(set.pieces).map(([slot, [name]]) => `<span class="${has(slot) ? 'on' : ''}">${esc(name)} <small>${slot === 'ring' ? 'ring' : GEAR[slot].label.toLowerCase()}</small></span>`).join('')}</p><ul>${set.bonuses.map(([need, , text]) => `<li class="${worn >= need ? 'on' : ''}"><i>${need}</i> ${esc(text)}</li>`).join('')}</ul></div>`;
}
function itemBody(item, s) {
  const unique = UNIQUE_EFFECTS[item.unique], imp = implicitStats(item), base = baseLines(item) + socketLines(item);
  return `<ul class="implicits">${Object.entries(imp).map(([k,v]) => `<li><span>${STAT_LABELS[k]}</span><b>${v}</b></li>`).join('')}</ul>
  ${base || item.affixes?.length ? `<ul class="affixes">${base}${affixLines(item)}</ul>` : ''}
  ${unique ? `<p class="unique-power">${icon('star')} <b>${esc(unique.name)}</b> — ${esc(unique.description)}</p>` : ''}${setBlock(item, s)}`;
}
const cardClass = item => `r${item.rarity}${item.set ? ' set' : ''}`;
const itemTitle = item => `<h3>${esc(item.name)}${item.upgrade ? ` <b>+${item.upgrade}</b>` : ''}</h3><small>${item.set ? 'Set' : ITEM_RARITIES[item.rarity]} ${slotLabel(item.slot)} · ${esc(baseOf(item).name)} · ilvl ${item.itemLevel}</small>`;
const delta = (label, value) => `<span class="delta ${value > .05 ? 'good' : value < -.05 ? 'bad' : ''}">${label} ${value > 0 ? '+' : ''}${num(value)}%</span>`;

export function itemDetail(s, item, {equipped = false} = {}) {
  const slots = RING_SLOTS.includes(item.slot) ? RING_SLOTS : [item.slot];
  const compare = equipped ? '' : slots.map(slot => {
    const c = compareItem(s, item, slot), current = s.equipment[slot], extras = utilityChanges(s, item, slot);
    return `<div class="compare"><small>If worn as ${GEAR[slot].label.toLowerCase()}</small><div>${delta('Damage', c.dps)}${delta('Toughness', c.tough)}</div>${extras.length ? `<p class="extras">${extras.map(e => `<span class="${e.diff > 0 ? 'good' : 'bad'}">${e.diff > 0 ? '+' : '−'}${e.text} ${e.label}</span>`).join('')}</p>` : ''}
    ${current ? `<details><summary>Replaces <span class="c${current.rarity}">${esc(current.name)}${current.upgrade ? ` +${current.upgrade}` : ''}</span></summary>${itemBody(current, s)}</details>` : '<small>The slot is empty.</small>'}</div>`;
  }).join('');
  const lock = `<button class="btn small icon-only ${item.locked ? 'on' : ''}" data-act="lock" data-arg="${esc(item.id)}" aria-pressed="${!!item.locked}" aria-label="${item.locked ? 'Unlock item' : 'Lock item: protect it from salvage and merging'}">${icon('lock')}</button>`;
  const actions = equipped
    ? `<button class="btn primary" data-act="forge-item" data-arg="${esc(item.id)}">${icon('hammer')} Forge</button>`
    : `${slots.map(slot => `<button class="btn primary" data-act="equip" data-arg="${esc(item.id)}" data-slot="${slot}">${icon('check')} ${slots.length > 1 ? GEAR[slot].label : 'Equip'}</button>`).join('')}<button class="btn" data-act="forge-item" data-arg="${esc(item.id)}">${icon('hammer')} Craft</button><button class="btn danger" data-act="salvage" data-arg="${esc(item.id)}" ${item.locked ? 'disabled' : ''}>${icon('coin')} ${fmt(salvageGold(item))}</button>`;
  return `<div class="item-card ${cardClass(item)}"><div class="item-head"><span class="tile ${cardClass(item)} static">${icon(SLOT_ICONS[item.slot])}</span><div>${itemTitle(item)}</div>${lock}</div>
  ${itemBody(item, s)}${!item.affixes?.length && !item.unique ? '<p class="muted small">No modifiers. Use an orb at the forge to add some.</p>' : ''}
  ${compare}<div class="actions">${actions}</div></div>`;
}

// ---------- Hero ----------
const DOLL = [['head','neck','shoulder'],['hand','chest','wrist'],['leftRing','belt','rightRing'],[null,'leg','foot']];
export function paperDoll(s, act = 'equipped') {
  return `<div class="doll">${DOLL.flat().map(slot => {
    if (!slot) return '<span></span>';
    const item = s.equipment[slot];
    return item ? itemTile(item, {equipped:true, act}) : `<button class="tile empty" data-act="empty-slot" data-arg="${slot}" aria-label="Empty ${GEAR[slot].label} slot">${icon(SLOT_ICONS[slot])}<span class="tile-caption">${slotLabel(slot)}</span></button>`;
  }).join('')}</div>`;
}
function activeSets(s) {
  const counts = setCounts(Object.values(s.equipment)), ids = Object.keys(counts);
  if (!ids.length) return '';
  return `<h4>Sets</h4>${ids.map(id => `<div class="set-block" style="--c:${SETS[id].color}"><b>${esc(SETS[id].name)} · ${counts[id]}/4</b><ul>${SETS[id].bonuses.map(([need, , text]) => `<li class="${counts[id] >= need ? 'on' : ''}"><i>${need}</i> ${esc(text)}</li>`).join('')}</ul></div>`).join('')}`;
}
export function heroPanel(s) {
  const p = combatStats(s), row = (label, value, hint = '') => `<li><span>${label}</span><b>${value}</b>${hint ? `<small>${hint}</small>` : ''}</li>`;
  const tree = treeBonuses(s);
  return `<div class="hero-top"><div class="hero-id"><button class="hero-name" data-act="rename" aria-label="Rename hero">${esc(s.name)} ${icon('feather')}</button><small>Level ${s.level} Vanguard · ${fmt(s.xp)} / ${fmt(xpRequired(s.level))} XP</small>
  <div class="power-pair"><div><small>Damage / sec</small><strong>${fmt(p.dps)}</strong></div><div><small>Toughness</small><strong>${fmt(p.toughness)}</strong></div></div></div>${paperDoll(s)}</div>
  <h4>Offense</h4><ul class="stat-list">
  ${row('Attack', num(p.attack))}${row('Attacks / sec', num(p.attackSpeed, 2))}${row('Critical chance', num(p.crit*100) + '%')}${row('Critical multiplier', num(p.critMultiplier*100, 0) + '%')}
  ${row('Fire / Cold / Lightning', `${num(p.fire)} / ${num(p.cold)} / ${num(p.lightning)}`, 'fire ignites · cold chills · lightning shocks')}${row('Splash damage', num(p.splash*100, 0) + '%', 'to 3 foes beside your target')}${row('Skill damage', num(p.skillDamage*100, 0) + '%')}${row('Attack range', num(p.attackRange) + ' tiles')}</ul>
  <h4>Defense</h4><ul class="stat-list">
  ${row('Health', fmt(p.maxHp))}${row('Armor', num(p.defense), 'blocks more of small hits')}${row('Elemental resistance', num(p.resist) + '%')}${row('Life regeneration', num(p.regen) + ' / sec')}${row('Life leech', num(p.leech) + '%')}${row('Damage taken', num(p.damageTaken*100, 0) + '%')}</ul>
  <h4>Utility</h4><ul class="stat-list">
  ${row('Mana', `${fmt(p.maxMana)} · ${num(p.manaRegen)} / sec`)}${row('Cooldown recovery', num(p.cooldownRate*100, 0) + '%')}${row('Movement speed', num(p.movementSpeed) + ' tiles / sec')}${row('Potions', `${p.potionCharges} × ${num(p.potionHeal*100, 0)}% health`)}${row('Gold found', '+' + num(p.goldFind, 0) + '%')}${row('Item rarity', '+' + num(p.magicFind, 0) + '%', 'better odds of rare and unique drops')}${p.allSkills ? row('All skill ranks', '+' + p.allSkills) : ''}</ul>
  ${activeSets(s)}<h4>Record</h4><ul class="stat-list">${row('Highest stage', s.maxStage)}${row('Enemies slain', fmt(s.kills))}${row('Guardians slain', fmt(s.bosses))}${row('Passive nodes', `${s.tree.length}${Object.keys(tree).length ? '' : ' · none yet'}`)}</ul>`;
}

// ---------- Bag ----------
export function inventoryItems(s, filter = 'all', sort = 'recent') {
  const items = s.inventory.filter(i => filter === 'all' || (filter === 'rings' ? RING_SLOTS.includes(i.slot) : i.slot === filter));
  if (sort === 'rarity') items.sort((a,b) => b.rarity - a.rarity || b.itemLevel - a.itemLevel);
  if (sort === 'level') items.sort((a,b) => b.itemLevel - a.itemLevel || b.rarity - a.rarity);
  if (sort === 'upgrade') { const gain = new Map(items.map(i => { const c = bestComparison(s, i); return [i.id, c.dps + c.tough]; })); items.sort((a,b) => gain.get(b.id) - gain.get(a.id)); }
  if (sort === 'slot') items.sort((a,b) => GEAR_SLOTS.indexOf(a.slot) - GEAR_SLOTS.indexOf(b.slot) || b.rarity - a.rarity || b.itemLevel - a.itemLevel);
  return items;
}
// Bulk salvage never touches rare, unique or forged gear.
export const salvageCandidates = (s, filter = 'all') => inventoryItems(s, filter).filter(i => i.rarity < 2 && !i.unique && !i.upgrade && !i.locked);
export const upgradeCount = s => s.inventory.filter(i => isUpgrade(bestComparison(s, i))).length;

export function bagPanel(s, ui) {
  const items = inventoryItems(s, ui.bagFilter, ui.bagSort), junk = salvageCandidates(s, ui.bagFilter), gold = junk.reduce((n,i) => n + salvageGold(i), 0);
  const filters = [['all','All'],['rings','Rings'],...GEAR_SLOTS.filter(x => !RING_SLOTS.includes(x)).map(x => [x, GEAR[x].label])];
  const tiles = items.map(i => itemTile(i, {upgrade:isUpgrade(bestComparison(s, i)), fresh:!!ui.fresh?.has(i.id)})).join('');
  const blanks = ui.bagFilter === 'all' ? '<span class="tile blank"></span>'.repeat(Math.max(0, 48 - items.length)) : '';
  return `<div class="bag-top">${paperDoll(s)}<div class="bag-side"><div class="bag-count"><span><b>${s.inventory.length}</b> / 48</span><small>${icon('coin')} ${fmt(s.gold)}</small></div>
  <button class="btn small" data-act="equip-best" ${upgradeCount(s) ? '' : 'disabled'}>${icon('up')} Equip upgrades</button>
  <button class="btn small" data-act="salvage-junk" ${junk.length ? '' : 'disabled'}>${icon('trash')} Salvage ${junk.length} · ${fmt(gold)}</button>
  <button class="btn small" data-act="loot-filter">${icon('filter')} Loot filter</button></div></div>
  <div class="bag-tools"><select id="bag-filter" aria-label="Filter by slot">${filters.map(([id,name]) => `<option value="${id}" ${ui.bagFilter===id?'selected':''}>${name}</option>`).join('')}</select><select id="bag-sort" aria-label="Sort items">${[['recent','Newest'],['upgrade','Best upgrade'],['rarity','Rarity'],['level','Item level'],['slot','Slot']].map(([id,name]) => `<option value="${id}" ${ui.bagSort===id?'selected':''}>${name}</option>`).join('')}</select><label class="toggle" title="Wear upgrades the moment they are picked up"><input type="checkbox" data-change="set-autoequip" ${s.settings.autoEquip ? 'checked' : ''}><span></span>Auto-equip</label></div>
  <p class="muted small filter-line">${icon('filter')} ${esc(lootFilterSummary(s.lootFilter))}</p>
  <div class="grid">${tiles}${blanks}</div>${items.length ? '<p class="muted small center">▲ would make you stronger · a dot marks new finds · locked items are never salvaged.</p>' : '<p class="muted center">Nothing here yet. Slain enemies drop gear onto the battlefield.</p>'}`;
}

// ---------- Skills ----------
export function skillsPanel(s, ui) {
  const p = stats(s);
  const slots = s.skills.slots.map((id, i) => {
    const def = SKILL_BY_ID[id];
    return `<button class="skill-slot ${ui.skillSlot===i?'selected':''}" data-act="pick-slot" data-arg="${i}" aria-label="Skill slot ${i+1}${def ? ': ' + def.name : ', empty'}" aria-pressed="${ui.skillSlot===i}">${def ? icon(def.icon) : icon('plus')}<small>${def ? esc(def.name) : 'Empty'}</small></button>`;
  }).join('');
  const list = SKILLS.map(def => {
    const rank = skillRank(s, def.id), locked = rank === 0, sp = skillParams(s, def.id, p.attackRange), slot = s.skills.slots.indexOf(def.id), rune = activeRune(s, def.id);
    const runes = rank >= RUNE_RANK ? `<div class="runes">${def.runes.map(r => `<button class="rune ${s.skills.runes[def.id]===r.id?'on':''}" data-act="rune" data-arg="${def.id}" data-rune="${r.id}" aria-pressed="${s.skills.runes[def.id]===r.id}"><b>${esc(r.name)}</b><small>${esc(r.description)}</small></button>`).join('')}</div>` : locked ? '' : `<small class="muted">Runes unlock at rank ${RUNE_RANK}: ${def.runes.map(r => esc(r.name)).join(' or ')}.</small>`;
    return `<article class="skill-card ${locked?'locked':''}" style="--skill:${def.color}"><div class="skill-head"><span class="skill-icon">${icon(locked ? 'lock' : def.icon)}</span><div><h3>${esc(def.name)}${rune ? ` <em>${esc(rune.name)}</em>` : ''}</h3><small>${locked ? `Unlocks at level ${def.level}` : `Rank ${baseRank(s, def.id)}/${MAX_SKILL_RANK}${gearRanks(s) ? ` <b class="gear-rank">+${gearRanks(s)}</b>` : ''} · ${num(sp.cooldown)}s · ${sp.mana} ${p.bloodMagic ? 'health' : 'mana'}`}</small></div>
    ${locked ? '' : `<button class="btn small primary" data-act="rank" data-arg="${def.id}" ${s.skillPoints > 0 && baseRank(s, def.id) < MAX_SKILL_RANK ? '' : 'disabled'} aria-label="Raise ${esc(def.name)} rank">${icon('plus')}</button>`}</div>
    <p>${esc(def.description)} ${locked ? '' : esc(skillDetail(s, def.id, p.attackRange))}</p>${runes}
    ${locked ? '' : `<div class="skill-foot"><button class="btn small ${slot>=0?'on':''}" data-act="assign" data-arg="${def.id}">${slot >= 0 ? `In slot ${slot+1}` : `Put in slot ${ui.skillSlot+1}`}</button><label class="toggle"><input type="checkbox" data-change="auto-skill" data-arg="${def.id}" ${s.skills.auto[def.id] !== false ? 'checked' : ''}><span></span>Auto-cast</label></div>`}</article>`;
  }).join('');
  return `<div class="points-bar"><span><b>${s.skillPoints}</b> skill point${s.skillPoints===1?'':'s'}</span><button class="btn small" data-act="reset-skills" ${Object.keys(s.skills.ranks).length ? '' : 'disabled'}>Reset ranks</button></div>
  <div class="skill-slots">${slots}</div><p class="muted small center">Pick a slot, then choose the skill to put there. Auto-cast skills fire on their own.</p>${list}`;
}

// ---------- Passive tree ----------
export function treePanel(s, ui) {
  const E = TREE_EXTENT, size = Math.round(E*2*ui.treeZoom), drawn = new Set();
  const lines = TREE_NODES.flatMap(n => n.links.map(l => {
    const key = [n.id,l].sort().join('|'); if (drawn.has(key)) return ''; drawn.add(key);
    const m = TREE_BY_ID[l], on = hasNode(s,n.id) && hasNode(s,m.id), reach = !on && (hasNode(s,n.id) || hasNode(s,m.id));
    return `<line x1="${n.x}" y1="${n.y}" x2="${m.x}" y2="${m.y}" class="${on?'on':reach?'reach':''}"/>`;
  })).join('');
  const nodes = TREE_NODES.map(n => {
    const owned = hasNode(s,n.id), can = canAllocate(s,n.id), r = n.type==='keystone' ? 24 : n.type==='notable' ? 18 : n.type==='start' ? 20 : 12;
    const shape = n.type==='keystone' ? `<rect x="${n.x-r}" y="${n.y-r}" width="${r*2}" height="${r*2}" rx="5" transform="rotate(45 ${n.x} ${n.y})"/>` : `<circle cx="${n.x}" cy="${n.y}" r="${r}"/>`;
    return `<g class="node ${n.type} ${owned?'owned':can?'can':''} ${ui.treeNode===n.id?'selected':''}" data-node="${n.id}" style="--c:${n.color}" tabindex="0" role="button" aria-label="${esc(n.name)}: ${esc(n.description)}${owned?' (allocated)':''}"><circle class="hit" cx="${n.x}" cy="${n.y}" r="${Math.max(r+8,22)}"/>${shape}</g>`;
  }).join('');
  const labels = TREE_PATHS.map((p,i) => { const a = -Math.PI/2 + i*Math.PI/3, r = E - 14; return `<text x="${Math.round(Math.cos(a)*r)}" y="${Math.round(Math.sin(a)*r)+4}" fill="${p.color}">${p.name.toUpperCase()}</text>`; }).join('');
  const n = TREE_BY_ID[ui.treeNode], cost = respecCost(s);
  const info = n ? `<div class="tree-info" style="--c:${n.color}"><div><h3>${esc(n.name)} <small>${n.type==='keystone'?'Keystone':n.type==='notable'?'Notable':n.type==='start'?'':'Passive'}</small></h3><p>${esc(n.description)}</p></div>${n.type==='start' ? '' : hasNode(s,n.id) ? `<span class="tag">${icon('check')} Taken</span>` : `<button class="btn primary" data-act="allocate" data-arg="${n.id}" ${canAllocate(s,n.id)?'':'disabled'}>${s.points > 0 ? (canAllocate(s,n.id) ? 'Allocate' : 'Not connected') : 'No points'}</button>`}</div>` : `<div class="tree-info"><p class="muted">Tap a node to read it. Nodes must connect to one you own.</p></div>`;
  return `<div class="points-bar"><span><b>${s.points}</b> passive point${s.points===1?'':'s'} · ${s.tree.length} taken</span><span class="row"><button class="btn small icon-only" data-act="tree-zoom" data-arg="-1" aria-label="Zoom out">${icon('minus')}</button><button class="btn small icon-only" data-act="tree-zoom" data-arg="1" aria-label="Zoom in">${icon('plus')}</button><button class="btn small" data-act="respec" ${s.tree.length ? '' : 'disabled'}>Respec · ${fmt(cost)} ${icon('coin')}</button></span></div>
  <div class="tree-scroll" id="tree-scroll"><svg class="tree" width="${size}" height="${size}" viewBox="${-E} ${-E} ${E*2} ${E*2}" role="group" aria-label="Passive tree">${lines}${nodes}${labels}</svg></div>${info}`;
}
export function treeSummary(s) { const t = treeBonuses(s); return Object.keys(t).length ? describeStats(t) : ''; }

// ---------- Forge ----------
export function forgeTarget(s, id) { return s.inventory.find(i => i.id === id) || Object.values(s.equipment).find(i => i?.id === id) || null; }
export function forgePanel(s, ui) {
  const equipped = Object.values(s.equipment).filter(Boolean);
  const item = forgeTarget(s, ui.forgeItem) || equipped[0] || s.inventory[0];
  if (!item && ui.forgeTab !== 'gamble') return '<p class="muted center">Find some equipment first.</p>';
  const tab = ui.forgeTab, tabs = `<div class="tabs sub">${[['upgrade','Temper'],['orbs','Orbs'],['bench','Bench'],['gems','Gems'],['gamble','Gamble']].map(([id,name]) => `<button class="${tab===id?'on':''}" data-act="forge-tab" data-arg="${id}">${name}</button>`).join('')}</div>`;
  if (tab === 'gamble') {
    const cost = gambleCost(s), can = s.gold >= cost && s.inventory.length < 48;
    const slots = [...GEAR_SLOTS.filter(x => !RING_SLOTS.includes(x)), 'ring'];
    return `${tabs}<div class="forge-box"><p>Buy an unidentified piece at item level <b>${s.maxStage}</b>. Most are magic, about a third are rare, and a few are unique. The base is random too.</p><div class="gamble-grid">${slots.map(slot => `<button class="gamble" data-act="gamble" data-arg="${slot}" ${can ? '' : 'disabled'}>${icon(SLOT_ICONS[slot === 'ring' ? 'leftRing' : slot])}<b>${slot === 'ring' ? 'Ring' : GEAR[slot].label}</b></button>`).join('')}</div><p class="center"><b class="c2">${fmt(cost)}</b> ${icon('coin')} each · you have ${fmt(s.gold)}${s.inventory.length >= 48 ? ' · bag full' : ''}</p></div>
    <div class="forge-box"><h4>Bases</h4><p class="muted small">Every slot drops as one of three bases.</p>${slots.map(slot => `<p class="small base-row"><b>${slot === 'ring' ? 'Ring' : GEAR[slot].label}</b> ${BASES[slot === 'ring' ? 'leftRing' : slot].map(b => `${esc(b.name)}${b.bonus ? ` <span class="muted">(${esc(bonusLines(b).join(', '))})</span>` : ''}`).join(' · ')}</p>`).join('')}</div>`;
  }
  const isEquipped = equipped.includes(item), up = upgradeCost(item);
  const picker = `<div class="picker">${equipped.map(i => itemTile(i, {act:'forge-pick', selected:i===item})).join('')}<span class="picker-gap"></span>${s.inventory.map(i => itemTile(i, {act:'forge-pick', selected:i===item})).join('')}</div>`;
  const head = `<div class="item-card ${cardClass(item)} compact"><div class="item-head"><span class="tile ${cardClass(item)} static">${icon(SLOT_ICONS[item.slot])}</span><div>${itemTitle(item)}${isEquipped ? '<small> · equipped</small>' : ''}</div></div>${itemBody(item, s)}</div>`;
  let body = '';
  if (tab === 'upgrade') {
    const next = implicitStats({...item, upgrade:item.upgrade+1}), now = implicitStats(item);
    body = isEquipped ? `<div class="forge-box"><p>Temper this piece: each rank adds 10% of its base stats.</p><ul class="implicits">${Object.keys(now).map(k => `<li><span>${STAT_LABELS[k]}</span><b>${now[k]} → <i>${next[k]}</i></b></li>`).join('')}</ul><div class="actions"><button class="btn primary" data-act="upgrade" data-arg="${item.slot}" ${s.gold >= up.gold ? '' : 'disabled'}>${icon('hammer')} Upgrade to +${item.upgrade+1} · ${fmt(up.gold)} ${icon('coin')}</button><button class="btn" data-act="upgrade-max" data-arg="${item.slot}" ${s.gold >= up.gold ? '' : 'disabled'}>Max</button></div></div>` : '<div class="forge-box"><p class="muted">Only equipped gear can be tempered. Equip this piece first, or pick an equipped item above.</p></div>';
    const merges = GEAR_SLOTS.flatMap(slot => [0,1,2].map(rarity => { const n = s.inventory.filter(i => i.slot === slot && i.rarity === rarity && !i.locked).length; return n >= 3 ? `<button class="btn small" data-act="merge" data-arg="${slot}" data-rarity="${rarity}" ${s.gold >= 75 ? '' : 'disabled'}>3 × ${ITEM_RARITIES[rarity]} ${slotLabel(slot)} → ${ITEM_RARITIES[rarity+1]}</button>` : ''; })).join('');
    body += `<div class="forge-box"><h4>Merge</h4><p class="muted small">Fuse three bag items of one slot and rarity into the next rarity. 75 gold.</p><div class="actions wrap">${merges || '<small class="muted">No matching sets of three in your bag.</small>'}</div></div>`;
  } else if (tab === 'gems') {
    const max = maxSockets(item.slot), sockets = item.sockets || [], open = sockets.includes(null), cost = socketCost(item);
    const row = max ? `<div class="socket-row">${sockets.map((key, i) => key ? `<button class="socket filled" data-act="gem-pull" data-arg="${i}" ${s.gold >= unsocketCost(item) ? '' : 'disabled'} aria-label="Remove ${esc(gemName(key))} for ${unsocketCost(item)} gold"><i class="gem-dot big" style="background:${parseGem(key).def.color}"></i><small>${esc(gemText(key, item.slot))}</small><em>pull · ${fmt(unsocketCost(item))} ${icon('coin')}</em></button>` : '<span class="socket"><i class="gem-dot big"></i><small>Empty</small></span>').join('')}${sockets.length < max ? `<button class="socket add" data-act="add-socket" ${s.gold >= cost ? '' : 'disabled'}>${icon('plus')}<small>Add socket</small><em>${fmt(cost)} ${icon('coin')}</em></button>` : ''}</div>` : '<p class="muted">Jewelry cannot hold gems. Pick armor or a hand piece.</p>';
    const owned = GEM_TYPES.flatMap(type => GEM_GRADES.map((_, grade) => gemKey(type, grade))).filter(key => s.gems[key] > 0);
    const pouch = owned.map(key => { const g = parseGem(key), n = s.gems[key]; return `<div class="gem-row"><i class="gem-dot big" style="background:${g.def.color}"></i><div><b>${esc(gemName(key))} <span class="muted">× ${n}</span></b><small>${esc(max ? gemText(key, item.slot) + ' here' : gemSummary(key))}</small></div>${g.grade < GEM_GRADES.length - 1 ? `<button class="btn small" data-act="gem-combine" data-arg="${key}" ${n >= 3 ? '' : 'disabled'} aria-label="Combine three into ${esc(gemName(gemKey(g.type, g.grade + 1)))}">3 → 1</button>` : ''}<button class="btn small primary" data-act="gem-socket" data-arg="${key}" ${open ? '' : 'disabled'}>Socket</button></div>`; }).join('');
    body = `<div class="forge-box"><p>Sockets ${sockets.length}/${max}. Gems grant one stat in hand and wrist pieces and another in armor. Pulled gems are returned.</p>${row}</div><div class="forge-box"><h4>Gem pouch</h4>${pouch || '<p class="muted small">No gems yet. Rare enemies and guardians drop them most often.</p>'}${owned.some(k => s.gems[k] >= 3 && parseGem(k).grade < 4) ? `<div class="actions"><button class="btn" data-act="gem-combine-all">Combine everything possible</button></div>` : ''}</div>`;
  } else if (tab === 'orbs') {
    body = `<div class="orb-grid">${Object.entries(CRAFT_OPERATIONS).map(([id, op]) => {
      const have = s.orbs[id] || 0, cost = craftCost(op, item).gold, block = craftBlock(item, id) || (have < 1 ? 'None held' : s.gold < cost ? 'Not enough gold' : '');
      return `<button class="orb-btn ${block && have > 0 ? 'blocked' : ''}" data-act="craft" data-arg="${id}" ${block ? 'disabled' : ''}><span class="orb-count">${have}</span><b>${esc(op.name.replace('Orb of ','').replace(' Orb',''))}</b><small>${esc(op.flavor)}</small><em>${block ? esc(block) : `${fmt(cost)} ${icon('coin')}`}</em></button>`;
    }).join('')}</div><p class="muted small center">Orbs drop from slain enemies. Each use also costs gold.</p>`;
  } else {
    const used = affixSlots(item), options = Object.entries(AFFIXES).filter(([id, def]) => def.slots.includes(item.slot) && !item.affixes?.some(a => a.id === id) && used[def.kind] < AFFIX_LIMIT && def.tiers[0].minLevel <= item.itemLevel);
    const affixId = options.some(([id]) => id === ui.benchAffix) ? ui.benchAffix : options[0]?.[0], def = AFFIXES[affixId];
    const tiers = def ? def.tiers.map((t, i) => ({tier:def.tiers.length - i, ...t})).filter(t => t.minLevel <= item.itemLevel).reverse() : [];
    const tier = tiers.some(t => t.tier === ui.benchTier) ? ui.benchTier : tiers[0]?.tier, cost = def && tier ? benchCost(def, tier, item.itemLevel).gold : 0;
    const blocked = item.rarity === 0 ? 'The bench needs a magic or rare item. Use an orb first.' : !def ? 'Every modifier slot is full, or nothing else fits this item.' : used[def.kind] >= AFFIX_LIMIT ? `All ${def.kind} slots are full.` : '';
    body = `<div class="forge-box"><p>Add a modifier of your choice for gold. Prefixes ${used.prefix}/${AFFIX_LIMIT} · suffixes ${used.suffix}/${AFFIX_LIMIT}.</p>${def ? `<div class="bench"><select id="bench-affix" aria-label="Modifier">${options.map(([id, d]) => `<option value="${id}" ${id===affixId?'selected':''}>${d.kind==='prefix'?'P':'S'} · ${esc(d.label.replace(/^% /,''))}</option>`).join('')}</select><select id="bench-tier" aria-label="Tier">${tiers.map(t => `<option value="${t.tier}" ${t.tier===tier?'selected':''}>T${t.tier} · ${t.minVal}–${t.maxVal}</option>`).join('')}</select></div>` : ''}${blocked ? `<p class="muted small">${blocked}</p>` : ''}<div class="actions"><button class="btn primary" data-act="bench" data-affix="${affixId||''}" data-tier="${tier||''}" ${!blocked && s.gold >= cost ? '' : 'disabled'}>${icon('hammer')} Craft · ${fmt(cost)} ${icon('coin')}</button></div></div>`;
  }
  return `${picker}${head}${tabs}${body}`;
}

// ---------- World: map, rifts, quests ----------
export function keystoneDetail(key) {
  const b = riftBonuses(key);
  return `<div class="item-card r${key.rarity} compact"><div class="item-head"><span class="tile r${key.rarity} static">${icon('portal')}</span><div><h3>${esc(key.name)}</h3><small>Level ${key.itemLevel} rift · ${RIFT_WAVES} waves</small></div></div>${key.modifiers.length ? `<ul class="affixes">${key.modifiers.map(m => `<li><span>+${modifierValue(m)}% ${esc(RIFT_MODIFIERS[m.id].label)}</span><small>${esc(RIFT_MODIFIERS[m.id].name)}</small></li>`).join('')}</ul>` : ''}<p class="small">Rewards: item level ${key.itemLevel + b.itemLevel} · +${b.quantity}% quantity · +${b.rarity}% rarity</p></div>`;
}
export function worldPanel(s, ui) {
  const tab = ui.worldTab, inTown = s.location === 'village', inRift = s.location === 'rift';
  const tabs = `<div class="tabs sub">${[['map','Stages'],['rifts',`Rifts${s.keystones.length ? ` · ${s.keystones.length}` : ''}`],['quests',`Quests${claimable(s) ? ' ●' : ''}`]].map(([id,name]) => `<button class="${tab===id?'on':''}" data-act="world-tab" data-arg="${id}">${name}</button>`).join('')}</div>`;
  if (tab === 'quests') return tabs + questList(s);
  if (tab === 'rifts') {
    const state = inRift ? `<div class="forge-box"><h4>${icon('portal')} Inside a rift</h4><p>Wave ${s.rift.wave} of ${RIFT_WAVES}${s.map.completed ? ' · cleared' : ''}. Leaving or dying closes it for good.</p>${keystoneDetail(s.rift.keystone)}<div class="actions"><button class="btn ${s.map.completed?'primary':'danger'}" data-act="village">${s.map.completed ? 'Return to Village' : 'Abandon rift'}</button></div></div>`
      : !inTown ? `<div class="forge-box"><h4>${icon('tree')} The Village</h4><p>Keystones are cut and rifts are opened in the Village. Your expedition waits exactly as you left it.</p><div class="actions"><button class="btn primary" data-act="village">${icon('portal')} Town portal</button></div></div>`
      : `<div class="forge-box"><h4>${icon('tree')} In the Village</h4><p>${s.returnPortal ? `Your stage ${s.stage} expedition is waiting.` : 'No expedition is waiting.'}</p><div class="actions">${s.returnPortal ? `<button class="btn primary" data-act="resume">${icon('play')} Resume expedition</button>` : ''}<button class="btn" data-act="new-run">${icon('compass')} New run · stage ${s.maxStage}</button>${s.riftPortal ? `<button class="btn primary" data-act="enter-rift">${icon('portal')} Enter rift</button>` : ''}</div>${s.riftPortal ? keystoneDetail(s.riftPortal) : ''}</div>`;
    const last = s.lastRift ? `<p class="muted small center">Last rift: ${s.lastRift.status}${s.lastRift.wave ? ` on wave ${s.lastRift.wave}` : ''}.</p>` : '';
    const keys = s.keystones.length ? s.keystones.slice(0, 24).map(k => `<div class="key-row r${k.rarity}"><span class="tile r${k.rarity} static">${icon('portal')}</span><div><b>${esc(k.name)}</b><small>Level ${k.itemLevel} · ${k.modifiers.length ? k.modifiers.map(m => RIFT_MODIFIERS[m.id].name).join(', ') : 'no modifiers'}</small></div><button class="btn small" data-act="key-info" data-arg="${esc(k.id)}">Info</button><button class="btn small primary" data-act="open-rift" data-arg="${esc(k.id)}" ${inTown && !s.riftPortal ? '' : 'disabled'}>Open</button></div>`).join('') : '<p class="muted small center">No keystones. Guardians and rare enemies sometimes drop them.</p>';
    const total = Object.values(s.orbs).reduce((a,b) => a+b, 0);
    const recipes = KEYSTONE_RECIPES.map(r => { const can = inTown && Object.entries(r.cost).every(([o,n]) => (s.orbs[o]||0) >= n); return `<button class="btn small r${r.rarity}" data-act="craft-key" data-arg="${r.rarity}" ${can ? '' : 'disabled'}><b>${r.label}</b> ${Object.entries(r.cost).map(([o,n]) => `${n} ${esc(CRAFT_OPERATIONS[o].name.replace('Orb of ','').replace(' Orb',''))}`).join(' + ')}</button>`; }).join('');
    return `${tabs}${state}${last}<h4>Keystones</h4>${keys}<h4>Cut a keystone <small class="muted">${total} orbs held</small></h4><div class="actions wrap">${recipes}</div><p class="muted small">A rift is ${RIFT_WAVES} waves ending in Vharos. Modifiers make it deadlier and raise item level, quantity and rarity. Level: <input id="key-level" type="number" min="1" max="${s.maxStage}" value="${s.maxStage}" aria-label="Keystone level"></p>`;
  }
  const maxCycle = Math.floor((s.maxStage-1)/20), cycle = Math.max(0, Math.min(maxCycle, ui.mapCycle ?? journey(s)-1)), first = cycle*20+1;
  const regions = REGIONS.map((r, index) => {
    const start = cycle*20 + r.start;
    return `<section class="region" style="--c:${r.color}"><div><b>${r.name}</b><small>${esc(r.boss)}</small></div><div class="stages">${Array.from({length:5}, (_,i) => start+i).map(stage => `<button class="${s.stage===stage&&!inRift?'current':''} ${stage<s.maxStage?'done':''}" data-act="travel" data-arg="${stage}" ${stage > s.maxStage || inRift ? 'disabled' : ''} aria-label="Stage ${stage}">${stage > s.maxStage ? icon('lock') : stage}</button>`).join('')}</div></section>`;
  }).join('');
  return `${tabs}<div class="mode-row"><label class="toggle"><input type="checkbox" data-change="advance" ${s.advance ? 'checked' : ''} ${s.location==='expedition'?'':'disabled'}><span></span>Auto-advance to the next stage</label><small class="muted">${s.advance ? 'Pushing forward after every guardian.' : 'Farming this stage on fresh maps.'}</small></div>
  <div class="pager"><button class="btn small icon-only" data-act="map-cycle" data-arg="${cycle-1}" ${cycle===0?'disabled':''} aria-label="Previous journey">${icon('chevron','flip')}</button><div><b>Journey ${cycle+1}</b><small>Stages ${first}–${first+19} · highest ${s.maxStage}</small></div><button class="btn small icon-only" data-act="map-cycle" data-arg="${cycle+1}" ${cycle>=maxCycle?'disabled':''} aria-label="Next journey">${icon('chevron')}</button></div>
  ${regions}<div class="actions"><button class="btn" data-act="reroll" ${s.location==='expedition'?'':'disabled'}>${icon('loop')} New map of stage ${s.stage}</button><button class="btn" data-act="travel" data-arg="${s.maxStage}" ${s.stage===s.maxStage||inRift?'disabled':''}>${icon('forward')} Go to stage ${s.maxStage}</button></div>`;
}
export const claimable = s => QUESTS.filter(q => !s.claimed.includes(q.id) && q.value(s) >= q.target).length;
function questList(s) {
  const open = QUESTS.filter(q => !s.claimed.includes(q.id)), done = QUESTS.length - open.length;
  return `<p class="muted small">${done} of ${QUESTS.length} deeds completed.</p>${open.slice(0, 8).map(q => {
    const value = Math.min(q.target, q.value(s)), ready = value >= q.target;
    return `<div class="quest ${ready?'ready':''}"><div><b>${esc(q.name)}</b><small>${esc(q.description)}</small><div class="bar"><i style="width:${value/q.target*100}%"></i></div></div><div class="quest-side"><small>${fmt(value)} / ${fmt(q.target)}</small><button class="btn small ${ready?'primary':''}" data-act="claim" data-arg="${q.id}" ${ready?'':'disabled'}>${icon('coin')} ${fmt(q.gold)}${q.orbs ? ' + orbs' : ''}</button></div></div>`;
  }).join('') || '<p class="center">Every deed is done. The realms still await.</p>'}`;
}

// ---------- Dialog content ----------
export function enemyDossier(s) {
  const e = s.enemy; if (!e) return '';
  const t = ENEMY_TIERS[e.tier], p = enemyStats(s, e);
  return `<div class="item-card compact" style="--rc:${t.color}"><div class="item-head"><span class="tile static" style="color:${t.color}">${icon(e.boss ? 'skull' : 'swords')}</span><div><h3 style="color:${t.color}">${esc(e.name)}</h3><small>${t.label} · level ${e.level}</small></div></div>
  <ul class="implicits"><li><span>Health</span><b>${fmt(Math.ceil(e.hp))} / ${fmt(e.maxHp)}</b></li><li><span>Damage per hit</span><b>${num(p.attack)}</b></li><li><span>Attacks / sec</span><b>${num(p.attackSpeed, 2)}</b></li><li><span>Critical chance</span><b>${num(p.crit*100, 0)}%</b></li></ul>
  ${e.modifiers.length ? `<ul class="affixes">${e.modifiers.map(m => `<li><span><b>${esc(MODIFIERS[m].name)}</b> — ${esc(MODIFIERS[m].description)}</span></li>`).join('')}</ul>` : '<p class="muted small">No special modifiers.</p>'}</div>`;
}
export function lootFilterForm(s) {
  const f = s.lootFilter;
  return `<form id="filter-form"><p class="muted small">Drops that fail the filter are turned into gold on pickup.</p>
  <div class="presets">${['Keep all','Magic +','Rare +','Unique only'].map((name, i) => `<button type="button" class="btn small ${f.minRarity===i?'on':''}" data-act="filter-preset" data-arg="${i}">${name}</button>`).join('')}</div>
  <label class="field">Minimum rarity<select name="minRarity">${ITEM_RARITIES.map((r,i) => `<option value="${i}" ${f.minRarity===i?'selected':''}>${i ? r + ' or better' : 'Everything'}</option>`).join('')}</select></label>
  <label class="field">Minimum item level<input name="minItemLevel" type="number" min="1" value="${f.minItemLevel}"></label>
  <fieldset><legend>Slots</legend><div class="checks">${GEAR_SLOTS.map(slot => `<label><input type="checkbox" name="slots" value="${slot}" ${f.slots.includes(slot)?'checked':''}>${GEAR[slot].label}</label>`).join('')}</div></fieldset>
  <fieldset><legend>Only keep items with any of (optional)</legend><div class="checks">${Object.entries(AFFIXES).map(([id,a]) => `<label><input type="checkbox" name="affixes" value="${id}" ${f.affixes.includes(id)?'checked':''}>${esc(a.label.replace(/^% /,''))} <small class="muted">${esc(a.name)}</small></label>`).join('')}</div></fieldset>
  <label class="toggle row-toggle"><input type="checkbox" name="keepUpgrades" ${f.keepUpgrades?'checked':''}><span></span><div>Always keep upgrades<small>Anything that would make you stronger gets through</small></div></label>
  <label class="toggle row-toggle"><input type="checkbox" name="alwaysShowUnique" ${f.alwaysShowUnique?'checked':''}><span></span><div>Always keep uniques and set pieces</div></label>
  <div class="actions"><button class="btn primary" type="submit">Save filter</button></div></form>`;
}
export function offlineSummary(s, r) {
  const counts = (r.orbs||[]).reduce((m,id) => (m[id] = (m[id]||0)+1, m), {}), orbCount = (r.orbs||[]).length;
  const h = Math.floor(r.seconds/3600), m = Math.floor(r.seconds%3600/60);
  return `<p>Your hero kept fighting for <b>${h ? h+'h ' : ''}${m}m</b> at half pace.</p><div class="reward-row"><div>${icon('skull')}<b>${fmt(r.kills)}</b><small>Kills</small></div><div>${icon('coin')}<b>${fmt(r.gold)}</b><small>Gold</small></div><div>${icon('star')}<b>${fmt(r.xp)}</b><small>XP</small></div><div>${icon('sparkles')}<b>${orbCount}</b><small>Orbs</small></div></div>${r.items?.length ? `<p class="small">Brought back: ${r.items.map(i => `<span class="c${i.rarity}">${esc(i.name)}</span>`).join(', ')}.</p>` : ''}${orbCount ? `<p class="muted small">${Object.entries(counts).map(([id,n]) => `${esc(CRAFT_OPERATIONS[id].name)} ×${n}`).join(', ')}</p>` : ''}<div class="actions"><button class="btn primary" data-act="close">Back to the hunt</button></div>`;
}
export const HELP = [
  ['swords','It fights for you','Your hero hunts through each map on their own, casting slotted skills automatically. Tap the ground to move, tap an enemy to focus it, tap a skill to cast it yourself.'],
  ['skull','Break the seal','Slay packs to fill the seal bar, then kill the guardian to open the next stage. If you fall twice on one map you drop back a stage and farm until you are stronger.'],
  ['bag','Gear up','Loot drops on the ground and is picked up for you. In the bag, ▲ marks upgrades; “Equip upgrades” wears them all. The loot filter turns junk into gold.'],
  ['nodes','Build your hero','Every level gives a passive point for the tree and a skill point for skill ranks. Rank 4 unlocks a rune that reshapes a skill. Keystones at the end of each path trade one strength for another.'],
  ['hammer','Forge','Temper equipped gear with gold, use orbs to reroll or add modifiers, pick an exact modifier at the bench, set gems into sockets, or gamble for new pieces.'],
  ['gem','Sets and gems','Green set pieces grow stronger together: wear two, three or four of a set for its bonuses. Gems drop from tougher enemies; three of a kind combine into a better one.'],
  ['portal','Rifts','Cut keystones from orbs in the Village and open a rift: five waves and a boss for higher-level, richer loot. One entry — death closes it.'],
  ['clock','Away','With the fight running you earn gold, experience and orbs for up to 8 hours while the game is closed.']
];
export const helpContent = () => `<div class="help">${HELP.map(([i,t,p]) => `<div>${icon(i)}<section><h4>${t}</h4><p>${p}</p></section></div>`).join('')}</div><div class="actions"><button class="btn primary" data-act="close">Got it</button></div>`;
export {matchesLootFilter, skillRange, POTION_KILLS, SKILL_SLOTS};
