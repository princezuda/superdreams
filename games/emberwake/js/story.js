// Emberwake — story (pure). Cast appearance specs (read by the pixel painter), every event script, and the
// reference walkthrough that the node test plays from the first frame to the credits.
// Scripts are async functions over a host API `G` (see World.api in game.js); the browser host animates them,
// the test host resolves them instantly.

// ---------------------------------------------------------------- cast (appearance + display name)
// look: skin, hair, style(short|spiky|long|braid|bun|bald|hood|cap|straw|bandana|captain|miner), top, top2, bottom, boots,
//       cape, scarf, apron, beard, weapon(sword|hammer|harpoon|cane|staff), scale, build(slim|broad), kind(human|cat|gull)
export const CAST = {
  rook: { name: 'Rook', look: { skin: '#f2c9a0', hair: '#3b2418', style: 'spiky', top: '#c8582a', top2: '#8e3a1c', bottom: '#3f3a58', boots: '#4a2c1c', scarf: '#f0d090', weapon: 'sword' } },
  bram: { name: 'Bram', look: { skin: '#9a6440', hair: '#1c1410', style: 'miner', top: '#5d6f7d', top2: '#3d4a56', bottom: '#5a4430', boots: '#2e2018', beard: '#241812', weapon: 'hammer', build: 'broad', scale: 1.1 } },
  ines: { name: 'Ines', look: { skin: '#e0ae84', hair: '#20465e', style: 'braid', top: '#2b7480', top2: '#1b4c56', bottom: '#e8dcc0', boots: '#3a3028', scarf: '#e86a5a', weapon: 'harpoon', build: 'slim' } },
  odile: { name: 'Odile', look: { skin: '#e8bfa0', hair: '#dcdce6', style: 'bun', top: '#7c2c3e', top2: '#561c2a', bottom: '#561c2a', boots: '#3a2420', scarf: '#d8b060', weapon: 'cane', robe: true } },
  morrow: { name: '???', look: { skin: '#c8b8b0', hair: '#9a9aa6', style: 'hood', top: '#5c5c6e', top2: '#3c3c4c', bottom: '#3c3c4c', boots: '#24242e', weapon: 'cane', robe: true, scale: 1.08 } },
  morrowOld: { name: 'Morrow', look: { skin: '#dcc0a8', hair: '#eeeef4', style: 'long', beard: '#e8e8f0', top: '#5c5c6e', top2: '#3c3c4c', bottom: '#3c3c4c', boots: '#24242e', weapon: 'cane', robe: true, scale: 1.06 } },
  pell: { name: 'Pell', look: { skin: '#f0c8a8', hair: '#8a4a22', style: 'short', top: '#6a8a4a', bottom: '#4a3a2a', apron: '#e8dcc0', build: 'broad' } },
  harrow: { name: 'Harrow', look: { skin: '#c08060', hair: '#2a2020', style: 'bald', beard: '#5a3a2a', top: '#7a3a2a', bottom: '#3a2a22', apron: '#4a3a32', build: 'broad', scale: 1.08 } },
  marta: { name: 'Marta', look: { skin: '#f0c8a8', hair: '#c88a3a', style: 'bun', top: '#3a5a8a', bottom: '#2a3a5a', apron: '#f0e8d8' } },
  kid: { name: 'Tobin', look: { skin: '#f2caa4', hair: '#d8a040', style: 'short', top: '#4a8ac8', bottom: '#6a4a2a', scale: 0.72 } },
  elder: { name: 'Old Fennick', look: { skin: '#dcb090', hair: '#e0e0e0', style: 'bald', beard: '#e8e8e8', top: '#6a5a3a', bottom: '#4a3a2a', weapon: 'cane', robe: true } },
  farmer: { name: 'Wenna', look: { skin: '#d8a078', hair: '#5a3a1a', style: 'straw', top: '#a8783a', bottom: '#4a5a3a' } },
  lark: { name: 'Lark', look: { skin: '#f4d0b0', hair: '#c83a2a', style: 'long', top: '#e8b040', bottom: '#8a3a4a', build: 'slim' } },
  cat: { name: 'Whiskerwick', look: { kind: 'cat', fur: '#e89a4a' } },
  traveller: { name: 'Traveller', look: { skin: '#c89878', hair: '#3a3a3a', style: 'hood', top: '#6a5a4a', bottom: '#4a4038', cape: '#8a3a2a', weapon: 'staff' } },
  woodcutter: { name: 'Woodcutter Abe', look: { skin: '#d89a70', hair: '#7a2a1a', style: 'short', beard: '#7a2a1a', top: '#a83a2a', top2: '#7a2a1a', bottom: '#3a3a4a', build: 'broad' } },
  gus: { name: 'Gus', look: { skin: '#e0b090', hair: '#4a4a4a', style: 'cap', top: '#4a6a8a', bottom: '#3a3a3a', apron: '#d8d0b8', build: 'broad' } },
  sera: { name: 'Sera', look: { skin: '#b07850', hair: '#1a1a1a', style: 'bandana', top: '#8a2a2a', bottom: '#3a3a4a', scarf: '#e8c040' } },
  marta2: { name: 'Nell', look: { skin: '#f0c8a8', hair: '#8a5a3a', style: 'bun', top: '#5a8a7a', bottom: '#3a5a5a', apron: '#f0e8d8' } },
  hask: { name: 'Captain Hask', look: { skin: '#d09070', hair: '#e0e0e0', style: 'captain', beard: '#e0e0e0', top: '#2a3a5a', top2: '#1a2a44', bottom: '#2a2a3a', build: 'broad' } },
  teodor: { name: 'Teodor Marr', look: { skin: '#d8a880', hair: '#c8c8d0', style: 'short', beard: '#c8c8d0', top: '#3a6a7a', bottom: '#4a4038', scarf: '#e86a5a' } },
  fisher: { name: 'Dory', look: { skin: '#c88a60', hair: '#3a2a1a', style: 'straw', top: '#c8a03a', bottom: '#3a4a5a' } },
  kid2: { name: 'Pip', look: { skin: '#a87048', hair: '#1a1a1a', style: 'spiky', top: '#e85a3a', bottom: '#3a4a6a', scale: 0.7 } },
  elder2: { name: 'Old Sal', look: { skin: '#d8a888', hair: '#f0f0f0', style: 'bun', top: '#4a4a7a', bottom: '#3a3a5a', scarf: '#8ac8c8', weapon: 'cane', robe: true } },
  gull: { name: 'Gull', look: { kind: 'gull' } },
  wagoner: { name: 'Quill', look: { skin: '#e0b090', hair: '#6a3a8a', style: 'hood', top: '#6a3a8a', bottom: '#3a2a4a', cape: '#e8b040' } },
};

