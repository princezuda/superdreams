<?php
require_once __DIR__ . '/inc/layout.php';
page_head('Terms of Service', '/terms.php');
?>
<article class="prose">
<h1>Terms of Service</h1>
<p class="note">Last updated <?= date('F j, Y', filemtime(__FILE__)) ?>. Plain-language summary first, details below.</p>
<div class="panel">
<p><strong>The short version</strong></p>
<ul>
<li><strong>No refunds.</strong> Credits spent on a dream that gets built are not refundable.</li>
<li><strong>Impossible means you get your credits back.</strong> If we can't make what you asked for, we tell you and offer a compromise. If you say no, every credit you spent comes back.</li>
<li><strong>Sharing adds to everyone's dreams.</strong> When you share a redream, its parts (themes, pieces, rules, modes, levels and settings) become things the Dream Catcher can make for everyone, including in templates.</li>
<li><strong>Everything is PG-13.</strong> No sexual content or erotica, ever.</li>
</ul></div>

<h2>1. Credits</h2>
<p>Credits pay for custom dreams: new features, modes, levels or whole games. Restyling a game with the Remix panel is free. <strong>Credits are currently a preview currency</strong>: every account gets free starter credits, and credits can't be bought, sold, transferred or exchanged for money. When paid credits launch, these terms will be updated before any purchase is possible.</p>

<h2 id="refunds">2. No refunds — except when a dream isn't possible</h2>
<p>All credit spending is final. <strong>There are no refunds</strong> for dreams that were built, including if you change your mind or don't like the result. You can always ask for a follow-up change.</p>
<p>The single exception: <strong>if your request isn't possible</strong>, because of technical limits, safety rules or rights we don't hold, we'll say so and offer the closest compromise we can make. Your credits are only held until you decide. Choose <em>“No thanks, keep my credits”</em> and the full amount goes back to your wallet. If we accept a request and later find it can't be built, we refund it automatically.</p>
<p>You can ask to be notified if an impossible dream becomes possible later, for example after the community shares something that makes it buildable.</p>

<h2 id="sharing">3. Sharing redreams adds to everyone's capabilities</h2>
<p>A <strong>redream</strong> is your remix of a game. Private redreams stay yours. When you <strong>share</strong> a redream:</p>
<ul>
<li>Anyone can play it and remix it into their own redream, and those remixes can be shared too.</li>
<li><strong>Its components are automatically added to the Dream Catcher's capabilities for everyone.</strong> That includes themes, piece designs, rules, modes, level layouts and settings. They may be used to build games for other people and may be built into the site's templates.</li>
<li>You give Super Dreams a worldwide, royalty-free, perpetual licence to use, modify, combine and redistribute those components for this purpose. You keep credit as the original redreamer where the site shows authorship.</li>
<li>We review shared components and may remove any that aren't useful for making games, or that break these terms.</li>
</ul>
<p>Don't share anything you don't have the right to share.</p>

<h2>4. Content rules (PG-13)</h2>
<p>Every game and redream must be suitable for teens. Not allowed: sexual content or erotica of any kind; gore, torture or simulations of real-world atrocities; hate content; anything designed to cause real-world harm; other studios' characters, names or worlds. Requests that break these rules are declined and not charged.</p>

<h2>5. Fun, not compulsion</h2>
<p>Our games are designed to be enjoyed, not to keep you hooked. We don't use streak punishments, loot boxes or manipulative timers. Play stats are only used to check that a game matches the length it was designed for.</p>

<h2>6. Accounts, availability and changes</h2>
<p>Accounts are currently anonymous and tied to your browser. Clearing site data may lose your credits and private redreams. Games are provided as-is, and we may update or retire games, redreams or features. We may change these terms, and continued use means you accept the updated terms.</p>

<h2>7. Third-party assets</h2>
<p>Some games use openly licensed art and models, credited on the <a href="/attributions.php">asset credits page</a>.</p>
</article>
<?php page_foot();
