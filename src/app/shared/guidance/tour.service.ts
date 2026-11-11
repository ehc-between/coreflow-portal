import {
  ConnectedPosition,
  OverlayRef,
  createFlexibleConnectedPositionStrategy,
  createGlobalPositionStrategy,
  createOverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { GuidanceContentService } from '../../core/guidance/guidance-content.service';
import { TourStep } from '../../core/guidance/guidance.models';
import { TOUR_CONTROLLER, TourController } from './tour-controller';
import { TourPopover } from './tour-popover';

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 12 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -12 },
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 12 },
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -12 },
];

/**
 * Guided tours: steps from the guidance file (`tours.<tour>`), each highlighting the
 * element marked `[appTourStep]="'<target>'"` with a popover in a CDK overlay (no
 * layout edits). Steps whose target is not on the page show centred. Escape or the
 * backdrop ends the tour.
 */
@Injectable({ providedIn: 'root' })
export class TourService implements TourController {
  private readonly content = inject(GuidanceContentService);
  private readonly injector = inject(Injector);

  private readonly targets = new Map<string, HTMLElement>();
  private readonly _steps = signal<readonly TourStep[]>([]);
  private readonly _index = signal(0);

  private overlayRef: OverlayRef | null = null;
  private overlaySubs: Subscription[] = [];
  private highlighted: { el: HTMLElement; outline: string; offset: string } | null = null;
  private restoreFocus: HTMLElement | null = null;

  readonly steps = this._steps.asReadonly();
  readonly index = this._index.asReadonly();
  readonly active = computed(() => this._steps().length > 0);
  readonly step = computed<TourStep | null>(() => this._steps()[this._index()] ?? null);
  readonly isLast = computed(() => this._index() >= this._steps().length - 1);

  /** Called by `TourStepDirective`. */
  register(key: string, el: HTMLElement): void {
    this.targets.set(key, el);
  }

  unregister(key: string, el: HTMLElement): void {
    if (this.targets.get(key) === el) {
      this.targets.delete(key);
    }
  }

  /** Start tour `tour` from the `scope` guidance file. Resolves false when it has no steps. */
  async start(scope: string, tour: string): Promise<boolean> {
    const file = await this.content.whenLoaded(scope);
    const steps = file?.tours?.[tour] ?? [];
    if (steps.length === 0) {
      return false;
    }
    this.end();
    this.restoreFocus = (globalThis.document?.activeElement as HTMLElement | null) ?? null;
    this._steps.set(steps);
    this._index.set(0);
    this.open();
    this.show();
    return true;
  }

  next(): void {
    if (this.isLast()) {
      this.end();
      return;
    }
    this._index.update((i) => i + 1);
    this.show();
  }

  previous(): void {
    if (this._index() > 0) {
      this._index.update((i) => i - 1);
      this.show();
    }
  }

  end(): void {
    this.clearHighlight();
    this.overlaySubs.forEach((s) => s.unsubscribe());
    this.overlaySubs = [];
    this.overlayRef?.dispose();
    this.overlayRef = null;
    const wasActive = this.active();
    this._steps.set([]);
    this._index.set(0);
    if (wasActive) {
      this.restoreFocus?.focus?.();
    }
    this.restoreFocus = null;
  }

  private open(): void {
    const ref = createOverlayRef(this.injector, {
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      positionStrategy: createGlobalPositionStrategy(this.injector)
        .centerHorizontally()
        .centerVertically(),
      maxWidth: 'calc(100vw - 24px)',
    });
    this.overlaySubs.push(
      ref.backdropClick().subscribe(() => this.end()),
      ref.keydownEvents().subscribe((event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.end();
        }
      }),
    );
    const injector = Injector.create({
      providers: [{ provide: TOUR_CONTROLLER, useValue: this }],
      parent: this.injector,
    });
    ref.attach(new ComponentPortal(TourPopover, null, injector));
    this.overlayRef = ref;
  }

  private show(): void {
    const step = this.step();
    const ref = this.overlayRef;
    if (!step || !ref) {
      return;
    }
    this.clearHighlight();
    const target = this.targets.get(step.target);
    if (target && target.isConnected) {
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      this.highlighted = {
        el: target,
        outline: target.style.outline,
        offset: target.style.outlineOffset,
      };
      target.style.outline = '3px solid var(--accent)';
      target.style.outlineOffset = '4px';
      ref.updatePositionStrategy(
        createFlexibleConnectedPositionStrategy(this.injector, target)
          .withPositions(POSITIONS)
          .withPush(true)
          .withViewportMargin(12),
      );
    } else {
      ref.updatePositionStrategy(
        createGlobalPositionStrategy(this.injector).centerHorizontally().centerVertically(),
      );
    }
    ref.updatePosition();
  }

  private clearHighlight(): void {
    if (this.highlighted) {
      this.highlighted.el.style.outline = this.highlighted.outline;
      this.highlighted.el.style.outlineOffset = this.highlighted.offset;
      this.highlighted = null;
    }
  }
}
