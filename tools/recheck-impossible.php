<?php
// Re-run declined/offered requests whose owners asked to be notified; if the dream is now possible
// (new game, template or shared capability), notify them. Run after each release: php tools/recheck-impossible.php
declare(strict_types=1);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/dreamcatcher.php';
$n = 0;
foreach (db()->query("SELECT * FROM requests WHERE notify = 1 AND notified = 0 AND status IN ('declined','offered')")->fetchAll() as $r) {
  $v = dream_catch($r['text']);
  if (in_array($v['verdict'], ['remix', 'build'], true)) {
    notify_user((int) $r['user_id'], 'Good news: your dream "' . mb_substr($r['text'], 0, 80) . '" is now possible.', '/dream.php?q=' . rawurlencode($r['text']));
    db()->prepare('UPDATE requests SET notified = 1 WHERE id = ?')->execute([$r['id']]); $n++;
  }
}
echo "notified $n\n";
