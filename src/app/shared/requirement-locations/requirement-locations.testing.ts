import { HttpTestingController } from '@angular/common/http/testing';

/**
 * For specs of pages that mount requirement-location components (the
 * requirement card, module register pages): answer their reads with "no
 * mapping" so `HttpTestingController.verify()` only checks the page's own calls.
 * Call it right before `verify()`.
 */
export function flushLocationRequests(http: HttpTestingController): void {
  for (const req of http.match((r) => /\/(requirement-)?locations(\/|\?|$)/.test(r.url))) {
    if (req.cancelled) {
      continue;
    }
    const url = req.request.url;
    if (url.endsWith('/requirement-locations')) {
      req.flush({
        requirement: { ref: req.request.params.get('ref') ?? '', label: null },
        status: { status: 'not_started', basis: 'links', fresh: false, text: '' },
        primary: [],
        supporting: [],
        disabled: [],
        links: { confirmed: 0, suggested: 0 },
      });
    } else if (url.endsWith('/requirements')) {
      req.flush({ location: null, items: [] });
    } else if (url.endsWith('/evaluate')) {
      req.flush({ items: {} });
    } else {
      req.flush(url.endsWith('/locations') ? [] : {});
    }
  }
}
