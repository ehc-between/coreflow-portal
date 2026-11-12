import { provideSharedScope } from '../../core/i18n/shared-scope';

/**
 * Transloco scope of the shared record kit (`src/assets/i18n/kit/<lang>.json`).
 * Every kit component provides it (in `viewProviders`, merged with the host
 * page's scope), so `'kit.…'` keys resolve wherever a kit component is used,
 * without the host feature declaring the scope — and the host's own keys
 * passed into or projected through the kit still resolve.
 */
export const KIT_SCOPE = 'kit';

export const provideKitScope = () => provideSharedScope(KIT_SCOPE);
