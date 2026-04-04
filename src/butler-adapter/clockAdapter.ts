import { nowIso } from '../util/time.js';
import type { ClockPort } from '../core/butler/ports/clock.js';

export const systemClock: ClockPort = {
  now: () => Date.now(),
  isoNow: () => nowIso(),
};
