<?php
// Session length beacon. Used to check games against their intended play length (5/15/30/60 min), never to optimise dwell time.
require_once __DIR__ . '/../lib/db.php';
$in = json_decode(file_get_contents('php://input') ?: '{}', true) ?: [];
$sec = max(0, min(6 * 3600, (int) ($in['seconds'] ?? 0)));
if ($sec >= 5 && preg_match('/^[a-z0-9-]{1,40}$/', (string) ($in['game'] ?? ''))) {
  $uid = null;
  if (preg_match('/^[a-f0-9]{32}$/', $_COOKIE['sd_user'] ?? '')) { $st = db()->prepare('SELECT id FROM users WHERE token = ?'); $st->execute([$_COOKIE['sd_user']]); $uid = $st->fetchColumn() ?: null; }
  db()->prepare('INSERT INTO plays (user_id, game_id, redream_id, seconds) VALUES (?,?,?,?)')->execute([$uid, $in['game'], $in['redream'] ?? null, $sec]);
}
http_response_code(204);
