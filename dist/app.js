// Browser shell: full-screen battlefield, HUD, slide-over panels, input,
// persistence and cloud sync. Game rules live in engine.js; panel markup in panels.js.
import {SAVE_KEY,SKILLS,stats,combatStats,region,journey,xpRequired,tick,useSkill,usePotion,equip,salvage,salvageGold,upgrade,upgradeCost,merge,travel,claimQuest,loadGame,saveGame,createGame,offlineRewards,startExpedition,movePlayer,collectLoot,teleportVillage,resumeExpedition,startVillageStage,craftKeystone,openRiftPortal,enterRift,POTION_KILLS} from './engine.js';
import {SKILL_BY_ID,skillRank,skillParams,investSkill,chooseRune,slotSkill,resetSkills} from './skills.js';
import {allocate,respec,respecCost,TREE_BY_ID,TREE_EXTENT} from './tree.js';
import {GEAR,RING_SLOTS} from './gear.js';
import {ITEM_RARITIES} from './loot.js';
import {ENEMY_TIERS,MODIFIERS} from './monsters.js';
import {craft,benchCraft,CRAFT_OPERATIONS} from './crafting.js';
import {RIFT_WAVES} from './keystones.js';
import {normalizeLootFilter} from './loot-filter.js';
import {CloudSaves,restorePayload} from './cloud-saves.js';
import {connectAccount} from './firebase.js';
import {icon} from './icons.js';
import {Battlefield,drawMinimap} from './renderer.js';
import {esc,fmt,heroPanel,bagPanel,skillsPanel,treePanel,forgePanel,worldPanel,itemDetail,keystoneDetail,enemyDossier,lootFilterForm,offlineSummary,helpContent,forgeTarget,salvageCandidates,bestComparison,isUpgrade,upgradeCount,claimable} from './panels.js';

const loaded = loadGame();
let state = loaded.state;
const ui = {sheet:null, bagFilter:'all', bagSort:'recent', skillSlot:0, treeZoom:.8, treeNode:null, forgeItem:null, forgeTab:'upgrade', benchAffix:null, benchTier:null, worldTab:'map', mapCycle:null};
const $ = id => document.getElementById(id);
const wide = matchMedia('(min-aspect-ratio: 1/1)');
const SHEETS = {hero:['Hero','user'], bag:['Bag','bag'], skills:['Skills','zap'], tree:['Passives','nodes'], forge:['Forge','hammer'], world:['World','map']};
let audioContext, lastHitSound = 0, sheetDirty = false, pendingSalvage = [], pendingConfirm = null;

// ---------- Small helpers ----------
const cache = new Map();
function setText(id, value) { if (cache.get(id) !== value) { cache.set(id, value); $(id).textContent = value; } }
function setHtml(id, value) { if (cache.get(id) !== value) { cache.set(id, value); $(id).innerHTML = value; } }
function setStyle(id, prop, value) { const key = id+'|'+prop; if (cache.get(key) !== value) { cache.set(key, value); $(id).style.setProperty(prop, value); } }
function toast(message, type = 'info') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = message;
  $('toasts').append(el); while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => el.remove(), 3200);
}
function feed(html, cls = '') {
  const el = document.createElement('div'); el.className = `feed-line ${cls}`; el.innerHTML = html;
  $('feed').append(el); while ($('feed').children.length > 5) $('feed').firstChild.remove();
  setTimeout(() => el.remove(), 4200);
}
let bannerTimer;
function banner(title, subtitle = '', cls = '') {
  const el = $('banner'); el.className = `banner show ${cls}`; el.innerHTML = `<strong>${esc(title)}</strong>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}`;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { el.className = 'banner'; }, 2100);
}
function sound(freq = 440, length = .12, type = 'sine') {
  if (!state.settings.sound) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)(); void audioContext.resume();
    const o = audioContext.createOscillator(), g = audioContext.createGain();
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(.03, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + length);
    o.connect(g).connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + length);
  } catch { /* Sound is optional. */ }
}
function modal(title, body) {
  const d = $('dialog');
  $('dialog-content').innerHTML = `<header><h2 id="dialog-title">${esc(title)}</h2><button class="icon-btn" data-act="close" aria-label="Close">${icon('close')}</button></header><div class="dialog-body">${body}</div>`;
  if (!d.open) d.showModal();
}
const closeModal = () => { if ($('dialog').open) $('dialog').close(); };
function confirmModal(title, text, label, action, danger = true) {
  pendingConfirm = action;
  modal(title, `<p>${text}</p><div class="actions"><button class="btn" data-act="close">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="confirm">${esc(label)}</button></div>`);
}

