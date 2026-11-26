<?php
declare(strict_types=1);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/catalog.php';

function page_head(string $title, string $active = '', string $desc = 'Play finished AA browser games, ask for new ones, and remix any game into your own redream.'): array {
  $u = current_user();
  $unseen = (int) db()->query('SELECT COUNT(*) FROM notifications WHERE seen = 0 AND user_id = ' . (int) $u['id'])->fetchColumn();
  $nav = ['/' => 'Games', '/dream.php' => 'Dream one up', '/redreams.php' => 'Redreams', '/me.php' => 'My dreams'];
  ?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= h($title) ?> · Super Dreams</title><meta name="description" content="<?= h($desc) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1'%3E%3Cstop offset='0' stop-color='%23ffd27a'/%3E%3Cstop offset='.5' stop-color='%23ff7ad9'/%3E%3Cstop offset='1' stop-color='%237ac8ff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M40 6a26 26 0 1 0 18 44A22 22 0 1 1 40 6z' fill='url(%23g)'/%3E%3C/svg%3E">
</head><body>
<div class="sky" aria-hidden="true"></div>
<header class="top"><a class="brand" href="/"><span class="moon"></span>Super&nbsp;Dreams</a>
<nav><?php foreach ($nav as $href => $label): ?><a href="<?= $href ?>" class="<?= $active === $href ? 'on' : '' ?>"><?= h($label) ?></a><?php endforeach; ?></nav>
<a class="wallet" href="/me.php" title="Credits (preview — not yet purchasable)"><span class="coin"></span><b id="credits"><?= (int) $u['credits'] ?></b><?php if ($unseen): ?><i class="dot" title="<?= $unseen ?> new"></i><?php endif; ?></a>
</header><main><?php
  return $u;
}

function page_foot(): void { ?></main>
<footer class="foot"><div>Super Dreams — finished games, remixable by anyone. Every game is PG-13.</div>
<nav><a href="/terms.php">Terms</a><a href="/attributions.php">Art &amp; asset credits</a><a href="/about.php">About the Dream Catcher</a></nav></footer>
<script src="/assets/site.js" defer></script></body></html><?php }

function game_card(array $g): string {
  $thumb = $g['thumbUrl'] ? '<img loading="lazy" src="' . h($g['thumbUrl']) . '" alt="">' : '<div class="ph">' . h(mb_substr($g['title'], 0, 1)) . '</div>';
  return '<article class="card" data-genre="' . h($g['genre'] ?? '') . '" data-search="' . h(mb_strtolower(($g['title'] ?? '') . ' ' . ($g['genre'] ?? '') . ' ' . ($g['subgenre'] ?? '') . ' ' . ($g['tagline'] ?? ''))) . '">'
    . '<a class="thumb" href="/game.php?id=' . h($g['id']) . '">' . $thumb . '<span class="tier">' . h($g['tier'] ?? 'AA') . '</span></a>'
    . '<div class="body"><div class="meta">' . h($g['genre'] ?? '') . (isset($g['subgenre']) ? ' · ' . h($g['subgenre']) : '') . '<span>' . h($g['playTime'] ?? '') . '</span></div>'
    . '<h3><a href="/game.php?id=' . h($g['id']) . '">' . h($g['title']) . '</a></h3><p>' . h($g['tagline'] ?? '') . '</p>'
    . '<div class="actions"><a class="btn primary" href="/game.php?id=' . h($g['id']) . '">Play</a><a class="btn" href="/game.php?id=' . h($g['id']) . '&remix=1">Remix</a></div></div></article>';
}
