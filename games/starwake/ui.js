// Starwake — DOM UI: title, docked station screens (market/contracts/shipyard/outfitter/bar), sector map, pause, comms, dialogs, touch controls.
import { sfx, toast, settings, store } from '/shared/sd-kit.js';
import { FACTIONS, COMMODITIES, COMM, SHIPS, PLAYER_SHIPS, GUNS, MARKS, GUN_PRICE, UPGRADES, POD_PRICE, MISSILE_PRICE, CELL_PRICE, STATION_TYPES, PEOPLE, BAR_NAMES, ENDINGS, TIPS, STORY, rng, hashStr, mapDist, route, clamp } from './data.js';
import * as S from './sim.js';
import { audio } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cr = (n) => `${Math.round(n).toLocaleString()} cr`;

// ---------------------------------------------------------------- portraits (procedural)
export function drawPortrait(cv, who) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height; const r = rng(hashStr(who.name || 'x'));
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0c1424'); bg.addColorStop(1, who.accent || '#334'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.25; g.fillStyle = who.accent || '#fff'; for (let i = 0; i < 6; i++) g.fillRect(0, r() * h, w, 1); g.globalAlpha = 1;
  const cx = w / 2, cy = h * 0.52, s = w / 100;
  g.fillStyle = who.accent || '#556'; g.beginPath(); g.ellipse(cx, h + 8 * s, 44 * s, 34 * s, 0, Math.PI, 0); g.fill(); // shoulders
  g.fillStyle = '#1a1c22'; g.fillRect(cx - 9 * s, cy + 18 * s, 18 * s, 16 * s); // collar
  g.fillStyle = who.skin || '#c90'; g.fillRect(cx - 7 * s, cy + 12 * s, 14 * s, 14 * s);
  g.beginPath(); g.ellipse(cx, cy, 22 * s, 27 * s, 0, 0, 7); g.fill();
  g.fillStyle = who.hair || '#222';
  if (who.hairStyle === 'helmet') { g.beginPath(); g.ellipse(cx, cy - 4 * s, 27 * s, 31 * s, 0, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(cx + 27 * s, cy + 6 * s); g.lineTo(cx - 27 * s, cy + 6 * s); g.fill(); g.fillStyle = 'rgba(120,200,255,.35)'; g.fillRect(cx - 20 * s, cy - 6 * s, 40 * s, 9 * s); }
  else if (who.hairStyle === 'long') { g.beginPath(); g.ellipse(cx, cy - 8 * s, 25 * s, 24 * s, 0, Math.PI, 0); g.fill(); g.fillRect(cx - 25 * s, cy - 8 * s, 9 * s, 38 * s); g.fillRect(cx + 16 * s, cy - 8 * s, 9 * s, 38 * s); }
  else if (who.hairStyle === 'bun') { g.beginPath(); g.ellipse(cx, cy - 10 * s, 23 * s, 19 * s, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(cx, cy - 30 * s, 9 * s, 0, 7); g.fill(); }
  else if (who.hairStyle === 'mohawk') { g.fillRect(cx - 5 * s, cy - 38 * s, 10 * s, 22 * s); }
  else { g.beginPath(); g.ellipse(cx, cy - 12 * s, 23 * s, 16 * s, 0, Math.PI, 0); g.fill(); }
  g.fillStyle = who.eyes || '#fff'; g.shadowColor = who.eyes || '#fff'; g.shadowBlur = 6 * s;
  g.fillRect(cx - 12 * s, cy - 1 * s, 7 * s, 2.6 * s); g.fillRect(cx + 5 * s, cy - 1 * s, 7 * s, 2.6 * s); g.shadowBlur = 0;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(cx - 6 * s, cy + 13 * s, 12 * s, 2 * s);
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
}

// ---------------------------------------------------------------- comms + objective + story popups
export function initUI(G) {
  const root = el('div', 'sw-ui'); root.innerHTML = `
  <div id="objective" class="hide"></div>
  <div id="comms" class="hide"><canvas width="96" height="96"></canvas><div><b></b><p></p></div></div>
  <div id="dock" class="hide"></div>
  <div id="map" class="hide"><canvas></canvas><div class="mapside"></div><button class="sd-btn mapclose" aria-label="Close map">✕</button></div>
  <div id="pause" class="hide"></div>
  <div id="modal" class="hide"></div>
  <div id="fade"></div>
  <div id="touch" class="hide">
    <div class="stick" id="stick"><div class="nub"></div></div>
    <div class="throttle" id="tthrottle"><div class="fill"></div><span>THR</span></div>
    <button class="tb fire" data-k="fire">FIRE</button><button class="tb msl" data-k="missile">MSL</button>
    <button class="tb boost" data-k="boost">BOOST</button><button class="tb tgt" data-k="target">TGT</button>
    <div class="trow"><button class="tb s" data-k="nav">NAV</button><button class="tb s" data-k="auto">AUTO</button><button class="tb s" data-k="cam">CAM</button><button class="tb s" data-k="map">MAP</button><button class="tb s ctx" data-k="ctx">DOCK</button><button class="tb s" data-k="pause">II</button></div>
  </div>`;
  document.body.appendChild(root);
  const C = $('#comms'); const queue = []; let cur = null;
  const showNext = () => {
    if (cur || !queue.length) return; cur = queue.shift();
    drawPortrait(C.querySelector('canvas'), cur.who); C.querySelector('b').textContent = cur.who.name + (cur.who.title ? ` · ${cur.who.title}` : '');
    const p = C.querySelector('p'); p.textContent = ''; C.classList.remove('hide'); audio.comms();
    let i = 0; const txt = cur.text; const tick = () => { if (!cur) return; i = Math.min(txt.length, i + 2); p.textContent = txt.slice(0, i); if (i < txt.length) setTimeout(tick, 18); }; tick();
    setTimeout(() => { C.classList.add('hide'); cur = null; setTimeout(showNext, 250); }, cur.dur * 1000 + txt.length * 18);
  };
  G.ui = Object.assign(G.ui || {}, {
    comms(who, text, dur = 3, ship = null) { if (queue.length > 3) queue.shift(); queue.push({ who, text, dur }); showNext(); },
    objective(t) { const o = $('#objective'); if (!t) { o.classList.add('hide'); return; } o.textContent = t; o.classList.remove('hide'); },
    toast: (t) => toast(t, 2600),
    warn(t) { G.warnMsg = { text: t, t: 2.2 }; },
    story(m) { if (G.state === 'docked') storyDialog(G, m, true); else { G.ui.comms(PEOPLE[m.doneBy || m.giver] || PEOPLE.ferro, m.done, 5); toast(`Story: ${m.title} complete (+${m.reward.toLocaleString()} cr)`, 3500); } },
    ending: () => endingScreen(G),
    clearComms() { queue.length = 0; cur = null; C.classList.add('hide'); },
  });
  $('#map .mapclose').onclick = () => G.closeMap();
  initTouch(G);
}

// ---------------------------------------------------------------- docked screens
const TABS = [['market', 'Market'], ['contracts', 'Contracts'], ['shipyard', 'Shipyard'], ['outfit', 'Outfitter'], ['bar', 'Bar'], ['map', 'Sector map'], ['launch', 'Launch ▸']];
export function openDock(G, tab = null) {
  const D = $('#dock'); D.classList.remove('hide');
  const st = G.dockedStation; const P = G.P;
  const offers = S.storyOffers(P, st.id);
  if (!tab) tab = offers.length ? 'bar' : G.lastTab || 'market';
  G.lastTab = tab === 'map' || tab === 'launch' ? G.lastTab : tab;
  const fac = FACTIONS[st.faction];
  const sys = G.sys;
  D.innerHTML = `<div class="dk-top"><div><div class="dk-name">${esc(st.name)}</div><div class="dk-sub"><span class="chip" style="--c:${fac.color}">${fac.short}</span> ${STATION_TYPES[st.type].name} station · ${esc(sys.name)} · Day ${Math.floor(P.day)}</div></div>
    <div class="dk-stats"><div><small>Credits</small><b>${cr(P.credits)}</b></div><div><small>Hold</small><b>${S.cargoUsed(P)}/${S.shipStats(P).cargoMax}</b></div><div><small>Hull</small><b>${Math.round(P.ship.hull / S.shipStats(P).hull * 100)}%</b></div></div></div>
    <div class="dk-tabs">${TABS.map(([k, n]) => `<button class="dk-tab ${k === tab ? 'on' : ''} ${k === 'bar' && offers.length ? 'bang' : ''} ${k === 'contracts' && !P.tutorial.market ? '' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
    <div class="dk-body"></div><div class="dk-rep">${['concord', 'hollows', 'veil'].map((f) => `<span style="--c:${FACTIONS[f].color}">${FACTIONS[f].short} <b>${S.repTier(P.rep[f])}</b> <i style="width:${(P.rep[f] + 100) / 2}%"></i></span>`).join('')}</div>`;
  D.querySelectorAll('.dk-tab').forEach((b) => b.onclick = () => { sfx.click(); const t = b.dataset.t; if (t === 'launch') { G.launch(); return; } if (t === 'map') { G.openMap(); return; } openDock(G, t); });
  const body = D.querySelector('.dk-body');
  ({ market: marketTab, contracts: contractsTab, shipyard: shipyardTab, outfit: outfitTab, bar: barTab }[tab])(G, body, st);
}
export function closeDock() { $('#dock').classList.add('hide'); }
const refresh = (G) => openDock(G, G.lastTab);

function marketTab(G, body, st) {
  const P = G.P; const vol = G.cfg.volatility;
  S.recordIntel(P, st, vol);
  const rows = COMMODITIES.filter((c) => S.trades(st, c.id) || P.cargo[c.id]).map((c) => {
    const q = S.quote(P, st, c.id, vol); const have = P.cargo[c.id] || 0; const best = S.bestKnownSale(P, c.id, st.id);
    const role = STATION_TYPES[st.type].produce.includes(c.id) ? '<em class="pro">made here</em>' : STATION_TYPES[st.type].consume.includes(c.id) ? '<em class="con">wanted</em>' : '';
    const hint = best ? `<span class="hint">${esc(stationName(G, best.station))}: ${best.sell}</span>` : '<span class="hint dim">no intel</span>';
    return `<tr data-c="${c.id}"><td><b>${c.name}</b>${c.illegal ? ' <em class="ill">illegal</em>' : ''} ${role}<div class="stock" title="Station stock"><i style="width:${Math.min(100, q.stock / 1.2)}%"></i></div></td>
      <td class="num">${q.canBuy ? q.buy : '—'}</td><td class="num">${q.canSell ? q.sell : '—'}</td><td class="num">${have || ''}</td><td class="best">${hint}</td>
      <td class="btns"><button class="mini" data-a="s10" ${!q.canSell || !have ? 'disabled' : ''}>−10</button><button class="mini" data-a="s1" ${!q.canSell || !have ? 'disabled' : ''}>−1</button><button class="mini b" data-a="b1" ${!q.canBuy ? 'disabled' : ''}>+1</button><button class="mini b" data-a="b10" ${!q.canBuy ? 'disabled' : ''}>+10</button></td></tr>`;
  }).join('');
  const mc = P.missions.filter((m) => m.carry).map((m) => `<li>${m.carry} × ${COMM[m.cid].name} → ${esc(stationName(G, m.station))}</li>`).join('');
  body.innerHTML = `<div class="dk-head"><h2>Commodity market</h2><p>Prices move with supply: every unit you sell here pushes the price down. Best-known prices come from stations you have docked at.</p></div>
    <div class="tablewrap"><table class="mkt"><thead><tr><th>Goods · stock</th><th>Buy</th><th>Sell</th><th>Hold</th><th class="best">Best known sale</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row"><button class="sd-btn" id="sellall">Sell all cargo</button><span class="note">Hold ${S.cargoUsed(P)}/${S.shipStats(P).cargoMax}${mc ? ' · contract cargo is sealed' : ''}</span></div>${mc ? `<ul class="sealed">${mc}</ul>` : ''}`;
  body.querySelectorAll('tr[data-c] button').forEach((b) => b.onclick = () => {
    const cid = b.closest('tr').dataset.c; const a = b.dataset.a; const n = a.endsWith('10') ? 10 : 1;
    const r = a[0] === 'b' ? S.buy(P, st, cid, n, G.cfg.volatility) : S.sell(P, st, cid, n, G.cfg.volatility);
    if (!r.n) { sfx.error(); toast(a[0] === 'b' ? (S.cargoFree(P) <= 0 ? 'Hold full' : 'Not enough credits') : 'Nothing to sell'); }
    else { a[0] === 'b' ? sfx.click() : audio.cash(); P.tutorial.market = true; }
    refresh(G);
  });
  body.querySelector('#sellall').onclick = () => { let got = 0; for (const cid of Object.keys(P.cargo)) if (S.trades(st, cid)) got += S.sell(P, st, cid, 999, G.cfg.volatility).got; if (got) { audio.cash(); toast(`Sold for ${cr(got)}`); } else sfx.error(); refresh(G); };
}
const stationName = (G, id) => { for (const s of Object.values(G.SYS)) for (const x of s.stations) if (x.id === id) return x.name; return id; };
const ICON = { cargo: '▣', bounty: '✦', escort: '⛨', patrol: '◇', smuggle: '☍', raid: '✸' };
function contractsTab(G, body, st) {
  const P = G.P; const board = S.missionBoard(P, G.SYS, st, G.cfg);
  const card = (m, active) => `<div class="mcard ${active ? 'act' : ''}" data-id="${m.id}"><div class="mi">${ICON[m.type] || '•'}</div><div class="mt"><b>${esc(m.title)}</b><p>${esc(m.desc)}</p>
    <small>${G.SYS[m.sys].name} · ${m.type}${m.carry ? ` · needs ${m.carry} hold` : ''} · ${Object.entries(m.rep || {}).map(([f, v]) => `${FACTIONS[f].short} ${v > 0 ? '+' : ''}${v}`).join(', ')}</small></div>
    <div class="mr"><b>${cr(m.reward)}</b>${active ? '<button class="mini" data-a="drop">Abandon</button><button class="mini" data-a="route">Route</button>' : '<button class="mini b" data-a="take">Accept</button>'}</div></div>`;
  const story = P.story.active ? STORY.find((s) => s.id === P.story.active) : null;
  body.innerHTML = `<div class="dk-head"><h2>Contracts</h2><p>Up to four at once. No deadlines; take your time. Failing or abandoning costs a little reputation.</p></div>
    ${story ? `<div class="mcard story"><div class="mi">★</div><div class="mt"><b>${esc(story.title)}</b><p>${esc(story.brief)}</p></div><div class="mr"><button class="mini" data-a="sroute">Route</button></div></div>` : ''}
    ${P.missions.length ? `<h3>Active</h3>${P.missions.map((m) => card(m, true)).join('')}` : ''}
    <h3>Available here</h3>${board.length ? board.map((m) => card(m, false)).join('') : '<p class="note">The board is empty. Check back after a jump or two.</p>'}`;
  body.querySelectorAll('.mcard [data-a]').forEach((b) => b.onclick = () => {
    const id = b.closest('.mcard').dataset.id; const a = b.dataset.a;
    if (a === 'take') { const m = board.find((x) => x.id === id); const r = S.acceptMission(P, m); if (r.ok) { audio.cash(); toast('Contract accepted'); G.setRoute(m.sys); } else { sfx.error(); toast(r.why); } }
    if (a === 'drop') { const m = P.missions.find((x) => x.id === id); S.failMission(P, m, 'abandoned'); sfx.click(); }
    if (a === 'route') { const m = P.missions.find((x) => x.id === id); G.setRoute(m.sys); toast(`Route plotted to ${G.SYS[m.sys].name}`); }
    if (a === 'sroute') { const t = story.target.sys; if (t === 'lacuna') toast('The Lacuna is off the gate network: jump from Ninefold with the sector map'); else { G.setRoute(t); toast(`Route plotted to ${G.SYS[t].name}`); } }
    refresh(G);
  });
}
const statBar = (v, max) => `<div class="sbar"><i style="width:${clamp(v / max * 100, 4, 100)}%"></i></div>`;
function shipyardTab(G, body, st) {
  const P = G.P; const cur = P.ship.cls; const ti = S.tradeInValue(P);
  const avail = st.type === 'pirate' ? ['magpie', 'kite', 'halberd'] : st.type === 'mining' || st.type === 'agri' ? ['magpie', 'ox'] : PLAYER_SHIPS;
  body.innerHTML = `<div class="dk-head"><h2>Shipyard</h2><p>Trade-in value of your ${SHIPS[cur].name} and its fittings: <b>${cr(ti)}</b>. A new hull comes with stock fittings; cargo must fit. Click a silhouette to roll that hull onto the pad.</p></div>
    <div class="ships">${avail.map((k) => { const d = SHIPS[k]; const cost = S.shipPrice(P, k);
      return `<div class="shipcard ${k === cur ? 'cur' : ''}"><canvas width="160" height="110" data-s="${k}"></canvas><div><b>${d.name}</b> <small>${d.role}</small><p>${d.blurb}</p>
      <div class="stats"><span>Hull</span>${statBar(d.hull, 420)}<span>Shield</span>${statBar(d.shield, 190)}<span>Speed</span>${statBar(d.speed, 270)}<span>Turn</span>${statBar(d.turn, 2.2)}<span>Guns</span>${statBar(d.guns, 4)}<span>Cargo</span>${statBar(d.cargo + d.pods * 10, 100)}</div>
      ${k === cur ? '<em>Current ship</em>' : `<button class="sd-btn ${P.credits >= cost ? 'primary' : ''}" data-buy="${k}">Buy · ${cr(cost)}</button>`}</div></div>`; }).join('')}</div>
    ${st.type !== 'tech' && st.type !== 'industrial' ? '<p class="note">Bigger yards at Tech and Industrial stations stock every hull.</p>' : ''}`;
  body.querySelectorAll('canvas[data-s]').forEach((c) => { drawShipCard(c, c.dataset.s, G.cfg.colors.accent); c.title = 'Preview on the pad'; c.style.cursor = 'pointer'; c.onclick = () => { sfx.click(); G.previewShip(c.dataset.s); }; });
  body.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { const r = S.buyShip(P, b.dataset.buy); if (r.ok) { audio.cash(); toast(`Welcome aboard your new ${SHIPS[b.dataset.buy].name}`); G.onShipChanged(); } else { sfx.error(); toast(r.why); } refresh(G); });
}
function drawShipCard(c, cls, acc) {
  const g = c.getContext('2d'); g.fillStyle = '#060a12'; g.fillRect(0, 0, c.width, c.height);
  const SIL = SILS[cls] || SILS.magpie; g.save(); g.translate(c.width / 2, c.height / 2); g.rotate(Math.PI / 2); g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); SIL.forEach(([x, y], i) => (i ? g.lineTo(x * 46, y * 46) : g.moveTo(x * 46, y * 46))); g.closePath(); g.globalAlpha = 0.2; g.fillStyle = acc; g.fill(); g.globalAlpha = 1; g.stroke(); g.restore();
}
const SILS = {
  magpie: [[0, -1], [0.22, -0.7], [0.22, -0.2], [0.5, -0.1], [0.62, 0.15], [0.42, 0.25], [0.32, 0.55], [0.15, 0.9], [-0.15, 0.9], [-0.32, 0.55], [-0.42, 0.25], [-0.62, 0.15], [-0.5, -0.1], [-0.22, -0.2], [-0.22, -0.7]],
  kite: [[0, -1], [0.1, -0.5], [0.15, -0.05], [0.8, -0.2], [0.82, 0.05], [0.14, 0.45], [0.16, 0.95], [-0.16, 0.95], [-0.14, 0.45], [-0.82, 0.05], [-0.8, -0.2], [-0.15, -0.05], [-0.1, -0.5]],
  ox: [[0, -1], [0.12, -0.9], [0.3, -0.75], [0.3, 0.62], [0.32, 0.95], [-0.32, 0.95], [-0.3, 0.62], [-0.3, -0.75], [-0.12, -0.9]],
  halberd: [[0, -0.9], [0.12, -0.4], [0.38, -0.25], [0.38, -0.9], [0.48, -0.9], [0.48, 0.95], [0.38, 0.95], [0.38, 0.3], [-0.38, 0.3], [-0.38, 0.95], [-0.48, 0.95], [-0.48, -0.9], [-0.38, -0.9], [-0.38, -0.25], [-0.12, -0.4]],
};
function outfitTab(G, body, st) {
  const P = G.P; const s = P.ship; const d = SHIPS[s.cls]; const stats = S.shipStats(P);
  const gunCell = (t, mk) => { const on = s.guns.type === t && s.guns.mk === mk; const c = S.gunCost(P, t, mk); return `<button class="ocell ${on ? 'on' : ''}" data-g="${t}:${mk}" ${on ? 'disabled' : ''}><b>${MARKS[mk - 1].name}</b><small>${on ? 'fitted' : cr(c)}</small></button>`; };
  const up = (k) => { const U = UPGRADES[k]; return `<div class="orow"><div><b>${U.name}</b><p>${U.blurb}</p></div><div class="ocells">${U.levels.map((L, i) => { const on = s[k] === i; const c = S.upgradeCost(P, k, i); return `<button class="ocell ${on ? 'on' : ''}" data-u="${k}:${i}" ${on || (i < s[k] && k === 'jump') ? 'disabled' : ''}><b>${L.n}</b><small>${on ? 'fitted' : i < s[k] ? 'sell back' : cr(c)}</small></button>`; }).join('')}</div></div>`; };
  const rc = S.repairCost(P);
  body.innerHTML = `<div class="dk-head"><h2>Outfitter</h2><p>${d.name}: ${d.guns} gun hardpoints, ${d.missiles} missile rails, ${d.pods} cargo pod mounts. Upgrades sell back at half price.</p></div>
    <div class="orow"><div><b>Hull repair</b><p>${Math.round(s.hull)}/${stats.hull} · ${rc ? cr(rc) : 'no damage'}</p></div><div class="ocells"><button class="ocell" id="rep" ${rc ? '' : 'disabled'}><b>Repair</b><small>${rc ? cr(rc) : '—'}</small></button>
      <button class="ocell" id="msl" ${s.missiles >= d.missiles ? 'disabled' : ''}><b>Missiles ${s.missiles}/${d.missiles}</b><small>${MISSILE_PRICE} cr each</small></button>
      <button class="ocell" id="cells" ${s.cells >= 8 ? 'disabled' : ''}><b>Fuel cells ${s.cells}/8</b><small>${CELL_PRICE} cr each</small></button>
      <button class="ocell" id="pod" ${s.pods >= d.pods ? 'disabled' : ''}><b>Cargo pod ${s.pods}/${d.pods}</b><small>+10 hold · ${cr(POD_PRICE)}</small></button></div></div>
    ${Object.values(GUNS).map((g) => `<div class="orow"><div><b style="color:${g.color}">${g.name}</b><p>${g.blurb} ${g.dmg} dmg · ${g.rof}/s · shields ×${g.vsShield}, hull ×${g.vsHull}</p></div><div class="ocells">${[1, 2, 3].map((mk) => gunCell(g.id, mk)).join('')}</div></div>`).join('')}
    ${['shields', 'armour', 'engines', 'jump'].map(up).join('')}
    ${s.wakeDrive ? '<p class="note">Ferro\'s wake-tuned drive gives at least 24 ly of jump range.</p>' : ''}`;
  const after = (r, msg) => { if (r.ok) { audio.cash(); toast(msg); G.onShipChanged(); } else { sfx.error(); toast(r.why); } refresh(G); };
  body.querySelectorAll('[data-g]').forEach((b) => b.onclick = () => { const [t, mk] = b.dataset.g.split(':'); after(S.buyGuns(P, t, +mk), `${GUNS[t].name} ${MARKS[mk - 1].name} fitted`); });
  body.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => { const [k, i] = b.dataset.u.split(':'); after(S.buyUpgrade(P, k, +i), `${UPGRADES[k].name}: ${UPGRADES[k].levels[i].n}`); });
  body.querySelector('#rep').onclick = () => after(S.repair(P), 'Hull repaired');
  body.querySelector('#msl').onclick = () => after(S.buyMissiles(P, 99), 'Missile rails loaded');
  body.querySelector('#cells').onclick = () => after(S.buyCells(P, 99), 'Fuel cells topped up');
  body.querySelector('#pod').onclick = () => after(S.buyPod(P), 'Cargo pod fitted');
}
function rumours(G, st) {
  const P = G.P; const r = rng(hashStr(st.id) ^ Math.floor(P.day) * 131); const out = [];
  // real price tips computed from the live markets
  const others = Object.values(G.SYS).flatMap((s) => s.stations.filter((x) => x.id !== st.id && !s.hidden).map((x) => ({ s, x })));
  for (let i = 0; i < 2 && others.length; i++) {
    const o = others[Math.floor(r() * others.length)]; const cons = STATION_TYPES[o.x.type].consume; const cid = cons[Math.floor(r() * cons.length)];
    const q = S.quote(P, o.x, cid, G.cfg.volatility); out.push(`${o.x.name} in ${o.s.name} is paying around ${q.sell} for ${COMM[cid].name.toLowerCase()} this week.`);
  }
  const danger = Object.values(G.SYS).filter((s) => !s.hidden).sort((a, b) => b.danger - a.danger)[Math.floor(r() * 3)];
  out.push(`Veil crews are thick in ${danger.name}. Danger ${danger.danger}/5. Bounties pay well there, if you come back.`);
  out.push(TIPS[Math.floor(r() * TIPS.length)]);
  if (P.story.stage >= 2) out.push('People say there\'s a light between the stars past Ninefold. Ships that follow it don\'t always come back.');
  return out;
}
function barTab(G, body, st) {
  const P = G.P; const offers = S.storyOffers(P, st.id); const r = rng(hashStr(st.id) ^ Math.floor(P.day));
  const rs = rumours(G, st); const patrons = [0, 1, 2].map((i) => ({ name: BAR_NAMES[Math.floor(r() * BAR_NAMES.length)], faction: st.faction, skin: ['#8a5a3c', '#c9946e', '#e2b99a', '#6a4a30'][i], hair: ['#222', '#a07030', '#ddd', '#5a2a2a'][(i + 1) % 4], hairStyle: ['short', 'long', 'bun', 'mohawk'][Math.floor(r() * 4)], eyes: '#ffd890', accent: FACTIONS[st.faction].color, title: 'Regular', line: rs[i % rs.length] }));
  body.innerHTML = `<div class="dk-head"><h2>The bar</h2><p>Warm drinks, cold rumours.</p></div>
    ${offers.map((m) => `<div class="patron story" data-s="${m.id}"><canvas width="96" height="96"></canvas><div><b>${PEOPLE[m.giver].name}</b> <small>${PEOPLE[m.giver].title}</small><p>${esc(m.brief.slice(0, 130))}…</p><button class="sd-btn primary">Talk</button></div></div>`).join('')}
    ${patrons.map((p, i) => `<div class="patron" data-p="${i}"><canvas width="96" height="96"></canvas><div><b>${p.name}</b><p>"${esc(p.line)}"</p></div></div>`).join('')}
    <div class="patron"><div style="flex:1"><b>Rumour board</b>${rs.slice(2).map((x) => `<p>• ${esc(x)}</p>`).join('')}</div></div>`;
  body.querySelectorAll('.patron[data-s] canvas').forEach((c, i) => drawPortrait(c, PEOPLE[offers[i].giver]));
  body.querySelectorAll('.patron[data-p] canvas').forEach((c, i) => drawPortrait(c, patrons[i]));
  body.querySelectorAll('.patron[data-s] button').forEach((b) => b.onclick = () => { const m = STORY.find((x) => x.id === b.closest('.patron').dataset.s); storyDialog(G, m, false); });
}
export function storyDialog(G, m, done) {
  const M = $('#modal'); const who = PEOPLE[done ? m.doneBy || m.giver : m.giver] || PEOPLE.ferro; const P = G.P;
  const alts = done ? [] : S.storyOffers(P, G.dockedStation?.id).filter((x) => x.id !== m.id);
  M.innerHTML = `<div class="sd-card dlg"><canvas width="128" height="128"></canvas><div><h2>${esc(m.title)}</h2><small>${esc(who.name)} · ${esc(who.title)}</small><p>${esc(done ? m.done : m.brief)}</p>
    ${done ? `<p class="rew">+${cr(m.reward)}</p>` : `<p class="rew">Reward ${cr(m.reward)}${Object.keys(m.rep).length ? ' · ' + Object.entries(m.rep).map(([f, v]) => `${FACTIONS[f].short} ${v > 0 ? '+' : ''}${v}`).join(', ') : ''}</p>`}
    ${alts.length ? `<p class="note">Choosing this closes the other offer (${alts.map((a) => esc(PEOPLE[a.giver].name)).join(', ')}). Your reputation decides who will still talk to you.</p>` : ''}
    <div class="sd-row" style="justify-content:flex-start">${done ? '<button class="sd-btn primary" data-a="ok">Onward</button>' : '<button class="sd-btn primary" data-a="go">Accept</button><button class="sd-btn" data-a="no">Not yet</button>'}</div></div></div>`;
  drawPortrait(M.querySelector('canvas'), who); M.classList.remove('hide'); audio.comms();
  M.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
    M.classList.add('hide'); sfx.click();
    if (b.dataset.a === 'go') { S.startStory(P, m); G.storyObjective(); toast(`Story: ${m.title}`); if (m.target.sys !== 'lacuna') G.setRoute(m.target.sys); else { G.setRoute('ninefold'); toast('Route plotted to Ninefold. From there: M, select the Lacuna, Jump drive', 5000); } G.autosave(); openDock(G, 'contracts'); }
    else if (G.state === 'docked') openDock(G, G.lastTab);
  });
}