// ---------- HUD ----------
let skillbarKey = '';
function renderSkillbar() {
  const key = state.skills.slots.join(',') + '|' + state.level + '|' + JSON.stringify(state.skills.auto);
  if (key === skillbarKey) return; skillbarKey = key;
  $('skillbar').innerHTML = state.skills.slots.map((id, i) => {
    const def = SKILL_BY_ID[id];
    if (!def) return `<button class="skill empty" data-act="open" data-arg="skills" aria-label="Empty skill slot ${i+1}">${icon('plus')}</button>`;
    const locked = state.level < def.level;
    return `<button class="skill ${locked ? 'locked' : ''}" id="skill-${i}" data-act="cast" data-arg="${id}" style="--skill:${def.color}" aria-label="${esc(def.name)}${locked ? `, unlocks at level ${def.level}` : ''}">${icon(locked ? 'lock' : def.icon)}<i class="cd"></i><b class="cd-text"></b>${locked ? `<small>Lv ${def.level}</small>` : state.skills.auto[id] !== false ? '<small class="auto">AUTO</small>' : ''}</button>`;
  }).join('') + `<button class="skill potion" id="potion" data-act="potion" aria-label="Health potion">${icon('flask')}<i class="cd"></i><b class="count" id="potion-count"></b></button>`;
  cache.clear();
}
function updateHud() {
  const p = stats(state), r = region(state), map = state.map, e = state.enemy, inRift = state.location === 'rift', inTown = state.location === 'village';
  setStyle('hp-fill', 'height', `${Math.max(0, Math.min(100, state.hp / p.maxHp * 100))}%`); setText('hp-text', fmt(Math.ceil(state.hp)));
  setStyle('mp-fill', 'height', `${Math.max(0, Math.min(100, state.mana / p.maxMana * 100))}%`); setText('mp-text', fmt(Math.floor(state.mana)));
  $('hp-orb').classList.toggle('low', state.hp < p.maxHp * .35); $('hp-orb').classList.toggle('warded', state.effects.ward > 0);
  setStyle('xp-bar', 'width', `${state.xp / xpRequired(state.level) * 100}%`); setText('level-text', `Lv ${state.level}`);
  setText('gold', fmt(state.gold));
  setText('region-name', inRift ? 'Rift' : inTown ? 'Village' : r.name);
  setText('stage-label', inRift ? `Wave ${state.rift.wave}/${RIFT_WAVES}` : `Stage ${state.stage}`);
  const sealPct = inRift ? (state.rift.wave - 1 + (map.completed ? 1 : 0)) / RIFT_WAVES * 100 : map.bossUnlocked ? 100 : map.goal ? map.progress / map.goal * 100 : 0;
  setStyle('seal-bar', 'width', `${sealPct}%`); $('stage-chip').classList.toggle('boss', !!map.bossUnlocked && !map.completed);
  setHtml('mode-btn', icon(state.advance ? 'forward' : 'loop')); $('mode-btn').classList.toggle('on', state.advance); $('mode-btn').disabled = state.location !== 'expedition';
  $('mode-btn').setAttribute('aria-label', state.advance ? 'Auto-advance on. Tap to farm this stage.' : 'Farming this stage. Tap to auto-advance.');
  setText('speed-btn', `${state.speed}×`);
  setHtml('pause-btn', icon(state.auto ? 'pause' : 'play'));
  // Target plate
  const show = e && e.hp > 0 && !inTown && (!e.boss || map.bossUnlocked);
  $('target').hidden = !show;
  if (show) {
    const tier = ENEMY_TIERS[e.tier];
    setText('target-name', e.name); setStyle('target-name', 'color', tier.color);
    setStyle('target-bar', 'width', `${e.hp / e.maxHp * 100}%`); setStyle('target-bar', 'background', e.tier === 'normal' ? '#d9584a' : tier.color);
    setHtml('target-mods', e.modifiers.map(m => `<span>${esc(MODIFIERS[m].name)}</span>`).join(''));
    $('target').classList.toggle('boss', e.boss);
  }
  // Skills
  renderSkillbar();
  state.skills.slots.forEach((id, i) => {
    const b = $('skill-' + i); if (!b || !id) return;
    const def = SKILL_BY_ID[id], sp = skillParams(state, id, p.attackRange), cd = state.cooldowns[id] || 0, locked = state.level < def.level;
    const starved = !locked && (p.bloodMagic ? state.hp <= sp.mana : state.mana < sp.mana);
    const frac = cd > 0 ? Math.min(1, cd / sp.cooldown) : 0;
    b.style.setProperty('--cd', frac); b.querySelector('.cd-text').textContent = cd > 0 ? (cd >= 10 ? Math.ceil(cd) : cd.toFixed(1)) : '';
    b.classList.toggle('cooling', cd > 0); b.classList.toggle('starved', starved); b.classList.toggle('active', (id === 'whirl' && state.effects.whirl > 0) || (id === 'warcry' && state.effects.warcry > 0) || (id === 'ward' && state.effects.ward > 0));
  });
  setText('potion-count', String(state.potion.charges)); $('potion').classList.toggle('starved', state.potion.charges <= 0);
  $('potion').style.setProperty('--cd', state.potion.charges >= p.potionCharges ? 0 : 1 - state.potion.progress / POTION_KILLS);
  // Dock badges
  badge('dock-bag', state.inventory.length >= 44 ? 'full' : dockUpgrades ? '▲' : '');
  badge('dock-skills', state.skillPoints > 0 ? String(state.skillPoints) : '');
  badge('dock-tree', state.points > 0 ? String(state.points) : '');
  badge('dock-world', claimable(state) ? '!' : state.keystones.length && !inRift ? String(state.keystones.length) : '');
  // Overlay
  const overlay = inTown ? `<div class="overlay-card"><h3>${icon('tree')} The Village</h3><p>Safe ground. ${state.returnPortal ? `Your stage ${state.stage} expedition is waiting.` : ''}</p><div class="actions wrap">${state.returnPortal ? `<button class="btn primary" data-act="resume">${icon('play')} Resume</button>` : `<button class="btn primary" data-act="new-run">${icon('compass')} Set out</button>`}${state.riftPortal ? `<button class="btn primary" data-act="enter-rift">${icon('portal')} Enter rift</button>` : ''}<button class="btn" data-act="open-rifts">${icon('portal')} Rifts</button></div></div>`
    : inRift && map.completed ? `<div class="overlay-card"><h3>${icon('trophy')} Rift conquered</h3><p>Your spoils are collected.</p><div class="actions"><button class="btn primary" data-act="village">Return to Village</button></div></div>`
    : !state.auto ? `<div class="overlay-card slim"><h3>${icon('pause')} Paused</h3><div class="actions"><button class="btn primary" data-act="pause">${icon('play')} Resume</button></div></div>` : '';
  setHtml('overlay', overlay); $('overlay').hidden = !overlay;
}
let dockUpgrades = 0;
function badge(id, text) { const el = $(id).querySelector('.badge'); if (cache.get(id) !== text) { cache.set(id, text); el.textContent = text; el.hidden = !text; } }

