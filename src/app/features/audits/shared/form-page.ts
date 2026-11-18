import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { Card } from '../../../shared/ui/card/card';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';

/**
 * Layout of an audit create / edit page (docs/ux-guide.md, "Form"): the shared
 * page header with breadcrumbs, the help strip, the projected fields in one
 * card at most 760 px wide, and Cancel / Save bottom-right (sticky on phones).
 * Submitting the form (Enter in a field or Save) emits `save`; when the form is
 * not valid yet, `invalidKey` says what to fill in.
 */
@Component({
  selector: 'app-audit-form-page',
  imports: [TranslocoPipe, Button, Card, HelpStrip, LoadingState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header [titleKey]="titleKey()" [breadcrumbs]="breadcrumbs()" />
      <app-help-strip scope="audits" [page]="guidePage()" [lesson]="lesson()" />
      <ng-content select="[before]" />
      @if (ready()) {
        <form novalidate (submit)="$event.preventDefault(); submit()">
          <app-card>
            <div class="flex flex-col gap-5">
              <ng-content />
            </div>
          </app-card>
          <div
            class="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-bg py-3 sm:static sm:border-0 sm:bg-transparent"
          >
            @if (attempted() && !canSave() && invalidKey()) {
              <p class="mr-auto text-meta font-semibold text-fail-ink" role="alert">
                {{ invalidKey()! | transloco }}
              </p>
            }
            <app-button variant="secondary" (click)="cancelled.emit()">
              {{ 'audits.common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy()">
              {{ saveKey() | transloco }}
            </app-button>
          </div>
        </form>
      } @else {
        <app-loading-state [rows]="6" />
      }
    </div>
  `,
})
export class AuditFormPage {
  readonly titleKey = input.required<string>();
  readonly guidePage = input.required<string>();
  readonly breadcrumbs = input<readonly Breadcrumb[]>([]);
  readonly lesson = input<string | null>(null);
  readonly busy = input(false);
  readonly canSave = input(true);
  /** "Kunne ikke lagre. Fyll ut tittel." – shown after a save attempt on an invalid form. */
  readonly invalidKey = input<string | null>(null);
  readonly saveKey = input('audits.common.save');
  /** Show the form (false while the record to edit is loading). */
  readonly ready = input(true);
  readonly save = output<void>();
  readonly cancelled = output<void>();

  protected readonly attempted = signal(false);

  protected submit(): void {
    this.attempted.set(true);
    if (this.canSave()) {
      this.save.emit();
    }
  }
}
