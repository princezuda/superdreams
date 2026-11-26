<?php
require_once __DIR__ . '/inc/layout.php';
page_head('Play, dream, remix', '/');
$games = catalog();
$shared = db()->query('SELECT r.id, r.title, r.game_id, r.plays, u.name FROM redreams r JOIN users u ON u.id = r.user_id WHERE r.shared = 1 ORDER BY r.plays DESC, r.created DESC LIMIT 6')->fetchAll();
?>
<section class="hero">
  <h1>Finished games. <em>Your dreams</em>, made playable.</h1>
  <p>Play polished browser games, no download. Remix any of them into your own <strong>redream</strong>, or describe a brand-new game and the Dream Catcher builds it.</p>
  <form class="ask" action="/dream.php" method="get">
    <input name="q" maxlength="500" placeholder="“Chess in space where the pieces are starships…”" aria-label="Describe your dream game">
    <button class="btn primary" type="submit">Dream it</button>
  </form>
</section>

<div class="section-h"><div><h2>Games</h2><p><?= count($games) ?> ready to play</p></div>
  <input data-filter class="btn ghost" style="cursor:text;min-width:0;width:min(260px,45vw)" placeholder="Search games" aria-label="Search games"></div>
<div class="chips"><button class="chip on" data-genre-chip="">All</button><?php foreach (genres() as $g): ?><button class="chip" data-genre-chip="<?= h($g) ?>"><?= h($g) ?></button><?php endforeach; ?></div>
<?php if ($games): ?>
<div class="grid" data-catalog><?php foreach ($games as $g) echo game_card($g); ?></div>
<p class="empty" data-none hidden>No games match. <a href="/dream.php">Dream one up instead?</a></p>
<?php else: ?><p class="empty">The first games are being finished right now.</p><?php endif; ?>

<div class="section-h"><div><h2>Community redreams</h2><p>Remixes players shared — every one can be remixed again.</p></div><a class="btn ghost" href="/redreams.php">See all</a></div>
<?php if ($shared): ?><div class="grid"><?php foreach ($shared as $r): $g = game($r['game_id']); if (!$g) continue; ?>
  <article class="card"><a class="thumb" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>"><?php if ($g['thumbUrl']): ?><img loading="lazy" src="<?= h($g['thumbUrl']) ?>" alt=""><?php else: ?><div class="ph">★</div><?php endif; ?><span class="tier">REDREAM</span></a>
  <div class="body"><div class="meta"><?= h($g['title']) ?><span><?= (int) $r['plays'] ?> plays</span></div><h3><?= h($r['title']) ?></h3><p>by <?= h($r['name']) ?></p>
  <div class="actions"><a class="btn primary" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>">Play</a><a class="btn" href="/game.php?id=<?= h($r['game_id']) ?>&redream=<?= h($r['id']) ?>&remix=1">Remix</a></div></div></article>
<?php endforeach; ?></div><?php else: ?><p class="empty">No shared redreams yet — remix a game and share it to be first.</p><?php endif; ?>
<?php page_foot();
