// The Hollow Crown — story, puzzles, dialog, hints. Pure data + async scripts against the engine API `G`.
// No three.js here: the whole game logic runs headless in node for the walkthrough tests.
export const T = (c, g) => ({ c, g }); // narrator tone variants: cheeky / gentle

export const CHAPTERS = {
  1: { title: 'Chapter One', sub: 'A Crown Full of Nothing' },
  2: { title: 'Chapter Two', sub: 'The Whispering Woods' },
  3: { title: 'Chapter Three', sub: 'Where the Sea Keeps Secrets' },
};

export const CAST = {
  hero: { name: '{name}', color: '#ffe9a8' },
  narrator: { name: 'Narrator', color: '#f4ecdc' },
  queen: { name: 'Queen Elowen', color: '#f6b8d8' },
  brannoch: { name: 'Sir Brannoch', color: '#9fd0ff' },
  mabel: { name: 'Mabel Crust', color: '#ffc58a' },
  hobb: { name: 'Miller Hobb', color: '#d9d2b0' },
  fennick: { name: 'Fennick', color: '#ffad6b' },
  granny: { name: 'Granny Thistle', color: '#c9b0ff' },
  oak: { name: 'Grumbleroot', color: '#b5e08a' },
  marlow: { name: 'Keeper Marlow', color: '#9ee6e0' },
  corvin: { name: 'Corvin', color: '#c8d4ff' },
};

// ------------------------------------------------------------------ items
export const ITEMS = {
  wrench: { name: "Tinker's Wrench", look: T("Your trusty wrench. It has fixed clocks, carts, a drawbridge and, once, an argument.", "Your trusty tinker's wrench. You never go anywhere without it.") },
  crown: {
    name: (s) => (s.f.tideSet ? 'The Crown of Wrenfold' : 'The Hollow Crown'),
    look: (s) => {
      const n = ['emberSet', 'bloomSet', 'tideSet'].filter((k) => s.f[k]).length;
      if (n === 0) return T("The Crown of Wrenfold, with three empty sockets where its heart-stones should be. It's lighter than it should be, which is somehow the saddest thing about it.", "The Crown of Wrenfold. Three empty sockets wait for their stones.");
      if (n === 3) return T("Whole again, and humming like a kettle that's just heard good news.", "Whole again. It glows warm, green and blue, and hums softly.");
      return T(`${n} of 3 heart-stones are home. The empty sockets look at you expectantly.`, `${n} of the three stones are back in place.`);
    },
  },
  feather: { name: 'Magpie Feather', look: T("A long black-and-white feather with a blue-green sheen. It smells faintly of mischief.", "A long black-and-white magpie feather, shimmering blue-green in the light.") },
  tongs: { name: 'Fire Tongs', look: T("Iron fire tongs, long enough to grab something hot without becoming something hot.", "A pair of long iron fire tongs from the throne room hearth.") },
  water: { name: 'Bucket of Water', look: T("A bucket of cold well water. It sloshes reproachfully whenever you walk fast.", "A wooden bucket full of cold, clear well water.") },
  ember: { name: 'Ember Stone', look: T("The Ember Stone, heart of every hearth in Wrenfold. It pulses like a small, cross heart. You're holding it with the tongs, which it resents.", "The Ember Stone, glowing red and warm. You hold it carefully with the tongs.") },
  bread: { name: 'Fresh Loaf', look: (s) => (s.f.fennickFed ? T("Half of Mabel's loaf. The other half is inside a very happy fox.", "Half of Mabel's lovely loaf.") : T("Mabel's first unburnt loaf of the week. It smells like a hug.", "A warm, crusty loaf from Mabel's bakery.")) },
  musicbox: {
    name: (s) => (s.f.boxFixed ? 'Music Box' : 'Silent Music Box'),
    look: (s) => (s.f.boxFixed ? T("The Queen's music box, wound and ready. It plays the old Wrenfold lullaby, which has never failed to put anybody to sleep, including the composer.", "The Queen's music box, ready to play its gentle lullaby.") : T("A little silver music box painted with dancing wrens. The winding key is missing, so it's currently a very pretty brick.", "A silver music box painted with wrens. Its winding key is missing.")),
  },
  key: { name: 'Brass Key', look: T("A tiny brass winding key, slightly duck-flavoured.", "A tiny brass winding key. It looks like it would fit something small and musical.") },
  rope: { name: 'Coil of Rope', look: T("Good, honest rope from Hobb's mill. Every adventurer needs rope. It's in the rules.", "A sturdy coil of rope from Hobb's mill.") },
  pass: { name: 'Royal Pass', look: T("A Royal Pass, signed by the Queen with a flourish and slightly crooked. It says: LET THIS TINKER THROUGH, AND BE NICE ABOUT IT.", "A Royal Pass signed by Queen Elowen, allowing you to leave the town.") },
  lavender: { name: 'Sprig of Lavender', look: T("A fragrant sprig of lavender. Smelling it makes you want a nap and a biscuit, in either order.", "A fragrant sprig of lavender from the castle garden.") },
  mirror: { name: "Fennick's Mirror", look: T("A 'genuine Enchanted Mirror'. It shows the face of whoever looks into it. Every time! Never fails!", "A small hand mirror in a gilded frame, traded from Fennick.") },
  glowcap: { name: 'Glowcap', look: T("A glowing toadstool. It smells of cinnamon and bad decisions. Do not eat. Probably.", "A softly glowing toadstool. Probably best not to eat it.") },
  toffee: {
    name: (s) => (s.f.toffeeWarm ? 'Warm Toffee' : "Granny's Toffee"),
    look: (s) => (s.f.toffeeWarm ? T("Warm, glossy, gloriously sticky toffee. It wants to mend something, and soon.", "Warm, sticky toffee, soft enough to spread.") : T("A jar of Granny Thistle's famous toffee. It sets harder than a troll's heart. Folk use it to mend pots and roof tiles, and occasionally, by accident, their teeth.", "A jar of Granny Thistle's rock-hard toffee. She said to warm it before mending anything.")),
  },
  bloom: { name: 'Bloom Stone', look: T("The Bloom Stone, green as a secret. It's already trying to grow a tiny fern on your sleeve.", "The Bloom Stone, glowing a gentle spring green.") },
  tide: { name: 'Tide Stone', look: T("The Tide Stone, blue as a summer wave. Hold it to your ear and you can hear the sea, which is showing off.", "The Tide Stone, glowing blue like a summer wave.") },
  thimble: { name: 'Silver Thimble', look: T("A silver thimble engraved 'M.C.' The magpie must have dropped it. Someone in town will be missing it.", "A small silver thimble engraved with the letters M.C.") },
  bell: { name: 'Brass Bell', look: T("A duck-sized brass bell engraved GERALD. Either a duck's or a very small knight's.", "A little brass bell engraved with the name GERALD.") },
  watch: { name: (s) => (s.f.watchFixed ? 'Ticking Watch' : 'Stopped Watch'), look: (s) => (s.f.watchFixed ? T("A silver pocket-watch, ticking happily. Engraved: 'To Marlow, for keeping the light.'", "A silver pocket-watch, ticking again. Engraved: 'To Marlow, for keeping the light.'") : T("A silver pocket-watch, stopped at ten past midnight. Engraved: 'To Marlow, for keeping the light.' A tinker could have this ticking in no time.", "A stopped silver pocket-watch, engraved 'To Marlow, for keeping the light.' Perhaps you could fix it.")) },
  hairpin: { name: 'Pearl Hairpin', look: T("A royal pearl hairpin, lightly seasoned with crab.", "A lovely pearl hairpin. It looks like it belongs to someone royal.") },
};

export const DEEDS = {
  biscuit: 'Gave Biscuit the cat a proper scratch',
  turnip: 'Fed Turnip the hungry pony',
  brave: 'Told Sir Brannoch he was brave',
  thimble: "Returned Mabel's silver thimble",
  bell: "Returned Gerald's bell to Hobb",
  goat: 'Gave Clementine the goat a treat',
  watchfix: "Mended Marlow's pocket-watch",
  watch: "Returned Marlow's watch",
  hairpin: "Returned the Queen's pearl hairpin",
  invite: 'Invited Corvin to the coronation',
};

// ------------------------------------------------------------------ helpers used by scripts
const setStone = async (G, id, flag) => {
  G.take(id); G.set(flag); G.sfx('magic'); G.fx('crown');
  const n = ['emberSet', 'bloomSet', 'tideSet'].filter((k) => G.f(k)).length;
  await G.n(n === 1 ? T("The Ember Stone clicks into its socket. The Crown shivers, warms, and — just for a moment — you hear a single note, like a choir clearing its throat.", "The Ember Stone settles into its socket with a soft chime. The Crown feels a little warmer.")
    : n === 2 ? T("The Bloom Stone snaps home. A second note joins the first. Somewhere in the woods, a very old tree sighs with relief.", "The Bloom Stone settles into its socket. A second, sweeter note joins the first.")
      : T("The Tide Stone clicks home.", "The Tide Stone settles into its socket."));
  if (n === 3) await G.finale();
};

