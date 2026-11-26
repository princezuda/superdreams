<?php
// Catalog = every games/<id>/meta.json. Games are static pages; this is the single source of listing truth.
declare(strict_types=1);

function catalog(): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $games = [];
  foreach (glob(__DIR__ . '/../games/*/meta.json') ?: [] as $f) {
    $m = json_decode((string) file_get_contents($f), true);
    if (!is_array($m) || empty($m['id'])) continue;
    $dir = basename(dirname($f));
    if ($m['id'] !== $dir) continue;           // id must match folder
    if (!empty($m['hidden'])) continue;        // unreleased: never listed
    $m['url'] = "/games/$dir/";
    $m['thumbUrl'] = is_file(dirname($f) . '/' . ($m['thumb'] ?? 'thumb.jpg')) ? "/games/$dir/" . ($m['thumb'] ?? 'thumb.jpg') : null;
    $games[$m['id']] = $m;
  }
  uasort($games, fn($a, $b) => ($b['featured'] ?? 0) <=> ($a['featured'] ?? 0) ?: strcmp($a['title'], $b['title']));
  return $cache = $games;
}

function game(string $id): ?array { return catalog()[$id] ?? null; }

function genres(): array {
  $g = [];
  foreach (catalog() as $m) $g[$m['genre'] ?? 'Other'] = true;
  ksort($g);
  return array_keys($g);
}

// Default dream config from the remix schema: [{key:"theme", default:"classic"}, {key:"colors.light", ...}]
function remix_defaults(array $game): array {
  $cfg = [];
  foreach ($game['remix'] ?? [] as $r) {
    if (!isset($r['key'])) continue;
    $ref = &$cfg;
    foreach (explode('.', $r['key']) as $part) { $ref = &$ref[$part]; }
    $ref = $r['default'] ?? null; unset($ref);
  }
  return $cfg;
}

// Keep only keys the game's remix schema declares, with type checks. Shared configs are untrusted input.
function sanitize_config(array $game, array $cfg): array {
  $out = [];
  foreach ($game['remix'] ?? [] as $r) {
    $v = $cfg; $ok = true;
    foreach (explode('.', $r['key']) as $part) { if (!is_array($v) || !array_key_exists($part, $v)) { $ok = false; break; } $v = $v[$part]; }
    if (!$ok) continue;
    $type = $r['type'] ?? 'choice';
    if ($type === 'choice') { $vals = array_map(fn($c) => is_array($c) ? ($c['v'] ?? $c['value'] ?? null) : $c, $r['choices'] ?? []); if (!in_array($v, $vals, true)) continue; }
    elseif ($type === 'color') { if (!is_string($v) || ($v !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $v))) continue; /* '' = theme default */ }
    elseif ($type === 'range') { if (!is_numeric($v)) continue; $v = max($r['min'] ?? -1e9, min($r['max'] ?? 1e9, $v + 0)); }
    elseif ($type === 'bool') { $v = (bool) $v; }
    elseif ($type === 'text') { if (!is_string($v)) continue; $v = mb_substr($v, 0, 80); }
    $ref = &$out;
    foreach (explode('.', $r['key']) as $part) { $ref = &$ref[$part]; }
    $ref = $v; unset($ref);
  }
  return $out;
}
