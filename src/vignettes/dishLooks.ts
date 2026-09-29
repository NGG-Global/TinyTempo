import type { LookCopy } from './Vignette';
import { lookAt } from './lookAt';

export interface DishLook {
  readonly id: 'plate' | 'glass' | 'cutlery';
  readonly rim: number;
  readonly copy: LookCopy;
  readonly spots: readonly (readonly [number, number])[];
}

export const DISH_LOOKS: readonly DishLook[] = [
  { id: 'plate', rim: 0x478c9f, copy: {}, spots: [[-70, -90], [30, -95], [95, -25], [25, 35], [-65, 45], [-110, -20], [0, -25]] },
  { id: 'glass', rim: 0x69a7af,
    copy: { title: 'Wash the glass', intro: 'Give it\na polish.', success: ['Crystal\nclear.', 'A glass worth raising.'], rough: ['Still\nsmudged.', 'Another little scrub.'] },
    spots: [[-65, -110], [15, -105], [60, -40], [35, 50], [-35, 65], [-55, -5], [0, -35]] },
  { id: 'cutlery', rim: 0x708d9b,
    copy: { title: 'Wash the cutlery', intro: 'Scrub to\na shine.', success: ['A shining\nset.', 'Ready for the table.'], rough: ['Still\nsticky.', 'A little sauce left over.'] },
    spots: [[-110, -100], [-110, 15], [0, -110], [0, 15], [110, -100], [110, 15], [110, 85]] },
];
export const dishLook = (lap: number): DishLook => lookAt(DISH_LOOKS, lap);