// ------------------------------------------------------------------ per-scene hotspot logic
export const SCENES = {
  // ============================================================ CHAPTER 1
  throne: {
    name: 'The Throne Room', chapter: 1,
    enter: async (G) => {
      if (G.f('intro')) return;
      G.set('intro');
      await G.chapter(1);
      await G.n(T("Once upon a Tuesday, in the little kingdom of Wrenfold, the Crown woke up hollow.", "Once upon a time, in the little kingdom of Wrenfold, the Crown woke up hollow."));
      await G.n(T("Its three heart-stones — the Ember, the Bloom and the Tide — had vanished in the night, leaving three empty sockets and one very confused Queen.", "Its three heart-stones — the Ember, the Bloom and the Tide — had vanished in the night."));
      await G.say('queen', "{name}! Oh, thank goodness. Come here, dear — I need my favourite tinker.");
      G.tutorial('talk');
    },
    hot: {
      queen: {
        name: 'Queen Elowen', npc: 'queen',
        look: async (G) => { G.set('lookedQueen'); await G.n(T("Queen Elowen of Wrenfold: kind, clever, and currently wearing her spectacles on top of her head while looking for them.", "Your Aunt Elowen, Queen of Wrenfold. Her spectacles are perched on top of her head — she doesn't seem to have noticed.")); },
        items: {
          hairpin: async (G) => { await G.h("Aunt, is this yours? A crab had it."); G.take('hairpin'); await G.say('queen', "My pearl hairpin! I thought the bird had it. A crab, you say? How very enterprising of the crab."); await G.deed('hairpin'); },
          feather: async (G) => { await G.say('queen', "That's the feather from my windowsill. Show it to Sir Brannoch — he insists birds don't do crimes."); },
          crown: async (G) => { await G.say('queen', G.f('emberSet') ? "Oh, it's warming up already! Keep going, dear." : "Keep it safe, dear. Bring the stones home to it."); },
        },
      },
      throne: { name: 'Throne', look: T("The Throne of Wrenfold, carved from a single oak and padded with three centuries of cushions.", "The Throne of Wrenfold, carved from a single great oak."), use: T("You sit on the throne for exactly one second. It feels like being told off by furniture.", "You consider sitting on it, then think better of it.") },
      cushion: { name: 'Velvet Cushion', look: (s) => (s.f.gotCrown ? T("An empty velvet cushion with a crown-shaped dent. It looks lonely.", "An empty velvet cushion. The Crown usually rests here.") : T("A velvet cushion holding the Hollow Crown. Even the cushion looks disappointed.", "The Hollow Crown rests on a velvet cushion.")), use: (s) => (s.f.gotCrown ? T("You fluff the cushion. It remains lonely, but better groomed.", "You straighten the cushion.") : T("Better ask the Queen before you pick up the Crown. Grabbing royal regalia is how tinkers end up in the dungeon.", "You should ask the Queen first.")) },
      window: { name: 'Stained-Glass Window', look: T("The great window shows the founding of Wrenfold: a red stone glowing in a hearth, a green stone cradled in an oak, a blue stone beneath the waves. Subtle, the old glaziers were not.", "The great window shows a red stone in a hearth, a green stone in an oak, and a blue stone beneath the waves."), use: T("You can't reach. And if you could, you'd only leave fingerprints on a masterpiece.", "It's far too high to reach.") },
      feather: {
        name: 'Feather', vis: (s) => !s.f.featherTaken,
        look: T("A long black-and-white feather lies on the windowsill. Tucked under it: nothing. You checked.", "A black-and-white feather lies on the windowsill."),
        use: async (G) => { G.set('featherTaken'); await G.anim('hero', 'reach'); G.give('feather'); await G.n(T("You pick up the feather. It smells faintly of mischief and very faintly of spoons.", "You pick up the feather. It shimmers blue-green.")); },
      },
      hearth: { name: 'Hearth', look: T("A big friendly fire, the only thing in the castle that isn't worried today.", "A big, friendly fire crackles in the hearth."), use: T("You warm your hands and feel briefly heroic.", "You warm your hands for a moment. Lovely.") },
      tongs: {
        name: 'Fire Tongs', vis: (s) => !s.f.tongsTaken,
        look: T("Long iron fire tongs, leaning against the hearth like a bored sentry.", "A pair of long iron fire tongs leans against the hearth."),
        use: async (G) => { G.set('tongsTaken'); await G.anim('hero', 'pickup'); G.give('tongs'); await G.n(T("You take the fire tongs. Nobody stops you. Nobody ever stops a tinker carrying tools; it's the great secret of the profession.", "You take the fire tongs.")); },
      },
      musicbox: {
        name: 'Music Box', vis: (s) => !s.f.boxTaken,
        look: T("A little silver music box painted with dancing wrens. The winding key is missing.", "A little silver music box sits on the table. Its winding key is missing."),
        use: async (G) => { await G.say('queen', "Take it if you like, dear. It played me to sleep every night when I was small — until the key went missing. If anyone can make it sing again, it's you."); G.set('boxTaken'); await G.anim('hero', 'pickup'); G.give('musicbox'); },
      },
      portrait: { name: 'Portrait', look: T("Great-Great-Grandmother Queen Ottilie, who once defeated a dragon by explaining tax law to it until it fell asleep.", "A portrait of Queen Ottilie, a great-great-grandmother famed for outwitting a dragon."), use: T("You straighten the portrait. Queen Ottilie still looks like she's about to explain tax law.", "You straighten the frame.") },
      armor: { name: 'Suit of Armour', look: T("A suit of armour. Empty, you hope.", "A gleaming, empty suit of armour."), use: T("You knock politely. Nobody's home.", "You tap the breastplate. It rings hollowly."), talk: T("'Hello?' The armour says nothing. Armour rarely does.", "The armour doesn't answer.") },
      banners: { name: 'Banners', look: T("Banners in the royal colours. Someone has ironed them. Twice.", "Banners in the royal colours hang from the rafters.") },
    },
    exits: { courtyard: { name: 'To the Courtyard', to: 'courtyard', entry: 'keep' } },
  },

  courtyard: {
    name: 'The Castle Courtyard', chapter: 1,
    enter: async (G) => { if (!G.once('courtyardIntro')) return; await G.n(T("The castle courtyard: cobbles, chickens, and a general air of everybody pretending not to panic.", "The castle courtyard, bright with Midsummer banners.")); },
    hot: {
      well: {
        name: 'Well',
        look: (s) => (s.f.wellUsed ? T("The castle well. Your wrench made a fine crank. You might patent it.", "The castle well.") : T("The castle well. The bucket is down there somewhere, but the brass crank handle has vanished — only a square iron peg sticks out where it used to be. Something shiny-loving has been here.", "The castle well. Its brass crank handle is missing; just a square iron peg sticks out.")),
        use: T("You try to turn the iron peg with your fingers. Your fingers lose.", "The peg is too stiff to turn by hand."),
        items: {
          wrench: async (G) => {
            if (G.has('water') || G.f('ovenDoused')) return G.n(T("You've already got all the water this story needs. Two buckets would be showing off.", "You already have the water you need."));
            await G.anim('hero', 'reach', 1.2); G.sfx('click'); G.fx('splash', 'well');
            G.set('wellUsed'); G.give('water');
            await G.n(T("Your wrench fits the square peg like it was born there. A few cheerful cranks later, up comes the bucket, brimming with cold, clear well water.", "Your wrench fits the square peg perfectly. You crank up a bucket of cold, clear water."));
          },
          tongs: T("You could probably turn the peg with the tongs, if you also had three more hands.", "The tongs won't grip the peg."),
        },
      },
      lavender: {
        name: 'Herb Garden',
        look: (s) => (s.f.lavenderTaken ? T("Rosemary, thyme, and a great purple cloud of lavender, now one sprig lighter.", "The castle herb garden, full of rosemary, thyme and lavender.") : T("The castle herb garden: rosemary, thyme, and a great purple cloud of lavender that the bees have unionised.", "The castle herb garden: rosemary, thyme, and a big purple cloud of lavender humming with bees.")),
        use: async (G) => {
          if (G.has('lavender') || G.f('grannyHappy')) return G.n(T("The bees have made it very clear that one sprig is your limit.", "One sprig is plenty."));
          await G.anim('hero', 'pickup'); G.set('lavenderTaken'); G.give('lavender');
          await G.n(T("You pick a fragrant sprig of lavender. The bees allow it, this once, pending review.", "You pick a fragrant sprig of lavender."));
        },
      },
      biscuit: {
        name: 'Biscuit the Cat',
        look: T("Biscuit, the castle cat: ginger, round, and firmly of the opinion that the castle belongs to her and everyone else is a lodger.", "Biscuit, the castle cat, is sunning herself on the wall."),
        talk: async (G) => { await G.h("Morning, Biscuit. Did you see who took the stones?"); await G.n(T("Biscuit looks at you, then at the sky, then back at you, as if to say: 'Birds. Obviously. Keep up.'", "Biscuit glances meaningfully at the sky. Something flew, she seems to say.")); },
        use: async (G) => { if (G.d('biscuit')) return G.n(T("Biscuit has been scratched enough for one day. She'll send for you.", "Biscuit is quite content now.")); await G.anim('hero', 'reach'); G.sfx('select'); await G.n(T("You scratch Biscuit behind the ears. She purrs like a small, smug engine.", "You scratch Biscuit behind the ears. She purrs happily.")); await G.deed('biscuit'); },
        items: { bread: T("Biscuit sniffs the bread and looks deeply insulted on behalf of all cats.", "Biscuit isn't interested in bread."), musicbox: async (G) => (G.f('boxFixed') ? G.n(T("You play Biscuit a few bars of the lullaby. She was asleep before you started. She's a professional.", "Biscuit dozes off to the lullaby.")) : G.n("The music box is silent without its key.")) },
      },
      turnip: {
        name: 'Turnip the Pony',
        look: (s) => (s.deeds.turnip ? T("Turnip, the royal pony, chewing contentedly and dreaming of more bread.", "Turnip, the royal pony, looks content.") : T("Turnip, the royal pony. He has the sad, hollow look of a pony whose stable boy has gone to choir practice and forgotten breakfast.", "Turnip, the royal pony. He looks hungry — someone forgot his breakfast.")),
        use: T("You pat Turnip's nose. He checks your hands for food, finds none, and forgives you, barely.", "You pat Turnip's nose. He snuffles your empty hands hopefully."),
        talk: T("'Who's a good pony?' Turnip suggests, with his whole face, that a good pony is a fed pony.", "Turnip nickers softly. He seems hungry."),
        items: {
          bread: async (G) => { if (G.d('turnip')) return G.n("Turnip has had his share. Any more and he'll need a bigger stable."); await G.anim('hero', 'reach'); await G.n(T("You tear off a chunk of bread for Turnip. He chews it with the solemn joy of a pony who has finally been heard.", "You give Turnip a piece of bread. He munches it gratefully.")); await G.deed('turnip'); },
          lavender: T("Turnip sniffs the lavender and sneezes magnificently.", "Turnip sniffs the lavender and sneezes."),
          glowcap: T("Turnip takes one look at the glowcap and backs into his stable. Wise pony.", "Turnip doesn't want that."),
        },
      },
      dummy: { name: 'Training Dummy', look: T("A straw training dummy. It has been defeated many times and remains upbeat.", "A straw training dummy for the castle guards."), use: T("You give the dummy a stern talking-to. It takes it well.", "You give the dummy a friendly poke.") },
      banners: { name: 'Banners', look: T("Midsummer banners. Everyone's decorating as if the Crown will be fixed in time. No pressure.", "Bright Midsummer banners flutter from the walls.") },
    },
    exits: {
      keep: { name: 'Into the Throne Room', to: 'throne', entry: 'courtyard' },
      gate: { name: 'To Wrenfold Square', to: 'square', entry: 'castle' },
    },
  },

  square: {
    name: 'Wrenfold Square', chapter: 1,
    enter: async (G) => { if (!G.once('squareIntro')) return; await G.n(T("Wrenfold Square, decked out for Midsummer. The bunting is up, the fountain is gossiping, and the whole place smells of burning bread.", "Wrenfold Square, decked out for Midsummer. Something smells of burning bread.")); },
    hot: {
      mabel: { name: 'Mabel', npc: 'mabel', look: T("Mabel Crust, Wrenfold's baker: flour to the elbows, gossip to the eyebrows.", "Mabel Crust, Wrenfold's cheerful baker."), items: { thimble: async (G) => dlgMabelThimble(G), bread: T("'You keep that, love, you've earned it.'", "'That's yours, love. Enjoy it.'"), ember: T("Mabel backs away. 'Keep that thing well away from my oven!'", "'Please keep it away from my oven, love!'") } },
      oven: {
        name: (s) => (s.f.emberTaken ? 'Oven' : 'Roaring Oven'),
        look: async (G) => {
          if (G.f('emberTaken')) return G.n(T("The oven glows a sensible, bread-friendly orange.", "The oven glows a cosy orange."));
          G.set('lookedOven');
          if (G.f('ovenDoused')) return G.n(T("The flames are sulking after their bath. Deep inside, the red stone still glows. You'd want something long and iron to fish it out.", "The flames have died down. Deep inside, something red still glows — you'll need something long to reach it."));
          await G.n(T("Mabel's oven is roaring like a dragon with indigestion. Deep inside the flames, something glows a fierce, jewel-bright red.", "Mabel's oven is roaring fiercely. Deep within the flames, something glows a jewel-bright red."));
        },
        use: async (G) => {
          if (G.f('emberTaken')) return G.n(T("You warm your hands at the oven. Mabel gives you a look that says 'no free warmth'.", "It's nice and warm."));
          if (G.f('ovenDoused')) return G.n(T("Even after its bath, that stone is far too hot to touch. Something long and iron would do.", "It's still far too hot to touch. You'll need something long and iron."));
          return G.death(T("You reach bravely into the roaring oven. You have been baked at a temperature generally reserved for crusty loaves. Delicious, but deceased.", "You reach into the roaring oven — OUCH! That was a very bad idea. Let's pretend it never happened."));
        },
        items: {
          water: async (G) => {
            if (G.f('ovenDoused')) return G.n("It's already doused.");
            G.take('water'); G.set('ovenDoused'); await G.anim('hero', 'reach', 1.0); G.fx('steam', 'oven'); G.sfx('whoosh'); G.refresh();
            await G.n(T("You hurl the water into the oven. A great hiss of steam! For a moment, the flames lie down like scolded dogs.", "You throw the water into the oven. With a great hiss of steam, the flames die down."));
            await G.say('mabel', "Oh! Oh, you've calmed it! I can see the bottom of my oven for the first time since Monday!");
          },
          tongs: async (G) => {
            if (G.f('emberTaken')) return G.n("There's nothing left in there but heat and happiness.");
            if (!G.f('ovenDoused')) { G.sfx('error'); return G.n(T("You poke the tongs into the inferno. They glow cherry-red in seconds and you drop them, saying a word Royal Tinkers aren't supposed to know. (You pick them back up once they've cooled.)", "The flames are far too fierce — the tongs glow red-hot and you pull them back. You'll need to calm the fire first.")); }
            await G.anim('hero', 'reach', 1.2); G.set('emberTaken'); G.give('ember'); G.sfx('magic'); G.fx('sparkle', 'oven'); G.refresh();
            await G.n(T("You fish out the glowing thing with the tongs. It's the Ember Stone, pulsing like a small, cross heart.", "With the long tongs, you lift out the glowing thing: the Ember Stone!"));
            await G.say('mabel', "THAT'S what's been cooking my loaves? The Crown's own Ember Stone, down my chimney! Here, love — the first loaf I've baked all week that isn't charcoal. Take it, with my thanks.");
            G.give('bread'); G.tutorial('combine');
          },
          crown: T("The Crown wants the stone, not the oven.", "You'd need to get the stone out first."),
          wrench: T("You could tighten the oven door hinges, but that won't help with the dragon living inside.", "The wrench won't help with this."),
        },
      },
      fountain: { name: 'Fountain', look: T("The Wrenfold fountain. The bottom is carpeted with wishing pennies — most of them, by the look of it, wishing for better weather.", "The village fountain. Its bottom glitters with wishing pennies."), use: T("You trail your fingers in the water. Refreshing, and only slightly full of pennies.", "The water is cool and clear."), items: { water: T("You'd just be moving water from one place to another. Very tinker-ish, but pointless.", "The bucket's already full.") } },
      tavern: { name: 'The Hopeful Hare', look: T("The Hopeful Hare, Wrenfold's tavern. A sign on the door says CLOSED FOR MIDSUMMER CHOIR PRACTICE. From inside comes singing, if you're being generous.", "The Hopeful Hare tavern. It's closed for Midsummer choir practice."), use: T("The door is locked. You knock. Nobody hears you over the sound of their own enthusiasm.", "The tavern door is locked. Everyone inside is singing.") },
      notices: { name: 'Notice Board', look: T("WANTED: Whoever keeps stealing everybody's shiny things. Reward: a firm talking-to. — Sir B.  /  LOST: one silver thimble. Small. Shiny. Loved. — M. Crust  /  LOST: brass bell, duck-sized. — Hobb", "Notices: WANTED — the thief of shiny things. LOST — Mabel's silver thimble. LOST — a duck-sized brass bell, Hobb.") },
      stall: { name: 'Fruit Stall', look: T("A fruit stall, unattended. The apples are polished to a high shine, which seems unwise this week.", "A fruit stall with shiny, polished apples."), use: T("You resist the urge to take an apple. Royal tinkers pay for things. Eventually.", "The stall-keeper isn't here. You leave the apples be.") },
      chickens: { name: 'Chickens', look: T("Chickens, wandering about with the confidence of creatures who have never read a recipe book.", "A few chickens peck about the cobbles."), talk: T("'Bawk,' you say. The chickens exchange glances. You've said something terribly rude in Chicken.", "The chickens ignore you politely.") },
      brannoch: { name: 'Sir Brannoch', npc: 'brannoch', look: T("Sir Brannoch, Captain of the Guard: forty years of service, a moustache you could hang laundry on, and an unshakeable belief that a locked gate solves everything.", "Sir Brannoch, Captain of the Guard, standing very straight beside the East Gate."), items: { pass: async (G) => dlgBrannochPass(G), feather: async (G) => G.dialog('brannoch'), bread: T("'I'm on duty,' says Sir Brannoch, eyeing the bread. 'Crumbs are a security risk.'", "'Not while I'm on duty, thank you.'") } },
    },
    exits: {
      castle: { name: 'Up to the Castle', to: 'courtyard', entry: 'gate' },
      mill: { name: "To Hobb's Mill", to: 'mill', entry: 'square' },
      east: {
        name: 'The East Gate', to: 'woods', entry: 'west',
        can: async (G) => {
          if (G.f('gateOpen')) return true;
          G.set('brannochMet');
          await G.say('brannoch', "Halt! Nobody leaves Wrenfold while a thief is at large! Queen's orders. Well — my orders. On the Queen's behalf. Probably.");
          return false;
        },
      },
    },
  },

  mill: {
    name: "Hobb's Mill", chapter: 1,
    enter: async (G) => { if (!G.once('millIntro')) return; await G.n(T("Hobb's Mill, where the river does all the work and Hobb takes all the credit. Today the great wheel is still, and the river is complaining about it.", "Hobb's Mill, beside the river. The great water wheel stands still.")); },
    hot: {
      hobb: { name: 'Miller Hobb', npc: 'hobb', look: T("Miller Hobb: as tall as a door, and about as chatty.", "Miller Hobb, the tall, quiet miller."), items: { bell: async (G) => dlgHobbBell(G) } },
      wheel: {
        name: 'Water Wheel',
        look: (s) => (s.f.wheelFixed ? T("The wheel turns happily, slapping the river like a friendly giant.", "The water wheel turns steadily.") : T("The great water wheel is stuck fast. Something brassy glints, wedged in the gears of the axle.", "The water wheel is jammed. Something brassy glints in the gears.")),
        use: (s) => (s.f.wheelFixed ? T("It's turning nicely. Don't put your hand in it; that's the whole safety lecture.", "It's working nicely now.") : T("You heave on the paddles. The wheel doesn't budge. Neither, thankfully, does your back.", "You push the wheel. It won't budge — something in the gears is jamming it.")),
        items: {
          wrench: async (G) => {
            if (G.f('wheelFixed')) return G.n("It's already turning. Fixing it again would just be bragging.");
            await G.anim('hero', 'reach', 1.4); G.sfx('thud'); G.set('wheelFixed'); G.set('keyInDuck'); G.refresh(); G.fx('keyfly', 'wheel');
            await G.n(T("You climb onto the axle housing and give the gearing a sharp, tinkerly twist. CLUNK. The wheel lurches, the river cheers, and something small and shiny pings out of the works—", "You give the gearing a firm twist with your wrench. CLUNK! The wheel lurches into motion, and something small and shiny flies out—"));
            await G.n(T("—straight into the duck pond, where a duck snaps it up and paddles off, looking extremely pleased with itself.", "—and lands in the duck pond, where a duck snaps it up!"));
            await G.say('hobb', "Huh. Wheel's going.");
            await G.say('hobb', "...Thanks. Here. Rope. Every adventurer needs rope. It's in the rules.");
            G.give('rope');
          },
        },
      },
      duck: {
        name: (s) => (s.f.keyInDuck && !s.f.keyTaken ? 'Duck with a Key' : 'Ducks'),
        look: (s) => (s.f.keyInDuck && !s.f.keyTaken ? T("A duck with a tiny brass key in its bill. It has the air of a duck who has finally been given the respect it deserves.", "A duck holding a tiny brass key in its bill.") : T("Hobb's ducks. They seem to like shiny things nearly as much as magpies do.", "Hobb's ducks paddle about the pond.")),
        use: (s) => (s.f.keyInDuck && !s.f.keyTaken ? T("You reach for the key. The duck reaches for your fingers. The duck wins.", "The duck paddles out of reach with the key.") : T("The ducks decline to be petted. They're very busy being ducks.", "The ducks paddle away.")),
        talk: T("'Quack?' you try. The ducks have heard better.", "The ducks quack back at you cheerfully."),
        items: {
          bread: async (G) => {
            if (!G.f('keyInDuck') || G.f('keyTaken')) return G.n(T("The ducks gobble the crumbs with great enthusiasm and no gratitude whatsoever.", "The ducks happily gobble up the crumbs."));
            await G.anim('hero', 'reach'); G.fx('crumbs', 'duck');
            await G.n(T("You toss a few crumbs. The duck weighs its options — key, or bread — and chooses bread, as all sensible ducks do. The key plinks onto the bank.", "You toss a few crumbs. The duck drops the key to gobble them up!"));
            G.set('keyTaken'); G.give('key'); G.sfx('check'); G.tutorial('combine');
          },
        },
      },
      pond: { name: 'Duck Pond', look: T("A duck pond, populated by ducks and the occasional opinionated frog.", "A peaceful duck pond, fringed with reeds."), use: T("You dabble your fingers. A frog gives you a look.", "The water is cool.") },
      door: { name: 'Mill Door', look: T("Hobb's front door. Hobb isn't the sort of person who has visitors; he's the sort who has 'people who are leaving'.", "Hobb's front door, firmly shut."), use: T("Locked. Hobb's flour is guarded better than the Crown was.", "It's locked.") },
      sacks: { name: 'Flour Sacks', look: T("Sacks of flour stacked high. Hobb's flour is famous in three villages and suspected in a fourth.", "Sacks of Hobb's famous flour."), use: T("You poke a sack. A cloud of flour puffs into your face. You now look like a very surprised ghost.", "You pat a sack. A little puff of flour escapes.") },
      willow: { name: 'Willow', look: T("A weeping willow, trailing its hair in the river like it's had a long week.", "A graceful weeping willow trails its branches in the river.") },
    },
    exits: { square: { name: 'Back to the Square', to: 'square', entry: 'mill' } },
  },

  // ============================================================ CHAPTER 2
  woods: {
    name: 'The Crossroads', chapter: 2,
    enter: async (G) => {
      if (!G.once('woodsIntro')) return;
      await G.chapter(2);
      await G.n(T("Beyond the East Gate, the Whispering Woods close in like a great green secret. Somewhere behind you, Sir Brannoch is pretending not to watch.", "Beyond the East Gate, the Whispering Woods close in, green and secret."));
      G.unlockMap();
    },
    hot: {
      fennick: { name: 'Fennick', npc: 'fennick', look: T("A fox in a waistcoat, lounging against a peddler's cart. His smile has more teeth than a business plan should.", "Fennick, a fox peddler in a smart waistcoat, leans against his cart."), items: { bread: async (G) => dlgFennickBread(G), feather: T("'A magpie feather? Bad luck, that. I'll give you nothing for it, which is generous.'", "'Ah, a magpie feather. Not worth much, I'm afraid.'"), thimble: T("'Very nice. Very shiny. Very much somebody else's, by the engraving. Return it, friend — honest trade's good trade.'", "'That belongs to someone, friend. Best return it.'") } },
      cart: { name: "Fennick's Cart", look: T("Fennick's cart, piled with Genuine Wonders: a bottle of 'dragon's tears' (water), a 'giant's toenail' (a shell), and a 'wishing mirror' (a mirror).", "A cart piled with curiosities: bottles, shells, and a little gilded mirror."), use: T("Fennick swats your hand away. 'Browsing is free. Touching is a silver penny.'", "'Ah ah! Ask first, friend.'") },
      signpost: { name: 'Signpost', look: T("The signpost reads: WEST — Wrenfold. NORTH — Thistle's Hollow (BEWARE OF GRANNY). EAST — The Old Oak, and beyond it, the Sea Cliffs. Someone has scratched underneath: 'the goat bites'.", "WEST: Wrenfold. NORTH: Thistle's Hollow. EAST: The Old Oak and the Sea Cliffs.") },
      mushrooms: {
        name: 'Fairy Ring', look: T("A fairy ring of glowing toadstools. They smell of cinnamon and bad decisions.", "A fairy ring of softly glowing toadstools."),
        use: async (G) => { if (G.has('glowcap') || G.d('goat')) return G.n(T("One glowcap is plenty. Two would be a lifestyle.", "You already have one.")); await G.anim('hero', 'pickup'); G.give('glowcap'); await G.n(T("You pick a glowcap. It glows a little brighter, flattered.", "You pick a glowing toadstool.")); },
      },
      thimble: {
        name: 'Something Shiny', vis: (s) => !s.f.thimbleTaken,
        look: T("Something small and silver glints in the grass. The magpie's been careless.", "Something small and silver glints in the grass."),
        use: async (G) => { G.set('thimbleTaken'); await G.anim('hero', 'pickup'); G.give('thimble'); await G.n(T("A silver thimble, engraved 'M.C.' Mabel's notice said she'd lost one. What a coincidence. (It is not a coincidence.)", "A silver thimble engraved 'M.C.' — Mabel's lost thimble!")); },
      },
      stream: { name: 'Stream', look: T("A chattering stream. It's whispering too. Everything here is. It's like being at a party where you don't know anyone.", "A clear stream chatters over the stones."), use: T("You splash your face. Bracing! You feel 12% more heroic.", "The water is cold and refreshing.") },
      trees: { name: 'Old Trees', look: T("Old trees, leaning together as if gossiping about you. Rude.", "Tall old trees lean together overhead.") },
    },
    exits: {
      west: { name: 'Back to Wrenfold', to: 'square', entry: 'east' },
      north: { name: "To Thistle's Hollow", to: 'glade', entry: 'south' },
      east: { name: 'To the Old Oak', to: 'oak', entry: 'west' },
    },
  },

  glade: {
    name: "Thistle's Hollow", chapter: 2,
    enter: async (G) => { if (!G.once('gladeIntro')) return; await G.n(T("Thistle's Hollow: a crooked cottage, a bubbling cauldron, and a goat who is already eyeing your sleeve with intent.", "Thistle's Hollow: a crooked cottage, a bubbling cauldron, and a curious goat.")); },
    hot: {
      granny: { name: 'Granny Thistle', npc: 'granny', look: T("Granny Thistle, hedge-witch of the woods: a hat like a collapsed chimney and a smile like warm soup.", "Granny Thistle, the kindly hedge-witch, stirring her cauldron."), items: { lavender: async (G) => dlgGrannyLavender(G), glowcap: T("'A glowcap! Give it to Clementine, dearie — she adores them. Don't eat it yourself, unless you fancy a trip to the moon.'", "'Oh, Clementine loves those! Give it to her.'") } },
      cauldron: { name: 'Cauldron', look: T("A bubbling cauldron of something green that smells strongly of peppermint and faintly of feet.", "A bubbling cauldron of something green that smells of peppermint."), use: async (G) => G.say('granny', "Hands out of the soup, dearie! Or potion. Depends who's asking."), item: async (G) => G.say('granny', "Don't you dare put that in my soup!") },
      cottage: { name: 'Crooked Cottage', look: T("Granny's cottage leans in three directions at once, as if it can't decide where to go.", "Granny Thistle's crooked, cosy cottage."), use: T("Granny watches you with the look of a woman who has turned people into newts for less. You leave the door alone.", "It's polite to wait to be invited in.") },
      goat: {
        name: 'Clementine the Goat', look: T("Clementine the goat. She has eaten a hat, two umbrellas, and the corner of the signpost. She is eyeing your inventory.", "Clementine, Granny's goat, nibbling at everything in reach."),
        use: T("Clementine headbutts you affectionately. Your ribs file a complaint.", "Clementine nuzzles you affectionately."),
        talk: T("'Hello, Clementine.' She chews thoughtfully, as if she's deciding which part of you to try first.", "Clementine bleats happily."),
        items: { glowcap: async (G) => { G.take('glowcap'); await G.anim('hero', 'reach'); G.fx('sparkle', 'goat'); await G.n(T("Clementine wolfs down the glowcap, then glows gently for the rest of the day. She looks thrilled. She looks like a lamp with opinions.", "Clementine gobbles the glowcap happily and starts to glow softly.")); G.set('goatGlow'); G.refresh(); await G.deed('goat'); } },
        item: async (G, id) => G.n(T(`Clementine tries to eat the ${G.itemName(id)}. You snatch it back. She looks betrayed.`, `Clementine nibbles the ${G.itemName(id)}. You gently take it back.`)),
      },
      garden: { name: 'Herb Garden', look: (s) => (s.f.grannyHappy ? T("Granny's garden: nettles, feverfew, sleepwort, and one proudly replanted sprig of lavender.", "Granny's herb garden, lavender and all.") : T("Granny's garden: nettles, feverfew, sleepwort... and a sad gap where the lavender should be.", "Granny's herb garden. There's an empty patch where something is missing — the label says LAVENDER.")) },
      watch: {
        name: 'Pocket-Watch', vis: (s) => !s.f.watchTaken,
        look: T("A silver pocket-watch dangles from a giant mushroom. It isn't ticking. The magpie must have dropped it here.", "A silver pocket-watch hangs from a giant mushroom."),
        use: async (G) => { G.set('watchTaken'); await G.anim('hero', 'reach'); G.give('watch'); await G.n(T("You unhook the watch. Engraved on the back: 'To Marlow, for keeping the light.' It has stopped at ten past midnight.", "You take the watch. It's engraved: 'To Marlow, for keeping the light.' It has stopped.")); },
      },
      mushroom: { name: 'Giant Mushroom', look: T("A mushroom the size of a garden shed. Granny uses it as an umbrella. And a table. And, once, a boat.", "An enormous spotted mushroom.") },
    },
    exits: { south: { name: 'Back to the Crossroads', to: 'woods', entry: 'north' } },
  },

  oak: {
    name: 'The Old Oak', chapter: 2,
    enter: async (G) => { if (!G.once('oakIntro')) return; await G.n(T("The Old Oak fills the clearing like a sleeping giant who has forgotten how to sleep. Brambles choke the path east. High in his trunk, something glows a soft, steady green.", "The Old Oak fills the clearing. Brambles block the path east, and high in the trunk, something glows green.")); },
    hot: {
      grumbleroot: {
        name: 'Grumbleroot', npc: 'oak',
        look: (s) => (s.f.oakAsleep && !s.f.bloomTaken ? T("Grumbleroot is fast asleep, snoring like a landslide in slippers. His lowest branch droops almost to the ground.", "Grumbleroot is fast asleep. His lowest branch has drooped low.") : T("Grumbleroot, the oldest oak in the Whispering Woods. His bark is wrinkled into a face: two knotty eyes, a mossy beard and a mouth like a split log.", "Grumbleroot, the ancient oak. His bark forms a wise, wrinkled face.")),
        talk: async (G) => { if (G.f('oakAsleep') && !G.f('bloomTaken')) return G.n(T("You clear your throat. Grumbleroot snores like a landslide. Better not wake him.", "Grumbleroot is sleeping peacefully. Best not to wake him.")); return G.dialog('oak'); },
        items: {
          musicbox: async (G) => {
            if (!G.f('boxFixed')) return G.n(T("You hold up the silent music box. It remains silent, which is its whole problem. It needs its winding key.", "The music box can't play without its winding key."));
            if (G.f('bloomTaken')) return G.n("Grumbleroot doesn't need a lullaby now. He's sleeping just fine on his own.");
            if (G.f('oakAsleep')) return G.n("He's already asleep. Any more lullaby and he'll hibernate.");
            await G.anim('hero', 'reach'); G.fx('music', 'grumbleroot'); G.sfx('chime');
            await G.n(T("You wind the music box and set it on a root. The old Wrenfold lullaby drifts up through the leaves.", "You wind the music box. The gentle Wrenfold lullaby drifts up through the leaves."));
            await G.say('oak', "What a lovely... little... tune...");
            await G.n(T("Grumbleroot yawns a yawn that rustles the whole forest, and falls fast asleep. His lowest branch sags until it nearly touches the ground.", "Grumbleroot yawns an enormous yawn and falls fast asleep. His lowest branch sags down low."));
            G.set('oakAsleep'); G.refresh();
          },
          rope: async (G) => takeBloomWithRope(G),
          crown: T("'Ooh, shiny! No. Mine's greener.'", "Grumbleroot isn't interested in trading for the Crown."),
          tongs: T("You consider poking an ancient forest spirit with fire tongs, and then, wisely, you don't.", "Poking him wouldn't be very polite."),
          glowcap: T("'I don't eat, small one. I photosynthesise. Majestically.'", "'Trees don't eat mushrooms, small one.'"),
        },
      },
      knothole: {
        name: 'Glowing Knothole', vis: (s) => !s.f.bloomTaken,
        look: T("High in the trunk, the Bloom Stone glows in a knothole, well out of reach.", "High in the trunk, the Bloom Stone glows in a knothole, far out of reach."),
        use: (s) => (s.f.oakAsleep ? T("Too high to reach — but that drooping branch would take a rope.", "It's too high, but you could climb the drooping branch with a rope.") : T("Too high. You're a tinker, not a squirrel.", "It's much too high to reach.")),
        items: { rope: async (G) => takeBloomWithRope(G), tongs: T("Even fully extended, the tongs reach about a seventh of the way.", "The tongs aren't nearly long enough.") },
      },
      brambles: {
        name: 'Brambles', vis: (s) => !s.f.bramblesGone,
        look: T("A wall of brambles as thick as a castle gate and twice as rude. They're growing even as you watch.", "A thick wall of brambles blocks the path east. They seem to be growing."),
        use: T("You prod the brambles. They prod back. Harder.", "Ouch! The thorns are sharp."),
        items: { tongs: T("You pull a bramble aside with the tongs. Two more sprout in its place. You'll have to stop whatever is making them grow.", "For every bramble you pull aside, two more grow. Something must be making them grow."), wrench: T("You can't tighten a bramble. You've tried. Today.", "The wrench won't help here.") },
      },
      bell: {
        name: (s) => (s.f.bramblesGone ? 'Brass Bell' : 'Something Brassy'), vis: (s) => !s.f.bellTaken,
        look: (s) => (s.f.bramblesGone ? T("A little brass bell lies where the brambles used to be.", "A little brass bell lies on the path.") : T("A little brass bell hangs deep in the brambles, out of reach of everything but your curiosity.", "A little brass bell is caught deep in the brambles.")),
        use: async (G) => { if (!G.f('bramblesGone')) return G.n(T("You reach for the bell. The brambles reach for you.", "The brambles are too thick to reach it.")); G.set('bellTaken'); await G.anim('hero', 'pickup'); G.give('bell'); await G.n(T("A brass bell, engraved GERALD. Hobb's notice mentioned a lost bell.", "A brass bell engraved GERALD — the one Hobb lost!")); },
      },
      roots: { name: 'Roots', look: T("Roots as thick as barrels, twisting through the earth as if he's holding the whole forest together. He probably is.", "Great twisting roots, thick as barrels.") },
    },
    exits: {
      west: { name: 'Back to the Crossroads', to: 'woods', entry: 'east' },
      east: { name: 'To the Sea Cliffs', to: 'cliffs', entry: 'west', can: async (G) => { if (G.f('bramblesGone')) return true; await G.n(T("The brambles are having none of it.", "The brambles block the way.")); return false; } },
    },
  },

  // ============================================================ CHAPTER 3
  cliffs: {
    name: 'Lighthouse Point', chapter: 3,
    enter: async (G) => {
      if (!G.once('cliffsIntro')) return;
      await G.chapter(3);
      await G.n(T("The woods end all at once, as if they'd run out of nerve. Below you, the sea; above you, gulls; ahead, a lighthouse with no light in it. Out on the water, a wall of fog sits as still as a held breath.", "The woods open onto high sea cliffs. A dark lighthouse stands above the waves, and a wall of fog lies still upon the sea."));
    },
    hot: {
      marlow: { name: 'Keeper Marlow', npc: 'marlow', look: T("Keeper Marlow: a beard like sea-foam and the faraway eyes of a man who argues with gulls and usually wins.", "Keeper Marlow, the old lighthouse keeper, with a beard like sea-foam."), items: { watch: async (G) => dlgMarlowWatch(G) } },
      lighthouse: {
        name: 'Lighthouse',
        look: (s) => (s.f.lampLit ? T("The lighthouse blazes, its golden beam sweeping the sea like a great bright broom.", "The lighthouse shines brightly, its beam sweeping across the sea.") : s.f.lampFixed ? T("The lamp's clockwork is mended, but the wick is cold. It needs a flame that fog can't drown.", "The turning gear is fixed, but the lamp needs a flame.") : T("The lighthouse: tall, white, red-striped, and dark. Way up top, the great lamp sits cold.", "The lighthouse stands tall and dark. Its great lamp has gone out.")),
        use: (s) => (s.f.lampLit ? T("You climb up to admire the light. It's very bright. You climb down, slightly blinded and very proud.", "The lamp is shining beautifully.") : T("You climb all 143 steps to the lamp room. The big brass clockwork that turns the lens is seized, and the wick is stone cold. You climb back down, which is the worst part.", "You climb to the lamp room. The turning clockwork is jammed and the wick is cold.")),
        items: {
          wrench: async (G) => {
            if (G.f('lampFixed')) return G.n("The clockwork is already purring.");
            G.fx('climb'); await G.wait(0.6); G.sfx('click'); G.set('lampFixed'); G.refresh();
            await G.n(T("You climb the 143 steps, wrench in hand. The clockwork has a magpie-shaped dent and a jammed gear. A twist, a tap, a muttered tinker's oath — and the great lens turns smooth as butter.", "You climb up and work on the clockwork. A twist, a tap — and the great lens turns smoothly again."));
            await G.say('marlow', "You've mended the turning gear! But the fog's soaked my oil and drowned my matches. Nothing ordinary will light that wick now.");
          },
          crown: async (G) => lightLamp(G),
          ember: async (G) => lightLamp(G),
          toffee: async (G) => {
            if (!G.f('lampLit')) return G.n(T("The lamp is cold. You could warm the toffee on it about as well as on a fish.", "The lamp isn't lit — there's no heat to warm anything."));
            if (G.f('toffeeWarm')) return G.n("It's already warm and gooey.");
            G.fx('climb'); await G.wait(0.4); G.set('toffeeWarm');
            await G.n(T("You hold the jar near the lamp's flame. The toffee slumps into a glossy, golden, extremely boat-friendly goo.", "You warm the jar by the lamp. The toffee softens into a sticky golden goo."));
          },
        },
      },
      telescope: { name: 'Telescope', look: (s) => (s.f.lampLit ? T("Through the telescope: Magpie Isle. On top of the crooked tower, a huge nest glitters — and on the highest spire, a big black-and-white bird is admiring itself in a spoon.", "Through the telescope you see Magpie Isle, its tower topped by a glittering nest.") : T("Through the telescope you see: fog. More fog. A gull. A gull looking back at you through the fog, rudely.", "Through the telescope: only fog, and a gull.")), use: (s) => (s.f.lampLit ? T("You look again. The magpie seems to be blowing kisses at the spoon.", "The isle is clearly visible now.") : T("You twiddle the focus. The fog comes into crisp, detailed focus. It's still fog.", "Nothing but fog.")) },
      fog: { name: 'Fog Bank', vis: (s) => !s.f.lampLit, look: T("A great bank of fog sits on the sea, thick as porridge and about as exciting. Marlow says something's hidden in it.", "A great bank of fog sits on the sea, hiding whatever lies beyond.") },
      cottage: { name: "Keeper's Cottage", look: T("Marlow's cottage, with a garden of sea-pinks and a doormat that says GO AWAY in a friendly font.", "Marlow's little cottage, with sea-pinks in the garden.") },
      edge: { name: 'Cliff Edge', look: T("The cliff edge. A long, long way down, the sea is chewing on the rocks.", "The edge of the cliff. A long way down, waves crash on the rocks."), use: async (G) => G.death(T("You lean out over the edge for a better look. A better look becomes a much closer look, very quickly. The gulls award you a 6 out of 10.", "Whoa! You wobble, windmill your arms, and — let's try that again from a safer distance.")) },
      gulls: { name: 'Gulls', look: T("Gulls, screaming about something. Gulls always are.", "Seagulls wheel and cry overhead."), talk: T("You shout 'Hello!' at the gulls. They shout 'MINE!' back. You were never going to win that.", "The gulls cry back at you.") },
    },
    exits: {
      west: { name: 'Back to the Old Oak', to: 'oak', entry: 'east' },
      cove: { name: 'Down to the Cove', to: 'cove', entry: 'path' },
    },
  },

  cove: {
    name: "Smuggler's Cove", chapter: 3,
    enter: async (G) => { if (!G.once('coveIntro')) return; await G.n(T("A little crescent of sand hidden under the cliffs: rock pools, driftwood, a sea cave breathing in and out — and Marlow's rowboat, lying on its side like a sulking dog.", "A hidden cove under the cliffs, with rock pools, driftwood, and Marlow's old rowboat on the sand.")); },
    hot: {
      boat: {
        name: 'Rowboat',
        look: (s) => (s.f.boatPatched ? T("The Saucy Gull, patched with toffee and ready for adventure. Or at least for floating.", "Marlow's rowboat, patched and ready to sail.") : T("Marlow's rowboat, the Saucy Gull. A neat round hole in her bottom lets in daylight, and would let in a great deal more sea.", "Marlow's rowboat. There's a round hole in the bottom.")),
        use: async (G) => {
          if (!G.f('boatPatched')) return G.n(T("You'd sink faster than a stone in a stocking. That hole needs patching.", "With that hole, she'd sink. You need to patch it first."));
          if (!G.f('lampLit')) return G.n(T("Row into that fog? Marlow's right — you'd end up in next Tuesday. Light the lighthouse first so you can see where you're going.", "You can't see where to row through the fog. The lighthouse needs to be lit first."));
          G.fx('row'); G.sfx('whoosh');
          await G.n(T("You push the Saucy Gull into the surf, hop in, and row for Magpie Isle, steering by the lighthouse beam.", "You push off and row toward Magpie Isle, guided by the lighthouse beam."));
          await G.goto('isle', 'boat');
        },
        items: {
          toffee: async (G) => {
            if (G.f('boatPatched')) return G.n("She's already patched.");
            if (!G.f('toffeeWarm')) return G.n(T("You press the rock-hard toffee against the hole. It's like trying to patch a boat with a pebble. Granny said to warm it first.", "The toffee is rock-hard. Granny said to warm it first."));
            G.take('toffee'); await G.anim('hero', 'pickup', 1.2); G.set('boatPatched'); G.refresh(); G.sfx('check');
            await G.n(T("You smear the warm toffee over the hole and smooth it with your thumb. It sets in seconds, hard as glass and smelling of Midsummer fairs.", "You spread the warm toffee over the hole. It sets hard and watertight in moments."));
          },
          rope: T("You could tie the boat to something, but it's not going anywhere with that hole in it.", "The boat needs patching, not tying."),
        },
      },
      crab: {
        name: (s) => (s.f.hairpinTaken ? 'Crab' : 'Crab with a Treasure'),
        look: (s) => (s.f.hairpinTaken ? T("The crab, now treasureless, is pretending it never wanted the hairpin anyway.", "A crab sits on the rock, sulking.") : T("A crab on a rock, guarding something pearly. It snaps its claws at you in a way that suggests it has a lawyer.", "A crab on a rock, clutching something pearly in its claw.")),
        use: T("You reach for the pearly thing. The crab reaches for your nose. Let's call it a draw.", "The crab snaps at your fingers. You need something to reach with."),
        talk: T("'Excuse me, I think that's the Queen's.' The crab clicks something unrepeatable.", "The crab clicks its claws at you."),
        items: {
          tongs: async (G) => { if (G.f('hairpinTaken')) return G.n("The crab has nothing left to give but attitude."); await G.anim('hero', 'reach'); G.set('hairpinTaken'); G.give('hairpin'); G.refresh(); await G.n(T("With the long fire tongs, you politely relieve the crab of its treasure: a pearl hairpin! The crab clicks furiously, then goes back to being a crab.", "Using the long tongs, you gently take the treasure from the crab: a pearl hairpin!")); },
          bread: T("The crab isn't interested. Crabs don't do carbs.", "The crab ignores the bread."),
        },
      },
      tidepool: { name: 'Rock Pool', look: T("A rock pool: tiny fish, a sulking starfish, and an anemone waving at you like an old friend.", "A rock pool full of tiny fish and a starfish."), use: T("You poke the anemone. It closes up, offended. You apologise to the anemone.", "You watch the tiny fish dart about.") },
      cave: { name: 'Sea Cave', look: T("A sea cave, breathing in and out with the waves. It smells of old fish and older secrets.", "A dark sea cave echoing with the waves."), use: T("You step into the cave... and right back out again. Some secrets are best kept by caves.", "It's very dark in there. Better not.") },
      driftwood: { name: 'Driftwood', look: T("Driftwood, bleached silver by the sea. One piece looks like a duck. You decide not to tell Hobb.", "Silvery driftwood, smoothed by the sea.") },
      sea: { name: 'The Sea', look: (s) => (s.f.lampLit ? T("The sea, sparkling and restless. Out past the breakers, Magpie Isle waits.", "The sparkling sea. Magpie Isle lies out past the waves.") : T("The sea, going about its business. The fog sits on the horizon like a lid on a pot.", "The sea, with a thick fog lying on the horizon.")) },
    },
    exits: { path: { name: 'Up to the Cliffs', to: 'cliffs', entry: 'cove' } },
  },

  isle: {
    name: 'Magpie Isle', chapter: 3,
    enter: async (G) => {
      if (!G.once('isleIntro')) return;
      await G.n(T("You row through the last wisps of fog to Magpie Isle. The tower is built of stone, stolen spoons and spite. At the top, in a nest the size of a cottage, sits a hoard that glitters like a dragon's dream — and above it, on a broken spire, perches the thief himself.", "You reach Magpie Isle. Atop the crooked tower, a huge glittering nest holds a hoard of stolen treasures — and above it perches the thief himself."));
      await G.say('corvin', "Well, well, WELL. A visitor! Nobody visits Corvin. They just write angry notices about their spoons.");
    },
    hot: {
      corvin: {
        name: 'Corvin, the Magpie King', npc: 'corvin',
        look: (s) => (s.f.corvinDistracted ? T("Corvin is gazing into the mirror, utterly lost in his own reflection. 'Hello, gorgeous,' he keeps saying. He means himself.", "Corvin is completely absorbed in admiring his reflection.") : T("Corvin, the Magpie King: a magpie as tall as a man, with a crown of bent tinsel and feathers he keeps checking in a spoon. In his talons glows the Tide Stone, blue as a summer wave.", "Corvin, the Magpie King, a man-sized magpie wearing a tinsel crown. He clutches the glowing blue Tide Stone.")),
        items: {
          mirror: async (G) => {
            if (G.f('corvinDistracted')) return G.n("He's already got the mirror. He's named his reflection 'Gorgeous'.");
            G.take('mirror'); await G.anim('hero', 'reach');
            await G.n(T("You hold up Fennick's mirror. Corvin freezes mid-gloat.", "You hold up Fennick's mirror. Corvin goes very still."));
            await G.say('corvin', "Who... who is THAT? That dashing, glossy, magnificent creature?");
            G.set('corvinDistracted'); G.fx('corvinDown'); G.refresh(); G.sfx('whoosh');
            await G.n(T("He flutters down from his spire, drops the Tide Stone onto the hoard without even noticing, snatches the mirror and presses his beak to the glass.", "He flutters down, drops the Tide Stone onto his hoard without noticing, and takes the mirror to gaze at himself."));
            await G.say('corvin', "Hello, gorgeous. Have we met? We should have met.");
          },
          feather: T("'My feather! I wondered where that went. Keep it, I've got thousands. Each one more beautiful than the last.'", "'Oh, one of mine! Keep it. I have plenty.'"),
          bread: T("'Bread? BREAD? Do I look like a pigeon?'", "'I'm not a pigeon, thank you.'"),
          crown: T("'The Crown! Give it h— no. NO. Keep it away from me. I'll get ideas.'", "Corvin eyes the Crown greedily. Better keep it safe."),
          glowcap: T("'Is it shiny? It's... GLOWY. Glowy is not shiny. Begone.'", "'Glowy isn't the same as shiny.'"),
          wrench: T("'Ooh, chrome. No. Steel. Dull. Next.'", "Corvin sniffs. 'Not shiny enough.'"),
        },
      },
      hoard: {
        name: "Corvin's Hoard",
        look: (s) => (s.f.tideTaken ? T("Spoons, bells, buttons, forty-three thimbles, the castle well's brass crank handle, and what may be a teapot. Minus one Tide Stone.", "A glittering pile of stolen treasures.") : s.f.corvinDistracted ? T("The hoard glitters — and right on top, where Corvin dropped it, the Tide Stone glows blue.", "Right on top of the hoard, the Tide Stone glows blue!") : T("A glittering hoard: spoons, bells, buttons, forty-three thimbles, the castle well's brass crank handle, and what may be a teapot.", "A glittering hoard: spoons, bells, buttons, and even the castle well's crank handle.")),
        use: async (G) => {
          if (G.f('tideTaken')) return G.n(T("You leave the rest of the hoard for Corvin to return. He'll need something to do with his wings.", "The rest can be returned to its owners later."));
          if (!G.f('corvinDistracted')) { await G.say('corvin', "MINE! Paws OFF the hoard!"); return; }
          await G.anim('hero', 'pickup'); G.set('tideTaken'); G.give('tide'); G.refresh(); G.sfx('magic'); G.fx('sparkle', 'hoard');
          await G.n(T("You slip the Tide Stone off the hoard while Corvin blows kisses at his reflection.", "Quietly, you take the Tide Stone while Corvin admires himself."));
        },
      },
      spire: { name: 'Spire', look: T("Corvin's perch: the highest point for miles, where he can see everything shiny and everything shiny can see him.", "A broken spire, Corvin's favourite perch.") },
      edge: { name: 'Edge of the Nest', look: T("The edge of the nest. Far below, the sea foams over the rocks.", "The edge of the nest. It's a long way down."), use: async (G) => G.death(T("You step out for a dramatic look at the view. The view, it turns out, is mostly down. Corvin laughs so hard he drops a spoon.", "Careful! You lean too far and — whoops. Let's step back from the edge.")) },
    },
    exits: { boat: { name: 'Row Back to the Cove', to: 'cove', entry: 'boat', can: async (G) => { if (G.f('tideSet')) return false; return true; } } },
  },
};

