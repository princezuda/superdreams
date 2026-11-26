<?php
// POST {text} → Dream Catcher verdict. Credits are held when a build is accepted; impossible → compromise offer
// with credits held until the user accepts (build) or declines ("Keep my credits" → full refund).
// POST {action: accept|decline|notify, id} acts on an existing request.
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/dreamcatcher.php';
require_once __DIR__ . '/../lib/catalog.php';

$u = current_user(); $in = json_in();
$credits = fn() => (int) db()->query('SELECT credits FROM users WHERE id = ' . (int) $u['id'])->fetchColumn();

if (!empty($in['action'])) {
  $st = db()->prepare('SELECT * FROM requests WHERE id = ? AND user_id = ?'); $st->execute([(int) ($in['id'] ?? 0), $u['id']]);
  $r = $st->fetch(); if (!$r) json_out(['error' => 'Request not found'], 404);
  switch ($in['action']) {
    case 'accept':
      if ($r['status'] !== 'offered') json_out(['error' => 'Nothing to accept'], 409);
      db()->prepare("UPDATE requests SET status = 'queued' WHERE id = ?")->execute([$r['id']]);
      json_out(['status' => 'queued', 'reply' => 'Great — the compromise is in the build queue. I\'ll notify you when it\'s playable.', 'credits' => $credits()]);
    case 'decline':
      if (!in_array($r['status'], ['offered'], true)) json_out(['error' => 'Nothing to decline'], 409);
      refund((int) $u['id'], (int) $r['held'], 'Kept credits (declined compromise)', 'req:' . $r['id']);
      db()->prepare("UPDATE requests SET status = 'declined', held = 0 WHERE id = ?")->execute([$r['id']]);
      json_out(['status' => 'declined', 'reply' => 'No problem — your ' . (int) $r['held'] . ' credits are back in your wallet.', 'credits' => $credits()]);
    case 'notify':
      db()->prepare('UPDATE requests SET notify = ? WHERE id = ?')->execute([empty($in['off']) ? 1 : 0, $r['id']]);
      json_out(['notify' => empty($in['off']), 'reply' => empty($in['off']) ? 'I\'ll let you know if this dream becomes possible.' : 'Notifications off for this dream.']);
  }
  json_out(['error' => 'Unknown action'], 400);
}

$text = (string) ($in['text'] ?? '');
$v = dream_catch($text);
$status = match ($v['verdict']) { 'remix' => 'done', 'build' => 'queued', 'compromise' => 'offered', 'rejected' => 'rejected', default => 'info' };
$cost = (int) ($v['cost'] ?? 0);
if (in_array($status, ['queued', 'offered'], true) && $cost > 0) {
  if (!charge((int) $u['id'], $cost, $status === 'offered' ? 'Held for dream request' : 'Dream request', null)) {
    json_out(['verdict' => 'insufficient', 'reply' => "That dream needs $cost credits and you have {$credits()}. Credits will be purchasable soon.", 'credits' => $credits()]);
  }
}
$id = null;
if ($v['verdict'] !== 'identity' && $v['verdict'] !== 'empty') {
  db()->prepare('INSERT INTO requests (user_id, text, status, verdict, template, compromise, reply, cost, held) VALUES (?,?,?,?,?,?,?,?,?)')
    ->execute([$u['id'], mb_substr($text, 0, 2000), $status, $v['verdict'], $v['template'] ?? null, $v['compromise'] ?? null, $v['reply'], $cost, in_array($status, ['queued', 'offered'], true) ? $cost : 0]);
  $id = (int) db()->lastInsertId();
}
$out = ['id' => $id, 'status' => $status, 'credits' => $credits()] + $v;
if ($v['verdict'] === 'remix' && ($g = game($v['template']))) {
  $rid = new_id();
  db()->prepare('INSERT INTO redreams (id, user_id, game_id, title, config, shared) VALUES (?,?,?,?,?,0)')
    ->execute([$rid, $u['id'], $g['id'], mb_substr('Dream: ' . $text, 0, 60), json_encode($v['config'])]);
  $out['play'] = '/game.php?id=' . $g['id'] . '&redream=' . $rid;
}
json_out($out);
