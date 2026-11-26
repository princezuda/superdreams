<?php
// The Dream Catcher: turns a text request into (a) an instant remix of an existing game, (b) a queued build,
// (c) a compromise offer for something impossible, or (d) a refusal (PG-13 / harm).
// This is the deterministic fallback. When a model is wired in (lib/pipeline.php), the same verdict shape is produced by Claude.
declare(strict_types=1);
require_once __DIR__ . '/moderation.php';
require_once __DIR__ . '/catalog.php';

const DC_IDENTITY = "I'm Super Dreams' Dream Catcher — I transform your dreams into reality. Describe a game, or how you'd change one, and I'll make it.";

const DC_COST = ['remix' => 0, 'feature' => 25, 'game' => 60];

// Requests the browser genuinely can't do (or we won't), each with an honest compromise.
const DC_IMPOSSIBLE = [
  ['re' => '/\b(mmo|massively multiplayer|thousands? of players|1000 players|battle royale with 100 (real )?players)\b/', 'why' => 'Real-time servers for huge player counts aren\'t available yet.', 'offer' => 'a single-player version with smart AI opponents filling the world, plus shareable seeds so friends play the same map'],
  ['re' => '/\b(real money|win money|cash prizes?|crypto|nft|bet(ting)? money)\b/', 'why' => 'Games here never pay out or take real money.', 'offer' => 'the same game with an in-game currency and leaderboards just for fun'],
  ['re' => '/\b(vr headset|oculus|quest 3|vision pro|virtual reality only)\b/', 'why' => 'VR headsets aren\'t supported yet.', 'offer' => 'a first-person 3D version you can play in any browser, including phones'],
  ['re' => '/\b(mario|pokemon|pok[eé]mon|zelda|sonic|minecraft|fortnite|call of duty|halo|master chief|pikachu|disney|marvel|spider-?man|batman|star wars|harry potter|hogwarts|lego)\b/', 'why' => 'I can\'t use other studios\' characters, names, or worlds.', 'offer' => 'an original game in the same genre with the same kind of fun, and its own characters'],
  ['re' => '/\b(voice chat|webcam chat|video chat)\b/', 'why' => 'Live voice and video between players isn\'t available.', 'offer' => 'the game with quick emotes and text pings instead'],
  ['re' => '/\b(photo ?realistic movie|hours? of cutscenes|full motion video|fmv)\b/', 'why' => 'Movie-length cinematics are too heavy for a browser game.', 'offer' => 'short in-engine cutscenes that keep the story moving'],
  ['re' => '/\b(console|xbox|playstation|ps5|switch) (version|port|release)\b/', 'why' => 'Super Dreams games run in the browser, not on consoles.', 'offer' => 'a gamepad-friendly browser version (most console controllers work in browsers)'],
];

// Genre keywords used to pick the closest existing template.
const DC_GENRES = [
  'chess' => ['chess', 'checkmate', 'king', 'queen', 'bishop', 'rook', 'pawn', 'knight piece'],
  'checkers' => ['checkers', 'draughts', 'black hole', 'graves'],
  'fps' => ['fps', 'shooter', 'shoot', 'gun', 'sniper', 'soldier', 'first person', 'first-person', 'arena', 'deathmatch'],
  'space' => ['space', 'galaxy', 'planet', 'starship', 'spaceship', 'trader', 'trading', 'dogfight', 'privateer', 'asteroid', 'colony', 'city builder', 'landmark'],
  'adventure' => ['adventure', 'point and click', 'point-and-click', 'quest', 'puzzle story', 'fairy tale', 'kingdom', 'story game'],
  'rpg' => ['rpg', 'jrpg', 'role playing', 'role-playing', 'party', 'turn based', 'dungeon', 'loot'],
  'racing' => ['race', 'racing', 'kart', 'car', 'drift'],
  'platformer' => ['platformer', 'jump', 'side scroller', 'side-scroller', 'metroidvania'],
  'puzzle' => ['puzzle', 'match 3', 'match-3', 'tetris', 'sudoku', 'sliding'],
  'casual' => ['casual', 'idle', 'clicker', 'quick game', 'simple game', 'relaxing'],
];

const DC_COLORS = ['red' => '#d8343a', 'blue' => '#2f6fe0', 'green' => '#2ea35a', 'gold' => '#e5b53a', 'yellow' => '#f2d43c', 'purple' => '#8a4fe0', 'pink' => '#ec6ab4', 'orange' => '#f08a2b', 'black' => '#15161a', 'white' => '#f3f1ea', 'silver' => '#c4c8d0', 'cyan' => '#3cd6e8', 'teal' => '#1fa39a', 'brown' => '#7a4b2a'];