// ---------- Sheet ----------
function openSheet(name) {
  if (ui.sheet === name) return closeSheet();
  ui.sheet = name; $('sheet').hidden = false; document.body.classList.add('sheet-open');
  document.querySelectorAll('#dock button').forEach(b => b.classList.toggle('on', b.dataset.arg === name));
  $('sheet-title').innerHTML = `${icon(SHEETS[name][1])} ${SHEETS[name][0]}`;
  renderSheet(true); layout();
}
function closeSheet() {
  ui.sheet = null; $('sheet').hidden = true; document.body.classList.remove('sheet-open');
  document.querySelectorAll('#dock button').forEach(b => b.classList.remove('on')); layout();
}
function renderSheet(fresh = false) {
  sheetDirty = false; if (!ui.sheet) return;
  const body = $('sheet-body'), top = body.scrollTop, tree = $('tree-scroll'), treePos = tree ? [tree.scrollLeft, tree.scrollTop, tree.scrollWidth] : null;
  const picker = body.querySelector('.picker'), pickerPos = picker ? picker.scrollLeft : 0;
  const html = ui.sheet === 'hero' ? heroPanel(state) : ui.sheet === 'bag' ? bagPanel(state, ui) : ui.sheet === 'skills' ? skillsPanel(state, ui) : ui.sheet === 'tree' ? treePanel(state, ui) : ui.sheet === 'forge' ? forgePanel(state, ui) : worldPanel(state, ui);
  body.className = 'sheet-body ' + ui.sheet; body.innerHTML = html; body.scrollTop = fresh ? 0 : top;
  const nextPicker = body.querySelector('.picker'); if (nextPicker) nextPicker.scrollLeft = pickerPos;
  const next = $('tree-scroll');
  if (next) {
    if (treePos && !fresh) { const k = next.scrollWidth / treePos[2]; next.scrollLeft = (treePos[0] + next.clientWidth/2) * k - next.clientWidth/2; next.scrollTop = (treePos[1] + next.clientHeight/2) * k - next.clientHeight/2; }
    else { next.scrollLeft = (next.scrollWidth - next.clientWidth) / 2; next.scrollTop = (next.scrollHeight - next.clientHeight) / 2; }
  }
  dockUpgrades = upgradeCount(state);
}
// Re-render an open sheet soon, unless the player is mid-interaction with a form control.
function refreshSheet(now = false) {
  if (!ui.sheet) { sheetDirty = false; return; }
  if (now) return renderSheet();
  sheetDirty = true;
}
function layout() {
  if (!battle) return;
  const isWide = wide.matches, top = $('hud-top').getBoundingClientRect().bottom, w = innerWidth, h = innerHeight;
  const dock = $('dock').getBoundingClientRect(), bottomHud = $('hud-bottom').getBoundingClientRect(), sheet = ui.sheet ? $('sheet').getBoundingClientRect() : null;
  battle.insets = isWide
    ? {top, left:dock.right, right:sheet ? w - sheet.left : 0, bottom:h - bottomHud.top}
    : {top, left:0, right:0, bottom:sheet ? h - sheet.top : h - bottomHud.top};
}

