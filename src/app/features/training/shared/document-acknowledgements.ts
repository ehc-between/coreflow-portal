import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { provideSharedScope } from '../../../core/i18n/shared-scope';
import { SelectedOrgService } from '../../../core/org/selected-org.service';
import { Card } from '../../../shared/ui/card/card';
import { ProgressBar } from '../../../shared/ui/progress-bar/progress-bar';
import { TrainingApi } from '../data/training-api';
import { DocumentAcknowledgements as DocumentAcks } from '../data/training.models';

/**
 * "Lest og forstått" status of a controlled document, for the document page
 * (A24 mounts it in the aside): how many of the people who must confirm the
 * current approved revision have done so, the read-and-understood courses about
 * the document, and — for people who oversee training — who is still missing.
 * Renders nothing when no read-and-understood course covers the document or the
 * training module is off.
 *
 *   <app-training-document-acks [documentId]="doc.id" />
 */
@Component({
  selector: 'app-training-document-acks',
  imports: [RouterLink, TranslocoPipe, Card, ProgressBar],
  viewProviders: [provideSharedScope('training')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (acks(); as a) {
      @if (a.courses.length) {
        <app-card data-testid="document-acks">
          <h2 class="mb-1 text-card font-semibold text-fg">
            {{ 'training.documentAcks.title' | transloco }}
          </h2>
          <p class="mb-2 text-ui text-fg">
            {{
              (a.rev ? 'training.documentAcks.summaryRev' : 'training.documentAcks.summary')
                | transloco: { done: a.acknowledged, required: a.required, rev: a.rev }
            }}
          </p>
          <app-progress-bar [value]="pct()" [label]="'training.documentAcks.title' | transloco" />
          <ul class="mt-3 flex flex-col gap-1 text-meta">
            @for (c of a.courses; track c.id) {
              <li>
                <a [routerLink]="c.url" class="font-semibold text-accent hover:underline">
                  {{ c.code }} · {{ c.title }}
                </a>
              </li>
            }
          </ul>
          @if (a.pending.length) {
            <p class="mt-3 text-meta font-semibold text-fg-muted">
              {{ 'training.documentAcks.pending' | transloco: { count: a.pending.length } }}
            </p>
            <p class="mt-0.5 text-meta text-fg-muted">{{ pendingNames() }}</p>
          }
        </app-card>
      }
    }
  `,
})
export class DocumentAcknowledgementsCard {
  private readonly api = inject(TrainingApi);
  private readonly selectedOrg = inject(SelectedOrgService);

  readonly documentId = input.required<string>();

  protected readonly acks = signal<DocumentAcks | null>(null);
  protected readonly pct = computed(() => {
    const a = this.acks();
    return a && a.required ? Math.round((a.acknowledged / a.required) * 100) : 0;
  });
  protected readonly pendingNames = computed(() =>
    (this.acks()?.pending ?? [])
      .slice(0, 12)
      .map((p) => p.name)
      .join(', '),
  );

  private sub = new Subscription();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.sub.unsubscribe());
    effect(() => {
      const orgId = this.selectedOrg.currentOrgId();
      const id = this.documentId();
      const enabled = (this.selectedOrg.currentOrg()?.permissions ?? []).includes('training:read');
      untracked(() => {
        this.sub.unsubscribe();
        this.acks.set(null);
        if (!orgId || !enabled) {
          return;
        }
        this.sub = this.api.documentAcknowledgements(orgId, id).subscribe({
          next: (a) => this.acks.set(a),
          error: () => this.acks.set(null),
        });
      });
    });
  }
}