export const CHAPTERS = { 1: 'The Night of the Wake', 2: 'The Dark Light of Saltmere', 3: 'Lanternspire', 4: 'Dawn' };

// ---------------------------------------------------------------- scripts
const shopTalk = (id, hello) => async (G) => { await G.say(G.who, hello); await G.shop(id); };

export const SCRIPTS = {
  // ======================================================== CHAPTER I — Kindlewick
  async intro(G) {
    G.flag('introStarted'); G.flag('chapter', 1);
    await G.title('Chapter I', 'The Night of the Wake');
    await G.say('', 'Every year, on the longest night, Kindlewick keeps the Emberwake: no one sleeps until the shrine flame greets the dawn.');
    await G.say('', 'This year the dawn is late. It has been late all autumn.');
    await G.cam(16.5, 6, { zoom: 0.85 });
    await G.say('odile', 'Rook! There you are. The wick won\'t trim itself — and neither will you. Look at that hair.');
    await G.say('rook', 'I was helping Lark hang the lantern strings. Mostly holding the ladder. Morally holding the ladder.');
    await G.say('odile', 'Hmph. Tonight you tend the shrine flame. Alone, start to finish.');
    await G.say('rook', 'Alone? But you\'ve kept the Wake for fifty years—');
    await G.say('odile', 'Fifty-one. And I am old enough to know when a hand is ready. Come. Stand by me.');
    await G.walk('player', 15.2, 7.6); await G.face('player', 'up');
    await G.fx('gutter', 16, 4.2); await G.shake(0.12);
    await G.say('', 'The shrine flame shivers. For one heartbeat every lamp in Kindlewick bows toward the north…');
    await G.cam(26.5, 2.5, { zoom: 0.8 }); await G.emote('morrowSpy', '…');
    await G.say('', '…and on the inn roof, a grey shape you have never seen before is watching.');
    await G.cam(16.5, 6, { zoom: 0.85 });
    await G.fx('snatch', 16, 4.2);
    await G.say('odile', 'The shard! Something took the shard — it\'s in the square! Rook, after it!');
    G.flag('intro'); await G.hide('morrowSpy'); await G.camReset();
    await G.hint('Walk with WASD / arrow keys / left stick / the touch pad. Touch the shadow-creature in the square to fight it.');
  },
  async tutorial(G) {
    await G.say('rook', 'Hey! Put that back — that\'s ours!');
    await G.say('', 'The duskling hisses. Two more peel out of the shadows.');
    const r = await G.battle('tut', { tut: true });
    if (r !== 'win') return;
    G.flag('tut');
    await G.say('', 'The dusklings come apart like smoke. The third — the one with the shard — is already gone, a trail of cold soot leading out of the south gate.');
    await G.walk('odile', 13.5, 11.2);
    await G.say('odile', 'North-west. That soot goes north-west. Mossbarrow Hollow — the old mine, where the roots came alive last spring.');
    await G.say('rook', 'Then that\'s where I\'m going.');
    await G.say('odile', 'Of course you are. You\'re my apprentice; I trained the sense out of you myself.');
    await G.say('odile', 'Take these. Pell and Harrow will sell you what else you need — and Marta\'s inn is free for a Wickwarden tonight.');
    await G.give('tonic', 3); await G.gold(60);
    await G.say('odile', 'One more thing. Those creatures have soft spots — fire, a clean edge, whatever it is. Find it, and hit it there until they buckle.');
    await G.walk('odile', 16.5, 7.8); await G.face('odile', 'down');
    await G.hint('South gate → the Hearthmere. Mossbarrow Hollow lies north along the road. You can save anywhere from the menu (Esc / ☰).');
  },
  async odile(G) {
    const f = G.f;
    if (f.ending) return SCRIPTS.epilogueOdile(G);
    if (!f.tut) return G.say('odile', 'After it, Rook! The square!');
    if (!f.boss1) { await G.say('odile', 'North along the Hearthmere road to Mossbarrow Hollow. Mind the boars, mind the roots, mind your manners.'); return G.say('odile', 'And if something shows you its soft spot — use it. A broken guard is half a battle.'); }
    if (!f.chapter2) {
      await G.say('rook', 'Odile — I got it back. The shard. But it\'s… cold.');
      await G.say('', 'Odile turns the shard in her hands. The light inside it is the colour of a coal at four in the morning.');
      await G.say('odile', 'It isn\'t the shard, child. It\'s what the shard is lit from. Every shrine in the Hearthmere burns with fire taken from the Great Ember at Lanternspire.');
      await G.say('odile', 'If the shards are dimming, the Ember is dying. Or someone is killing it.');
      await G.say('bram', 'Someone? Who goes around putting out the sun\'s little cousin?');
      await G.say('odile', '…There was a Keeper at Lanternspire. My brother, Morrow. He went across the water forty years ago to tend the Great Ember. He wrote for a while.');
      await G.say('odile', 'Then he stopped.');
      await G.say('rook', 'Then I\'ll go to Lanternspire. I\'ll find out.');
      await G.say('odile', 'Saltmere\'s ferry is the only boat that knows the reef. The thornwall on the east road withered when you beat that root-thing; the way is open.');
      await G.say('odile', 'Take this. It was my first wick. It\'s kept me stubborn for fifty-one years.');
      await G.give('c_wick', 1); G.flag('chapter2'); G.flag('chapter', 2);
      await G.title('Chapter II', 'The Dark Light of Saltmere');
      return G.hint('Saltmere lies east, past where the Thornwall stood. Equip Odile\'s Wick from the menu (Equip).');
    }
    if (!f.boss3) return G.say('odile', f.boss2 ? 'Lanternspire… Bring him home if you can, Rook. Bring yourself home regardless.' : 'Saltmere is east along the road. Give Captain Hask my regards — and don\'t let him tell you the story about the squid.');
  },
  async pell(G) { G.who = 'pell'; if (!G.f.tut) return G.say('pell', 'Shard\'s been snatched? Then why are you talking to me? Shoo!'); await G.say('pell', 'Provisions for the road, Wickwarden? Tonics, salts, a little fire in a jar.'); await G.shop('kindle_items'); },
  async harrow(G) { G.who = 'harrow'; if (!G.f.tut) return G.say('harrow', 'Not now, lad — go!'); await G.say('harrow', 'A blade\'s only as good as the arm. But it helps if it\'s also a good blade.'); await G.shop('kindle_smith'); },
  async innKindle(G) {
    if (!G.f.tut) return G.say('marta', 'Rook! Odile\'s calling for you!');
    const free = !G.f.boss1;
    await G.say('marta', free ? 'Wake-night rooms are free for the shrine\'s own. Rest a while?' : 'A bed and a bowl of stew — 12 gold. Rest a while?');
    if (await G.choose('', ['Rest', 'Not now']) === 0) await G.inn(free ? 0 : 12);
  },
  async kidKindle(G) {
    const f = G.f;
    if (f.ending) return G.say('kid', 'I stayed up the WHOLE night! Nobody even made me go to bed!');
    if (f.catReturned) return G.say('kid', 'Whiskerwick says thank you. She says it by ignoring you, which is how she says everything.');
    if (f.catFound) { await G.say('kid', 'You found her! Whiskerwick! Here — I was saving these for the festival, but you should have them.'); await G.give('cinderbomb', 2); G.flag('catReturned'); return; }
    await G.say('kid', 'Have you seen Whiskerwick? She\'s orange and she hates everybody. She ran off when the lamps went funny.');
    G.flag('catAsked');
  },
  async cat(G) {
    if (G.f.catAsked && !G.f.catFound) { await G.say('cat', 'Mrrp.'); await G.say('', 'Whiskerwick permits you to know where she is. Tobin will want to hear.'); G.flag('catFound'); return; }
    return G.say('cat', G.f.ending ? 'Prrrrrrrrr.' : 'Mrrp.');
  },
  async elderKindle(G) {
    const f = G.f;
    if (f.ending) return G.say('elder', 'Forty years I\'ve watched that shrine flame. Never seen it burn like this. Like it\'s glad.');
    if (!f.boss1) return G.say('elder', 'In my day the Wake was a party. Now the nights are so long, it\'s a vigil. Mark me, lad — something\'s eating the light.');
    return G.say('elder', 'Morrow Fenn? Aye, I remember him. Clever boy. Always said the Ember asked too much of the people who kept it.');
  },
  async farmerKindle(G) {
    if (G.f.ending) return G.say('farmer', 'Felt the sun on my neck this morning. I\'d forgotten it does that.');
    return G.say('farmer', G.f.boss1 ? 'The frost\'s easing a touch since you came back. The turnips have noticed.' : 'Frost in the turnip beds and it\'s not even midwinter. The dusk sits on the fields like a wet blanket.');
  },
  async larkKindle(G) {
    if (G.f.ending) return G.say('lark', 'Look at the lanterns! I didn\'t even light them. They lit THEMSELVES.');
    if (!G.f.tut) return G.say('lark', 'Rook! The shard!');
    return G.say('lark', G.f.boss1 ? 'You\'re a hero now? Ugh. You\'ll be insufferable.' : 'If you get yourself eaten in the Hollow, I\'m keeping your good scarf.');
  },
  async epilogueOdile(G) {
    await G.say('odile', 'There you are. The Wake\'s over, Wickwarden. Every shrine in the Hearthmere lit itself at dawn — with a little of everyone\'s light.');
    await G.say('odile', 'Morrow tells me it was your idea. Sharing it.');
    await G.say('rook', 'It was everyone\'s. Bram held the shard steady and Ines told the tide to wait. I just… asked.');
    await G.say('odile', 'That\'s what a Keeper is, child. Someone who asks.');
    await G.say('odile', 'Now go to sleep. You\'ve earned one whole night in a bed.');
    await G.say('rook', '…Five more minutes. I want to watch the sun come up.');
    await G.ending();
  },
  async epilogueMorrow(G) {
    await G.say('morrowOld', 'Forty years I fed it my mornings. I thought the only way to stop the hunger was to starve the fire.');
    await G.say('morrowOld', 'A child had to show an old man that a flame shared is a flame that doesn\'t eat anyone.');
    await G.say('morrowOld', 'My sister says I may stay, provided I trim the wicks and never, ever talk about the squid.');
  },
  async epilogueBram(G) { await G.say('bram', 'Mossbarrow\'s roots went back to sleep. I\'m going to dig a very peaceful tunnel. Pebble and I are retiring from heroics.'); await G.say('bram', '…Until next week. Probably.'); },
  async epilogueInes(G) { await G.say('ines', 'Dad\'s lit the Tidewatch every night since. He says it\'s brighter now. He says that about everything I do, so I don\'t trust him.'); await G.say('ines', 'Come to Saltmere sometime, Wickwarden. I\'ll teach you to read the tide. You\'ll be terrible at it.'); },

  // ======================================================== the Hearthmere
  async thornLook(G) {
    if (G.f.thornSeen) return;
    G.flag('thornSeen');
    await G.say('', 'A wall of black thorns, thick as a man\'s arm, chokes the east road. It pulses faintly — like something breathing, far off to the north-west.');
  },
  async thornMan(G) { await G.say('woodcutter', 'Twelve axes I\'ve broken on that. TWELVE. It\'s the Hollow\'s doing, mark me — roots don\'t grow like that on their own.'); },
  async traveller(G) {
    if (G.f.boss2) return G.say('traveller', 'The Tidewatch burns again! I can sleep on the road now. Well — I could. I won\'t. Wanderer\'s habit.');
    await G.say('traveller', 'Saw a fellow fight a bristleboar once. Hit it where it hurt, over and over, till the beast just… folded. Guard broke wide open.');
    await G.say('traveller', 'Then he saved up his strength and let it have everything at once. Boost, he called it. Clever lad.');
  },

  // ======================================================== Mossbarrow Hollow
  async mbEnter(G) {
    await G.say('', 'The Hollow is warm and wet and smells of turned earth. Somewhere ahead, something large is snorting.');
    await G.say('bram', 'Oi! Anyone out there? Preferably someone holding a sharp thing?');
    G.flag('mbHeard');
  },
  async bramMeet(G) {
    if (G.f.bram) return;
    await G.say('bram', 'Oh, thank the deep. A person! Name\'s Bram. I dig here. Dug here. Then the roots started digging back.');
    await G.say('bram', 'These two boars have had me cornered since noon. You look like you know which end of a sword goes in the boar.');
    await G.say('rook', 'The pointy end. Mostly.');
    await G.say('bram', 'Good enough for me. Pebble — that\'s my hammer — says hello. Together, then!');
    G.flag('bramTalk'); await G.join('bram');
    await G.hint('Bram joined! He breaks shields with Blunt and Bolt, and Stand Fast lets him guard the others.');
    const r = await G.battle('gbram', {});
    if (r !== 'win') return;
    G.flag('bram');
    await G.say('bram', 'Ha! You\'re all right, little lantern. So — what\'s a Wickwarden doing this deep in my mine?');
    await G.say('rook', 'A duskling stole our shrine\'s shard. It came this way.');
    await G.say('bram', 'The thing with the shard went past an hour ago. Straight for the Root Heart, where the big one lives. I\'m coming. It\'s my mine. Mostly.');
  },
  async rootGate(G) {
    if (G.f.rootsOpen) return;
    if (!G.f.bram) { await G.say('', 'A wall of roots, pulsing with a dim orange light — the shard\'s light. They are thick as tree trunks. You\'d need a miner\'s hammer.'); return G.push(); }
    await G.say('', 'A wall of roots blocks the way, pulsing with a dim orange light. The shard\'s light. Something beyond is drinking it.');
    await G.say('bram', 'Stand back. Pebble\'s been wanting a word with these.');
    await G.fx('crack', 15, 7.5); await G.shake(0.2);
    G.flag('rootsOpen');
    await G.say('', 'The roots split with a sound like a felled oak. A heavy, sleepy breathing fills the chamber beyond.');
  },
  async boss1(G) {
    await G.say('', 'The Root Heart. A thing of bark and moss and slow anger — and caught in its roots, the Kindlewick shard, flickering.');
    await G.say('bram', 'That\'s the Rootmother. Miners tell stories. None of them end with "and then we hit her with a hammer".');
    await G.say('rook', 'First time for everything.');
    const r = await G.battle('boss1', { boss: true });
    if (r !== 'win') return;
    G.flag('boss1'); G.flag('thornsGone');
    await G.fx('rootsWither', 15, 3.2);
    await G.say('', 'The Rootmother sags. Her roots loosen and pale and sink back into the earth, and the shard drops into your hand — warm, but barely.');
    await G.give('shard', 1);
    await G.fx('shardflare', 15, 3.2);
    await G.say('', 'For a moment you see it: a tower in the sea. A great fire at its top, red as a dying coal. A grey figure with his hands cupped around it, as if to shield it from the wind… or to smother it.');
    await G.say('???', '…let it rest…');
    await G.say('bram', 'You went white as chalk. What did you see?');
    await G.say('rook', 'I need to talk to Odile.');
    await G.hint('The Thornwall on the east road has withered. Return to Kindlewick and speak with Odile.');
  },

  // ======================================================== Saltmere
  async saltArrive(G) {
    await G.say('', 'Saltmere smells of tar and kelp and frying fish. Above the harbour, out on the headland, the Tidewatch Light stands dark for the first time in two hundred years.');
    await G.say('bram', 'Is a lighthouse supposed to look that sad?');
  },
  async brineShop(G) { await G.say('gus', 'Brine Barrel! If it\'s in a jar, I\'ve got it. If it explodes, it\'s extra.'); await G.shop('salt_items'); },
  async armsShop(G) { await G.say('sera', 'Gullwing Arms. Steel from the north, coral from the deep, discounts for nobody.'); await G.shop('salt_smith'); },
  async innSalt(G) { await G.say('marta2', 'Sea-view room, 24 gold. The view\'s mostly fog lately.'); if (await G.choose('', ['Rest (24g)', 'Not now']) === 0) await G.inn(24); },
  async hask(G) {
    const f = G.f;
    if (!f.boss2) { await G.say('hask', 'Lanternspire? Without the Tidewatch lit? The reef round that rock has eaten better boats than mine, Wickwarden.'); return G.say('hask', 'No light, no ferry. Talk to the Marr girl — the light\'s her family\'s business.'); }
    await G.say('hask', 'You lit her! You actually lit her! Haven\'t seen the reef that bright since I was a lad.');
    await G.say('hask', 'Lanternspire, then. One-way trip unless you come back, which I recommend.');
    if (await G.choose('Sail to Lanternspire?', ['All aboard', 'Not yet']) !== 0) return G.say('hask', 'I\'ll be here. Probably napping.');
    G.flag('ferry'); G.flag('chapter', 3);
    await G.fade(1, 0.8);
    await G.say('', 'The ferry noses out through the reef, the Tidewatch\'s beam sweeping ahead like a hand clearing a table.');
    await G.warp('lanternspire', 12.5, 29, 'up');
    await G.fade(0, 0.8);
  },
  async inesMeet(G) {
    if (G.f.ines) return;
    await G.say('ines', 'You\'re not from here. Good. Everyone from here keeps telling me to wait.');
    await G.say('rook', 'Wait for what?');
    await G.say('ines', 'For my father to come back. Teodor Marr — he keeps the Tidewatch. Three nights ago the light died, he went down into the Saltglass Grotto to see why, and he hasn\'t come up.');
    await G.say('', 'The shard in your pocket hums. Ines\'s harpoon — tipped with sea-glass — hums back.');
    await G.say('ines', '…What was that? That\'s tide-glass. It only sings near lighthouse-fire.');
    await G.say('rook', 'Shrine-fire. It\'s from Kindlewick. We\'re trying to find out who\'s putting out the lights.');
    await G.say('ines', 'Then we want the same thing. I\'m Ines. I know the grotto\'s tides — the only safe path in is at low water, and that\'s now.');
    await G.say('ines', 'You can come. Try to keep up.');
    await G.join('ines'); G.flag('ines');
    await G.hint('Ines joined! She heals (Mend, Tidecall), revives (Rekindle at Lv 7) and pierces with Frost. The Saltglass Grotto lies under the lighthouse, north along the coast road.');
  },
  async teodor(G) { await G.say('teodor', 'My girl tells me you\'re going to Lanternspire. Take this — Marr family tradition: never sail without a picnic.'); if (!G.f.teoGift) { G.flag('teoGift'); await G.give('feast', 2); await G.gold(250); } else await G.say('teodor', 'Bring her back with all her fingers. She\'ll need them to point at things and tell me I\'m wrong.'); },
  async fisher(G) { await G.say('fisher', G.f.boss2 ? 'Fish are biting again! Light brings \'em up. Or they\'re just nosy.' : 'Nothing\'s biting. Fish don\'t like the dark any more than we do.'); },
  async gullkid(G) { await G.say('kid2', G.f.boss2 ? 'The lighthouse goes WOOSH every eleven seconds! I counted!' : 'Did you know gulls can steal a whole fish pie? I know because one did. From me.'); },
  async oldsal(G) {
    if (G.f.boss2) return G.say('elder2', 'A grey man walked out of the sea the night the light died, they say. Walked back into it, too. Some folk aren\'t finished with a place.');
    return G.say('elder2', 'Crabs in the grotto have got shells like anvils. Hit \'em with a hammer, not a sword, dear — or hit \'em with lightning, if you\'ve any handy.');
  },
  async gull(G) { await G.say('gull', 'SKRAAAW.'); },

  // ======================================================== Saltglass Grotto
  async sgEnter(G) {
    G.flag('sgEnter');
    await G.say('ines', 'Low tide. We\'ve got until the water turns — then the lower caves flood. That\'s hours. Don\'t look so worried.');
    await G.say('ines', 'The crabs down here have shells like anvils. Blunt or Bolt. The shades hate fire. Everything hates being stabbed.');
  },
  async teodorTrapped(G) { await G.say('teodor', 'Ines?! Stay back — the Warden\'s gone mad! Something grey came down the lamp-shaft and snuffed the focus stone, and the old crab went wild!'); },
  async boss2(G) {
    await G.say('', 'The Brinewarden rises from the tide pool, a crab the size of a cottage, its shell crusted with a hundred years of lighthouse glass. Its eyes are the colour of a dead lamp.');
    await G.say('ines', 'It\'s the Warden — it guards the focus stone. It\'s never hurt anyone. Something\'s wrong with it.');
    await G.say('bram', 'Something\'s about to be wrong with its shell.');
    const r = await G.battle('boss2', { boss: true });
    if (r !== 'win') return;
    G.flag('boss2');
    await G.say('', 'The Brinewarden shudders and goes still, the grey fog draining out of its eyes. It sinks peacefully back into the pool.');
    await G.say('teodor', 'Ines! Oh, my girl — you came down here? Into THIS? You absolute— thank you. Thank you.');
    await G.say('ines', 'Dad. The focus stone.');
    await G.say('teodor', 'Dead cold. Whatever took the fire from it took it all. We\'d need a flame from the old source to wake it.');
    await G.say('rook', '…Like this?');
    await G.fx('beam', 16, 2.4); await G.flash('#ffd890');
    await G.say('', 'You lift the Kindlewick shard to the focus stone. Fire leaps from one to the other — and a beam of gold light roars up the shaft toward the lantern room high above.');
    await G.light('crystalLit');
    await G.say('???', 'You carry Odile\'s shard.');
    await G.emote('player', '!');
    await G.say('???', 'Go home, little Wickwarden. The Ember is not what you think. Let it rest.');
    await G.say('', 'A grey figure stands at the very top of the shaft, outlined against the new light. Then the light swings round, and he is gone.');
    await G.say('ines', 'Who was THAT?');
    await G.say('rook', 'I think… he knows Odile. And he\'s waiting for us at Lanternspire.');
    await G.hint('The Tidewatch burns again. Return to Saltmere — Captain Hask can sail now.');
  },

  // ======================================================== Lanternspire
  async spireArrive(G) {
    await G.title('Chapter III', 'Lanternspire');
    await G.say('', 'The spire rises out of the sea like a candle someone forgot to light. At its peak the Great Ember burns — a dull red coal, barely brighter than the stars.');
    await G.say('bram', 'Bit of a climb.');
    await G.say('ines', 'Then we\'d better start climbing.');
    await G.hint('Shrines heal and save. A travelling merchant has set up by the dock.');
  },
  async wagon(G) { await G.say('wagoner', 'Even at the end of the world, somebody\'s selling tonics. Lucky for you, it\'s me.'); await G.shop('spire_cart'); },
  async reveal(G) {
    await G.cam(15, 4, { zoom: 0.8 });
    await G.say('', 'The summit. The Great Ember hangs in a cradle of black iron, guttering. Before it stands the grey figure. He lowers his hood.');
    await G.say('morrowOld', 'You climbed all this way to watch it go out. I suppose that is a kind of Wake.');
    await G.say('rook', 'You\'re Morrow. Odile\'s brother.');
    await G.say('morrowOld', 'I was. I am fifty-eight years old, child. Look at me. Do I look fifty-eight?');
    await G.say('morrowOld', 'The Great Ember does not burn on oil. It burns on its Keeper. Every dawn it lights, it takes a morning from the one who tends it. I gave it forty years of mornings.');
    await G.say('morrowOld', 'And when I am spent, it will choose the next. It already has. Why do you think your shard sang for you, and not for Odile?');
    await G.say('ines', 'So you\'re putting out the light. Everywhere. To save one person?');
    await G.say('morrowOld', 'To save every person who would come after. Let the world have its night. Night is not the enemy. Hunger is.');
    await G.say('bram', 'People are freezing in the Hearthmere. The dusklings are coming out of the woods. That\'s not night. That\'s you.');
    await G.say('rook', 'There has to be another way.');
    await G.say('morrowOld', 'Forty years I looked for one. Prove me wrong, then, Wickwarden. Show me.');
    G.flag('reveal'); await G.camReset();
    await G.hint('Morrow waits at the Great Ember. The shrine below will save and heal — prepare, then face him.');
  },
  async boss3(G) {
    await G.say('morrowOld', 'Come, then. Let\'s see if your little fire can stand the dark.');
    const r = await G.battle('boss3', { boss: true });
    if (r !== 'win') return;
    G.flag('boss3'); G.flag('chapter', 4);
    await G.say('', 'Morrow staggers. The shadows peel away from him like wet paper, and what is left is only an old, tired man.');
    await G.say('morrowOld', '…You won. It will choose you now. I am sorry. I am so sorry, child.');
    await G.say('rook', 'Then let it choose all of us.');
    await G.say('', 'You hold out the Kindlewick shard. Bram closes his great hand around yours. Ines lays her harpoon\'s tide-glass against it, and it sings.');
    await G.say('rook', 'A fire\'s meant to be shared. That\'s the whole point of a Wake — nobody keeps it alone.');
    await G.fx('emberSplit', 15, 2.4); await G.flash('#fff0c0'); await G.shake(0.25);
    await G.say('', 'The Great Ember flares white — and splits. A hundred sparks lift from the spire and scatter over the sea, toward every hearth and shrine and lighthouse in the Hearthmere.');
    await G.say('', 'Each takes only a little. No one gives a morning they can\'t spare.');
    await G.say('morrowOld', '…Forty years. Forty years, and I never once thought to ask for help.');
    await G.light('dawn');
    await G.say('', 'That night, for the first time in forty years, the Long Dusk broke — and before the dawn came, the stars came out to watch.');
    G.flag('ending');
    await G.title('Epilogue', 'Dawn over Kindlewick');
    await G.warp('kindlewick', 15.5, 11.5, 'up');
    await G.hint('Speak with Odile at the shrine when you are ready to end the Wake.');
  },
};

