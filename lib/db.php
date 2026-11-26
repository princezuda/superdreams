<?php
// SQLite storage + anonymous session users. Credits are a dummy currency for now (will become paid).
declare(strict_types=1);

const SD_START_CREDITS = 100;

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $dir = __DIR__ . '/../data';
  if (!is_dir($dir)) mkdir($dir, 0775, true);
  $pdo = new PDO('sqlite:' . $dir . '/superdreams.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $pdo->exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  migrate($pdo);
  return $pdo;
}

function migrate(PDO $pdo): void {
  $pdo->exec(<<<SQL
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 100, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS redreams (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), game_id TEXT NOT NULL,
    parent_id TEXT, title TEXT NOT NULL, config TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0,
    plays INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL,
    status TEXT NOT NULL, verdict TEXT, template TEXT, compromise TEXT, reply TEXT,
    cost INTEGER NOT NULL DEFAULT 0, held INTEGER NOT NULL DEFAULT 0, notify INTEGER NOT NULL DEFAULT 0,
    notified INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS capabilities (
    id INTEGER PRIMARY KEY, redream_id TEXT, game_id TEXT NOT NULL, component TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', reason TEXT, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), delta INTEGER NOT NULL,
    reason TEXT NOT NULL, ref TEXT, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY, user_id INTEGER, game_id TEXT NOT NULL, redream_id TEXT,
    seconds INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL,
    link TEXT, seen INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  SQL);
}

// Anonymous user bound to a long-lived cookie. Real accounts arrive with paid credits.
function current_user(): array {
  $token = $_COOKIE['sd_user'] ?? '';
  if ($token && preg_match('/^[a-f0-9]{32}$/', $token)) {
    $st = db()->prepare('SELECT * FROM users WHERE token = ?'); $st->execute([$token]);
    if ($u = $st->fetch()) return $u;
  }
  $token = bin2hex(random_bytes(16));
  $name = 'Dreamer ' . strtoupper(substr($token, 0, 4));
  db()->prepare('INSERT INTO users (token, name, credits) VALUES (?, ?, ?)')->execute([$token, $name, SD_START_CREDITS]);
  $id = (int) db()->lastInsertId();
  ledger($id, SD_START_CREDITS, 'Welcome credits');
  if (!headers_sent()) setcookie('sd_user', $token, ['expires' => time() + 31536000, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
  $_COOKIE['sd_user'] = $token;
  return ['id' => $id, 'token' => $token, 'name' => $name, 'credits' => SD_START_CREDITS];
}

function ledger(int $userId, int $delta, string $reason, ?string $ref = null): void {
  db()->prepare('INSERT INTO ledger (user_id, delta, reason, ref) VALUES (?, ?, ?, ?)')->execute([$userId, $delta, $reason, $ref]);
}

// Atomic credit change; refuses to go negative.
function charge(int $userId, int $amount, string $reason, ?string $ref = null): bool {
  $pdo = db(); $pdo->beginTransaction();
  $st = $pdo->prepare('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?');
  $st->execute([$amount, $userId, $amount]);
  if ($st->rowCount() !== 1) { $pdo->rollBack(); return false; }
  ledger($userId, -$amount, $reason, $ref); $pdo->commit(); return true;
}
function refund(int $userId, int $amount, string $reason, ?string $ref = null): void {
  if ($amount <= 0) return;
  db()->prepare('UPDATE users SET credits = credits + ? WHERE id = ?')->execute([$amount, $userId]);
  ledger($userId, $amount, $reason, $ref);
}

function notify_user(int $userId, string $text, ?string $link = null): void {
  db()->prepare('INSERT INTO notifications (user_id, text, link) VALUES (?, ?, ?)')->execute([$userId, $text, $link]);
}

function new_id(int $len = 10): string {
  $a = 'abcdefghjkmnpqrstuvwxyz23456789'; $s = '';
  for ($i = 0; $i < $len; $i++) $s .= $a[random_int(0, strlen($a) - 1)];
  return $s;
}

function json_out($data, int $code = 200): never {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}
function json_in(): array {
  $d = json_decode(file_get_contents('php://input') ?: '[]', true);
  return is_array($d) ? $d : [];
}
function h(?string $s): string { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
