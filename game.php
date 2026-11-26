<?php
require_once __DIR__ . '/inc/layout.php';
$g = game((string) ($_GET['id'] ?? ''));
if (!$g) { http_response_code(404); page_head('Not found'); echo '<p class="empty">That game isn\'t here. <a href="/">Back to games</a></p>'; page_foot(); exit; }

$redream = null;
if (!empty($_GET['redream'])) {
  $st = db()->prepare('SELECT r.*, u.name FROM redreams r JOIN users u ON u.id = r.user_id WHERE r.id = ? AND r.game_id = ?');
  $st->execute([$_GET['redream'], $g['id']]);
  $redream = $st->fetch() ?: null;
  if ($redream) db()->prepare('UPDATE redreams SET plays = plays + 1 WHERE id = ?')->execute([$redream['id']]);
}
$config = array_replace_recursive(remix_defaults($g), $redream ? (json_decode($redream['config'], true) ?: []) : []);
// ?dream=<base64url config> (e.g. from the Dream Catcher) passes straight through; games sanitize it via their own defaults.
$dreamParam = preg_match('/^[A-Za-z0-9_-]{1,4000}$/', (string) ($_GET['dream'] ?? '')) ? $_GET['dream'] : null;
$src = $g['url'] . ($redream ? '?redream=' . rawurlencode($redream['id']) : ($dreamParam ? '?dream=' . $dreamParam : ''));
ob_start(); $u = page_head(($redream['title'] ?? null) ?: $g['title'], '/', $g['tagline'] ?? ''); $head = ob_get_clean();
echo str_replace('<body>', '<body class="play">', $head);
?>
<div class="playbar">
  <a class="btn small" href="/">← Games</a>
  <span class="btn small ghost" style="pointer-events:none"><?= h($g['title']) ?><?= $redream ? ' · ' . h($redream['title']) . ' by ' . h($redream['name']) : '' ?></span>
  <span style="flex:1"></span>
  <button class="btn small" id="share">Share</button>
  <button class="btn small primary" id="remixBtn">Remix</button>
</div>
<div class="stage">
  <iframe id="game" src="<?= h($src) ?>" title="<?= h($g['title']) ?>" allow="fullscreen; gamepad; autoplay" allowfullscreen></iframe>
  <aside class="drawer" id="drawer" aria-label="Remix panel">
    <h2>Remix <?= h($g['title']) ?></h2>
    <p class="note">Changes apply live. Save to keep it as your redream; share it and anyone can play or remix it.</p>
    <div id="fields"></div>
    <div class="field"><label for="rtitle">Redream name</label><input type="text" id="rtitle" maxlength="60" value="<?= h($redream ? 'Remix of ' . $redream['title'] : 'My ' . $g['title']) ?>"></div>
    <label class="note" style="display:flex;gap:8px;align-items:center;margin:6px 0 14px"><input type="checkbox" id="rshare" checked> Share publicly (see <a href="/terms.php#sharing">what sharing means</a>)</label>
    <div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="save">Save redream</button><button class="btn" id="reset">Reset</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:20px 0">
    <h2 style="font-size:17px">Want something the sliders can't do?</h2>
    <p class="note">Ask the Dream Catcher for new modes, pieces, levels or mechanics. Custom changes cost credits; if it turns out impossible you get them back.</p>
    <a class="btn" href="/dream.php?q=<?= rawurlencode('Change ' . $g['title'] . ' so that ') ?>">Ask for a custom change</a>
  </aside>
</div>
<script>
const GAME = <?= json_encode(['id' => $g['id'], 'remix' => $g['remix'] ?? []], JSON_UNESCAPED_SLASHES) ?>;
const DEFAULTS = <?= json_encode(remix_defaults($g), JSON_UNESCAPED_SLASHES) ?>;
let config = <?= json_encode($config, JSON_UNESCAPED_SLASHES) ?>;
const PARENT = <?= json_encode($redream['id'] ?? null) ?>;
const frame = document.getElementById('game'), drawer = document.getElementById('drawer');
const getP = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
const setP = (o, p, v) => { const ks = p.split('.'); let r = o; ks.slice(0, -1).forEach((k) => r = r[k] ??= {}); r[ks.at(-1)] = v; };
const push = () => frame.contentWindow?.postMessage({ type: 'sd-dream', config }, location.origin);
function build() {
  const box = document.getElementById('fields'); box.innerHTML = '';
  for (const f of GAME.remix) {
    const v = getP(config, f.key); const wrap = document.createElement('div'); wrap.className = 'field';
    const id = 'f_' + f.key.replace(/\W/g, '_'); wrap.innerHTML = `<label for="${id}">${f.label || f.key}</label>`;
    let inp;
    if ((f.type || 'choice') === 'choice') {
      inp = document.createElement('select'); inp.id = id;
      for (const c of f.choices || []) { const cv = typeof c === 'object' ? (c.v ?? c.value) : c; const o = new Option(typeof c === 'object' ? (c.label ?? cv) : c, cv); o.selected = String(cv) === String(v); inp.add(o); }
      inp.onchange = () => { setP(config, f.key, inp.value); push(); };
    } else if (f.type === 'color') { inp = Object.assign(document.createElement('input'), { type: 'color', id, value: v || '#888888' }); inp.oninput = () => { setP(config, f.key, inp.value); push(); }; }
    else if (f.type === 'range') { inp = Object.assign(document.createElement('input'), { type: 'range', id, min: f.min ?? 0, max: f.max ?? 10, step: f.step ?? 1, value: v ?? f.default ?? 0 }); inp.oninput = () => { setP(config, f.key, +inp.value); push(); }; }
    else if (f.type === 'bool') { inp = Object.assign(document.createElement('input'), { type: 'checkbox', id, checked: !!v }); inp.onchange = () => { setP(config, f.key, inp.checked); push(); }; }
    else { inp = Object.assign(document.createElement('input'), { type: 'text', id, value: v ?? '', maxLength: 80 }); inp.oninput = () => { setP(config, f.key, inp.value); push(); }; }
    wrap.appendChild(inp); box.appendChild(wrap);
  }
}
build();
const toggle = (open) => drawer.classList.toggle('open', open ?? !drawer.classList.contains('open'));
document.getElementById('remixBtn').onclick = () => toggle();
if (new URLSearchParams(location.search).has('remix')) toggle(true);
document.getElementById('reset').onclick = () => { config = structuredClone(DEFAULTS); build(); push(); };
document.getElementById('save').onclick = async (e) => {
  e.target.disabled = true;
  try {
    const r = await sd.api('/api/redream.php', { game: GAME.id, title: document.getElementById('rtitle').value, config, shared: document.getElementById('rshare').checked, parent: PARENT });
    history.replaceState(null, '', `/game.php?id=${GAME.id}&redream=${r.id}`);
    e.target.textContent = 'Saved ✓';
  } catch (err) { alert(err.message); } finally { setTimeout(() => { e.target.disabled = false; e.target.textContent = 'Save redream'; }, 1500); }
};
document.getElementById('share').onclick = async () => {
  const url = location.href.replace(/&remix=1/, '');
  try { if (navigator.share) await navigator.share({ title: document.title, url }); else { await navigator.clipboard.writeText(url); document.getElementById('share').textContent = 'Link copied'; } } catch {}
};
// Play time (for our own quality benchmarks: does a session match the game's intended length?)
const t0 = Date.now();
addEventListener('pagehide', () => navigator.sendBeacon('/api/play.php', JSON.stringify({ game: GAME.id, redream: PARENT, seconds: Math.round((Date.now() - t0) / 1000) })));
</script>
<?php page_foot();
