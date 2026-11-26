<?php
require_once __DIR__ . '/inc/layout.php';
page_head('Art & asset credits', '/attributions.php');
// Credits come from each game's meta.json "credits" array: [{asset, author, license, url, use}]
$rows = [];
foreach (catalog() as $g) foreach ($g['credits'] ?? [] as $c) $rows[] = $c + ['game' => $g['title']];
?>
<article class="prose" style="max-width:980px">
<h1>Art &amp; asset credits</h1>
<p>Super Dreams games are mostly built from code: geometry, shaders and synthesized sound. Where a game uses openly licensed art, models or textures, the creators are credited here. We only use CC0, CC-BY and CC-BY-SA assets (No-Derivatives licences are never used).</p>
<div class="panel" style="overflow-x:auto"><table class="list">
<tr><th>Asset</th><th>Creator</th><th>Licence</th><th>Used in</th></tr>
<tr><td><a href="https://threejs.org">three.js</a> r187</td><td>three.js authors</td><td>MIT</td><td>All 3D games (rendering engine)</td></tr>
<tr><td>Space Grotesk, Inter (fonts)</td><td>Florian Karsten; Rasmus Andersson</td><td>SIL OFL 1.1</td><td>Website</td></tr>
<?php foreach ($rows as $c): ?>
<tr><td><?= !empty($c['url']) ? '<a href="' . h($c['url']) . '" rel="noopener">' . h($c['asset'] ?? '') . '</a>' : h($c['asset'] ?? '') ?></td><td><?= h($c['author'] ?? '') ?></td><td><?= h($c['license'] ?? '') ?></td><td><?= h($c['game']) ?><?= !empty($c['use']) ? ' — ' . h($c['use']) : '' ?></td></tr>
<?php endforeach; ?>
</table></div>
<p class="note">Spot a missing or wrong credit? It will be fixed promptly. Rejected assets and the reasons (wrong subject, licence) are logged in the project's CREDITS.txt so they aren't reconsidered.</p>
</article>
<?php page_foot();
