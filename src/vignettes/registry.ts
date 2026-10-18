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
import { FISHING_REVEAL_SEC } from './fishingMotion';
import { DjScratchVignette, BOOTH } from './DjScratchVignette';
import { createScratchSounds } from '@/audio/scratchSounds';
import { SCRATCH_REVEAL_SEC } from './scratchMotion';
import { TromboneVignette, ROOFTOP } from './TromboneVignette';
import { createTromboneSounds } from '@/audio/tromboneSounds';
import { TROMBONE_REVEAL_SEC } from './tromboneMotion';
import { ClappingHandsVignette, ROOM } from './ClappingHandsVignette';
import { createClapSounds } from '@/audio/clapSounds';
import { CLAP_REVEAL_SEC } from './clapMotion';
import { SnareDrumVignette } from './SnareDrumVignette';
import { BongosVignette } from './BongosVignette';
import { SlushyVignette } from './SlushyVignette';
import { AppleVignette } from './AppleVignette';
import { APPLE_LOOKS } from './appleLooks';
import { createTreatSounds } from '@/audio/treatSounds';
import { TREAT_REVEAL_SEC } from './treatMotion';
import { TREAT_INK } from './treatArt';
import { BarberVignette, BARBER_INK } from './BarberVignette';
import { createBarberSounds } from '@/audio/barberSounds';
import { BARBER_REVEAL_SEC } from './barberMotion';
import { PopcornVignette, POPCORN_INK } from './PopcornVignette';
import { createPopcornSounds } from '@/audio/popcornSounds';
import { POPCORN_REVEAL_SEC } from './popcornMotion';
import { ToothbrushVignette, BRUSH_INK } from './ToothbrushVignette';
import { createBrushSounds } from '@/audio/brushSounds';
import { BRUSH_REVEAL_SEC } from './brushMotion';
import { PaintbrushVignette } from './PaintbrushVignette';
import { createCanvasSounds } from '@/audio/canvasSounds';
import { CANVAS_REVEAL_SEC } from './canvasMotion';
import { CANVAS_LOOKS } from './canvasLooks';
import { NoseBlowingVignette } from './NoseBlowingVignette';
import { DishCleaningVignette } from './DishCleaningVignette';
import { DISH_LOOKS } from './dishLooks';
import { createCleaningSounds } from '@/audio/cleaningSounds';
import { CLEANING_REVEAL_SEC } from './cleaningMotion';
import { ProspectorVignette } from './ProspectorVignette';
import { PROSPECTOR_LOOKS } from './prospectorLooks';
import { PROSPECTOR_REVEAL_SEC } from './prospectorMotion';
import { createProspectorSounds } from '@/audio/prospectorSounds';
import { CameraVignette } from './CameraVignette';
import { CAMERA_LOOKS } from './cameraLooks';
import { CAMERA_REVEAL_SEC } from './cameraMotion';
import { createCameraSounds } from '@/audio/cameraSounds';
import { IceCreamVignette } from './IceCreamVignette';
import { ICE_CREAM_LOOKS } from './iceCreamLooks';
import { ICE_CREAM_REVEAL_SEC } from './iceCreamMotion';
import { createIceCreamSounds } from '@/audio/iceCreamSounds';
import { FrogVignette } from './FrogVignette';
import { FROG_REVEAL_SEC } from './frogMotion';
import { createFrogSounds } from '@/audio/frogSounds';
import { GlassesVignette } from './GlassesVignette';
import { GLASS_REVEAL_SEC } from './glassesMotion';
import { createGlassesSounds } from '@/audio/glassesSounds';