// ---------- Events from the simulation ----------
function processEvents(events) {
  if (!events.length) return;
  let kills = 0;
  for (const e of events) {
    battle.event(e);
    switch (e.type) {
      case 'hit': if (performance.now() - lastHitSound > 90) { lastHitSound = performance.now(); sound(e.critical ? 260 : 170, .07, 'triangle'); } break;
      case 'skill': sound(520, .16); break;
      case 'kill': kills++; if (e.boss) sound(110, .5, 'sawtooth'); break;
      case 'level': banner(`Level ${e.value}`, '+1 passive point · +1 skill point', 'gold'); sound(660, .3); skillbarKey = ''; refreshSheet(); break;
      case 'unlock': toast(`New skill: ${e.name}`, 'gold'); skillbarKey = ''; break;
      case 'loot': if (e.item.rarity >= 1) feed(`${icon('bag')} <span class="c${e.item.rarity}">${esc(e.item.name)}</span>`); if (e.item.rarity >= 3) { toast(`Unique found: ${e.item.name}`, 'gold'); sound(880, .4); } if (ui.sheet === 'bag' || ui.sheet === 'forge') refreshSheet(); dockUpgrades = -1; break;
      case 'orb': feed(`${icon('sparkles')} <span class="c2">${esc(e.name)}</span>`); if (ui.sheet === 'forge' || ui.sheet === 'world') refreshSheet(); break;
      case 'keystone': feed(`${icon('portal')} <span class="c${e.item.rarity}">${esc(e.item.name)}</span>`); toast('Keystone found — open it in the Village.', 'gold'); persist(); break;
      case 'bossReady': banner('Seal broken', 'The guardian is revealed', 'boss'); sound(140, .5, 'sawtooth'); break;
      case 'complete': banner(`Stage ${e.stage} cleared`, state.advance ? 'Onward' : 'Farming this stage', 'gold'); break;
      case 'death': banner('You fell', 'Recovering at camp', 'dead'); sound(90, .6, 'sawtooth'); break;
      case 'retreat': toast(`Fell back to stage ${e.stage}. Auto-advance is off until you are stronger.`); break;
      case 'riftWave': banner(e.wave === RIFT_WAVES ? 'Vharos arrives' : `Rift wave ${e.wave}`, '', e.wave === RIFT_WAVES ? 'boss' : ''); persist(); break;
      case 'riftComplete': banner('Rift conquered', 'Return to the Village', 'gold'); persist(); refreshSheet(); break;
      case 'riftFailed': banner('The rift closes', 'You fell inside', 'dead'); persist(); refreshSheet(); break;
      case 'chest': feed(`${icon('gem')} Hidden cache opened`); break;
      case 'newMap': skillbarKey = ''; refreshSheet(); break;
    }
  }
  if (kills && ['hero','world'].includes(ui.sheet)) refreshSheet();
}

