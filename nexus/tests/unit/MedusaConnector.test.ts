import { describe, it, expect } from 'vitest';
import { MedusaConnector } from '../../connectors/medusa/MedusaConnector.js';

describe('MedusaConnector', () => {
    const connector = new MedusaConnector('medusa-anastasia');

    it('správne preloží Medusa DTO na Canonical model a späť', () => {
        const medusaVariant = {
            id: 'variant_123',
            product_id: 'prod_999',
            sku: 'ANAST-CREAM-50ML',
            title: 'Krem Anastasia 50ml',
            calculated_price: 2990,
            original_price: 3500,
            metadata: { currency: 'EUR', tenantId: 'anastasia' },
        };

        const canonical = connector.toCanonical(medusaVariant);
        expect(canonical.variantId).toBe('variant_123');
        expect(canonical.sku).toBe('ANAST-CREAM-50ML');
        expect(canonical.priceMinor).toBe(2990);
        expect(canonical.currency).toBe('EUR');

        const external = connector.toExternal(canonical);
        expect(external.id).toBe('variant_123');
        expect(external.calculated_price).toBe(2990);
    });
});
