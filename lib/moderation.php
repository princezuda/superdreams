<?php
// PG-13 content gate for requests, redream titles and shared components.
// No sexual content or erotica, ever. Violence is allowed at PG-13 level (no gore-for-gore, no real-world atrocity sims).
declare(strict_types=1);

function normalize_text(string $s): string {
  $s = mb_strtolower($s);
  $s = strtr($s, ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '@' => 'a', '$' => 's', '!' => 'i']);
  return preg_replace('/[^a-z\s]/', ' ', $s);
}

function moderate(string $text): array {
  $t = ' ' . preg_replace('/\s+/', ' ', normalize_text($text)) . ' ';
  $rules = [
    'sexual' => ['sex', 'sexy', 'nude', 'nudity', 'naked', 'porn', 'erotic', 'erotica', 'hentai', 'nsfw', 'strip club', 'stripper', 'fetish', 'lewd', 'xxx', 'onlyfans', 'boobs', 'genital', 'orgasm', 'seduce', 'seduction', 'lingerie', 'bdsm', 'kink', 'hookup', 'hook up', 'make out', 'brothel', 'escort'],
    'extreme_violence' => ['gore', 'torture', 'dismember', 'decapitat', 'school shoot', 'mass shoot', 'terrorist attack', 'genocide', 'suicide', 'self harm', 'self-harm'],
    'hate' => ['nazi', 'kkk', 'white power', 'ethnic cleansing'],
    'real_harm' => ['real money gambling', 'casino for money', 'bomb making', 'make a bomb', 'drug dealing sim', 'doxx', 'dox '],
  ];
  foreach ($rules as $reason => $words) {
    foreach ($words as $w) {
      // match whole words / prefixes so "sussex" or "essex" don't trip "sex"
      if (preg_match('/(^|\s)' . preg_quote($w, '/') . '/', $t)) {
        return ['ok' => false, 'reason' => $reason, 'message' => moderation_message($reason)];
      }
    }
  }
  return ['ok' => true];
}

function moderation_message(string $reason): string {
  return match ($reason) {
    'sexual' => 'Super Dreams keeps every game PG-13, so sexual content isn\'t something I can make. Try a different dream!',
    'extreme_violence' => 'That goes past PG-13. Action and combat are fine; gore, torture and real-world tragedies aren\'t.',
    'hate' => 'Hate content isn\'t allowed on Super Dreams.',
    'real_harm' => 'That could cause real-world harm, so I can\'t build it. Want a safe in-game version instead?',
    default => 'That request isn\'t allowed on Super Dreams.',
  };
}
