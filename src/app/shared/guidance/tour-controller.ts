import { InjectionToken, Signal } from '@angular/core';
import { TourStep } from '../../core/guidance/guidance.models';

/** What the tour popover needs from the running tour (provided by `TourService`). */
export interface TourController {
  readonly step: Signal<TourStep | null>;
  readonly index: Signal<number>;
  readonly steps: Signal<readonly TourStep[]>;
  readonly isLast: Signal<boolean>;
  next(): void;
  previous(): void;
  end(): void;
}

export const TOUR_CONTROLLER = new InjectionToken<TourController>('TOUR_CONTROLLER');
