import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Drop-in print styles for printable training pages (certificate, matrix,
 * person profile): while it is on the page, printing hides the app chrome (top
 * bar, side nav, assistant button, toasts, help strips) and lets the content
 * flow over several sheets. The styles are removed again when the page closes.
 */
@Component({
  selector: 'app-training-print-chrome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'hidden' },
  styles: `
    @media print {
      app-top-bar,
      app-side-nav,
      app-notifications,
      app-ask-panel,
      app-command-palette,
      app-help-strip,
      app-module-nav,
      .cf-skip-link,
      [data-testid='nav-panel'],
      [data-testid='ask-launcher'],
      [data-testid='page-actions'],
      .cf-no-print {
        display: none !important;
      }
      .h-dvh,
      main#main-content {
        height: auto !important;
        overflow: visible !important;
      }
      body {
        background: #fff !important;
      }
    }
  `,
  template: '',
})
export class PrintChrome {}
