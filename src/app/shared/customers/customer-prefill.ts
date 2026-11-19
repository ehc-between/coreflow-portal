import { ActivatedRoute } from '@angular/router';

const UUID_LIKE = /^[0-9a-f-]{8,64}$/i;

/**
 * The customer a new-form was opened for (`?customer_id=<id>`, set by the "+ Ny …"
 * links of the customer card and the create flows), or null. Anything that does
 * not look like an id is ignored.
 */
export function customerIdFromRoute(route: ActivatedRoute): string | null {
  const raw = route.snapshot.queryParamMap.get('customer_id');
  return raw && UUID_LIKE.test(raw.trim()) ? raw.trim() : null;
}
