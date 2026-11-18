import { Routes } from '@angular/router';
import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Public training pages (no login, outside the app shell): the certificate check
 * at `/verify/certificate/<code>` that the QR code on a printed certificate opens.
 */
export default [
  {
    path: 'certificate/:code',
    title: 'training.verify.title',
    providers: [provideTranslocoScope('training')],
    loadComponent: () => import('./verify/certificate-verify').then((m) => m.CertificateVerify),
  },
] satisfies Routes;
