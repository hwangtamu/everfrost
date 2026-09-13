// Forge-crafting panel: pick a target item, spend gold and essence on PoE-style
// orbs, or use the deterministic bench to add a chosen modifier at a chosen tier.
import {icon} from './icons.js';
import {AFFIXES, ITEM_RARITIES, affixText, affixSlots, canAddAffix, tierOf} from './loot.js';
import {CRAFT_OPERATIONS, craftCost, benchCost} from './crafting.js';

let craftSelected = '', benchAffix = '', benchTier = '';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => Math.floor(n).toLocaleString();

export const selectCraftItem = id => { craftSelected = id; };
export const selectBench = (affix, tier) => { if (affix) benchAffix = affix; if (tier !== undefined) benchTier = String(tier); };

export const craftTargets = s => [...Object.values(s.equipment).filter(Boolean), ...s.inventory];

function applicable(opId, item) {
  if (!item) return false;
  const open = side => canAddAffix(item, side);
  switch (opId) {
    case 'transmute': case 'alchemy': return item.rarity === 0;
    case 'augment': return item.rarity === 1 && (open('prefix') || open('suffix'));
    case 'regal': return item.rarity === 1;
    case 'chaos': return item.rarity === 2;
    case 'exalt': return item.rarity === 2 && (open('prefix') || open('suffix'));
    case 'scour': case 'divine': return item.rarity >= 1;
  }
  return false;
}

export function craftingPanel(s) {
  const items = craftTargets(s);
  const item = items.find(i => i.id === craftSelected) || items[0] || null;
  if (item) craftSelected = item.id;
  let def = benchAffix && AFFIXES[benchAffix] && AFFIXES[benchAffix].slots.includes(item?.slot) ? AFFIXES[benchAffix] : null;
  if (!def && item) {
    for (const [affixId, a] of Object.entries(AFFIXES)) {
      if (a.slots.includes(item.slot)) { def = a; benchAffix = affixId; break; }
    }
  }
  if (def && item) {
    const unlocked = def.tiers.map((t, i) => t.minLevel <= item.itemLevel ? i : -1).filter(i => i >= 0);
    const best = unlocked.length ? Math.max(...unlocked) : 0;
    if (!benchTier || tierOf(def, Number(benchTier)).minLevel > item.itemLevel) benchTier = String(def.tiers.length - best);
  }
  const tierNum = def ? Math.max(1, Math.min(def.tiers.length, Number(benchTier) || 1)) : 1;
  const benchBig = item && def ? benchCost(def, tierNum, item.itemLevel || 1) : null;
  const groupOptions = kind => Object.entries(AFFIXES)
    .filter(([, a]) => a.kind === kind && a.slots.includes(item.slot))
    .map(([affixId, a]) => `<option value="${affixId}" ${benchAffix === affixId ? 'selected' : ''}>${a.name} · ${a.label}</option>`).join('');
  return `<section class="panel secondary-panel craft-panel"><div class="view-section-title"><div><h2>The crafting bench</h2><p>Alter your gear the way the old smiths did. Orbs are paid with gold and essence; costs scale with item level.</p></div><button class="text-button" data-action="mod-dictionary">${icon('book')} Affix dictionary</button></div>
  <div class="craft-target"><label for="craft-item">Target</label><select id="craft-item">${items.map(i => `<option value="${i.id}" ${i.id === item?.id ? 'selected' : ''}>${ITEM_RARITIES[i.rarity]} ${esc(i.name)}${i.upgrade ? ' +' + i.upgrade : ''} · ilvl ${i.itemLevel}</option>`).join('')}</select><span class="craft-summary">${item ? `${item.slot} · ${affixSlots(item).prefix} of 3 prefixes · ${affixSlots(item).suffix} of 3 suffixes` : ''}</span></div>
  ${item ? `<div class="craft-preview"><ul>${item.affixes?.length ? item.affixes.map(a => `<li><span>${affixText(a)}</span><small>T${a.tier} · ${a.min}–${a.max}</small></li>`).join('') : '<li class="empty">No explicit modifiers · a blank canvas</li>'}</ul></div>` : ''}
  <div class="craft-orbs">${Object.entries(CRAFT_OPERATIONS).map(([opId, op]) => {
    const ok = applicable(opId, item), cost = item ? craftCost(op, item) : null;
    const afford = cost ? s.gold >= cost.gold && s.shards >= cost.shards : false;
    const off = !ok || !afford;
    const reason = !item ? 'Choose a target' : !ok ? 'Not usable on this item' : `Needs ${fmt(cost.gold)} gold · ${fmt(cost.shards)} essence`;
    return `<button class="craft-orb ${opId}" data-craft="${opId}" ${off ? 'disabled' : ''} title="${op.flavor}${off ? ' · ' + reason : ''}">${icon(op.icon)}<span><strong>${op.name}</strong><small>${cost ? `${fmt(cost.gold)} ${icon('coin')} · ${fmt(cost.shards)} ${icon('gem')}` : '—'}</small></span></button>`;
  }).join('')}</div>
  <div class="bench-row"><div class="bench-cell"><label for="bench-affix">Bench modifier</label><select id="bench-affix">${groupOptions('prefix')}${groupOptions('suffix')}</select></div><div class="bench-cell"><label for="bench-tier">Tier</label><select id="bench-tier">${def && item ? def.tiers.map((t, i) => { const n = def.tiers.length - i; return `<option value="${n}" ${Number(benchTier) === n ? 'selected' : ''} ${t.minLevel > item.itemLevel ? 'disabled' : ''}>T${n} · Lv ${t.minLevel}+ · ${t.minVal}–${t.maxVal}</option>`; }).join('') : ''}</select></div><div class="bench-pay"><span>${benchBig ? `${fmt(benchBig.gold)} ${icon('coin')} · ${fmt(benchBig.shards)} ${icon('gem')}` : '·'}</span><button class="button gold-button bench-apply" data-bench="1" ${!item || !benchBig || s.gold < benchBig.gold || s.shards < benchBig.shards ? 'disabled' : ''}>Apply ${icon('hammer')}</button></div></div></section>`;
}