// ---------- Persistence and cloud ----------
let cloud = null, account = null, accountUser = null, lastFlush = 0, conflictShown = false, saveOk = true;
function saveLabel() {
  if (!saveOk) return 'Save unavailable in this browser';
  if (!cloud?.uid) return 'Saved on this device';
  return {synced:'Synced to your account', syncing:'Syncing…', offline:'Saved here · syncs when online', conflict:'Save conflict', choice:'Choose which progress to keep', unavailable:'Cloud unavailable · saved here'}[cloud.status] || 'Saved on this device';
}
function persist() {
  const now = Date.now();
  if (cloud?.uid && cloud.record) { state.lastSave = now; saveOk = cloud.save(JSON.stringify(state)); }
  else saveOk = saveGame(state, undefined, now);
  if (cloud?.record?.dirty && now - lastFlush > 15000) { lastFlush = now; cloud.flush(); }
}
function adoptState(next) { state = next; skillbarKey = ''; cache.clear(); closeSheet(); updateHud(); }
function adoptRecord(payload) {
  const restored = restorePayload(payload);
  if (restored.recovered) { toast('The cloud save could not be read. This device’s save is unchanged.'); return; }
  adoptState(restored.state);
  if (restored.offline) setTimeout(() => showOffline(restored.offline), 600);
}
function saveSummary(payload) { try { const d = JSON.parse(payload); return `Level ${d.level} · Stage ${d.stage} · ${fmt(d.gold)} gold · ${new Date(d.lastSave || 0).toLocaleString([], {dateStyle:'medium', timeStyle:'short'})}`; } catch { return 'Unknown save'; } }
function conflictModal() {
  conflictShown = true; const remote = cloud.remoteConflict;
  modal('Two versions of your hero', `<p>This device and the cloud both have newer progress. Choose which one continues — the other is overwritten.</p><div class="choice"><div><b>This device</b><small>${esc(saveSummary(cloud.record?.payload))}</small></div><div><b>Cloud</b><small>${esc(remote ? saveSummary(remote.payload) : 'Unavailable')}</small></div></div><div class="actions"><button class="btn" data-act="resolve-cloud">Keep cloud</button><button class="btn primary" data-act="resolve-local">Keep this device</button></div>`);
}
function accountSection() {
  if (!account) return `<p class="muted small">Cloud saves are unavailable right now. Progress is safe in this browser.</p>`;
  if (!accountUser) return `<p class="muted small">Sign in to carry your hero across devices. This browser keeps a local backup.</p><div class="actions"><button class="btn primary" data-act="sign-in">${icon('user')} Sign in with Google</button></div>`;
  if (cloud?.status === 'choice') return `<p>Signed in as <b>${esc(accountUser.email || 'Google account')}</b>. This account has no cloud save yet.</p><div class="actions"><button class="btn" data-act="use-fresh-save">Start fresh</button><button class="btn primary" data-act="use-device-save">Sync this device</button></div>`;
  return `<p><b>${esc(accountUser.email || 'Google account')}</b><br><small class="muted">${esc(saveLabel())}</small></p><div class="actions"><button class="btn" data-act="sync-now">Sync now</button><button class="btn" data-act="sign-out">Sign out</button></div>`;
}
function menuModal() {
  const s = state.settings, toggle = (id, label, hint, on) => `<label class="toggle row-toggle"><input type="checkbox" data-change="${id}" ${on ? 'checked' : ''}><span></span><div>${label}<small>${hint}</small></div></label>`;
  modal('Menu', `${toggle('set-sound','Sound','Soft tones for hits and skills', s.sound)}${toggle('set-motion','Motion','Idle animation and screen shake', s.motion)}${toggle('set-potion','Auto-potion','Drink at 35% health', s.autoPotion !== false)}
  <div class="actions wrap"><button class="btn" data-act="help">${icon('info')} How to play</button><button class="btn" data-act="loot-filter">${icon('filter')} Loot filter</button><button class="btn" data-act="log">${icon('book')} Battle log</button></div>
  <h4>Account</h4>${accountSection()}<p class="muted small">${esc(saveLabel())} · Everfrost v3.0</p>`);
}
function reflectCloud() { if (cloud.status === 'conflict' && !conflictShown) conflictModal(); if (cloud.status !== 'conflict') conflictShown = false; }
connectAccount().then(fb => {
  account = fb;
  cloud = new CloudSaves({remote:fb.remote, onChange:reflectCloud});
  fb.onUser(async user => {
    accountUser = user;
    await cloud.connect(user ? user.uid : null);
    if (!user) { persist(); return; }
    if ((cloud.status === 'synced' || cloud.status === 'offline') && cloud.record) adoptRecord(cloud.record.payload);
    else if (cloud.status === 'choice') menuModal();
    else if (cloud.status === 'unavailable') toast('Cloud saves are unavailable. Playing on this device only.');
    persist();
  });
}).catch(() => { /* Firebase unreachable: guest mode continues with local saves. */ });
window.addEventListener('online', () => cloud?.flush());

function showOffline(r) { modal('While you were away', offlineSummary(state, r)); persist(); }