// ------------------------------------------------------------------ shared puzzle scripts
async function takeBloomWithRope(G) {
  if (G.f('bloomTaken')) return G.n("You've already got the Bloom Stone.");
  if (!G.f('oakAsleep')) {
    G.sfx('error');
    await G.n(T("You toss the rope over a branch. Grumbleroot flicks it straight back at you.", "You toss the rope up, but Grumbleroot flicks it away."));
    return G.say('oak', "NO climbing! I am NOT a playground!");
  }
  await G.anim('hero', 'reach', 1.2); G.fx('climb');
  await G.n(T("You toss the rope over the drooping branch and shin up the snoring oak. Gently, gently, you lift the Bloom Stone out of its knothole.", "You loop the rope over the drooping branch and climb up. Carefully, you lift the Bloom Stone from the knothole."));
  return gotBloom(G);
}
async function gotBloom(G) {
  G.set('bloomTaken'); G.give('bloom'); G.sfx('magic'); G.fx('sparkle', 'knothole');
  G.set('bramblesGone'); G.refresh(); G.fx('brambles');
  await G.n(T("The moment the stone leaves the oak, the brambles shiver, sigh, and shrink back into the earth like guilty snakes. The path east lies open — and you can smell the sea.", "As soon as the stone leaves the oak, the brambles shrink back into the earth. The path east is open, and you can smell the sea."));
}
async function lightLamp(G) {
  if (G.f('lampLit')) return G.n("The lamp is already blazing.");
  if (!G.has('ember') && !G.f('emberSet')) return G.n("You've nothing hot enough to light it.");
  if (!G.f('emberSet') && G.has('crown') && !G.has('ember')) return G.n(T("The Crown is beautiful, but it's cold. The Ember Stone would be the thing — if it were set in.", "The Crown is cold without the Ember Stone."));
  if (!G.f('lampFixed')) return G.n(T("You could light the wick, but with the clockwork jammed the beam would just stare at one patch of sea. Fix the turning gear first.", "The lamp's turning gear is jammed. It needs fixing before lighting it would do any good."));
  G.fx('climb'); await G.wait(0.5);
  await G.n(T("You climb to the lamp room and hold the Ember Stone to the wick. It flares — the wick catches with a great WHUMPH — and the lens begins to turn. A golden beam sweeps out across the water, and the fog... tears apart like wet paper.", "You hold the Ember Stone to the wick. It catches with a great WHUMPH! The lens turns, and a golden beam sweeps across the sea, scattering the fog."));
  G.set('lampLit'); G.refresh(); G.fx('beam'); G.sfx('win');
  await G.n(T("And there, where the fog had been: a little rocky isle with a crooked tower, glittering with a thousand stolen things.", "And there, where the fog had been, a little rocky isle appears, with a crooked tower glittering at the top."));
  await G.say('marlow', "Magpie Isle! I KNEW it! Forty years I've been telling the gulls!");
  await G.say('marlow', "Take my old boat, {name} — she's down in the cove. She's got a hole in her, mind. I keep meaning to patch it.");
}