export const VIGNETTES: readonly VignetteDefinition[] = [
  {
    id: 'hammer', title: 'Hammer & nail', intro: 'Make it\nstick.', ink: WORKSHOP.ink,
    success: ['Nicely\ndone.', 'Right on the head.'], rough: ['It has\ncharacter.', 'Perfectly imperfect.'],
    endingSec: 1.35,
    create: (scene, lap) => new HammerNailVignette(scene, false, lap),
    sounds: context => { const b = createImpactBuffers(context); return { action: b.hit, success: b.flush, rough: b.bent, scrape: b.skid, judder: b.dead }; },
  },
  {
    id: 'window', title: 'Window cleaning', intro: 'A clearer\nview.', ink: GLASS.ink,
    success: ['Looking\nsharp.', 'Nothing between you and the sky.'], rough: ['Almost\ninvisible.', 'One little souvenir.'],
    endingSec: 1.35,
    create: (scene, lap) => new WindowCleaningVignette(scene, lap), sounds: createWindowSounds,
  },
  {
    id: 'bug', title: 'Bug & shoe', intro: 'Watch your\nstep.', ink: GARDEN.ink,
    success: ['New\npassenger.', 'Small feet. Big personality.'], rough: ['Missed\nme.', 'A very determined little dot.'],
    endingSec: 1.35,
    create: (scene, lap) => new BugShoeVignette(scene, lap), sounds: createBugSounds,
  },
  {
    id: 'saw', title: 'Saw & timber', intro: 'Follow\nthe line.', ink: TIMBER.ink,
    success: ['Two planks\nnow.', 'Straight through, first time.'], rough: ['Nearly\nthrough.', 'It let go in its own time.'],
    endingSec: 1.35,
    create: (scene, lap) => new SawTimberVignette(scene, lap), sounds: createSawSounds,
  },
  {
    id: 'tomato', title: 'Knife & tomato', intro: 'Mind your\nfingers.', ink: KITCHEN.ink,
    success: ['Thin and\neven.', 'Every slice the same.'], rough: ['Roughly\nchopped.', 'Rustic. We are calling it rustic.'],
    endingSec: 1.35,
    create: (scene, lap) => new TomatoKnifeVignette(scene, lap), sounds: createTomatoSounds,
  },
  // New acts are appended so the introductory levels retain their order.
  {
    id: 'curl', title: 'Bicep curl', intro: 'One more\nrep.', ink: GYM.ink,
    success: ['Solid\nset.', 'Every rep to the top.'], rough: ['Form\ncheck.', 'The weight had other ideas.'],
    endingSec: 1.35,
    create: (scene, lap) => new BicepCurlVignette(scene, lap), sounds: createCurlSounds,
  },
  // Appended, not inserted: levels 1 to 6 keep the vignettes they had.
  {
    id: 'cucumber', title: 'Knife & cucumber', intro: 'Keep it\ncrisp.', ink: CRISP.ink,
    success: ['Clean\nrounds.', 'Every disc the same.'], rough: ['A bit\nragged.', 'Still a salad. Just rustic.'],
    endingSec: 1.35,
    create: (scene, lap) => new CucumberKnifeVignette(scene, lap), sounds: createCucumberSounds,
  },
  {
    id: 'banana', title: 'Knife & banana', intro: 'Easy does\nit.', ink: BREAKFAST.ink,
    success: ['Even\ncoins.', 'Breakfast, sorted.'], rough: ['A bit\nmushy.', 'Call it banana bread.'],
    endingSec: 1.35,
    create: (scene, lap) => new BananaKnifeVignette(scene, lap), sounds: createBananaSounds,
  },
  {
    id: 'paper', title: 'Scissors & paper', intro: 'A little\npaper magic.', ink: CRAFT.ink,
    success: ['Made with\na snip.', 'A little paper magic.'],
    partial: { copy: ['Almost\na masterpiece.', 'One edge needs another snip.'] },
    rough: ['A fresh\nsheet?', 'A few snips went astray.'],
    endingSec: 2, endingHoldBeats: 5,
    create: (scene, lap) => new ScissorsPaperVignette(scene, lap), sounds: createPaperSounds,
  },
  {
    id: 'egg', title: 'Egg cracking', intro: 'A cracking\nlittle rhythm.', ink: HOME_INK,
    success: ['Sunny\nside up.', 'One clean crack.'], rough: ['A little\nshell-shocked.', 'The bowl can wait.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new EggCrackingVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'egg'),
  },
  {
    id: 'bubble', title: 'Bubble wrap', intro: 'One more\npop.', ink: HOME_INK,
    success: ['Pop, pop…\nperfect.', 'Could do this all day.'], rough: ['A few\nleft over.', 'Saved for later.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new BubbleWrapVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'bubble'),
  },
  {
    id: 'light', title: 'Light switch', intro: 'Set the\nmood.', ink: HOME_INK,
    success: ['Oh,\nhello there.', 'Quite a room for one little switch.'], rough: ['Lights\nout.', 'A little more rhythm next time.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new LightSwitchVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'light'),
  },
  {
    id: 'doorbell', title: 'Doorbell', intro: 'Anyone\nhome?', ink: HOME_INK,
    success: ['Come\non in.', 'Someone was expecting you.'], rough: ['Nobody\nhome.', 'Try that rhythm again.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new DoorbellVignette(scene, lap), sounds: context => createHouseholdSounds(context, 'doorbell'),
  },
  // Acts 14 to 17, appended at request: the first thirteen levels keep their acts.
  {
    id: 'roller', title: 'Paint roller', intro: 'Roll it\non.', ink: HOME_INK,
    success: ['Bold as\nbrass.', 'One wall, one picture.'], rough: ['A little\npatchy.', 'It will want a second coat.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new PaintRollerVignette(scene, lap), sounds: context => createErrandSounds(context, 'roller'),
  },
  {
    id: 'bell', title: 'Hotel bell', intro: 'Ring for\nservice.', ink: HOME_INK,
    success: ['Right\naway.', 'Someone heard you.'], rough: ['Nobody\nabout.', 'Perhaps try the bell again.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new HotelBellVignette(scene, lap), sounds: context => createErrandSounds(context, 'bell'),
  },
  {
    id: 'balloon', title: 'Balloon pump', intro: 'Pump it\nup.', ink: HOME_INK,
    success: ['Up and\naway.', 'Tied off and floating.'], rough: ['Oh.\nPop.', 'That one had a weak spot.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new BalloonPumpVignette(scene, lap), sounds: context => createErrandSounds(context, 'balloon'),
  },
  {
    id: 'stapler', title: 'Stapler', intro: 'Bind it\nup.', ink: HOME_INK,
    success: ['Neatly\nbound.', 'One pile, one piece.'], rough: ['Jammed\nagain.', 'A pile of loose ends.'],
    endingSec: ERRAND_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new StaplerVignette(scene, lap), sounds: context => createErrandSounds(context, 'stapler'),
  },
  // Act 18, appended at request: levels 1 to 17 keep their acts.
  {
    id: 'fisherman', title: 'Fisherman', intro: 'Something\'s\nbiting.', ink: LAKESIDE.ink,
    success: ['What a\ncatch.', 'Dinner, and a story to go with it.'],
    partial: { copy: ['A little\none.', 'Back it goes. Give it a year.'] },
    rough: ['Oh.\nThat.', 'The lake keeps its fish.'],
    endingSec: FISHING_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new FishermanVignette(scene, lap), sounds: createFishingSounds,
  },
  // Act 19, appended at request: levels 1 to 18 keep their acts.
  {
    id: 'scratch', title: 'DJ scratch', intro: 'Bring the\nnoise.', ink: BOOTH.ink,
    success: ['Hands\nup.', 'The whole room heard that.'], rough: ['Needle\nskip.', 'The record has opinions.'],
    endingSec: SCRATCH_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new DjScratchVignette(scene, lap), sounds: createScratchSounds,
  },
  // Act 20, appended at request: levels 1 to 19 keep their acts.
  {
    id: 'trombone', title: 'Trombone', intro: 'Play it\nloud.', ink: ROOFTOP.ink,
    success: ['Bravo,\nmaestro.', 'The neighbours are applauding.'], rough: ['Wah\nwah.', 'The neighbours have closed the shutters.'],
    endingSec: TROMBONE_REVEAL_SEC, endingHoldBeats: 5, gridAction: true,
    create: (scene, lap) => new TromboneVignette(scene, lap), sounds: createTromboneSounds,
  },
  // Act 21, appended at request: levels 1 to 20 keep their acts.
  {
    id: 'clap', title: 'Clapping hands', intro: 'Give them\na hand.', ink: ROOM.ink,
    success: ['Take a\nbow.', 'The whole room is clapping.'],
    partial: { copy: ['A polite\nripple.', 'A few of them are clapping.'] },
    rough: ['Search\nme.', 'Nobody is quite sure what that was.'],
    endingSec: CLAP_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new ClappingHandsVignette(scene, lap), sounds: createClapSounds,
  },
  {
    id: 'snare', title: 'Snare drum', intro: 'Let it\nroll.', ink: TREAT_INK,
    success: ['Drumroll,\nplease.', 'A little flourish. A big finish.'], rough: ['Dropped\nthe sticks.', 'They were getting carried away.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new SnareDrumVignette(scene, lap), sounds: context => createTreatSounds(context, 'snare'),
  },
  {
    id: 'bongos', title: 'Bongos', intro: 'Find your\ngroove.', ink: TREAT_INK,
    success: ['In the\ngroove.', 'Two drums. One lovely groove.'], rough: ['Bongo\n…oh no.', 'The groove took a little detour.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new BongosVignette(scene, lap), sounds: context => createTreatSounds(context, 'bongos'),
  },
  {
    id: 'slushy', title: 'Slushy', intro: 'Sip to\nthe beat.', ink: TREAT_INK,
    success: ['Every\nlast drop.', 'Cool to the very bottom.'], rough: ['Brain\nfreeze!', 'A little too cool for comfort.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new SlushyVignette(scene, lap), sounds: context => createTreatSounds(context, 'slushy'),
  },
  {
    id: 'apple', title: 'Apple', intro: 'A little\ncrunch.', ink: TREAT_INK,
    success: ['To the\ncore.', 'That hit the sweet spot.'], rough: ['Oh,\nhello.', 'Someone else ordered the apple.'],
    endingSec: TREAT_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new AppleVignette(scene, lap), sounds: context => createTreatSounds(context, 'apple'),
    // A pear, a peach and a donut follow the apple, and each is called what it is.
    looks: APPLE_LOOKS.map(look => look.copy),
  },
  // Acts 26 to 28, appended at request. They debut on levels 82, 91 and 92 (`DEBUT_LEVELS`).
  {
    id: 'barber', title: 'Barber', intro: 'Just a\nlittle off.', ink: BARBER_INK,
    success: ['Looking\nsharp.', 'A cut above.'],
    partial: { copy: ['It’ll grow\nback.', 'A little longer on one side.'] },
    rough: ['Hat\nday.', 'We will say no more about it.'],
    endingSec: BARBER_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new BarberVignette(scene, lap), sounds: createBarberSounds,
  },
  {
    id: 'popcorn', title: 'Popcorn', intro: 'Pop to\nthe beat.', ink: POPCORN_INK,
    success: ['Big\nfinish!', 'One last pop, and not a kernel to spare.'], rough: ['Bit\ntoasty.', 'Something in the pan is smoking.'],
    endingSec: POPCORN_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new PopcornVignette(scene, lap), sounds: createPopcornSounds,
  },
  {
    id: 'toothbrush', title: 'Toothbrush', intro: 'Brush up\nthat smile.', ink: BRUSH_INK,
    success: ['Say\ncheese!', 'Every tooth sparkling.'], rough: ['Foaming\nover.', 'A little heavy on the paste.'],
    endingSec: BRUSH_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new ToothbrushVignette(scene, lap), sounds: createBrushSounds,
  },
  // Act 29, appended at request. It debuts on level 101 (`DEBUT_LEVELS`), as do the acts after it, one an area.
  {
    id: 'paintbrush', title: 'Paintbrush', intro: 'Stroke by\nstroke.', ink: HOME_INK,
    success: ['Signed and\ndone.', 'Every stroke where it belongs.'],
    rough: ['A little\nmuddy.', 'The canvas can take another go.'],
    endingSec: CANVAS_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new PaintbrushVignette(scene, lap), sounds: createCanvasSounds,
    looks: CANVAS_LOOKS.map(look => look.copy),
  },
  {
    id: 'nose', title: 'Blow your nose', intro: 'Tissue at\nthe ready.', ink: HOME_INK,
    success: ['All\nclear!', 'Now that feels better.'], rough: ['Still\nsniffling.', 'Better keep that tissue.'],
    endingSec: CLEANING_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new NoseBlowingVignette(scene, lap), sounds: context => createCleaningSounds(context, 'nose'),
  },
  {
    id: 'dish', title: 'Wash the plate', intro: 'A little\nelbow grease.', ink: HOME_INK,
    success: ['Squeaky\nclean.', 'Ready for another helping.'], rough: ['Still\ndirty.', 'A little more elbow grease.'],
    endingSec: CLEANING_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new DishCleaningVignette(scene, lap), sounds: context => createCleaningSounds(context, 'dish'),
    looks: DISH_LOOKS.map(look => look.copy),
  },
  {
    id: 'prospector', title: 'Strike gold', intro: 'Swing for\nthe seam.', ink: HOME_INK,
    success: ['Struck\ngold!', 'A nugget worth the dig.'], rough: ['Nothing\nbut rock.', 'Not a fleck in it.'],
    endingSec: PROSPECTOR_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new ProspectorVignette(scene, lap), sounds: createProspectorSounds,
    looks: PROSPECTOR_LOOKS.map(look => look.copy),
  },
  // Act 33, appended at request. It debuts on level 141 (`DEBUT_LEVELS`).
  {
    id: 'icecream', title: 'Ice cream', intro: 'Lick by\nlick.', ink: HOME_INK,
    success: ['Licked\nclean!', 'Not a drop wasted.'], rough: ['Dropped\nit!', 'The scoop hit the floor.'],
    endingSec: ICE_CREAM_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new IceCreamVignette(scene, lap), sounds: createIceCreamSounds,
    looks: ICE_CREAM_LOOKS.map(look => look.copy),
  },
  // Acts 34 and 35, appended at request. They debut on levels 151 and 161 (`DEBUT_LEVELS`).
  {
    id: 'frog', title: 'Frog & lily pad', intro: 'Ribbit,\nribbit.', ink: HOME_INK,
    success: ['Three-part\nharmony.', 'The whole pond is singing.'], rough: ['Ker-\nsplash!', 'Off the pad and into the pond.'],
    endingSec: FROG_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new FrogVignette(scene, lap), sounds: createFrogSounds,
  },
  {
    id: 'glasses', title: 'Raise a glass', intro: 'Clink,\nclink.', ink: HOME_INK,
    success: ['To good\ntiming!', 'Right on the clink.'], rough: ['Oops.\nSmash.', 'Someone fetch a broom.'],
    endingSec: GLASS_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new GlassesVignette(scene, lap), sounds: createGlassesSounds,
  },
  // Act 36, appended at request: an instant camera, the first act past the original cast. It
  // debuts on level 171 (`DEBUT_LEVELS`), the opener of area 18.
  {
    id: 'camera', title: 'Snapshot', intro: 'Click on\nthe beat.', ink: HOME_INK,
    success: ['Picture\nperfect!', 'One for the album.'], rough: ['Blurry\nshot.', 'Somebody blinked.'],
    endingSec: CAMERA_REVEAL_SEC, endingHoldBeats: 5,
    create: (scene, lap) => new CameraVignette(scene, lap), sounds: createCameraSounds,
    looks: CAMERA_LOOKS.map(look => look.copy),
  },
];

/**
 * The level each act first plays on, in registry order (`vignettes/rotation.ts`): every
 * other level plays the act that has gone longest without a turn.
 *
 * **Every area introduces at least one act until the cast is complete**, on its opener or
 * its first pattern level, the two easiest steps of an area, and never on a finale, which
 * reprises its area. Levels 1–9 open the game one act a level, as it always has. Then the
 * pace is set by Endless Mode: it unlocks on clearing level 100 and draws on the acts a
 * player has met by then (`eligibleActs`), and its rules version 1 pinned that pool as the
 * first twenty-eight acts in registry order (`tests/fixtures/endless-rules-v1.json`). So
 * exactly those twenty-eight are in by level 100 — three in area 2, two in each of areas 3
 * to 10 — and the seven after them follow one an area, to level 161. Acts appended since
 * keep that pace, one an area: the instant camera opens area 18, on level 171.
 *
 * **Appending an act means appending its debut level here**, after the last one: it moves
 * every level from that debut onward, keepsakes included, so it goes past the furthest
 * level players have reached. A debut at or below 100 also changes Endless Mode's pool,
 * which is a new rules version and a new leaderboard.
 */
export const DEBUT_LEVELS: readonly number[] = Object.freeze([
  // Area 1: the first nine acts, one a level. Level 10, the finale, reprises.
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  // Area 2: egg, bubble wrap, light switch.
  11, 12, 13,
  // Areas 3–10: two each, doorbell to toothbrush.
  21, 22, 31, 32, 41, 42, 51, 52, 61, 62, 71, 72, 81, 82, 91, 92,
  // Areas 11–17: one each, paintbrush to the glasses.
  101, 111, 121, 131, 141, 151, 161,
  // Area 18: the instant camera, appended past every level any player had reached.
  171,
]);