// ---------- Actions ----------
function inspect(id, equipped) {
  const item = equipped ? Object.values(state.equipment).find(i => i?.id === id) : state.inventory.find(i => i.id === id);
  if (item) modal(equipped ? 'Equipped' : 'Item', itemDetail(state, item, {equipped}));
}
function equipBest() {
  let count = 0;
  for (let guard = 0; guard < 30; guard++) {
    const best = state.inventory.map(item => ({item, c:bestComparison(state, item)})).filter(x => isUpgrade(x.c)).sort((a,b) => (b.c.dps + b.c.tough) - (a.c.dps + a.c.tough))[0];
    if (!best || !equip(state, best.item.id, best.c.slot)) break;
    count++;
  }
  toast(count ? `Equipped ${count} upgrade${count === 1 ? '' : 's'}.` : 'Nothing better in the bag.', count ? 'gold' : 'info');
}
function act(name, b) {
  const arg = b.dataset.arg;
  let changed = true;
  switch (name) {
    case 'open': arg === 'menu' ? menuModal() : openSheet(arg); changed = false; break;
    case 'close-sheet': closeSheet(); changed = false; break;
    case 'close': closeModal(); changed = false; break;
    case 'confirm': { const fn = pendingConfirm; pendingConfirm = null; closeModal(); fn?.(); break; }
    case 'pause': if (state.location !== 'village') state.auto = !state.auto; break;
    case 'speed': state.speed = state.speed === 1 ? 2 : 1; break;
    case 'toggle-advance': state.advance = !state.advance; toast(state.advance ? 'Auto-advance on: pushing to the next stage.' : 'Farming: replaying this stage on fresh maps.'); break;
    case 'cast': { const events = useSkill(state, arg); if (events.length) processEvents(events); else { const def = SKILL_BY_ID[arg]; if (state.level >= def.level && !(state.cooldowns[arg] > 0)) toast(state.mana < skillParams(state, arg).mana && !stats(state).bloodMagic ? 'Not enough mana.' : 'No target in range.'); } changed = false; break; }
    case 'potion': { const events = []; if (usePotion(state, events)) processEvents(events); else toast(state.potion.charges ? 'Already at full health.' : 'No charges — kills refill your potion.'); changed = false; break; }
    case 'dossier': modal('Target', enemyDossier(state)); changed = false; break;
    case 'big-map': modal(state.map.name || 'Map', `<canvas id="big-map" width="640" height="480" class="big-map"></canvas><p class="muted small center">${state.location === 'rift' ? 'Rift arena' : `Seal ${state.map.progress} / ${state.map.goal} · tap the battlefield to move`}</p>`); drawMinimap($('big-map'), state, true); changed = false; break;
    case 'item': inspect(arg, false); changed = false; break;
    case 'equipped': inspect(arg, true); changed = false; break;
    case 'empty-slot': ui.bagFilter = RING_SLOTS.includes(arg) ? 'rings' : arg; ui.sheet === 'bag' ? renderSheet() : openSheet('bag'); changed = false; break;
    case 'equip': if (equip(state, arg, b.dataset.slot)) { closeModal(); sound(600); } break;
    case 'equip-best': equipBest(); break;
    case 'salvage': {
      const item = state.inventory.find(i => i.id === arg); if (!item) break;
      const run = () => { const gold = salvageGold(item); if (salvage(state, item.id)) toast(`Salvaged for ${fmt(gold)} gold.`); closeModal(); after(); };
      if (item.rarity >= 2 || item.unique || item.upgrade) { confirmModal('Salvage this item?', `${esc(item.name)} will be destroyed for ${fmt(salvageGold(item))} gold.`, 'Salvage', run); changed = false; } else { run(); changed = false; }
      break;
    }
    case 'salvage-junk': {
      const items = salvageCandidates(state, ui.bagFilter); if (!items.length) break;
      pendingSalvage = items.map(i => i.id); const gold = items.reduce((n,i) => n + salvageGold(i), 0);
      confirmModal('Salvage junk?', `Salvage ${items.length} normal and magic item${items.length === 1 ? '' : 's'} for <b>${fmt(gold)} gold</b>. Rare, unique and tempered gear is kept.`, `Salvage ${items.length}`, () => { let n = 0; for (const id of pendingSalvage) if (salvage(state, id)) n++; pendingSalvage = []; toast(`Salvaged ${n} items.`); after(); });
      changed = false; break;
    }
    case 'loot-filter': modal('Loot filter', lootFilterForm(state)); changed = false; break;
    case 'forge-item': ui.forgeItem = arg; ui.forgeTab = 'orbs'; closeModal(); if (ui.sheet !== 'forge') openSheet('forge'); else renderSheet(); changed = false; break;
    case 'forge-pick': ui.forgeItem = arg; break;
    case 'forge-tab': ui.forgeTab = arg; break;
    case 'upgrade': if (upgrade(state, arg)) sound(620); break;
    case 'upgrade-max': { let n = 0; while (n < 200 && upgrade(state, arg)) n++; if (n) { sound(620); toast(`Tempered ${n} rank${n === 1 ? '' : 's'}.`, 'gold'); } break; }
    case 'merge': { const item = merge(state, arg, Number(b.dataset.rarity)); if (item) { toast(`${item.name} forged.`, 'gold'); ui.forgeItem = item.id; } break; }
    case 'craft': { const item = currentForgeItem(); const r = craft(state, item, arg); if (r.ok) { sound(560); toast(`${CRAFT_OPERATIONS[arg].name} used — now ${ITEM_RARITIES[item.rarity]}.`, 'gold'); } else toast(r.reason); break; }
    case 'bench': { const r = benchCraft(state, currentForgeItem(), b.dataset.affix, Number(b.dataset.tier)); if (r.ok) { sound(560); toast(`Crafted ${r.affix} (T${r.tier}).`, 'gold'); } else toast(r.reason); break; }
    case 'pick-slot': ui.skillSlot = Number(arg); break;
    case 'assign': slotSkill(state, ui.skillSlot, arg); skillbarKey = ''; break;
    case 'rank': if (investSkill(state, arg)) sound(700); break;
    case 'rune': chooseRune(state, arg, b.dataset.rune); break;
    case 'reset-skills': resetSkills(state); toast('Skill ranks reset.'); break;
    case 'allocate': if (allocate(state, arg)) sound(740); break;
    case 'tree-zoom': ui.treeZoom = Math.max(.6, Math.min(1.6, ui.treeZoom + Number(arg) * .2)); break;
    case 'respec': confirmModal('Respec passives?', `Refund all ${state.tree.length} passive points for <b>${fmt(respecCost(state))} gold</b>.`, 'Respec', () => { if (respec(state)) toast('Passive points refunded.'); else toast('Not enough gold.'); after(); }); changed = false; break;
    case 'world-tab': ui.worldTab = arg; break;
    case 'map-cycle': ui.mapCycle = Number(arg); break;
    case 'travel': if (travel(state, Number(arg))) { toast(`Stage ${state.stage} · ${region(state).name}`); ui.mapCycle = null; state.auto = true; } break;
    case 'reroll': if (state.location === 'expedition') { startExpedition(state); toast('A fresh map.'); } break;
    case 'claim': if (claimQuest(state, arg)) { toast('Reward claimed.', 'gold'); sound(660); } break;
    case 'village': {
      const go = () => { teleportVillage(state); ui.worldTab = 'rifts'; if (ui.sheet !== 'world') openSheet('world'); after(); };
      if (state.location === 'rift' && !state.map.completed) { confirmModal('Abandon the rift?', 'Leaving closes this rift for good. Loot on the ground is collected.', 'Leave', go); changed = false; } else { go(); changed = false; }
      break;
    }
    case 'open-rifts': ui.worldTab = 'rifts'; if (ui.sheet !== 'world') openSheet('world'); break;
    case 'resume': resumeExpedition(state); closeSheet(); break;
    case 'new-run': if (startVillageStage(state, state.maxStage)) closeSheet(); break;
    case 'enter-rift': if (enterRift(state)) { closeSheet(); toast('The portal closes behind you.'); } break;
    case 'open-rift': if (openRiftPortal(state, arg)) toast('Rift portal opened. One entry.', 'gold'); break;
    case 'key-info': { const key = state.keystones.find(k => k.id === arg); if (key) modal('Keystone', keystoneDetail(key)); changed = false; break; }
    case 'craft-key': { const input = $('key-level'), level = Math.max(1, Math.min(state.maxStage, Math.floor(Number(input?.value) || state.maxStage))); const r = craftKeystone(state, Number(arg), Math.random, level); toast(r.ok ? `${r.item.name} cut.` : r.reason, r.ok ? 'gold' : 'info'); break; }
    case 'rename': modal('Name your hero', `<form id="rename-form"><label class="field">Hero name<input id="hero-name" value="${esc(state.name)}" maxlength="20" required autocomplete="off"></label><div class="actions"><button class="btn primary" type="submit">Save</button></div></form>`); changed = false; break;
    case 'help': modal('How to play', helpContent()); changed = false; break;
    case 'log': modal('Battle log', `<ul class="log">${state.log.map(l => `<li class="${l.type}">${esc(l.text)}</li>`).join('')}</ul>`); changed = false; break;
    case 'sign-in': account?.signIn().catch(() => toast('Sign-in did not complete. Try again.')); changed = false; break;
    case 'sign-out': persist(); closeModal(); account?.signOut(); changed = false; break;
    case 'sync-now': cloud?.flush(); closeModal(); toast('Syncing…'); changed = false; break;
    case 'use-device-save': if (cloud?.start(JSON.stringify(state))) { cloud.flush(); closeModal(); toast('This device now syncs to your account.', 'gold'); } changed = false; break;
    case 'use-fresh-save': { const fresh = createGame(); if (cloud?.start(JSON.stringify(fresh))) { closeModal(); cloud.flush(); adoptState(fresh); toast('A new hero begins on your account.', 'gold'); } changed = false; break; }
    case 'resolve-local': cloud?.resolve('local').then(ok => { if (ok) { closeModal(); toast('This device now syncs to your account.', 'gold'); } else if (cloud.status === 'conflict') conflictModal(); }); changed = false; break;
    case 'resolve-cloud': cloud?.resolve('cloud').then(ok => { if (ok) { closeModal(); adoptRecord(cloud.record.payload); toast('Cloud progress restored.', 'gold'); } else if (cloud.status === 'conflict') conflictModal(); }); changed = false; break;
    default: changed = false;
  }
  if (changed) after();
}
const currentForgeItem = () => forgeTarget(state, ui.forgeItem) || Object.values(state.equipment).find(Boolean) || state.inventory[0];
function after() { updateHud(); renderSheet(); persist(); }