// ------------------------------------------------------------------ dialog trees
async function dlgMabelThimble(G) {
  await G.h("Mabel, is this your thimble? I found it in the woods.");
  G.take('thimble');
  await G.say('mabel', "My thimble! My mother's thimble! Oh, you darling. That wretched bird must have dropped it.");
  await G.say('mabel', "I take back half the things I said about that magpie. Only half, mind.");
  await G.deed('thimble');
}
async function dlgBrannochPass(G) {
  if (G.f('gateOpen')) return G.say('brannoch', "You're already through, {name}. I'm just guarding the open gate now. It's harder than it looks.");
  await G.h("I have a Royal Pass from the Queen.");
  await G.say('brannoch', "A Royal Pass! Signed and everything. Well. Rules are rules, and this rule says I let you through.");
  await G.say('brannoch', "Mind the woods. They're whispering more than usual.");
  G.set('gateOpen'); G.refresh(); G.sfx('check');
}
async function dlgHobbBell(G) {
  await G.h("Hobb, is this Gerald's bell?");
  G.take('bell');
  await G.say('hobb', "...That's Gerald's bell.");
  await G.n(T("Hobb's face does something complicated. Is that... a smile? It's gone now. But it was there. You saw it.", "Hobb's stern face softens into the smallest of smiles."));
  await G.say('hobb', "Thanks.");
  await G.deed('bell');
}
async function dlgFennickBread(G) {
  if (G.f('fennickFed')) return G.say('fennick', "I couldn't eat another crumb. Well. I could. But I'm a fox of principle.");
  await G.say('fennick', "Is that — is that BREAD? Real, crusty bread? Oh, you magnificent creature.");
  await G.n(T("Fennick tears off half the loaf, hands back the rest, and eats with the dignity of a fox who hasn't seen bread in a week.", "Fennick tears off half the loaf and hands the rest back."));
  await G.say('fennick', "A deal's a deal. The Enchanted Mirror, with Fennick's compliments. May it always show you something handsome.");
  G.set('fennickFed'); G.give('mirror'); G.refresh();
}
async function dlgGrannyLavender(G) {
  if (G.f('grannyHappy')) return G.say('granny', "I've plenty now, dearie, thank you!");
  await G.h("Granny, I brought you some lavender.");
  G.take('lavender');
  await G.say('granny', "LAVENDER! Oh, bless your boots, bless your buttons, bless your little tinker's cap!");
  await G.n(T("She drops it straight into the cauldron, which gives a contented burp.", "She stirs the lavender into her cauldron, which bubbles happily."));
  await G.say('granny', "Now — you'll want something for the road. Take a jar of my famous toffee. It sets harder than a troll's heart; folk use it to mend pots and roof tiles.");
  await G.say('granny', "Warm it first, mind! Cold, it'll break your teeth — or whatever you're mending.");
  G.set('grannyHappy'); G.give('toffee'); G.refresh();
}
async function dlgMarlowWatch(G) {
  await G.h("Marlow — is this your watch? I found it in the woods.");
  G.take('watch');
  if (G.f('watchFixed')) {
    await G.say('marlow', "My watch! And it's TICKING! It hasn't ticked since that bird snatched it off my windowsill...");
    await G.say('marlow', "My Nell gave me this, forty years ago. Thank you, {name}. Truly.");
  } else {
    await G.say('marlow', "My watch! The bird took it Monday. Pity it's stopped... Still. It's mine, and it's home. Thank you.");
  }
  await G.deed('watch');
}