// ---------------------------------------------------------------- sector map
export function openMap(G) {
  const M = $('#map'); M.classList.remove('hide'); G.mapSel = G.mapSel || G.P.sys;
  const cv = M.querySelector('canvas');
  const draw = () => {
    const d = Math.min(devicePixelRatio || 1, 2); const W = M.clientWidth, H = M.clientHeight; const side = W > 760 ? 320 : 0; const mh = side ? H : H * 0.62;
    cv.width = (W - side) * d; cv.height = mh * d; cv.style.width = W - side + 'px'; cv.style.height = mh + 'px';
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); const w = W - side, h = mh;
    const bg = g.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, w * 0.7); bg.addColorStop(0, G.cfg.colors.nebulaA + '55'); bg.addColorStop(0.6, G.cfg.colors.nebulaB + '22'); bg.addColorStop(1, '#02030a'); g.fillStyle = '#02030a'; g.fillRect(0, 0, w, h); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rng(3); g.fillStyle = '#fff'; for (let i = 0; i < 160; i++) { g.globalAlpha = r() * 0.6; g.fillRect(r() * w, r() * h, 1, 1); } g.globalAlpha = 1;
    const pad = 40, X = (x) => pad + (x / 100) * (w - pad * 2), Y = (y) => pad + (y / 80) * (h - pad * 2);
    const P = G.P; const known = (s) => !s.hidden || P.story.stage >= 3 || P.visited.includes(s.id);
    // faction territory glows
    for (const s of Object.values(G.SYS)) { if (!known(s) || s.faction === 'none') continue; const c = FACTIONS[s.faction].color; const gr = g.createRadialGradient(X(s.x), Y(s.y), 0, X(s.x), Y(s.y), 70); gr.addColorStop(0, c + '30'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; g.fillRect(X(s.x) - 70, Y(s.y) - 70, 140, 140); }
    // jump range
    const range = S.shipStats(P).jumpRange; const here = G.SYS[P.sys];
    if (range > 0) { g.strokeStyle = 'rgba(111,247,232,.5)'; g.setLineDash([4, 5]); g.beginPath(); g.ellipse(X(here.x), Y(here.y), range / 100 * (w - pad * 2), range / 80 * (h - pad * 2), 0, 0, 7); g.stroke(); g.setLineDash([]); }
    // links + route
    const rt = G.route || [];
    g.lineWidth = 1.5;
    for (const s of Object.values(G.SYS)) for (const o of s.gates) if (s.id < o) { const onR = rt.some((id, i) => (rt[i + 1] === o && id === s.id) || (rt[i + 1] === s.id && id === o)); g.strokeStyle = onR ? (G.cfg.colors.accent || '#ffb347') : 'rgba(160,180,255,.28)'; g.lineWidth = onR ? 3 : 1.5; g.beginPath(); g.moveTo(X(s.x), Y(s.y)); g.lineTo(X(G.SYS[o].x), Y(G.SYS[o].y)); g.stroke(); }
    // systems
    const mission = new Set(P.missions.map((m) => m.sys)); const story = P.story.active ? STORY.find((x) => x.id === P.story.active)?.target.sys : null;
    for (const s of Object.values(G.SYS)) {
      if (!known(s)) continue;
      const x = X(s.x), y = Y(s.y); const c = s.faction === 'none' ? '#c0c4d0' : s.faction === 'wake' ? '#6ff7e8' : FACTIONS[s.faction].color;
      g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, s.id === P.sys ? 8 : 6, 0, 7); g.fill(); g.shadowBlur = 0;
      if (s.id === P.sys) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 13, 0, 7); g.stroke(); }
      if (s.id === G.mapSel) { g.strokeStyle = G.cfg.colors.accent; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.arc(x, y, 18, 0, 7); g.stroke(); g.setLineDash([]); }
      g.fillStyle = '#eef2ff'; g.font = '600 12px Inter,system-ui,sans-serif'; g.textAlign = 'center'; g.fillText(s.name, x, y - 16);
      g.fillStyle = '#ff6a6a'; g.font = '10px ui-monospace,monospace'; g.fillText('▲'.repeat(s.danger), x, y + 20);
      if (mission.has(s.id)) { g.fillStyle = '#ffd35a'; g.fillText('◆ contract', x, y + 32); }
      if (story === s.id) { g.fillStyle = '#6ff7e8'; g.fillText('★ story', x, y + (mission.has(s.id) ? 44 : 32)); }
    }
    G._mapXY = { X, Y, known };
  };
  const side = M.querySelector('.mapside');
  const info = () => {
    const P = G.P; const s = G.SYS[G.mapSel]; const here = G.SYS[P.sys]; const rt = route(G.SYS, P.sys, s.id);
    const dist = mapDist(here, s); const range = S.shipStats(P).jumpRange;
    const canJump = s.id !== P.sys && range >= dist && P.ship.cells > 0;
    side.innerHTML = `<h2>${esc(s.name)}</h2><p><span class="chip" style="--c:${s.faction === 'none' ? '#ccc' : FACTIONS[s.faction].color}">${s.faction === 'none' ? 'Unclaimed' : FACTIONS[s.faction].short}</span> Danger ${s.danger}/5</p>
      <p>${s.stations.length ? s.stations.map((x) => `${esc(x.name)} (${STATION_TYPES[x.type].name})`).join('<br>') : 'No stations'}</p>
      <p>${s.planets.map((p) => p.type).join(', ') || 'No planets'}${s.asteroids ? ' · asteroid field' : ''}</p>
      <p class="note">${rt ? `${rt.length - 1} gate jump${rt.length === 2 ? '' : 's'}` : 'Not on the gate network'} · ${dist.toFixed(1)} ly direct</p>
      <div class="sd-row" style="justify-content:flex-start">${rt && s.id !== P.sys ? '<button class="sd-btn" data-a="route">Plot gate route</button>' : ''}
      ${range > 0 && s.id !== P.sys ? `<button class="sd-btn ${canJump ? 'primary' : ''}" data-a="jump" ${canJump && G.state !== 'docked' ? '' : 'disabled'}>Jump drive${canJump ? '' : range < dist ? ' (out of range)' : P.ship.cells ? '' : ' (no cells)'}</button>` : ''}</div>
      ${range > 0 && G.state === 'docked' ? '<p class="note">Launch first to use the jump drive.</p>' : ''}
      <p class="note">Click a system to inspect it. M or Esc closes the map.</p>`;
    side.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { sfx.click(); if (b.dataset.a === 'route') { G.setRoute(s.id); toast(`Route plotted to ${s.name}`); draw(); info(); } else { G.closeMap(); G.startJumpDrive(s.id); } });
  };
  cv.onclick = (e) => { const { X, Y, known } = G._mapXY; const rc = cv.getBoundingClientRect(); const mx = e.clientX - rc.left, my = e.clientY - rc.top; let best = null, bd = 900; for (const s of Object.values(G.SYS)) { if (!known(s)) continue; const d = (X(s.x) - mx) ** 2 + (Y(s.y) - my) ** 2; if (d < bd) { bd = d; best = s; } } if (best) { G.mapSel = best.id; sfx.click(); draw(); info(); } };
  draw(); info(); G._mapDraw = () => { draw(); info(); };
  if (!G.P.tutorial.map) { G.P.tutorial.map = true; toast('Plot a route: highlighted gates show the way in flight', 3500); }
}
export function closeMap() { $('#map').classList.add('hide'); }

