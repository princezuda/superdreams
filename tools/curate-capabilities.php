<?php
// Owner rule: loop over components users shared and remove any that aren't useful for making games for others.
// Deterministic pass here (duplicates, no-op configs, PG-13 failures). When a key is configured the borderline
// "kept" set is re-judged by the bulk model (claude-haiku-5-5) per lib/pipeline.php. Run: php tools/curate-capabilities.php
declare(strict_types=1);
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/catalog.php';
require_once __DIR__ . '/../lib/moderation.php';
$seen = []; $kept = $removed = 0;
foreach (db()->query("SELECT * FROM capabilities WHERE status = 'pending' ORDER BY id")->fetchAll() as $c) {
  $g = game($c['game_id']); $cfg = json_decode($c['component'], true) ?: [];
  $reason = null;
  if (!$g) $reason = 'game no longer exists';
  else {
    $clean = sanitize_config($g, $cfg);
    $hash = $c['game_id'] . ':' . md5(json_encode($clean));
    if ($clean == sanitize_config($g, remix_defaults($g))) $reason = 'identical to the default game';
    elseif (isset($seen[$hash])) $reason = 'duplicate of capability #' . $seen[$hash];
    elseif (!moderate(json_encode($cfg))['ok']) $reason = 'fails PG-13 rules';
    else $seen[$hash] = $c['id'];
  }
  db()->prepare('UPDATE capabilities SET status = ?, reason = ? WHERE id = ?')->execute([$reason ? 'removed' : 'kept', $reason, $c['id']]);
  $reason ? $removed++ : $kept++;
}
echo "kept $kept, removed $removed\n";