export const DIALOGS = {
  queen: {
    greet: async (G) => {
      if (!G.f('gotCrown')) {
        await G.say('queen', "The Crown, {name}. Look at it. Hollow as a drum.");
        await G.say('queen', "Tomorrow is Midsummer, and the whole kingdom expects to hear the Crown sing. It can't sing with nothing in it.");
        await G.say('queen', "Somebody took the Ember, the Bloom and the Tide. I want them back, and I want you to fetch them. You fix everything else around here.");
        await G.say('queen', "Take the Crown with you. When you find a stone, pop it in. They know where they belong.");
        G.set('gotCrown'); G.give('crown'); G.refresh(); G.sfx('chime');
        await G.n(T("You receive the Hollow Crown. It's lighter than it should be, which is somehow the saddest thing about it.", "You receive the Hollow Crown."));
        G.tutorial('inventory');
        return;
      }
      await G.say('queen', G.f('tideSet') ? "{name}! You did it!" : "Any news, dear?");
    },
    opts: [
      { id: 'who', t: 'Who would steal the heart-stones?', once: true, run: async (G) => { await G.say('queen', "I haven't the foggiest. Though there was a terrible flapping in the night, and a feather on my windowsill this morning."); await G.say('queen', "Sir Brannoch says birds don't do crimes. Sir Brannoch says a great many things."); } },
      { id: 'start', t: 'Where should I start looking?', run: async (G) => { G.set('queenStart'); await G.say('queen', "Mabel the baker sees everything that happens in the square — mostly through her oven window. Start with her. The square is just through the courtyard."); } },
      { id: 'stones', t: 'Tell me about the three stones.', run: async (G) => { await G.say('queen', "The Ember keeps the hearths warm. The Bloom keeps the woods green. The Tide keeps the sea in a good mood."); await G.say('queen', "Without them, well... have you noticed the bread's been burning? And the brambles growing? And the fog?"); } },
      { id: 'pass', t: 'May I have a Royal Pass to leave town?', if: (s) => s.f.gotCrown && !s.inv.includes('pass') && !s.f.gateOpen && !s.f.passAsked, run: async (G) => { G.set('passAsked'); await G.say('queen', "A pass! Of course, of course. Let me just write it out— now where are my spectacles? I can't sign a thing without my spectacles."); await G.say('queen', "Oh, bother. Come back when we've found them, dear."); } },
      { id: 'spectacles', t: 'Aunt Elowen... your spectacles are on your head.', if: (s) => s.f.passAsked && s.f.lookedQueen && !s.f.passGiven, run: async (G) => { await G.say('queen', "...So they are. How long have they been up there?"); await G.h("Since breakfast, I think."); await G.say('queen', "Don't tell the court."); G.fx('sparkle', 'queen'); G.set('passGiven'); G.give('pass'); G.sfx('check'); await G.n(T("The Queen signs a Royal Pass with a flourish, slightly crooked. It says: LET THIS TINKER THROUGH, AND BE NICE ABOUT IT.", "The Queen signs you a Royal Pass.")); } },
      { id: 'specs2', t: 'Have you found your spectacles yet?', if: (s) => s.f.passAsked && !s.f.lookedQueen && !s.f.passGiven, run: async (G) => { await G.say('queen', "Not yet, dear. I've looked absolutely everywhere. Well. Everywhere I can see."); } },
      { id: 'box', t: 'Tell me about the music box.', if: (s) => s.inv.includes('musicbox'), run: async (G) => { await G.say('queen', G.f('boxFixed') ? "You fixed it! Oh, play it softly, dear — that lullaby could put a mountain to sleep." : "The key went missing years ago — no, wait, it was only last week! Everything shiny's been vanishing. Find the key and it'll play again."); } },
    ],
  },
  mabel: {
    greet: async (G) => { await G.say('mabel', G.f('emberTaken') ? "My favourite tinker! The oven's purring like a kitten." : "Oh, {name}, love, don't come too close — my oven's gone mad! Roaring day and night since Monday. Every loaf comes out a lump of coal!"); },
    opts: [
      { id: 'strange', t: 'Have you seen anything strange lately?', run: async (G) => { G.set('mabelSaw'); await G.say('mabel', "Strange? Monday night I was up early kneading, and I saw a bird — biggest magpie you ever saw — flap over the rooftops with a sack of something glittery."); await G.say('mabel', "It dropped one twinkly thing right down my chimney, cheeky beggar, then off it went — east, over the woods, toward the sea."); if (!G.f('emberTaken')) { await G.h("Down your chimney? Into the oven?"); await G.say('mabel', "And that's when the roaring started. You don't think...?"); } } },
      { id: 'oven', t: "What's wrong with your oven?", if: (s) => !s.f.emberTaken, run: async (G) => { G.set('mabelOven'); await G.say('mabel', "It's possessed, love. Or it's got something in it. Either way I can't get near it — it'd singe the eyebrows off a dragon."); await G.h("Have you tried putting it out?"); await G.say('mabel', "With what? The castle well's lost its crank handle. Somebody'd need a bucket of water and a very long pair of tongs."); } },
      { id: 'brannoch', t: 'Tell me about Sir Brannoch.', run: async (G) => { G.set('mabelBran'); await G.say('mabel', "Sir Brannoch's a dear, but he's scared of his own shadow — and terrified of birds, though he'll never admit it."); await G.say('mabel', "He's locked the East Gate till the thief's caught. Fat lot of good that'll do, if the thief can fly."); } },
      { id: 'thimble', t: 'Is this your thimble?', if: (s) => s.inv.includes('thimble'), end: false, run: async (G) => dlgMabelThimble(G) },
    ],
    bye: "Mind how you go, love.",
  },
  brannoch: {
    greet: async (G) => {
      G.set('brannochMet');
      if (G.f('gateOpen')) return G.say('brannoch', "{name}! Back so soon? The gate's open. Very open. Openly guarded.");
      await G.say('brannoch', "Halt! Ah — it's you, {name}. Nobody leaves Wrenfold through this gate while a thief is at large. Captain's orders.");
    },
    opts: [
      { id: 'pass', t: 'I have a Royal Pass from the Queen.', if: (s) => s.inv.includes('pass') && !s.f.gateOpen, end: true, silent: true, run: async (G) => dlgBrannochPass(G) },
      { id: 'feather', t: "The thief isn't 'at large'. It flew. Look — a magpie feather from the throne room.", if: (s) => s.inv.includes('feather') && !s.f.gateOpen && !s.f.ptFeather, run: async (G) => { await G.say('brannoch', "A f-feather? That's just a feather. Birds lose them all the time. It's very normal. I'm not afraid of birds. Who told you I was afraid of birds?"); await G.h("Nobody."); await G.say('brannoch', "...Good. Fine. I'll grant you the thief may have... feathery qualities."); G.set('ptFeather'); return brannochPoint(G); } },
      { id: 'mabel', t: 'Mabel saw it fly east, over the woods, with a sack of shiny things.', if: (s) => s.f.mabelSaw && !s.f.gateOpen && !s.f.ptMabel, run: async (G) => { await G.say('brannoch', "Mabel sees a lot of things. Last week she saw a cloud shaped like her late husband."); await G.say('brannoch', "...Still. East, you say? Over the wall? Hmm."); G.set('ptMabel'); return brannochPoint(G); } },
      { id: 'logic', t: "If the thief's already gone, you're guarding the kingdom from nobody.", if: (s) => !s.f.gateOpen && !s.f.ptLogic, run: async (G) => { await G.say('brannoch', "Guarding it from nob— well, when you put it like that it sounds silly. It isn't silly. It's procedure."); G.set('ptLogic'); return brannochPoint(G); } },
      { id: 'queen', t: "Would you like to explain to the Queen why her Crown's still hollow on Midsummer morning?", if: (s) => !s.f.gateOpen && !s.f.ptQueen, run: async (G) => { await G.say('brannoch', "...I would very much rather not do that."); G.set('ptQueen'); return brannochPoint(G); } },
      { id: 'goat', t: 'Look behind you! A three-headed goat!', if: (s) => !s.f.gateOpen, once: true, run: async (G) => { await G.say('brannoch', "Nice try. I've been a guard for forty years. There's never anything behind me."); await G.n(T("He glances behind him anyway.", "He glances behind him.")); await G.say('brannoch', "...There isn't, is there?"); } },
      { id: 'buttons', t: 'I could pay you. In buttons.', if: (s) => !s.f.gateOpen, once: true, run: async (G) => { await G.say('brannoch', "Buttons! Do I look like a man who can be bought with buttons?"); await G.say('brannoch', "...What kind of buttons?"); await G.h("Never mind."); } },
      { id: 'brave', t: "You're very brave, Sir Brannoch.", if: (s) => s.f.gateOpen && !s.deeds.brave, run: async (G) => { await G.say('brannoch', "Brave? Me? ...Do you really think so?"); await G.h("Guarding the gate all night with magpies about? Very."); await G.n(T("His magnificent moustache quivers with emotion.", "His moustache quivers with emotion.")); await G.say('brannoch', "Thank you, {name}. Nobody's ever said that before."); await G.deed('brave'); } },
      { id: 'woods', t: "What's beyond the gate?", run: async (G) => { await G.say('brannoch', "The Whispering Woods. Foxes, witches, talking trees. Dreadful places. Lovely in spring."); } },
    ],
    bye: "Carry on. Carefully.",
  },
  hobb: {
    greet: async (G) => { await G.say('hobb', G.f('wheelFixed') ? "Hm. Wheel's going." : "Hm. Wheel's stuck."); },
    opts: [
      { id: 'wheel', t: "What's wrong with the wheel?", if: (s) => !s.f.wheelFixed, run: async (G) => { await G.say('hobb', "Stuck. Something shiny in the works. Magpie flew over Monday. Dropped it."); await G.h("Can I take a look?"); await G.say('hobb', "Can't stop you."); } },
      { id: 'ducks', t: 'Do you like ducks?', once: true, run: async (G) => { await G.say('hobb', "No."); await G.wait(0.6); await G.say('hobb', "Their names are Pudding, Dumpling, Admiral and Gerald."); } },
      { id: 'magpie', t: 'Did you see the magpie?', run: async (G) => { await G.say('hobb', "Big. Flew east. Didn't wave."); } },
      { id: 'bell', t: "Is this Gerald's bell?", if: (s) => s.inv.includes('bell'), run: async (G) => dlgHobbBell(G) },
    ],
    bye: 'Hm.',
  },
  fennick: {
    greet: async (G) => { await G.say('fennick', G.once('fennickMet') ? "Well, well! A customer! And a royal one, by the cut of that cap. Fennick's the name; marvels are the game." : "My favourite customer returns!"); },
    opts: [
      { id: 'sell', t: 'What are you selling?', run: async (G) => { G.set('fennickPitch'); await G.say('fennick', "Everything worth having! Dragon's tears, giant's toenails, and this — a genuine Enchanted Mirror, which shows the face of whoever looks into it."); await G.h("That's... just what mirrors do."); await G.say('fennick', "Yes! Every time! Never fails!"); } },
      { id: 'price', t: 'How much for the mirror?', if: (s) => !s.f.fennickFed, run: async (G) => { G.set('fennickPrice'); await G.say('fennick', "For you? I'm a fox of simple tastes. I haven't eaten anything that wasn't a beetle in three days. Bring me a meal — real bread, mind, not a promise — and it's yours."); } },
      { id: 'bread', t: 'Here — have some bread.', if: (s) => s.inv.includes('bread') && !s.f.fennickFed, silent: false, run: async (G) => dlgFennickBread(G) },
      { id: 'magpie', t: 'Have you seen a big magpie?', run: async (G) => { G.set('heardVain'); await G.say('fennick', "Corvin? Calls himself the Magpie King. Lives on an island past the sea cliffs, in a tower made of other people's spoons."); await G.say('fennick', "Vain as a peacock in a hall of mirrors, that one. We had a business arrangement once. He stole the arrangement."); } },
      { id: 'woods', t: 'What are the woods whispering about?', run: async (G) => { await G.say('fennick', "Mostly the Old Oak. Grumbleroot's been in a state since Monday — growing like a weed, brambles everywhere. The path to the cliffs is choked solid. Something's got into him."); } },
    ],
    bye: 'Come back soon! Bring money! Or bread!',
  },
  granny: {
    greet: async (G) => { await G.say('granny', G.once('grannyMet') ? "Visitors! Come in, come in — mind the goat. What's that, dearie? You'll have to speak up, my ears are full of wool this week." : "Back again, dearie? Lovely! Mind the goat."); },
    opts: [
      { id: 'stones', t: "I'm looking for the Crown's stolen heart-stones.", run: async (G) => { await G.say('granny', "Stolen what-stones? Bone-stones? Oh — HEART-stones! Yes, yes. That bird, Corvin. Dropped a green one on Monday, right into old Grumbleroot's knothole."); await G.say('granny', "The poor oak's been growing like mad ever since. Brambles all over the east path."); } },
      { id: 'oak', t: 'How do I get the stone from Grumbleroot?', run: async (G) => { G.set('heardOakTip'); await G.say('granny', "Get it from the OAK? Ha! He's a stubborn old stump. But there are two things Grumbleroot can't resist: a good riddle, and a lullaby."); await G.say('granny', "Ask him to trade — he'll never say no to a riddle game. Or sing him to sleep, if you can find a tune sweet enough to put a tree to bed."); } },
      { id: 'corvin', t: 'Do you know anything about the Magpie King?', run: async (G) => { G.set('heardVain'); await G.say('granny', "Corvin? Vain! Vainer than a swan at a wedding. That bird would trade his own grandmother for a look at himself in a spoon. Remember that, dearie."); } },
      { id: 'help', t: 'Can I help you with anything?', if: (s) => !s.f.grannyHappy, run: async (G) => { G.set('grannyAsked'); await G.say('granny', "Help me? Oh, my poor knees. I'm out of lavender for my sleepy-tea, and I haven't slept a wink since Sunday."); await G.say('granny', "Bring me a sprig of lavender, there's a dear, and I'll give you something worth having."); } },
      { id: 'lav', t: 'I brought you lavender.', if: (s) => s.inv.includes('lavender') && !s.f.grannyHappy, silent: true, run: async (G) => dlgGrannyLavender(G) },
      { id: 'pot', t: "What's in the cauldron?", once: true, run: async (G) => { await G.say('granny', "Soup! Or potion. Depends who's asking, and how poorly they are."); } },
    ],
    bye: 'Mind the goat on your way out! Mind the— oh. Too late.',
  },
  oak: {
    greet: async (G) => {
      if (G.f('bloomTaken')) return G.say('oak', G.once('oakAfter') ? "Mmf? Oh, it's you. My tickle's gone. ...Do you know, I feel rather better. Growing like that was exhausting." : "Hello again, small one. Quieter now, isn't it? Lovely.");
      await G.say('oak', G.once('oakMet') ? "WHO DISTURBS— oh. A small one. Hello, small one! I haven't felt so SPRIGHTLY in four hundred years! Look at me GROW!" : "The small one returns! Still small, I see.");
    },
    opts: [
      { id: 'stone', t: 'That green stone in your knothole belongs to the Queen.', if: (s) => !s.f.bloomTaken, run: async (G) => { await G.say('oak', "Belongs? BELONGS? It fell into my knothole. Finders keepers, that's the law of the woods."); await G.say('oak', "Besides, it TICKLES. Nothing has tickled me since the Age of Acorns."); } },
      { id: 'path', t: 'Your brambles have blocked the path to the sea.', if: (s) => !s.f.bloomTaken, run: async (G) => { await G.say('oak', "Have they? Oh dear. Well. A tree can't help growing. It's like asking you to stop... whatever it is you small ones do. Fidgeting."); } },
      { id: 'trade', t: 'Would you trade the stone for something?', if: (s) => !s.f.bloomTaken && !s.f.riddleOffer, run: async (G) => { G.set('riddleOffer'); await G.say('oak', "TRADE? What could a little thing like you have that an oak would want?"); await G.say('oak', "...Unless... do you know any RIDDLES? I adore a riddle. Answer three of mine, and I'll hand over the stone fair and square. Get one wrong, and we start again. I've got time. I've got LOTS of time."); } },
      { id: 'riddle', t: "Let's play riddles.", if: (s) => !s.f.bloomTaken && s.f.riddleOffer, run: async (G) => riddleGame(G) },
      { id: 'age', t: 'How old are you?', once: true, run: async (G) => { await G.say('oak', "Old enough to remember when the castle was a pile of rocks, and the rocks were a mountain, and the mountain was a rumour."); } },
    ],
    bye: 'Goodbye, small one! Come back when you are bigger!',
  },
  marlow: {
    greet: async (G) => { await G.say('marlow', G.once('marlowMet') ? "Ahoy! A visitor! Nobody visits. The gulls visit, but they never bring anything." : G.f('lampLit') ? "There's my lamplighter!" : "Ahoy again!"); },
    opts: [
      { id: 'dark', t: 'Why is the lighthouse dark?', if: (s) => !s.f.lampLit, run: async (G) => { G.set('marlowDark'); await G.say('marlow', "Monday night a great bird came screaming past my lamp room — knocked the turning gear clean out of true."); await G.say('marlow', "Then the fog rolled in so thick it soaked my oil and drowned my matches. Ships are steering by guesswork and prayer."); } },
      { id: 'fog', t: "What's out there in the fog?", if: (s) => !s.f.lampLit, run: async (G) => { await G.say('marlow', "Legend says there's an island out there, hidden in a fog that never lifts. Magpie Isle. I saw it once, on a clear night, forty years ago."); await G.say('marlow', "Nobody believes me but the gulls, and the gulls believe anything."); } },
      { id: 'boat', t: 'Could I borrow a boat?', run: async (G) => { G.set('askedBoat'); await G.say('marlow', G.f('lampLit') ? "The Saucy Gull's yours! She's down in the cove. Patch the hole first, mind." : "My old rowboat's down in the cove. But rowing into that fog? You'd end up in next Tuesday. Light my lamp first, and we'll see where you're going."); } },
      { id: 'watch', t: 'Is this your watch?', if: (s) => s.inv.includes('watch'), silent: true, run: async (G) => dlgMarlowWatch(G) },
      { id: 'gulls', t: 'Do you really talk to the gulls?', once: true, run: async (G) => { await G.say('marlow', "Talk to them? I argue with them. It's very good for the lungs. Theirs, mostly."); } },
    ],
    bye: 'Fair winds!',
  },
  corvin: {
    greet: async (G) => {
      if (G.f('corvinDistracted')) return G.say('corvin', "Shh! I'm busy. Gorgeous and I are having a moment.");
      await G.say('corvin', "Come to admire me? Everyone does, eventually. Go on. Admire.");
    },
    opts: [
      { id: 'give', t: 'Give back the Tide Stone. It belongs to the Crown.', if: (s) => !s.f.tideTaken, run: async (G) => { await G.say('corvin', "Belongs? Pah! Things belong to whoever loves them most, and NOBODY loves shiny things more than me."); } },
      { id: 'why', t: 'Why did you steal the heart-stones?', run: async (G) => { G.set('corvinWhy'); await G.say('corvin', "WHY? Have you SEEN them? The Ember, warm as a hug. The Bloom, green as a secret. The Tide, blue as... as..."); await G.n(T("He gazes at the Tide Stone and forgets the end of his sentence.", "He gazes at the Tide Stone, lost for words.")); await G.say('corvin', "I wanted the shiniest crown in the world. Is that so wrong?"); await G.h("Yes."); await G.say('corvin', "Agree to disagree!"); } },
      { id: 'dropped', t: 'You dropped the Ember and the Bloom, you know.', once: true, run: async (G) => { await G.say('corvin', "I did NOT drop them. I... strategically released them. Over a chimney. And an oak. Anyway, I kept the best one."); } },
      { id: 'flatter', t: "You're very handsome.", once: true, run: async (G) => { await G.say('corvin', "I KNOW. Thank you. Nobody ever SAYS it, but I know."); await G.say('corvin', "...Still not giving you the stone, though."); } },
      { id: 'party', t: 'Is this about the coronation?', if: (s) => s.f.corvinWhy, once: true, run: async (G) => { G.set('corvinLonely'); await G.say('corvin', "The coronation! Every Midsummer the whole kingdom gathers, and every year the invitations go to the bakers and the millers and the FOXES — and not one, NOT ONE, to the magpies."); await G.say('corvin', "So I thought: if I can't go to the party, I'll take the party's crown."); } },
    ],
    bye: 'Leaving so soon? Take one last look at me. Go on.',
  },
};

