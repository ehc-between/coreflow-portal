import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/ui/button/button';
import { FormActions } from '../../../shared/ui/form-actions/form-actions';
import { HelpStrip } from '../../../shared/ui/help-strip/help-strip';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';

/**
 * Layout of an audit create / edit page (docs/ux-guide.md, "Form"): the shared
 * page header with breadcrumbs, the help strip, the projected `app-form-section`
 * cards (808 px column) and the sticky `app-form-actions` bar (Cancel / Save right).
 * Submitting the form (Enter in a field or Save) emits `save`; when the form is
 * not valid yet, `invalidKey` says what to fill in.
 */
@Component({
  selector: 'app-audit-form-page',
  imports: [TranslocoPipe, Button, FormActions, HelpStrip, LoadingState, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-[808px] px-4 pt-6 pb-12 sm:px-8 sm:pt-7">
      <app-page-header [titleKey]="titleKey()" [breadcrumbs]="breadcrumbs()" />
      <app-help-strip scope="audits" [page]="guidePage()" [lesson]="lesson()" />
      <ng-content select="[before]" />
      @if (ready()) {
        <form class="flex flex-col gap-5" novalidate (submit)="$event.preventDefault(); submit()">
          <ng-content />
          <app-form-actions
            [message]="attempted() && !canSave() && invalidKey() ? (invalidKey()! | transloco) : ''"
          >
            <app-button variant="secondary" (click)="cancelled.emit()">
              {{ 'audits.common.cancel' | transloco }}
            </app-button>
            <app-button type="submit" [loading]="busy()" [disabled]="busy()">
              {{ saveKey() | transloco }}
            </app-button>
          </app-form-actions>
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