function dream_catch(string $text): array {
  $text = trim(mb_substr($text, 0, 2000));
  if ($text === '') return ['verdict' => 'empty', 'reply' => 'Tell me your dream — a game you want, or a change to one of ours.'];
  $low = mb_strtolower($text);

  if (preg_match('/\b(who|what) are you\b|\byour name\b|\bare you (an? )?(ai|bot|human|claude)\b/', $low)) {
    return ['verdict' => 'identity', 'reply' => DC_IDENTITY];
  }
  $mod = moderate($text);
  if (!$mod['ok']) return ['verdict' => 'rejected', 'reply' => $mod['message'], 'reason' => $mod['reason']];

  $template = best_template($low);

  foreach (DC_IMPOSSIBLE as $imp) {
    if (preg_match($imp['re'], $low)) {
      $cost = $template ? DC_COST['feature'] : DC_COST['game'];
      return ['verdict' => 'compromise', 'template' => $template, 'cost' => $cost,
        'reply' => "That exact dream isn't possible yet: {$imp['why']} Here's what I can make instead: {$imp['offer']}. Want me to build that? If not, you keep your credits — and I can notify you if it becomes possible.",
        'compromise' => $imp['offer']];
    }
  }

  // Instant remix: the request only touches things the template already exposes (theme/mode/colours/difficulty).
  if ($template && ($g = game($template))) {
    [$cfg, $matched] = remix_from_text($g, $low);
    $asksNew = preg_match('/\b(add|new|make it have|include|with an? |more levels|another|feature|mechanic|boss|story)\b/', $low);
    if ($matched > 0 && !$asksNew) {
      return ['verdict' => 'remix', 'template' => $template, 'cost' => DC_COST['remix'], 'config' => $cfg,
        'reply' => "Done — here's {$g['title']} remixed to your dream. Tweak it further in the Remix panel, then save it as your redream."];
    }
    return ['verdict' => 'build', 'template' => $template, 'cost' => DC_COST['feature'],
      'reply' => "I can build that as a redream of {$g['title']}. It joins the build queue; you'll get a notification when it's ready to play."];
  }
  return ['verdict' => 'build', 'template' => null, 'cost' => DC_COST['game'],
    'reply' => 'That\'s a brand-new game. I\'ll design it from scratch — levels where they help, a full start-to-finish loop — and notify you when it\'s playable.'];
}

function best_template(string $low): ?string {
  $best = null; $score = 0;
  foreach (DC_GENRES as $id => $words) {
    $s = 0; foreach ($words as $w) if (str_contains($low, $w)) $s += strlen($w);
    if ($s > $score && game($id)) { $score = $s; $best = $id; }
  }
  if ($best) return $best;
  foreach (catalog() as $id => $g) if (str_contains($low, mb_strtolower($g['title'])) || str_contains($low, $id)) return $id;
  return null;
}

// Map words in the request onto the game's remix schema. Returns [config, number of fields matched].
function remix_from_text(array $game, string $low): array {
  $cfg = remix_defaults($game); $matched = 0;
  foreach ($game['remix'] ?? [] as $r) {
    $type = $r['type'] ?? 'choice';
    if ($type === 'choice') {
      foreach ($r['choices'] ?? [] as $c) {
        $v = is_array($c) ? ($c['v'] ?? $c['value'] ?? '') : $c;
        $label = mb_strtolower(is_array($c) ? ($c['label'] ?? $v) : (string) $c);
        if ($v !== '' && (preg_match('/\b' . preg_quote(mb_strtolower((string) $v), '/') . '\b/', $low) || preg_match('/\b' . preg_quote($label, '/') . '\b/', $low))) {
          set_path($cfg, $r['key'], $v); $matched++; break;
        }
      }
    } elseif ($type === 'color') {
      $hint = mb_strtolower(preg_replace('/^colors?\./', '', $r['key']));
      foreach (DC_COLORS as $name => $hex) {
        if (preg_match('/\b' . $name . '\b[^.,;]{0,24}\b' . preg_quote(rtrim($hint, 's'), '/') . '/', $low)) { set_path($cfg, $r['key'], $hex); $matched++; break; }
      }
    }
  }
  return [sanitize_config($game, $cfg), $matched];
}

function set_path(array &$a, string $path, $v): void { $ref = &$a; foreach (explode('.', $path) as $p) { $ref = &$ref[$p]; } $ref = $v; }