document.addEventListener('click', e => {
  const node = e.target.closest('[data-node]');
  if (node) { ui.treeNode = ui.treeNode === node.dataset.node && allocate(state, node.dataset.node) ? node.dataset.node : node.dataset.node; after(); return; }
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  act(b.dataset.act, b);
});
document.addEventListener('change', e => {
  const t = e.target, kind = t.dataset.change;
  if (t.id === 'bag-filter') { ui.bagFilter = t.value; renderSheet(); }
  else if (t.id === 'bag-sort') { ui.bagSort = t.value; renderSheet(); }
  else if (t.id === 'bench-affix') { ui.benchAffix = t.value; ui.benchTier = null; renderSheet(); }
  else if (t.id === 'bench-tier') { ui.benchTier = Number(t.value); renderSheet(); }
  else if (kind === 'auto-skill') { state.skills.auto[t.dataset.arg] = t.checked; skillbarKey = ''; persist(); }
  else if (kind === 'advance') { state.advance = t.checked; after(); }
  else if (kind === 'set-sound') { state.settings.sound = t.checked; sound(); persist(); }
  else if (kind === 'set-motion') { state.settings.motion = t.checked; persist(); }
  else if (kind === 'set-potion') { state.settings.autoPotion = t.checked; persist(); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'filter-form') {
    const f = new FormData(e.target);
    state.lootFilter = normalizeLootFilter({minRarity:Number(f.get('minRarity')), minItemLevel:Math.max(1, Math.floor(Number(f.get('minItemLevel')) || 1)), slots:f.getAll('slots'), affixes:f.getAll('affixes'), alwaysShowUnique:f.get('alwaysShowUnique') === 'on'});
    closeModal(); toast('Loot filter saved.'); after();
  }
  if (e.target.id === 'rename-form') { const name = $('hero-name').value.trim(); if (name) { state.name = name.slice(0, 20); closeModal(); after(); } }
});
document.addEventListener('keydown', e => {
  if (e.repeat || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if ($('dialog').open) return;
  const slot = '1234'.indexOf(e.key);
  if (slot >= 0 && state.skills.slots[slot]) { e.preventDefault(); processEvents(useSkill(state, state.skills.slots[slot])); }
  else if (e.key === 'q' || e.key === 'Q') { const events = []; if (usePotion(state, events)) processEvents(events); }
  else if (e.code === 'Space' && state.location !== 'village' && !e.target.closest('button,a')) { e.preventDefault(); state.auto = !state.auto; updateHud(); }
  else if (e.key === 'Escape' && ui.sheet) closeSheet();
  else { const key = {c:'hero', i:'bag', b:'bag', s:'skills', p:'tree', t:'tree', f:'forge', m:'world', w:'world'}[e.key.toLowerCase()]; if (key && !e.ctrlKey && !e.metaKey && !e.altKey) openSheet(key); }
});
$('dialog').addEventListener('click', e => { if (e.target === $('dialog')) closeModal(); });
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- Boot ----------
let battle = null;
battle = new Battlefield($('battle-canvas'), () => state, (x, y, targetId) => { if (state.location !== 'village') { movePlayer(state, x, y, targetId); updateHud(); } }, dropId => { const events = []; if (collectLoot(state, dropId, events)) { processEvents(events); persist(); } });
updateHud(); layout();
addEventListener('resize', layout); wide.addEventListener('change', layout); new ResizeObserver(layout).observe($('hud-bottom'));
let previous = performance.now(), slow = 0, mapTimer = 0;
setInterval(() => {
  const now = performance.now(), dt = Math.min(.5, (now - previous) / 1000); previous = now;
  if (document.hidden) return;
  processEvents(tick(state, dt));
  updateHud();
  slow += dt; mapTimer += dt;
  if (mapTimer > .4) { mapTimer = 0; drawMinimap($('minimap'), state); $('minimap').hidden = state.location !== 'expedition'; }
  if (slow > .6) {
    slow = 0;
    if (dockUpgrades < 0) dockUpgrades = upgradeCount(state);
    const focus = document.activeElement;
    if (sheetDirty && !(focus && ['SELECT','INPUT'].includes(focus.tagName) && $('sheet').contains(focus))) renderSheet();
  }
}, 100);
setInterval(() => { if (!document.hidden) persist(); }, 5000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist();
  else { const rewards = offlineRewards(state); if (rewards) showOffline(rewards); previous = performance.now(); updateHud(); }
});
addEventListener('pagehide', persist);
dockUpgrades = upgradeCount(state);
if (loaded.migrated || (loaded.state.points > 0 && loaded.state.tree.length === 0 && loaded.state.level > 3)) toast('Your points were refunded for the new passive tree and skill ranks.', 'gold');
if (loaded.offline) setTimeout(() => showOffline(loaded.offline), 500);
if (loaded.recovered) toast('The previous save could not be read. A new journey has begun.');
try { if (!localStorage.getItem('everfrost.help') && state.kills === 0) { localStorage.setItem('everfrost.help', '1'); setTimeout(() => modal('Welcome to Everfrost', helpContent()), 400); } } catch { /* storage optional */ }