async function brannochPoint(G) {
  const pts = ['ptFeather', 'ptMabel', 'ptLogic', 'ptQueen'].filter((k) => G.f(k)).length;
  const need = G.diff === 'easy' ? 2 : G.diff === 'hard' ? 4 : 3;
  const evidence = G.f('ptFeather') || G.f('ptMabel');
  if (pts >= need && evidence) {
    await G.n(T("Sir Brannoch's moustache droops in defeat.", "Sir Brannoch sighs deeply."));
    await G.say('brannoch', "Oh, very WELL. The gate is open. But if anybody asks, you overpowered me.");
    await G.h("I'll tell them I was terribly fierce.");
    G.set('gateOpen'); G.refresh(); G.sfx('check'); G.fx('gate');
    return 'end';
  }
  await G.n(pts >= need ? T("He wavers — but he'll want some actual evidence that the thief has flown.", "He's almost convinced, but he wants real evidence that the thief has gone.") : T("Sir Brannoch's moustache wavers. He's weakening.", "Sir Brannoch looks less certain."));
}

const RIDDLES = [
  { q: "First riddle! I'm thrown when you're hopeful and lost when I'm thrown. I'm made of a wish, but I'm metal and stone. You'll find me asleep at the bottom of every fountain. What am I?", a: ['A penny', 'A frog', 'A tantrum', 'A spoon'] },
  { q: "Second riddle! I have a face but no head, hands but no arms, and I'm forever telling you something you should already know. What am I?", a: ['A clock', 'Sir Brannoch', 'A portrait', 'The moon'] },
  { q: "Third and last! The more of me there is, the less you can see. I'm the sea's breath in the morning, and only a lighthouse can cut me. What am I?", a: ['Fog', 'Darkness', 'Gravy', 'A secret'] },
];
const WRONG = { 'A frog': "A FROG? Frogs aren't thrown into fountains! Well. Not often.", 'A tantrum': "Ha! A tantrum's thrown, yes, but nobody wishes on one.", 'A spoon': "A spoon! Only if you're a magpie.", 'Sir Brannoch': "Ha! Close — he IS always telling people things — but no.", 'A portrait': "A portrait has a face, but no hands. Well, some do. But no!", 'The moon': "The moon has a face, but it never nags you.", 'Darkness': "Darkness? Ooh, close, but darkness doesn't come from the sea.", 'Gravy': "GRAVY? Where do you small ones get these ideas?", 'A secret': "A secret? Hmm. Poetic. Wrong!" };
async function riddleGame(G) {
  const nOpts = G.diff === 'easy' ? 2 : G.diff === 'hard' ? 4 : 3;
  for (let i = 0; i < RIDDLES.length; i++) {
    const r = RIDDLES[i];
    await G.say('oak', r.q);
    const answers = r.a.slice(0, nOpts);
    const order = G.shuffle(answers.map((t, k) => ({ id: k === 0 ? 'right' : 'wrong' + k, t })));
    const pick = await G.choose(order, { noBye: true });
    const chosen = order.find((o) => o.id === pick) || order[0];
    await G.h(chosen.t + '?');
    if (pick !== 'right') {
      G.sfx('error');
      await G.say('oak', (WRONG[chosen.t] || 'WRONG!') + " Back to the beginning, small one!");
      await G.n(T("No harm done. Grumbleroot has all the time in the world, and so, it seems, do you.", "No harm done — you can try again whenever you like."));
      return;
    }
    G.sfx('check');
    await G.say('oak', i < 2 ? 'RIGHT! Hmph. Lucky.' : 'RIGHT AGAIN! Three for three!');
  }
  await G.say('oak', "Well, I never. A bargain's a bargain, small one.");
  await G.n(T("Grumbleroot lowers a creaking branch to his knothole, plucks out the Bloom Stone, and drops it into your hands like an acorn.", "Grumbleroot lowers a branch, takes the Bloom Stone from his knothole, and places it gently in your hands."));
  await gotBloom(G);
  return 'end';
}

