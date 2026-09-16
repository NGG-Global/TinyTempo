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

export const VIGNETTES: readonly VignetteDefinition[] = [
  {
    id: 'hammer', title: 'Hammer & nail', intro: 'Make it\nstick.', ink: WORKSHOP.ink,
    success: ['Nicely\ndone.', 'Right on the head.'], rough: ['It has\ncharacter.', 'Perfectly imperfect.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new HammerNailVignette(scene),
    sounds: context => { const b = createImpactBuffers(context); return { action: b.hit, success: b.flush, rough: b.bent, scrape: b.skid, judder: b.dead }; },
  },
  {
    id: 'window', title: 'Window cleaning', intro: 'A clearer\nview.', ink: GLASS.ink,
    success: ['Looking\nsharp.', 'Nothing between you and the sky.'], rough: ['Almost\ninvisible.', 'One little souvenir.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new WindowCleaningVignette(scene), sounds: createWindowSounds,
  },
  {
    id: 'bug', title: 'Bug & shoe', intro: 'Watch your\nstep.', ink: GARDEN.ink,
    success: ['New\npassenger.', 'Small feet. Big personality.'], rough: ['Missed\nme.', 'A very determined little dot.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new BugShoeVignette(scene), sounds: createBugSounds,
  },
  {
    id: 'saw', title: 'Saw & timber', intro: 'Follow\nthe line.', ink: TIMBER.ink,
    success: ['Two planks\nnow.', 'Straight through, first time.'], rough: ['Nearly\nthrough.', 'It let go in its own time.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new SawTimberVignette(scene), sounds: createSawSounds,
  },
  {
    id: 'tomato', title: 'Knife & tomato', intro: 'Mind your\nfingers.', ink: KITCHEN.ink,
    success: ['Thin and\neven.', 'Every slice the same.'], rough: ['Roughly\nchopped.', 'Rustic. We are calling it rustic.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new TomatoKnifeVignette(scene), sounds: createTomatoSounds,
  },
  // New acts are appended so the introductory levels retain their order.
  {
    id: 'curl', title: 'Bicep curl', intro: 'One more\nrep.', ink: GYM.ink,
    success: ['Solid\nset.', 'Every rep to the top.'], rough: ['Form\ncheck.', 'The weight had other ideas.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new BicepCurlVignette(scene), sounds: createCurlSounds,
  },
  // Appended, not inserted: levels 1 to 6 keep the vignettes they had.
  {
    id: 'cucumber', title: 'Knife & cucumber', intro: 'Keep it\ncrisp.', ink: CRISP.ink,
    success: ['Clean\nrounds.', 'Every disc the same.'], rough: ['A bit\nragged.', 'Still a salad. Just rustic.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new CucumberKnifeVignette(scene), sounds: createCucumberSounds,
  },
  {
    id: 'banana', title: 'Knife & banana', intro: 'Easy does\nit.', ink: BREAKFAST.ink,
    success: ['Even\ncoins.', 'Breakfast, sorted.'], rough: ['A bit\nmushy.', 'Call it banana bread.'],
    endingSec: 1.35, successAccuracy: 70,
    create: scene => new BananaKnifeVignette(scene), sounds: createBananaSounds,
  },
  {
    id: 'paper', title: 'Scissors & paper', intro: 'A little\npaper magic.', ink: CRAFT.ink,
    success: ['Made with\na snip.', 'A little paper magic.'],
    partial: { minAccuracy: PAPER_MOTION.partialAccuracy, copy: ['Almost\na masterpiece.', 'One edge needs another snip.'] },
    rough: ['A fresh\nsheet?', 'A few snips went astray.'],
    endingSec: 2, endingHoldBeats: 5, successAccuracy: PAPER_MOTION.successAccuracy,
    create: scene => new ScissorsPaperVignette(scene), sounds: createPaperSounds,
  },
  {
    id: 'egg', title: 'Egg cracking', intro: 'A cracking\nlittle rhythm.', ink: HOME_INK,
    success: ['Sunny\nside up.', 'One clean crack.'], rough: ['A little\nshell-shocked.', 'The bowl can wait.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: scene => new EggCrackingVignette(scene), sounds: context => createHouseholdSounds(context, 'egg'),
  },
  {
    id: 'bubble', title: 'Bubble wrap', intro: 'One more\npop.', ink: HOME_INK,
    success: ['Pop, pop…\nperfect.', 'Could do this all day.'], rough: ['A few\nleft over.', 'Saved for later.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: scene => new BubbleWrapVignette(scene), sounds: context => createHouseholdSounds(context, 'bubble'),
  },
  {
    id: 'light', title: 'Light switch', intro: 'Set the\nmood.', ink: HOME_INK,
    success: ['Oh,\nhello there.', 'Quite a room for one little switch.'], rough: ['Lights\nout.', 'A little more rhythm next time.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: scene => new LightSwitchVignette(scene), sounds: context => createHouseholdSounds(context, 'light'),
  },
  {
    id: 'doorbell', title: 'Doorbell', intro: 'Anyone\nhome?', ink: HOME_INK,
    success: ['Come\non in.', 'Someone was expecting you.'], rough: ['Nobody\nhome.', 'Try that rhythm again.'],
    endingSec: HOUSEHOLD_REVEAL_SEC, endingHoldBeats: 5, successAccuracy: 70,
    create: scene => new DoorbellVignette(scene), sounds: context => createHouseholdSounds(context, 'doorbell'),
  },
];
