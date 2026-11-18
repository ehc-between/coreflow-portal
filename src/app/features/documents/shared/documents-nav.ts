import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  computed,
  inject,
} from '@angular/core';
import { TourService } from '../../../shared/guidance/tour.service';
import { ModuleNav, ModuleNavItem } from '../../../shared/ui/module-nav/module-nav';
import { DocumentControlPermissions } from './document-control-permissions';

interface DocumentsNavItem {
  readonly key: string;
  readonly link: string;
  readonly exact: boolean;
  /** Needs `documents:distribute` (distribution) on top of `documents:read`. */
  readonly distribute?: boolean;
}

/** The documents module's sub-pages, in nav order (`documents.control.nav.<key>`). */
export const DOCUMENTS_NAV: readonly DocumentsNavItem[] = [
  { key: 'documents', link: '/documents', exact: true },
  { key: 'register', link: '/documents/register', exact: false },
  { key: 'campaigns', link: '/documents/campaigns', exact: false, distribute: true },
  { key: 'external', link: '/documents/external', exact: false },
  { key: 'types', link: '/documents/types', exact: false },
  { key: 'templates', link: '/documents/templates', exact: false },
  { key: 'retention', link: '/documents/retention', exact: false },
];

/**
 * The documents module's sub-navigation (the shared `app-module-nav`), placed in
 * the `[nav]` slot of each section page, directly under the page header. Each tab
 * is also a tour target (`documents-nav-<key>`) for the page tours.
 */
@Component({
  selector: 'app-documents-nav',
  imports: [ModuleNav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<app-module-nav labelKey="documents.control.nav.label" [items]="items()" />`,
})
export class DocumentsNav {
  private readonly perms = inject(DocumentControlPermissions);
  private readonly tours = inject(TourService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  protected readonly items = computed<readonly ModuleNavItem[]>(() =>
    DOCUMENTS_NAV.filter((item) => !item.distribute || this.perms.canDistribute()).map((item) => ({
      labelKey: `documents.control.nav.${item.key}`,
      link: item.link,
      exact: item.exact,
      testId: `documents-nav-${item.key}`,
    })),
  );

  /** Tour key -> the tab element registered for it. */
  private readonly registered = new Map<string, HTMLElement>();

  constructor() {
    afterEveryRender(() => this.registerTourTargets());
    inject(DestroyRef).onDestroy(() => {
      for (const [key, el] of this.registered) {
        this.tours.unregister(key, el);
      }
      this.registered.clear();
    });
  }

  private registerTourTargets(): void {
    for (const item of DOCUMENTS_NAV) {
      const key = `documents-nav-${item.key}`;
      const el = this.host.nativeElement.querySelector<HTMLElement>(`[data-testid="${key}"]`);
      const known = this.registered.get(key);
      if (el === known) {
        continue;
      }
      if (known) {
        this.tours.unregister(key, known);
        this.registered.delete(key);
      }
      if (el) {
        this.tours.register(key, el);
        this.registered.set(key, el);
      }
    }
  }
}
