<?php
require_once __DIR__ . '/inc/layout.php';
page_head('Community redreams', '/redreams.php');
$rows = db()->query('SELECT r.*, u.name FROM redreams r JOIN users u ON u.id = r.user_id WHERE r.shared = 1 ORDER BY r.created DESC LIMIT 120')->fetchAll();
?>
<div class="section-h" style="margin-top:0"><div><h1 style="font-size:clamp(28px,5vw,42px)">Community redreams</h1><p>Shared remixes. Play any of them, or remix one into your own.</p></div></div>
<?php if ($rows): ?><div class="grid"><?php foreach ($rows as $r): $g = game($r['game_id']); if (!$g) continue; ?>
<article class="card"><a class="thumb" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>"><?php if ($g['thumbUrl']): ?><img loading="lazy" src="<?= h($g['thumbUrl']) ?>" alt=""><?php else: ?><div class="ph">★</div><?php endif; ?><span class="tier">REDREAM</span></a>
<div class="body"><div class="meta"><?= h($g['title']) ?><span><?= (int) $r['plays'] ?> plays</span></div><h3><?= h($r['title']) ?></h3><p>by <?= h($r['name']) ?></p>
<div class="actions"><a class="btn primary" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>">Play</a><a class="btn" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>&remix=1">Remix</a></div></div></article>
<?php endforeach; ?></div><?php else: ?><p class="empty">Nothing shared yet. Remix a game and tick “Share publicly”.</p><?php endif; ?>
<?php page_foot();