// ------------------------------------------------------------------ combinations (order-independent)
export const COMBOS = {
  'crown+ember': async (G) => setStone(G, 'ember', 'emberSet'),
  'bloom+crown': async (G) => setStone(G, 'bloom', 'bloomSet'),
  'crown+tide': async (G) => setStone(G, 'tide', 'tideSet'),
  'key+musicbox': async (G) => { G.take('key'); G.set('boxFixed'); G.sfx('chime'); G.fx('sparkle'); await G.n(T("The key slides in with a satisfied click. You give it a turn, and the music box tinkles the first bars of the old Wrenfold lullaby. Your eyelids immediately feel heavier. Powerful stuff.", "The key fits perfectly! You give it a turn, and the music box plays the gentle Wrenfold lullaby.")); },
  'watch+wrench': async (G) => { if (G.f('watchFixed')) return G.n("It's ticking nicely already."); G.set('watchFixed'); G.sfx('click'); await G.n(T("You pop the back off the watch with the tip of your wrench, coax a sprung hairspring back into place, and — tick, tick, tick. Tinkering: still the best magic.", "You open the watch with your wrench and nudge a loose spring back into place. It starts ticking!")); await G.deed('watchfix'); },
  'crown+toffee': async (G) => { if (!G.f('emberSet')) return G.n("The Crown's cold without the Ember Stone in it."); if (G.f('toffeeWarm')) return G.n("It's already warm."); G.set('toffeeWarm'); G.fx('sparkle'); await G.n(T("You hold the jar against the Crown's Ember Stone. The toffee softens into a sticky, golden, faintly smug goo.", "You warm the toffee jar against the Ember Stone. The toffee softens into a sticky golden goo.")); },
  'ember+toffee': async (G) => { if (G.f('toffeeWarm')) return G.n("It's already warm."); G.set('toffeeWarm'); await G.n(T("You hold the jar to the Ember Stone. The toffee slumps into a glossy goo.", "You warm the toffee with the Ember Stone.")); },
  'feather+toffee': T("You stick the feather in the toffee. Now you have a toffee with a feather in it. Nobody wants this.", "That doesn't help anything."),
  'bread+toffee': T("A toffee sandwich. Mabel would weep. Dentists would rejoice.", "That would be a very sticky sandwich, and not very useful."),
  'glowcap+bread': T("A glowing mushroom sandwich. Tempting. Terrible, but tempting.", "That doesn't seem like a good idea."),
};
export const SELF = { // using an item on the hero
  bread: T("You take a bite. Delicious. Mabel really is the best.", "You nibble a little of the bread. Delicious!"),
  glowcap: 'death',
  lavender: T("You sniff the lavender. Ahh. Your shoulders drop about an inch.", "You sniff the lavender. Very relaxing."),
  mirror: T("You look in the mirror. Your cap is crooked. You fix it. Much better. Hero material.", "You check your reflection and straighten your cap."),
  musicbox: (s) => (s.f.boxFixed ? T("You play yourself a few bars of the lullaby and nearly fall asleep standing up. Strong stuff.", "You play a little of the lullaby. You feel rather sleepy.") : T("No key, no tune.", "It needs its key.")),
  toffee: (s) => (s.f.toffeeWarm ? T("You lick a little warm toffee off your thumb. Worth it.", "Mmm, toffee.") : T("You try a piece. Your teeth file a formal complaint.", "It's far too hard to eat.")),
  crown: T("You try the Crown on. It's a bit big. Also it's treason. You take it off again.", "You resist the urge to try on the Crown."),
  wrench: T("You tighten your own belt buckle. Very professional.", "You give your belt buckle a little tighten."),
  feather: T("You tickle yourself with the feather. It's not as fun alone.", "You tickle your nose with the feather. Achoo!"),
};

// ------------------------------------------------------------------ fallback quips
export const FALLBACK = {
  use: [T("You can't think of anything sensible to do with that. Or anything silly, which is rarer.", "You can't think of a way to use that."), T("Nothing happens. Nothing happens very convincingly.", "That doesn't seem to do anything."), T("You fiddle with it in a tinkerly way. It remains unfixed, because it wasn't broken.", "It doesn't need fixing.")],
  item: [T("The {item} and the {target} have nothing to say to each other.", "The {item} won't help with that."), T("You try the {item} on the {target}. It doesn't work. You try it with more conviction. Still no.", "That doesn't seem to work."), T("A bold idea. A wrong idea, but bold.", "Hmm, that's not quite right.")],
  talk: [T("The {target} has nothing to say. It's not that kind of story.", "The {target} doesn't answer."), T("You make polite conversation with the {target}. It's a good listener, at least.", "It's not much of a talker.")],
  combine: [T("Those two don't go together. Like Hobb and small talk.", "Those don't go together."), T("You try jamming them together. They try very hard not to be jammed.", "That doesn't work."), T("If tinkering worked like that, everyone would do it.", "You can't combine those.")],
};

