import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { TourService } from './tour.service';

/** Marks an element as a tour target: `[appTourStep]="'risk-new'"`. */
@Directive({ selector: '[appTourStep]' })
export class TourStepDirective {
  private readonly tours = inject(TourService);
  private readonly el: ElementRef<HTMLElement> = inject(ElementRef);

  readonly appTourStep = input.required<string>();

  constructor() {
    effect((onCleanup) => {
      const key = this.appTourStep();
      const el = this.el.nativeElement as HTMLElement;
      this.tours.register(key, el);
      onCleanup(() => this.tours.unregister(key, el));
    });
  }
}
