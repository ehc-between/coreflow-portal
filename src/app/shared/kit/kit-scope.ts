import { provideTranslocoScope } from '@jsverse/transloco';

/**
 * Transloco scope of the shared record kit (`src/assets/i18n/kit/<lang>.json`).
 * Every kit component provides it, so `'kit.…'` keys resolve wherever a kit
 * component is used, without the host feature declaring the scope.
 */
export const KIT_SCOPE = 'kit';

export const provideKitScope = () => provideTranslocoScope(KIT_SCOPE);