// ------------------------------------------------------------------ goals → 3-tier hints (nudge, clue, answer)
const has = (s, i) => s.inv.includes(i);
export const GOALS = [
  { id: 'crown', avail: () => true, done: (s) => s.f.gotCrown, h: ["Your aunt, the Queen, looks like she needs a word.", "Talk to Queen Elowen in the throne room.", "Click on the Queen to talk to her. She'll hand you the Hollow Crown."] },
  { id: 'mabel', avail: (s) => s.f.gotCrown, done: (s) => s.f.mabelSaw, h: ["Somebody in the village must have seen the thief.", "The Queen suggested Mabel the baker — she sees everything in the square.", "Go out through the courtyard to Wrenfold Square and ask Mabel if she's seen anything strange."] },
  { id: 'water', avail: (s) => s.f.gotCrown && (s.f.lookedOven || s.f.mabelOven || s.f.mabelSaw), done: (s) => has(s, 'water') || s.f.ovenDoused, h: ["Mabel's oven is far too fierce to reach into. It needs calming down.", "Water would do it. The castle well has a bucket — but its crank handle is missing, leaving a square iron peg.", "Use your Tinker's Wrench on the well in the castle courtyard to crank up a bucket of water."] },
  { id: 'douse', avail: (s) => has(s, 'water'), done: (s) => s.f.ovenDoused, h: ["You've got water. Something nearby is far too hot.", "Mabel's oven needs dousing.", "Use the Bucket of Water on Mabel's oven in the square."] },
  { id: 'ember', avail: (s) => s.f.ovenDoused, done: (s) => s.f.emberTaken, h: ["The fire's down, but that glowing stone is still far too hot to touch.", "Something long and iron would reach it. Remember the throne room hearth?", "Take the fire tongs from the throne room hearth, then use them on the oven."] },
  { id: 'setEmber', avail: (s) => has(s, 'ember'), done: (s) => s.f.emberSet, h: ["That glowing stone belongs somewhere.", "The Crown has three empty sockets.", "Select the Ember Stone in your inventory, then click the Hollow Crown to combine them."] },
  { id: 'gate', avail: (s) => s.f.gotCrown && (s.f.mabelSaw || s.f.brannochMet), done: (s) => s.f.gateOpen, h: ["Sir Brannoch won't budge — but he can be persuaded, or overruled.", "Convince him the thief has flown (evidence helps: the feather from the throne room, and Mabel's story), or ask the Queen for a Royal Pass.", "Talk to Brannoch: show the magpie feather, tell him what Mabel saw, and point out he's guarding nobody. OR ask the Queen for a Royal Pass, look closely at her, and tell her where her spectacles are."] },
  { id: 'woods', avail: (s) => s.f.gateOpen, done: (s) => s.f.woodsIntro, h: ["The East Gate is open. Adventure is that way.", "The thief flew east, over the Whispering Woods.", "Walk through the East Gate in Wrenfold Square to reach the woods."] },
  { id: 'mirror', avail: (s) => s.f.woodsIntro, done: (s) => has(s, 'mirror') || s.f.corvinDistracted, h: ["Fennick the fox has a little something you'll be glad of later.", "Fennick will trade his 'Enchanted Mirror' for real food.", "Give Mabel's loaf to Fennick at the crossroads."] },
  { id: 'bloom', avail: (s) => s.f.woodsIntro, done: (s) => s.f.bloomTaken, h: ["The Bloom Stone is stuck high in Grumbleroot's knothole, and he won't give it up.", "Granny Thistle says Grumbleroot can't resist two things: a riddle game, or a lullaby.", "Either ask Grumbleroot to trade and answer his three riddles (a penny, a clock, fog) — or fix the Queen's music box, play it to him, then climb up with Hobb's rope."] },
  { id: 'box', avail: (s) => s.f.woodsIntro && !s.f.bloomTaken && !s.f.boxFixed && !s.f.riddleOffer, done: (s) => s.f.boxFixed || s.f.bloomTaken, h: ["The Queen's music box could put anyone to sleep — if it had its key.", "Something brassy was jammed in Hobb's water wheel...", "Use your wrench on the mill wheel, feed bread to the duck that grabs the key, then combine the key with the music box."] },
  { id: 'setBloom', avail: (s) => has(s, 'bloom'), done: (s) => s.f.bloomSet, h: ["Another stone for the Crown!", "Put it with the others.", "Combine the Bloom Stone with the Crown."] },
  { id: 'toffee', avail: (s) => s.f.gladeIntro, done: (s) => has(s, 'toffee') || s.f.boatPatched, h: ["Granny Thistle could use a hand, and she rewards kindness.", "She's run out of lavender for her sleepy-tea.", "Pick lavender from the castle courtyard herb garden (use the map to travel back), then give it to Granny Thistle."] },
  { id: 'cliffs', avail: (s) => s.f.bramblesGone, done: (s) => s.f.cliffsIntro, h: ["The brambles have gone. Where does the east path lead?", "Beyond the Old Oak lie the sea cliffs — and the thief flew toward the sea.", "Take the east path from the Old Oak to the sea cliffs."] },
  { id: 'lampFix', avail: (s) => s.f.cliffsIntro, done: (s) => s.f.lampFixed, h: ["Nobody will find anything in that fog until the lighthouse shines.", "Marlow says the lamp's turning gear was knocked out of true.", "Use your wrench on the lighthouse."] },
  { id: 'lampLit', avail: (s) => s.f.lampFixed, done: (s) => s.f.lampLit, h: ["The lamp needs a flame that fog can't drown.", "What do you carry that's hotter than any match?", "Use the Crown (with the Ember Stone set in it) on the lighthouse."] },
  { id: 'cove', avail: (s) => s.f.lampLit, done: (s) => s.f.coveIntro, h: ["Marlow offered you his boat.", "It's down in the cove below the cliffs.", "Take the path down from Lighthouse Point to the cove."] },
  { id: 'warm', avail: (s) => has(s, 'toffee') && s.f.coveIntro, done: (s) => s.f.toffeeWarm || s.f.boatPatched, h: ["Granny told you to warm the toffee before mending anything.", "Any fierce heat will do: the lit lamp, or a fiery stone.", "Use the toffee on the lit lighthouse — or combine it with the Crown while the Ember Stone is in it."] },
  { id: 'patch', avail: (s) => s.f.coveIntro, done: (s) => s.f.boatPatched, h: ["Marlow's boat has a hole in it.", "Something that sets hard as glass would seal it — Granny's toffee, perhaps.", "Get Granny's toffee (trade her lavender), warm it, then use it on the boat."] },
  { id: 'sail', avail: (s) => s.f.boatPatched && s.f.lampLit, done: (s) => s.f.isleIntro, h: ["The boat's ready, and the way is lit.", "Time to cross to Magpie Isle.", "Click the rowboat in the cove to row to the isle."] },
  { id: 'distract', avail: (s) => s.f.isleIntro, done: (s) => s.f.corvinDistracted, h: ["Corvin won't let go of the Tide Stone while he's looking at you.", "Fennick and Granny both said Corvin is terribly vain.", "Use Fennick's mirror on Corvin. (If you don't have it, give Fennick some of Mabel's bread.)"] },
  { id: 'tide', avail: (s) => s.f.corvinDistracted, done: (s) => s.f.tideTaken, h: ["Corvin's busy admiring himself...", "He dropped the Tide Stone onto his hoard.", "Click the hoard to take the Tide Stone."] },
  { id: 'setTide', avail: (s) => has(s, 'tide'), done: (s) => s.f.tideSet, h: ["One last stone!", "The Crown is waiting.", "Combine the Tide Stone with the Crown."] },
];

// ------------------------------------------------------------------ scripted walkthrough (used by solveAll + node tests)
// op: ['go',scene] | [verb, hotspot, ...dialogChoices] | ['item', item, hotspot, ...choices] | ['combine', a, b] | ['exit', id]
export const WALKTHROUGH = [
  ['talk', 'queen', 'who', 'start', 'bye'],
  ['look', 'queen'], ['talk', 'queen', 'pass', 'spectacles', 'bye'],
  ['use', 'feather'], ['use', 'tongs'], ['use', 'musicbox'],
  ['exit', 'courtyard'],
  ['use', 'lavender'], ['item', 'wrench', 'well'], ['use', 'biscuit'],
  ['exit', 'gate'],
  ['talk', 'mabel', 'strange', 'oven', 'brannoch', 'bye'],
  ['item', 'water', 'oven'], ['item', 'tongs', 'oven'], ['combine', 'ember', 'crown'],
  ['talk', 'brannoch', 'feather', 'mabel', 'logic', 'queen', 'bye'],
  ['talk', 'brannoch', 'brave', 'bye'],
  ['exit', 'mill'],
  ['item', 'wrench', 'wheel'], ['item', 'bread', 'duck'], ['combine', 'key', 'musicbox'],
  ['exit', 'square'], ['exit', 'castle'], ['item', 'bread', 'turnip'], ['exit', 'gate'],
  ['exit', 'east'],
  ['use', 'thimble'], ['talk', 'fennick', 'sell', 'price', 'bread', 'magpie', 'bye'], ['use', 'mushrooms'],
  ['exit', 'north'],
  ['talk', 'granny', 'oak', 'help', 'lav', 'bye'], ['item', 'glowcap', 'goat'], ['use', 'watch'], ['combine', 'wrench', 'watch'],
  ['exit', 'south'], ['exit', 'east'],
  ['item', 'musicbox', 'grumbleroot'], ['item', 'rope', 'knothole'], ['combine', 'bloom', 'crown'], ['use', 'bell'],
  ['exit', 'east'],
  ['talk', 'marlow', 'dark', 'watch', 'bye'], ['item', 'wrench', 'lighthouse'], ['item', 'crown', 'lighthouse'], ['item', 'toffee', 'lighthouse'],
  ['exit', 'cove'],
  ['item', 'tongs', 'crab'], ['item', 'toffee', 'boat'], ['use', 'boat'],
  ['talk', 'corvin', 'why', 'party', 'bye'], ['item', 'mirror', 'corvin'], ['use', 'hoard'], ['combine', 'tide', 'crown', 'invite'],
];
// alternate routes (tested in node): Brannoch by pass is above; persuasion-only gate; riddles instead of the lullaby; toffee warmed by the Ember.
export const ALT_ROUTE_RIDDLES = [['talk', 'grumbleroot', 'trade', 'riddle', 'right', 'right', 'right', 'bye']];

// The finale + epilogue scripts live here so the logic test can run them too.
export async function FINALE(G) {
  G.fx('finale'); G.sfx('win');
  await G.n(T("For a heartbeat, nothing. Then the Crown begins to SING: one clear note, then three, then a chord that rolls out over the sea like sunrise.", "For a moment, nothing. Then the Crown begins to sing — one note, then three, then a great golden chord that rolls out over the sea."));
  await G.say('corvin', "Oh. Oh my. That's... that's the shiniest thing I've ever seen.");
  await G.say('corvin', "I suppose you'll be taking it home now. To the party. That I'm not invited to.");
  const pick = await G.choose([{ id: 'invite', t: 'Come to the coronation, Corvin. As my guest.' }, { id: 'return', t: 'First, you return everything you stole.' }], { noBye: true });
  if (pick === 'invite') {
    await G.h('Come to the coronation, Corvin. As my guest.');
    await G.say('corvin', "Me? A GUEST? With a chair and everything?");
    await G.h("And a spoon. A shiny one.");
    await G.say('corvin', "I'll give it all back. Every spoon, every bell, every thimble. I'll even return the well handle!");
    await G.deed('invite');
  } else {
    await G.h('First, you return everything you stole.');
    await G.say('corvin', "...Fine. Every spoon. Every bell. Even the well handle. Happy?");
    await G.h("Then come to the coronation and say sorry in person.");
    await G.say('corvin', "...To the PARTY? Me? Well. If you insist.");
  }
  G.set('finaleDone');
  await G.epilogue();
}
export async function EPILOGUE(G) {
  await G.n(T("And so, on Midsummer morning, the Crown of Wrenfold sang again.", "And so, on Midsummer morning, the Crown of Wrenfold sang again."));
  for (const [it, deed, who, line] of [['thimble', 'thimble', 'mabel', "My thimble! Oh, you darling."], ['bell', 'bell', 'hobb', "...Gerald's bell. Thanks."], ['watch', 'watch', 'marlow', "My watch! Thank you, truly."], ['hairpin', 'hairpin', 'queen', "My pearl hairpin! Wherever did you find it?"]]) {
    if (G.has(it)) { G.take(it); await G.say(who, line); await G.deed(deed); }
  }
  await G.say('queen', "{name}, Royal Tinker of Wrenfold: the kingdom owes you its heart. Three of them, in fact.");
  await G.say('mabel', "And the bread's never been better!");
  await G.say('hobb', "Hm.");
  await G.say('hobb', "...Good.");
  await G.say('brannoch', "I never doubted you for a second. Well. Perhaps one second.");
  await G.say('granny', "What? Is it over? Lovely! Who wants soup?");
  await G.say('fennick', "Commemorative mirrors, get your commemorative mirrors! Shows the face of a hero — yours!");
  await G.say('marlow', "The light's burned bright every night since. The gulls are furious.");
  await G.say('corvin', "Is a party always this SHINY? I may cry. I'm crying. Don't look.");
  await G.n(T("Corvin returned every spoon, bell and thimble he had ever taken, and became the kingdom's first official Keeper of Lost Things. He is very good at it. Suspiciously good.", "Corvin returned everything he had taken, and became the kingdom's first Keeper of Lost Things. He was wonderful at it."));
  await G.n(T("Grumbleroot sent an acorn, which was either a gift or a threat. And {name} went back to fixing things, which, after all, is what tinkers do best.", "Grumbleroot sent an acorn as a gift. And {name} went back to fixing things — which is what tinkers do best."));
  G.set('epilogueDone');
  await G.theEnd();
}
