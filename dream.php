<?php
require_once __DIR__ . '/inc/layout.php';
$u = page_head('Dream one up', '/dream.php');
$q = (string) ($_GET['q'] ?? '');
?>
<section class="prose" style="max-width:860px">
  <h1>Dream one up</h1>
  <p>Describe a game, or a change to one of ours. Restyles of an existing game are free and instant. New features cost <b>25</b> credits and brand-new games cost <b>60</b>. If your dream isn't possible, I'll offer the closest thing I can make. Say no and you keep your credits.</p>
  <div class="chat" id="chat" aria-live="polite">
    <div class="msg"><div class="who">Dream Catcher</div>I'm Super Dreams' Dream Catcher. I transform your dreams into reality. What should we make?</div>
  </div>
  <form class="ask" id="ask"><textarea id="text" rows="2" maxlength="2000" placeholder="e.g. “Checkers on a haunted graveyard board with purple pieces”" aria-label="Your dream"><?= h($q) ?></textarea><button class="btn primary">Send</button></form>
  <p class="note">Every game is PG-13. By sending a request you agree to the <a href="/terms.php">terms</a>; credits are a preview currency and can't be bought yet.</p>
</section>
<script>
const chat = document.getElementById('chat');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function say(html, me) { const d = document.createElement('div'); d.className = 'msg' + (me ? ' me' : ''); d.innerHTML = `<div class="who">${me ? 'You' : 'Dream Catcher'}</div>${html}`; chat.appendChild(d); d.scrollIntoView({ behavior: 'smooth', block: 'end' }); return d; }
async function act(id, action, box) {
  box.querySelectorAll('button').forEach((b) => b.disabled = true);
  try { const r = await sd.api('/api/request.php', { action, id }); say(esc(r.reply)); } catch (e) { say(esc(e.message)); }
}
document.getElementById('ask').onsubmit = async (e) => {
  e.preventDefault(); const t = document.getElementById('text'); const text = t.value.trim(); if (!text) return;
  say(esc(text), true); t.value = '';
  const wait = say('<span class="note">Catching your dream…</span>');
  try {
    const r = await sd.api('/api/request.php', { text }); wait.remove();
    const badge = { remix: '<span class="badge ok">Ready now</span>', build: `<span class="badge ok">Queued · ${r.cost} credits</span>`, compromise: `<span class="badge warn">Compromise · ${r.cost} credits held</span>`, rejected: '<span class="badge bad">Not allowed</span>', insufficient: '<span class="badge warn">Not enough credits</span>' }[r.verdict] || '';
    const m = say(`${badge ? badge + '<br>' : ''}${esc(r.reply)}`);
    const row = document.createElement('div'); row.className = 'row';
    if (r.play) row.innerHTML = `<a class="btn primary" href="${r.play}">Play it</a><a class="btn" href="${r.play}&remix=1">Fine-tune</a>`;
    if (r.verdict === 'compromise') {
      row.innerHTML = `<button class="btn primary" data-a="accept">Build the compromise</button><button class="btn" data-a="decline">No thanks, keep my credits</button><button class="btn ghost" data-a="notify">Notify me if it becomes possible</button>`;
      row.onclick = (ev) => { const a = ev.target.dataset.a; if (!a) return; if (a === 'notify') { ev.target.disabled = true; sd.api('/api/request.php', { action: 'notify', id: r.id }).then((x) => say(esc(x.reply))); } else act(r.id, a, row); };
    }
    if (r.verdict === 'build') row.innerHTML = `<a class="btn" href="/me.php">Track it in My dreams</a>`;
    if (row.innerHTML) m.appendChild(row);
  } catch (err) { wait.remove(); say(esc(err.message)); }
};
if (document.getElementById('text').value) document.getElementById('text').focus();
</script>
<?php page_foot();
