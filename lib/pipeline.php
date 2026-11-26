<?php
// Game-generation pipeline policy (owner's rules). Model calls are currently routed through the
// Dream Catcher Artifact (Claude via the artifact runtime); this file is the budget/escalation contract the
// server-side worker follows once an API key is configured.
declare(strict_types=1);

const PIPELINE_MODELS = [
  'bulk' => 'claude-haiku-5-5',   // every batched pass defaults here
  'polish' => 'claude-sonnet-5-5', // final pass
  'apex' => 'claude-opus-5-5',     // optional: replaces the Sonnet pass when it's the better spend
];

const PIPELINE_BUDGET = [
  'haiku_soft' => 5_000_000,       // stop and assess quality here
  'haiku_hard' => 10_000_000,      // only if the 5M assessment says it is not AA/AAA yet
  'sonnet_max' => 1_000_000,       // all Sonnet passes combined (aim: one pass)
  'opus_max' => 100_000,           // all Opus passes combined, used instead of Sonnet when chosen
  'max_output_per_call' => 100_000, // no single output over 100k tokens; chunk and keep only what's needed
];

// Decide the next stage from what has been spent and the latest quality assessment.
// $q: ['aa_or_better' => bool, 'gap' => 'none'|'one_polish_pass'|'large']
function pipeline_next(array $spent, array $q): array {
  $h = $spent['haiku'] ?? 0;
  if ($h < PIPELINE_BUDGET['haiku_soft'] && ($q['gap'] ?? 'large') === 'large') return ['stage' => 'haiku', 'model' => PIPELINE_MODELS['bulk']];
  if ($h >= PIPELINE_BUDGET['haiku_soft'] && $h < PIPELINE_BUDGET['haiku_hard'] && ($q['gap'] ?? 'large') === 'large') return ['stage' => 'haiku-extended', 'model' => PIPELINE_MODELS['bulk']];
  if (($q['gap'] ?? '') === 'none') return ['stage' => 'release', 'model' => null];
  // Final pass: Sonnet by default; Opus when a single small high-judgement pass beats Sonnet's budget.
  if (($spent['sonnet'] ?? 0) < PIPELINE_BUDGET['sonnet_max'] && empty($q['prefer_opus'])) return ['stage' => 'sonnet', 'model' => PIPELINE_MODELS['polish']];
  if (($spent['opus'] ?? 0) < PIPELINE_BUDGET['opus_max']) return ['stage' => 'opus', 'model' => PIPELINE_MODELS['apex']];
  return ['stage' => 'stop', 'model' => null, 'note' => 'Budget exhausted — report remaining gaps to the owner.'];
}
