import { createImpactBuffers } from '@/audio/hammerSounds';
import { createWindowSounds } from '@/audio/windowSounds';
import { HammerNailVignette, WORKSHOP } from './HammerNailVignette';
import { WindowCleaningVignette, GLASS } from './WindowCleaningVignette';
import type { VignetteDefinition } from './Vignette';
import { BugShoeVignette, GARDEN } from './BugShoeVignette';
import { createBugSounds } from '@/audio/bugSounds';
import { SawTimberVignette, TIMBER } from './SawTimberVignette';
import { createSawSounds } from '@/audio/sawSounds';
import { TomatoKnifeVignette, KITCHEN } from './TomatoKnifeVignette';
import { createTomatoSounds } from '@/audio/tomatoSounds';
import { BicepCurlVignette, GYM } from './BicepCurlVignette';
import { createCurlSounds } from '@/audio/curlSounds';
import { CucumberKnifeVignette, CRISP } from './CucumberKnifeVignette';
import { createCucumberSounds } from '@/audio/cucumberSounds';
import { BananaKnifeVignette, BREAKFAST } from './BananaKnifeVignette';
import { createBananaSounds } from '@/audio/bananaSounds';
import { ScissorsPaperVignette, CRAFT } from './ScissorsPaperVignette';
import { createPaperSounds } from '@/audio/paperSounds';
import { PAPER_MOTION } from './paperMotion';
import { EggCrackingVignette } from './EggCrackingVignette';
import { BubbleWrapVignette } from './BubbleWrapVignette';
import { LightSwitchVignette } from './LightSwitchVignette';
import { DoorbellVignette } from './DoorbellVignette';
import { createHouseholdSounds } from '@/audio/householdSounds';
import { HOME_INK } from './householdArt';
import { HOUSEHOLD_REVEAL_SEC } from './householdMotion';
import { PaintRollerVignette } from './PaintRollerVignette';
import { HotelBellVignette } from './HotelBellVignette';
import { BalloonPumpVignette } from './BalloonPumpVignette';
import { StaplerVignette } from './StaplerVignette';
import { createErrandSounds } from '@/audio/errandSounds';
import { ERRAND_REVEAL_SEC } from './errandMotion';
import { FishermanVignette, LAKESIDE } from './FishermanVignette';
import { createFishingSounds } from '@/audio/fishingSounds';
import { FISHING_MOTION, FISHING_REVEAL_SEC } from './fishingMotion';
import { DjScratchVignette, BOOTH } from './DjScratchVignette';
import { createScratchSounds } from '@/audio/scratchSounds';
import { SCRATCH_REVEAL_SEC } from './scratchMotion';
import { TromboneVignette, ROOFTOP } from './TromboneVignette';
import { createTromboneSounds } from '@/audio/tromboneSounds';
import { TROMBONE_REVEAL_SEC } from './tromboneMotion';
import { ClappingHandsVignette, ROOM } from './ClappingHandsVignette';
import { createClapSounds } from '@/audio/clapSounds';
import { CLAP_MOTION, CLAP_REVEAL_SEC } from './clapMotion';
import { SnareDrumVignette } from './SnareDrumVignette';
import { BongosVignette } from './BongosVignette';
import { SlushyVignette } from './SlushyVignette';
import { AppleVignette } from './AppleVignette';
import { APPLE_LOOKS } from './appleLooks';
import { createTreatSounds } from '@/audio/treatSounds';
import { TREAT_REVEAL_SEC } from './treatMotion';
import { TREAT_INK } from './treatArt';

