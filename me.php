<?php
require_once __DIR__ . '/inc/layout.php';
$u = page_head('My dreams', '/me.php');
$uid = (int) $u['id'];
$notes = db()->query("SELECT * FROM notifications WHERE user_id = $uid ORDER BY id DESC LIMIT 20")->fetchAll();
$mine = db()->query("SELECT * FROM redreams WHERE user_id = $uid ORDER BY created DESC LIMIT 60")->fetchAll();
$reqs = db()->query("SELECT * FROM requests WHERE user_id = $uid ORDER BY id DESC LIMIT 40")->fetchAll();
$ledger = db()->query("SELECT * FROM ledger WHERE user_id = $uid ORDER BY id DESC LIMIT 15")->fetchAll();
$label = ['queued' => ['Queued', 'ok'], 'offered' => ['Compromise offered', 'warn'], 'declined' => ['Declined · refunded', ''], 'done' => ['Ready', 'ok'], 'rejected' => ['Not allowed', 'bad']];
?>
<div class="section-h" style="margin-top:0"><div><h1 style="font-size:clamp(28px,5vw,42px)"><?= h($u['name']) ?></h1><p><?= (int) $u['credits'] ?> credits · preview currency, purchasable soon</p></div><a class="btn primary" href="/dream.php">New dream</a></div>

<?php if ($notes): ?><div class="panel" style="margin-bottom:18px"><h2 style="font-size:20px;margin-bottom:8px">Notifications</h2>
<?php foreach ($notes as $n): ?><p style="margin:6px 0"><?= $n['seen'] ? '' : '<span class="badge warn">New</span> ' ?><?= h($n['text']) ?> <?= $n['link'] ? '<a href="' . h($n['link']) . '">Open</a>' : '' ?></p><?php endforeach; ?>
<button class="btn small" onclick="sd.api('/api/notifications.php',{seen:true}).then(()=>location.reload())">Mark all read</button></div><?php endif; ?>

<div class="section-h"><h2>My redreams</h2></div>
<?php if ($mine): ?><div class="grid"><?php foreach ($mine as $r): $g = game($r['game_id']); if (!$g) continue; ?>
<article class="card"><a class="thumb" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>"><?php if ($g['thumbUrl']): ?><img loading="lazy" src="<?= h($g['thumbUrl']) ?>" alt=""><?php else: ?><div class="ph">★</div><?php endif; ?><span class="tier"><?= $r['shared'] ? 'SHARED' : 'PRIVATE' ?></span></a>
<div class="body"><div class="meta"><?= h($g['title']) ?><span><?= (int) $r['plays'] ?> plays</span></div><h3><?= h($r['title']) ?></h3>
<div class="actions"><a class="btn primary" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>">Play</a><a class="btn" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>&remix=1">Edit</a></div></div></article>
<?php endforeach; ?></div><?php else: ?><p class="empty">No redreams yet. Open any game and press <b>Remix</b>.</p><?php endif; ?>

<div class="section-h"><h2>My requests</h2></div>
<?php if ($reqs): ?><div class="panel" style="overflow-x:auto"><table class="list"><tr><th>Dream</th><th>Status</th><th>Credits</th><th></th></tr>
<?php foreach ($reqs as $r): [$l, $c] = $label[$r['status']] ?? [$r['status'], '']; ?>
<tr><td><?= h($r['text']) ?><div class="note"><?= h($r['reply']) ?></div></td><td><span class="badge <?= $c ?>"><?= h($l) ?></span><?= $r['notify'] ? '<div class="note">Will notify if possible</div>' : '' ?></td><td><?= (int) $r['cost'] ?></td>
<td><?php if ($r['status'] === 'offered'): ?><button class="btn small primary" data-act="accept" data-id="<?= (int) $r['id'] ?>">Build it</button> <button class="btn small" data-act="decline" data-id="<?= (int) $r['id'] ?>">Keep my credits</button><?php endif; ?></td></tr>
<?php endforeach; ?></table></div><?php else: ?><p class="empty">No requests yet.</p><?php endif; ?>

<div class="section-h"><h2>Credit history</h2></div>
<div class="panel"><table class="list"><?php foreach ($ledger as $l): ?><tr><td><?= h($l['reason']) ?></td><td style="text-align:right;color:<?= $l['delta'] >= 0 ? 'var(--ok)' : 'var(--warn)' ?>"><?= $l['delta'] >= 0 ? '+' : '' ?><?= (int) $l['delta'] ?></td><td class="note"><?= h($l['created']) ?></td></tr><?php endforeach; ?></table></div>
<script>document.addEventListener('click', async (e) => { const b = e.target.closest('[data-act]'); if (!b) return; b.disabled = true; try { await sd.api('/api/request.php', { action: b.dataset.act, id: +b.dataset.id }); location.reload(); } catch (err) { alert(err.message); b.disabled = false; } });</script>
<?php page_foot();
