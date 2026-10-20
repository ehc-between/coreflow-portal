import {
  Directive,
  ElementRef,
  Injectable,
  OnDestroy,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * The reading line of the scroll-spy, as an IntersectionObserver root margin:
 * a 1%-high band 18% below the top of the scroll container. A section is
 * "crossing" while any part of it covers that band.
 */
const SPY_ROOT_MARGIN = '-18% 0px -81% 0px';

/** How far ahead (px) a held-back render unit starts rendering. */
const LAZY_ROOT_MARGIN = '1200px 0px 1200px 0px';

/**
 * Per-workspace scroll plumbing (provided by the workspace component): one
 * IntersectionObserver for the scroll-spy (which sections cross the reading
 * line) and one for lazy rendering (placeholders approaching the viewport).
 * Both observe within the workspace's own scroll container, attached once it
 * exists; elements registered before that are queued. Without
 * IntersectionObserver (tests, very old browsers) lazy content renders at once.
 */
@Injectable()
export class WorkspaceScroll implements OnDestroy {
  /** Section numbers currently crossing the reading line. */
  readonly crossing = signal<ReadonlySet<string>>(new Set());

  private spy: IntersectionObserver | null = null;
  private lazy: IntersectionObserver | null = null;
  private attached = false;
  private readonly sections = new Map<Element, string>();
  private readonly nearCallbacks = new Map<Element, () => void>();

  /** Start observing inside `root` (the workspace's scroll container). */
  attach(root: HTMLElement): void {
    if (this.attached) {
      return;
    }
    this.attached = true;
    if (typeof IntersectionObserver === 'undefined') {
      this.flushNear();
      return;
    }
    this.spy = new IntersectionObserver((entries) => this.onSpy(entries), {
      root,
      rootMargin: SPY_ROOT_MARGIN,
      threshold: 0,
    });
    this.lazy = new IntersectionObserver((entries) => this.onLazy(entries), {
      root,
      rootMargin: LAZY_ROOT_MARGIN,
      threshold: 0,
    });
    this.sections.forEach((_, el) => this.spy?.observe(el));
    this.nearCallbacks.forEach((_, el) => this.lazy?.observe(el));
  }

  observeSection(el: Element, number: string): void {
    this.sections.set(el, number);
    this.spy?.observe(el);
  }

  unobserveSection(el: Element): void {
    const number = this.sections.get(el);
    this.sections.delete(el);
    this.spy?.unobserve(el);
    if (number !== undefined && this.crossing().has(number)) {
      this.crossing.update((set) => {
        const next = new Set(set);
        next.delete(number);
        return next;
      });
    }
  }

  /** Call `cb` once `el` comes near the viewport. */
  observeNear(el: Element, cb: () => void): void {
    this.nearCallbacks.set(el, cb);
    if (this.lazy) {
      this.lazy.observe(el);
    } else if (this.attached) {
      this.flushNear();
    }
  }

  unobserveNear(el: Element): void {
    this.nearCallbacks.delete(el);
    this.lazy?.unobserve(el);
  }

  ngOnDestroy(): void {
    this.spy?.disconnect();
    this.lazy?.disconnect();
    this.sections.clear();
    this.nearCallbacks.clear();
  }

  private onSpy(entries: IntersectionObserverEntry[]): void {
    const next = new Set(this.crossing());
    for (const entry of entries) {
      const number = this.sections.get(entry.target);
      if (number === undefined) {
        continue;
      }
      if (entry.isIntersecting) {
        next.add(number);
      } else {
        next.delete(number);
      }
    }
    this.crossing.set(next);
  }

  private onLazy(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      const cb = this.nearCallbacks.get(entry.target);
      this.unobserveNear(entry.target);
      cb?.();
    }
  }

  private flushNear(): void {
    const callbacks = [...this.nearCallbacks.values()];
    this.nearCallbacks.clear();
    // Defer so a placeholder isn't swapped out during its own creation.
    queueMicrotask(() => callbacks.forEach((cb) => cb()));
  }
}

/** Registers a section with the workspace scroll-spy: `[appSpySection]="number"`. */
@Directive({ selector: '[appSpySection]' })
export class SpySection implements OnInit, OnDestroy {
  readonly number = input.required<string>({ alias: 'appSpySection' });

  private readonly el = inject<ElementRef<Element>>(ElementRef);
  private readonly scroll = inject(WorkspaceScroll);

  ngOnInit(): void {
    this.scroll.observeSection(this.el.nativeElement, this.number());
  }

  ngOnDestroy(): void {
    this.scroll.unobserveSection(this.el.nativeElement);
  }
}

/** Emits `(appNearViewport)` once the element approaches the workspace viewport. */
@Directive({ selector: '[appNearViewport]' })
export class NearViewport implements OnInit, OnDestroy {
  readonly appNearViewport = output<void>();

  private readonly el = inject<ElementRef<Element>>(ElementRef);
  private readonly scroll = inject(WorkspaceScroll);

  private destroyed = false;

  ngOnInit(): void {
    this.scroll.observeNear(this.el.nativeElement, () => {
      if (!this.destroyed) {
        this.appNearViewport.emit();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.scroll.unobserveNear(this.el.nativeElement);
  }
}