// Progressive enhancement for browsers implementing the page-scoped WebMCP registry.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool, {signal:lifecycle.signal})).catch(() => {}); } catch { /* optional */ } };
  register({name:'read_adventure', description:'Read the current hero, resources, stage, and battle status.', inputSchema:{type:'object', properties:{}, additionalProperties:false}, annotations:{readOnlyHint:true},
    execute:() => ({name:state.name, level:state.level, stage:state.stage, maxStage:state.maxStage, journey:journey(state), gold:state.gold, location:state.location, battleActive:state.auto && state.location !== 'village', passivePoints:state.points, skillPoints:state.skillPoints, skills:state.skills.slots, stats:combatStats(state), enemy:state.enemy ? {name:state.enemy.name, tier:state.enemy.tier, modifiers:state.enemy.modifiers} : null})});
  register({name:'set_battle_active', description:'Resume or pause automatic battle using the same control as the visible interface.', inputSchema:{type:'object', properties:{active:{type:'boolean'}}, required:['active'], additionalProperties:false}, annotations:{readOnlyHint:false},
    execute:input => { if (!input || typeof input.active !== 'boolean') throw Error('active must be a boolean'); if (state.location === 'village' && input.active) throw Error('Leave the Village first'); state.auto = input.active; updateHud(); persist(); return {battleActive:state.auto}; }});
  addEventListener('pagehide', () => lifecycle.abort(), {once:true});
}
void SAVE_KEY; void SKILLS; void GEAR; void TREE_BY_ID; void TREE_EXTENT; void skillRank; void upgradeCost;
