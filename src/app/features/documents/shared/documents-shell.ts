import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DocumentsSubnav } from './documents-subnav';

/** Frame of the documents module's section pages: the section navigation above the page. */
@Component({
  selector: 'app-documents-shell',
  imports: [RouterOutlet, DocumentsSubnav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-documents-subnav />
    <router-outlet />
  `,
})
export class DocumentsShell {}
