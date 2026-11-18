import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { provideSharedScope } from '../../core/i18n/shared-scope';
import { Icon } from '../ui/icon/icon';
import { RegistrerService } from './registrer.service';

/**
 * "Fullfør posten" (U05): the strip a record registered through the quick dialog opens
 * with. It says it was registered, what happens next (with the deadline the record now
 * runs against, e.g. the 72 hours of a personal data breach) and which details to fill
 * in when there is time. Shown above the page while the user is on that record; it
 * goes when dismissed or when something else is registered.
 */
@Component({
  selector: 'app-registrer-complete',
  imports: [TranslocoPipe, Icon],
  viewProviders: [provideSharedScope('registrer')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible(); as created) {
      <section
        class="mx-4 mt-4 rounded-card border border-accent/30 bg-accent-soft px-4 py-3 sm:mx-6"
        role="status"
        aria-labelledby="registrer-complete-title"
        data-testid="registrer-complete"
      >
        <div class="flex items-start gap-3">
          <span class="mt-0.5 flex text-accent"><app-icon name="checkcircle" [size]="18" /></span>
          <div class="min-w-0 flex-1">
            <h2 id="registrer-complete-title" class="text-ui font-bold text-fg">
              {{ 'registrer.complete.title' | transloco }}
            </h2>
            <p class="mt-0.5 text-meta text-fg-muted" data-testid="registrer-complete-next">
              {{ 'registrer.next.' + created.response.next_step.code | transloco }}
              @if (deadline(); as when) {
                <strong class="font-semibold text-fg">{{
                  'registrer.deadline' | transloco: { date: when }
                }}</strong>
              }
            </p>
            @if (created.response.complete_fields.length > 0) {
              <p class="mt-2 text-meta font-semibold text-fg">
                {{ 'registrer.complete.intro' | transloco }}
              </p>
              <ul class="mt-1 flex flex-wrap gap-1.5" data-testid="registrer-complete-fields">
                @for (field of created.response.complete_fields; track field) {
                  <li
                    class="rounded-full border border-border bg-surface px-2.5 py-0.5 text-meta text-fg-muted"
                  >
                    {{ 'registrer.complete.fields.' + field | transloco }}
                  </li>
                }
              </ul>
            }
          </div>
          <button
            type="button"
            class="flex h-7 w-7 flex-none items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            [attr.aria-label]="'registrer.complete.dismiss' | transloco"
            data-testid="registrer-complete-dismiss"
            (click)="registrer.registered(null)"
          >
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      </section>
    }
  `,
})
export class RegistrerComplete {
  protected readonly registrer = inject(RegistrerService);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => pathOf(e.urlAfterRedirects)),
    ),
    { initialValue: pathOf(this.router.url) },
  );

  protected readonly visible = computed(() => {
    const created = this.registrer.created();
    return created && created.path === this.path() ? created : null;
  });

  /** The legal / response deadline, as a date (and time, for an hour-based clock). */
  protected readonly deadline = computed(() => {
    const next = this.visible()?.response.next_step;
    const locale = this.language.active() === 'nb' ? 'nb-NO' : 'en-GB';
    if (next?.deadline_at) {
      const iso = /[zZ]|[+-]\d\d:\d\d$/.test(next.deadline_at)
        ? next.deadline_at
        : `${next.deadline_at}Z`;
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? null
        : date.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
    }
    if (next?.due_on) {
      const date = new Date(`${next.due_on}T00:00:00`);
      return Number.isNaN(date.getTime())
        ? null
        : date.toLocaleDateString(locale, { dateStyle: 'long' });
    }
    return null;
  });
}

function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}
