import { WorkspaceScroll } from './workspace-scroll';

/** Minimal IntersectionObserver double that records its root and targets. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly root: Element | null;
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(
    readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = (options.root as Element | null) ?? null;
    FakeObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  fire(target: Element, isIntersecting: boolean): void {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('WorkspaceScroll', () => {
  const original = globalThis.IntersectionObserver;

  beforeEach(() => {
    FakeObserver.instances = [];
    globalThis.IntersectionObserver = FakeObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = original;
  });

  it('queues elements until attached, then observes them within the root', () => {
    const scroll = new WorkspaceScroll();
    const section = document.createElement('section');
    const placeholder = document.createElement('div');
    scroll.observeSection(section, '4.1');
    scroll.observeNear(placeholder, () => undefined);
    const root = document.createElement('div');
    scroll.attach(root);
    const [spy, lazy] = FakeObserver.instances;
    expect(spy.root).toBe(root);
    expect(spy.observed.has(section)).toBe(true);
    expect(lazy.observed.has(placeholder)).toBe(true);
    spy.fire(section, true);
    expect([...scroll.crossing()]).toEqual(['4.1']);
  });

  it('re-creates the observers when the scroll container changes', () => {
    const scroll = new WorkspaceScroll();
    const section = document.createElement('section');
    const near = vi.fn();
    const placeholder = document.createElement('div');
    scroll.observeSection(section, '6');
    scroll.observeNear(placeholder, near);
    const first = document.createElement('div');
    scroll.attach(first);
    FakeObserver.instances[0].fire(section, true);
    // Attaching to the same root again is a no-op.
    scroll.attach(first);
    expect(FakeObserver.instances).toHaveLength(2);

    const second = document.createElement('div');
    scroll.attach(second);
    const [oldSpy, oldLazy, spy, lazy] = FakeObserver.instances;
    expect(oldSpy.disconnected && oldLazy.disconnected).toBe(true);
    expect(spy.root).toBe(second);
    expect(lazy.root).toBe(second);
    expect(spy.observed.has(section)).toBe(true);
    expect(lazy.observed.has(placeholder)).toBe(true);
    // Stale crossing state from the old container is dropped.
    expect(scroll.crossing().size).toBe(0);
    lazy.fire(placeholder, true);
    expect(near).toHaveBeenCalledTimes(1);
  });
});