export const VIGNETTES: readonly VignetteDefinition[] = [
  {
    id: 'hammer', title: 'Hammer & nail', intro: 'Make it\nstick.', ink: WORKSHOP.ink,
    success: ['Nicely\ndone.', 'Right on the head.'], rough: ['It has\ncharacter.', 'Perfectly imperfect.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new HammerNailVignette(scene, false, lap),
    sounds: context => { const b = createImpactBuffers(context); return { action: b.hit, success: b.flush, rough: b.bent, scrape: b.skid, judder: b.dead }; },
  },
  {
    id: 'window', title: 'Window cleaning', intro: 'A clearer\nview.', ink: GLASS.ink,
    success: ['Looking\nsharp.', 'Nothing between you and the sky.'], rough: ['Almost\ninvisible.', 'One little souvenir.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new WindowCleaningVignette(scene, lap), sounds: createWindowSounds,
  },
  {
    id: 'bug', title: 'Bug & shoe', intro: 'Watch your\nstep.', ink: GARDEN.ink,
    success: ['New\npassenger.', 'Small feet. Big personality.'], rough: ['Missed\nme.', 'A very determined little dot.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new BugShoeVignette(scene, lap), sounds: createBugSounds,
  },
  {
    id: 'saw', title: 'Saw & timber', intro: 'Follow\nthe line.', ink: TIMBER.ink,
    success: ['Two planks\nnow.', 'Straight through, first time.'], rough: ['Nearly\nthrough.', 'It let go in its own time.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new SawTimberVignette(scene, lap), sounds: createSawSounds,
  },
  {
    id: 'tomato', title: 'Knife & tomato', intro: 'Mind your\nfingers.', ink: KITCHEN.ink,
    success: ['Thin and\neven.', 'Every slice the same.'], rough: ['Roughly\nchopped.', 'Rustic. We are calling it rustic.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new TomatoKnifeVignette(scene, lap), sounds: createTomatoSounds,
  },
  // New acts are appended so the introductory levels retain their order.
  {
    id: 'curl', title: 'Bicep curl', intro: 'One more\nrep.', ink: GYM.ink,
    success: ['Solid\nset.', 'Every rep to the top.'], rough: ['Form\ncheck.', 'The weight had other ideas.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new BicepCurlVignette(scene, lap), sounds: createCurlSounds,
  },
  // Appended, not inserted: levels 1 to 6 keep the vignettes they had.
  {
    id: 'cucumber', title: 'Knife & cucumber', intro: 'Keep it\ncrisp.', ink: CRISP.ink,
    success: ['Clean\nrounds.', 'Every disc the same.'], rough: ['A bit\nragged.', 'Still a salad. Just rustic.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new CucumberKnifeVignette(scene, lap), sounds: createCucumberSounds,
  },
  {
    id: 'banana', title: 'Knife & banana', intro: 'Easy does\nit.', ink: BREAKFAST.ink,
    success: ['Even\ncoins.', 'Breakfast, sorted.'], rough: ['A bit\nmushy.', 'Call it banana bread.'],
    endingSec: 1.35, successAccuracy: 70,
    create: (scene, lap) => new BananaKnifeVignette(scene, lap), sounds: createBananaSounds,
  },
  {
    id: 'paper', title: 'Scissors & paper', intro: 'A little\npaper magic.', ink: CRAFT.ink,
    success: ['Made with\na snip.', 'A little paper magic.'],
    partial: { minAccuracy: PAPER_MOTION.partialAccuracy, copy: ['Almost\na masterpiece.', 'One edge needs another snip.'] },
    rough: ['A fresh\nsheet?', 'A few snips went astray.'],
    endingSec: 2, endingHoldBeats: 5, successAccuracy: PAPER_MOTION.successAccuracy,
    create: (scene, lap) => new ScissorsPaperVignette(scene, lap), sounds: createPaperSounds,
  },
  {
    id: 'egg', title: 'Egg cracking', intro: 'A cracking\nlittle rhythm.', ink: HOME_INK,
    success: ['Sunny\nside up.', 'One clean crack.'], rough: ['A little\nshell-shocked.', 'The bowl can wait.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new EggCrackingVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'egg'),
  },
  {
    id: 'bubble', title: 'Bubble wrap', intro: 'One more\npop.', ink: HOME_INK,
    success: ['Pop, pop…\nperfect.', 'Could do this all day.'], rough: ['A few\nleft over.', 'Saved for later.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new BubbleWrapVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'bubble'),
  },
  {
    id: 'light', title: 'Light switch', intro: 'Set the\nmood.', ink: HOME_INK,
    success: ['Oh,\nhello there.', 'Quite a room for one little switch.'], rough: ['Lights\nout.', 'A little more rhythm next time.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new LightSwitchVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'light'),
  },
  {
    id: 'doorbell', title: 'Doorbell', intro: 'Anyone\nhome?', ink: HOME_INK,
    success: ['Come\non in.', 'Someone was expecting you.'], rough: ['Nobody\nhome.', 'Try that rhythm again.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new DoorbellVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'doorbell'),
  },
  // Acts 14 to 17, appended at request: the first thirteen levels keep their acts.
  {
    id: 'roller', title: 'Paint roller', intro: 'Roll it\non.', ink: HOME_INK,
    success: ['Bold as\nbrass.', 'One wall, one picture.'], rough: ['A little\npatchy.', 'It will want a second coat.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new PaintRollerVignette(scene, lap), sounds: context => createErrandSounds(context, 'roller'),
  },
  {
    id: 'bell', title: 'Hotel bell', intro: 'Ring for\nservice.', ink: HOME_INK,
    success: ['Right\naway.', 'Someone heard you.'], rough: ['Nobody\nabout.', 'Perhaps try the bell again.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new HotelBellVignette(scene, lap), sounds: context => createErrandSounds(context, 'bell'),
  },
  {
    id: 'balloon', title: 'Balloon pump', intro: 'Pump it\nup.', ink: HOME_INK,
    success: ['Up and\naway.', 'Tied off and floating.'], rough: ['Oh.\nPop.', 'That one had a weak spot.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new BalloonPumpVignette(scene, lap), sounds: context => createErrandSounds(context, 'balloon'),
  },
  {
    id: 'stapler', title: 'Stapler', intro: 'Bind it\nup.', ink: HOME_INK,
    success: ['Neatly\nbound.', 'One pile, one piece.'], rough: ['Jammed\nagain.', 'A pile of loose ends.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new StaplerVignette(scene, lap), sounds: context => createErrandSounds(context, 'stapler'),
  },
  // Act 18, appended at request: levels 1 to 17 keep their acts.
  {
    id: 'fisherman', title: 'Fisherman', intro: 'Something\'s\nbiting.', ink: LAKESIDE.ink,
    success: ['What a\ncatch.', 'Dinner, and a story to go with it.'],
    partial: { minAccuracy: FISHING_MOTION.partialAccuracy, copy: ['A little\none.', 'Back it goes. Give it a year.'] },
    rough: ['Oh.\nThat.', 'The lake keeps its fish.'],
    endingSec: FISHING_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: FISHING_MOTION.successAccuracy,
    create: (scene, lap) => new FishermanVignette(scene, lap), sounds: createFishingSounds,
  },
  // Act 19, appended at request: levels 1 to 18 keep their acts.
  {
    id: 'scratch', title: 'DJ scratch', intro: 'Bring the\nnoise.', ink: BOOTH.ink,
    success: ['Hands\nup.', 'The whole room heard that.'], rough: ['Needle\nskip.', 'The record has opinions.'],
    endingSec: SCRATCH_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new DjScratchVignette(scene, lap), sounds: createScratchSounds,
  },
  // Act 20, appended at request: levels 1 to 19 keep their acts.
  {
    id: 'trombone', title: 'Trombone', intro: 'Play it\nloud.', ink: ROOFTOP.ink,
    success: ['Bravo,\nmaestro.', 'The neighbours are applauding.'], rough: ['Wah\nwah.', 'The neighbours have closed the shutters.'],
    endingSec: TROMBONE_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70, gridAction: true,
    create: (scene, lap) => new TromboneVignette(scene, lap), sounds: createTromboneSounds,
  },
  // Act 21, appended at request: levels 1 to 20 keep their acts.
  {
    id: 'clap', title: 'Clapping hands', intro: 'Give them\na hand.', ink: ROOM.ink,
    success: ['Take a\nbow.', 'The whole room is clapping.'],
    partial: { minAccuracy: CLAP_MOTION.partialAccuracy, copy: ['A polite\nripple.', 'A few of them are clapping.'] },
    rough: ['Search\nme.', 'Nobody is quite sure what that was.'],
    endingSec: CLAP_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: CLAP_MOTION.successAccuracy,
    create: (scene, lap) => new ClappingHandsVignette(scene, lap), sounds: createClapSounds,
  },
  {
    id: 'snare', title: 'Snare drum', intro: 'Let it\nroll.', ink: TREAT_INK,
    success: ['Drumroll,\nplease.', 'A little flourish. A big finish.'], rough: ['Dropped\nthe sticks.', 'They were getting carried away.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new SnareDrumVignette(scene, lap), sounds: context => createTreatSounds(context, 'snare'),
  },
  {
    id: 'bongos', title: 'Bongos', intro: 'Find your\ngroove.', ink: TREAT_INK,
    success: ['In the\ngroove.', 'Two drums. One lovely groove.'], rough: ['Bongo\n…oh no.', 'The groove took a little detour.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new BongosVignette(scene, lap), sounds: context => createTreatSounds(context, 'bongos'),
  },
  {
    id: 'slushy', title: 'Slushy', intro: 'Sip to\nthe beat.', ink: TREAT_INK,
    success: ['Every\nlast drop.', 'Cool to the very bottom.'], rough: ['Brain\nfreeze!', 'A little too cool for comfort.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new SlushyVignette(scene, lap), sounds: context => createTreatSounds(context, 'slushy'),
  },
  {
    id: 'apple', title: 'Apple', intro: 'A little\ncrunch.', ink: TREAT_INK,
    success: ['To the\ncore.', 'That hit the sweet spot.'], rough: ['Oh,\nhello.', 'Someone else ordered the apple.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: (scene, lap) => new AppleVignette(scene, lap), sounds: context => createTreatSounds(context, 'apple'),
    // A pear, a peach and a donut follow the apple, and each is called what it is.
    looks: APPLE_LOOKS.map(look => look.copy),
  },
];