// ---------------------------------------------------------------- pause / saves
export function openPause(G) {
  const M = $('#pause'); M.classList.remove('hide');
  const slots = [1, 2, 3].map((i) => ({ i, d: store.get(`starwake-slot-${i}`) }));
  const auto = store.get('starwake-auto');
  const desc = (d) => d ? `${esc(G.SYS[d.sys]?.name || d.sys)} · Day ${Math.floor(d.day)} · ${cr(d.credits)} · ${SHIPS[d.ship.cls].name}` : 'Empty';
  M.innerHTML = `<div class="sd-card pausecard"><h1 style="font-size:30px">Paused</h1>
    <div class="sd-row"><button class="sd-btn primary" data-a="resume">Resume</button><button class="sd-btn" data-a="settings">Settings</button><button class="sd-btn" data-a="controls">Controls</button><button class="sd-btn" data-a="quit">Quit to title</button></div>
    <div class="sd-label">Save / load</div>
    <div class="slots">${auto ? `<div class="slot"><span><b>Autosave</b> ${desc(auto)}</span><button class="mini" data-load="auto">Load</button></div>` : ''}
    ${slots.map((s) => `<div class="slot"><span><b>Slot ${s.i}</b> ${desc(s.d)}</span><button class="mini b" data-save="${s.i}">Save</button>${s.d ? `<button class="mini" data-load="${s.i}">Load</button>` : ''}</div>`).join('')}</div>
    <label class="optrow">Invert pitch <input type="checkbox" id="invY" ${G.opts.invertY ? 'checked' : ''}></label>
    <label class="optrow">Mouse steering <input type="checkbox" id="mSteer" ${G.input.mouseSteer ? 'checked' : ''}></label>
    <label class="optrow">Difficulty <select id="diffSel">${Object.entries(S.DIFF).map(([k, v]) => `<option value="${k}" ${G.P.difficulty === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <div id="controlsHelp" class="hide">${controlsHTML()}</div></div>`;
  M.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => { sfx.click(); const a = b.dataset.a; if (a === 'resume') G.resume(); if (a === 'settings') document.getElementById('sd-gear').click(); if (a === 'controls') $('#controlsHelp').classList.toggle('hide'); if (a === 'quit') G.quitToTitle(); });
  M.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => { G.saveSlot(+b.dataset.save); toast('Saved'); sfx.check(); openPause(G); });
  M.querySelectorAll('[data-load]').forEach((b) => b.onclick = () => { sfx.click(); G.loadSlot(b.dataset.load); });
  $('#invY').onchange = (e) => { G.opts.invertY = e.target.checked; store.set('starwake-opts', G.opts); };
  $('#mSteer').onchange = (e) => { G.input.mouseSteer = e.target.checked; };
  $('#diffSel').onchange = (e) => { G.P.difficulty = e.target.value; G.diff = S.DIFF[e.target.value]; toast(`Difficulty: ${S.DIFF[e.target.value].label}`); };
}
export function closePause() { $('#pause').classList.add('hide'); }
export function controlsHTML() {
  return `<table class="keys"><tr><td>Mouse</td><td>Steer (offset from centre) · LMB fire · RMB missile</td></tr><tr><td>W / S</td><td>Throttle up / down</td></tr><tr><td>Shift</td><td>Afterburner (fuel + heat)</td></tr>
  <tr><td>Q / E</td><td>Roll</td></tr><tr><td>A / D · R / F</td><td>Strafe sideways / vertical</td></tr><tr><td>Arrows</td><td>Pitch / yaw</td></tr><tr><td>Space</td><td>Fire guns</td></tr><tr><td>Ctrl or X</td><td>Fire missile (hold target for lock)</td></tr>
  <tr><td>T / Y</td><td>Target nearest hostile / cycle targets</td></tr><tr><td>N</td><td>Cycle nav point</td></tr><tr><td>Z</td><td>Autopilot to nav</td></tr><tr><td>C</td><td>Cruise drive</td></tr><tr><td>L</td><td>Request docking</td></tr><tr><td>J</td><td>Jump through gate</td></tr>
  <tr><td>M</td><td>Sector map</td></tr><tr><td>V</td><td>Cockpit / chase camera</td></tr><tr><td>Esc / P</td><td>Pause</td></tr><tr><td>Gamepad</td><td>LS steer · RS roll/throttle · RT fire · LT boost · A missile · Y target · X autopilot · B dock/jump · Start pause</td></tr></table>`;
}

// ---------------------------------------------------------------- death + ending
export function deathScreen(G, cause) {
  const M = $('#modal'); const tip = TIPS[Math.floor(Math.random() * 3)];
  M.innerHTML = `<div class="sd-card"><h1 style="font-size:34px">Ship destroyed</h1><p>${esc(cause)}</p><p class="note">${esc(tip)}</p>
    <div class="sd-row"><button class="sd-btn primary" data-a="restore">Restore last save</button><button class="sd-btn" data-a="title">Title screen</button></div></div>`;
  M.classList.remove('hide');
  M.querySelector('[data-a=restore]').onclick = () => { M.classList.add('hide'); G.loadSlot('auto'); };
  M.querySelector('[data-a=title]').onclick = () => { M.classList.add('hide'); G.quitToTitle(); };
}
export function endingScreen(G) {
  const P = G.P; const key = S.endingKey(P); const M = $('#modal');
  M.innerHTML = `<div class="sd-card end"><h1>Starwake</h1><p>${esc(ENDINGS[key])}</p>
    <p class="note">Day ${Math.floor(P.day)} · ${P.kills} kills · ${cr(P.earned)} earned · Concord ${S.repTier(P.rep.concord)}, Hollows ${S.repTier(P.rep.hollows)}, Veil ${S.repTier(P.rep.veil)}</p>
    <p>The Reach is still open. Keep flying: trade, hunt, or see what the wake does next.</p>
    <div class="sd-row"><button class="sd-btn primary" data-a="go">Keep flying</button><button class="sd-btn" data-a="title">Title screen</button></div></div>`;
  M.classList.remove('hide'); sfx.win(); G.host?.('complete', { ending: key });
  M.querySelector('[data-a=go]').onclick = () => { M.classList.add('hide'); G.autosave(); };
  M.querySelector('[data-a=title]').onclick = () => { M.classList.add('hide'); G.quitToTitle(); };
}

// ---------------------------------------------------------------- touch controls
function initTouch(G) {
  const T = $('#touch'); const I = G.input;
  const stick = $('#stick'), nub = stick.querySelector('.nub'); let sid = null, sc = null;
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); const r = stick.getBoundingClientRect(); sc = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 }; move(e); });
  const move = (e) => { if (e.pointerId !== sid) return; let dx = (e.clientX - sc.x) / sc.R, dy = (e.clientY - sc.y) / sc.R; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } I.tx = dx; I.ty = dy; nub.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; };
  stick.addEventListener('pointermove', move);
  const up = (e) => { if (e.pointerId !== sid) return; sid = null; I.tx = I.ty = 0; nub.style.transform = ''; };
  stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
  const th = $('#tthrottle'); const thSet = (e) => { const r = th.getBoundingClientRect(); const v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); G.player && (G.player.throttle = v); th.querySelector('.fill').style.height = v * 100 + '%'; G.P.tutorial.throttle = true; };
  th.addEventListener('pointerdown', (e) => { th.setPointerCapture(e.pointerId); thSet(e); }); th.addEventListener('pointermove', (e) => { if (e.buttons || e.pressure) thSet(e); });
  T.querySelectorAll('.tb').forEach((b) => {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); if (k === 'fire') I.tFire = true; else if (k === 'boost') I.tBoost = true; else G.touchAction(k); });
    const rel = () => { b.classList.remove('on'); if (k === 'fire') I.tFire = false; if (k === 'boost') I.tBoost = false; };
    b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
  });
  G.ui.touchSync = () => { if (G.player) th.querySelector('.fill').style.height = G.player.throttle * 100 + '%'; const c = T.querySelector('.ctx'); c.textContent = G.contextAction || '—'; c.disabled = !G.contextAction; };
}
export function showTouch(on) { $('#touch').classList.toggle('hide', !on); }
export function fade(on, ms = 400) { const f = $('#fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = on ? '1' : '0'; return new Promise((r) => setTimeout(r, ms)); }
