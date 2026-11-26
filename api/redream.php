<?php
// GET ?id= → {id, game, title, config}. POST {game, title, config, shared, parent} → saves a redream.
// Shared redreams also queue their components as capabilities (see terms: sharing adds to what everyone can make).
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/catalog.php';
require_once __DIR__ . '/../lib/moderation.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $st = db()->prepare('SELECT id, game_id, title, config, shared, user_id FROM redreams WHERE id = ?');
  $st->execute([(string) ($_GET['id'] ?? '')]);
  $r = $st->fetch();
  if (!$r) json_out(['error' => 'Not found'], 404);
  json_out(['id' => $r['id'], 'game' => $r['game_id'], 'title' => $r['title'], 'config' => json_decode($r['config'], true)]);
}
$u = current_user(); $in = json_in();
$g = game((string) ($in['game'] ?? ''));
if (!$g) json_out(['error' => 'Unknown game'], 400);
$title = trim(mb_substr((string) ($in['title'] ?? ''), 0, 60)) ?: 'My ' . $g['title'];
$mod = moderate($title);
if (!$mod['ok']) json_out(['error' => $mod['message']], 422);
$config = sanitize_config($g, is_array($in['config'] ?? null) ? $in['config'] : []);
$shared = !empty($in['shared']) ? 1 : 0;
$id = new_id();
db()->prepare('INSERT INTO redreams (id, user_id, game_id, parent_id, title, config, shared) VALUES (?,?,?,?,?,?,?)')
  ->execute([$id, $u['id'], $g['id'], $in['parent'] ?? null, $title, json_encode($config), $shared]);
if ($shared) db()->prepare('INSERT INTO capabilities (redream_id, game_id, component) VALUES (?,?,?)')->execute([$id, $g['id'], json_encode($config)]);
json_out(['id' => $id, 'credits' => (int) $u['credits']]);
