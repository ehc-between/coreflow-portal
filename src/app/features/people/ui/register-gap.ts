import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Button } from '../../../shared/ui/button/button';
import { Icon } from '../../../shared/ui/icon/icon';
import { PeopleApi } from '../data/people-api';
import { MemberWithoutEmployee } from '../data/people.models';

/** How many names the strip spells out before "and N more". */
const NAMED = 3;

/**
 * U26 "People register = everyone who does the work": the gap strip on `/people`.
 * Members who can own risks, tasks and training but have no employee card are
 * named here ("Emma Kristiansen, Sofie Johansen and 3 more have no employee card")
 * with one "Opprett ansattkort" button. The list comes from `user-matches`, the
 * same set of people the owner pickers offer (platform operators left out).
 * Hidden when `count` is 0.
 */
@Component({
  selector: 'app-people-register-gap',
  imports: [TranslocoPipe, Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0) {
      <section
        class="mb-5 flex flex-col gap-3 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 sm:flex-row sm:items-center"
        aria-labelledby="cf-people-gap-title"
        data-testid="register-gap"
      >
        <app-icon name="alert" [size]="18" class="hidden shrink-0 text-warn sm:block" />
        <div class="min-w-0 flex-1">
          <h2 id="cf-people-gap-title" class="text-ui font-semibold text-fg">
            {{
              (count() === 1 ? 'people.gap.titleOne' : 'people.gap.title')
                | transloco: { count: count() }
            }}
          </h2>
          @if (namesLine(); as line) {
            <p class="text-ui text-fg" data-testid="register-gap-names">
              @if (rest() > 0) {
                {{ 'people.gap.namesMore' | transloco: { names: line, count: rest() } }}
              } @else {
                {{ line }}
              }
            </p>
          }
          <p class="text-meta text-fg-muted">{{ 'people.gap.why' | transloco }}</p>
        </div>
        @if (canWrite()) {
          <app-button
            class="shrink-0"
            variant="secondary"
            (click)="create.emit()"
            data-testid="register-gap-create"
          >
            {{ 'people.gap.create' | transloco }}
          </app-button>
        }
      </section>
    }
  `,
})
export class RegisterGap {
  private readonly api = inject(PeopleApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  /** `summary.members_without_employee`. */
  readonly count = input(0);
  readonly canWrite = input(false);
  readonly create = output<void>();

  private readonly members = signal<readonly MemberWithoutEmployee[]>([]);
  private request = new Subscription();

  private readonly names = computed(() => this.members().map((m) => m.name || m.email));
  protected readonly namesLine = computed(() => this.names().slice(0, NAMED).join(', '));
  protected readonly rest = computed(() =>
    this.names().length ? Math.max(0, this.count() - Math.min(NAMED, this.names().length)) : 0,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
    effect(() => {
      const count = this.count();
      const orgId = this.selectedOrg.currentOrgId();
      untracked(() => this.load(orgId, count));
    });
  }

  private load(orgId: string | null, count: number): void {
    this.request.unsubscribe();
    if (!orgId || count <= 0) {
      this.members.set([]);
      return;
    }
    this.request = this.api.userMatches(orgId).subscribe({
      next: (data) => this.members.set(data.members_without_employee),
      error: () => this.members.set([]),
    });
  }
}