// ---------------------------------------------------------------- reference walkthrough (node full-story test)
// ops: ['enter', map] arrive via the map's natural entrance · ['talk', npc] · ['touch', enemy] · ['trig', trigger]
//      ['chest', id] · ['shrine', id] · ['exit', toMap] · ['buy', shop, item, n] · ['equip', hero, item] · ['inn']
export const WALKTHROUGH = [
  ['enter', 'kindlewick'], ['touch', 'thief'], ['chest', 'k1'], ['chest', 'k2'], ['talk', 'kid'], ['talk', 'cat'], ['talk', 'kid'],
  ['buy', 'kindle_items', 'tonic', 2], ['exit', 'overworld'],
  ['touch', 'o1'], ['touch', 'o3'], ['chest', 'ow1'], ['touch', 'o2'], ['exit', 'mossbarrow'],
  ['trig', 'mbEnter'], ['talk', 'bramNpc'], ['chest', 'mb4'], ['touch', 'm1'], ['chest', 'mb1'], ['equip', 'rook', 'w_brand'], ['touch', 'm2'], ['touch', 'm3'],
  ['chest', 'mb2'], ['touch', 'm5'], ['touch', 'm4'], ['shrine', 'ms1'], ['trig', 'rootGate'], ['chest', 'mb3'], ['touch', 'rootmother'],
  ['exit', 'overworld'], ['exit', 'kindlewick'], ['talk', 'odile'], ['equip', 'bram', 'c_wick'], ['buy', 'kindle_smith', 'h_maul', 1], ['equip', 'bram', 'h_maul'],
  ['buy', 'kindle_smith', 'a_leather', 1], ['equip', 'rook', 'a_leather'], ['inn'], ['exit', 'overworld'],
  ['touch', 'o4'], ['exit', 'saltmere'], ['talk', 'inesNpc'], ['buy', 'salt_items', 'tonic', 4], ['exit', 'overworld'], ['touch', 'o5'], ['touch', 'o6'], ['chest', 'ow2'], ['chest', 'ow3'], ['equip', 'ines', 'c_feather'],
  ['exit', 'saltglass'], ['trig', 'sgEnter'], ['touch', 'sg1'], ['touch', 'sg2'], ['touch', 'sg3'], ['chest', 'sg_c3'], ['chest', 'sg_c4'], ['equip', 'bram', 'c_tide'], ['touch', 'sg4'], ['chest', 'sg_c1'], ['equip', 'ines', 'a_tidecoat'],
  ['touch', 'sg5'], ['chest', 'sg_c2'], ['touch', 'sg6'], ['shrine', 'sgs'], ['talk', 'teodorTrapped'], ['touch', 'brinewarden'],
  ['exit', 'overworld'], ['exit', 'saltmere'], ['talk', 'teodor'], ['buy', 'salt_smith', 'w_tidecutter', 1], ['equip', 'rook', 'w_tidecutter'], ['buy', 'salt_smith', 'h_anchor', 1], ['equip', 'bram', 'h_anchor'],
  ['buy', 'salt_smith', 'a_chain', 1], ['equip', 'bram', 'a_chain'], ['buy', 'salt_items', 'draught', 3], ['inn'], ['talk', 'hask'],
  ['touch', 'ls1'], ['touch', 'ls2'], ['shrine', 'lss1'], ['touch', 'ls3'], ['chest', 'ls_c1'], ['chest', 'ls_c2'], ['equip', 'rook', 'w_dawnedge'], ['chest', 'ls_c5'], ['touch', 'ls4'],
  ['touch', 'ls5'], ['chest', 'ls_c3'], ['equip', 'ines', 's_moon'], ['chest', 'ls_c4'], ['touch', 'ls6'], ['shrine', 'lss2'], ['trig', 'reveal'], ['shrine', 'lss2'], ['touch', 'morrowBoss'],
  ['talk', 'dawnBram'], ['talk', 'dawnInes'], ['talk', 'dawnMorrow'], ['talk', 'odile'],
];
