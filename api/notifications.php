<?php
// POST {seen: true} marks all read.
require_once __DIR__ . '/../lib/db.php';
$u = current_user();
db()->prepare('UPDATE notifications SET seen = 1 WHERE user_id = ?')->execute([$u['id']]);
json_out(['ok' => true]);
