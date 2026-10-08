// Medusa.js Connector -- prekada tvar dat medzi Medusa.js (commerce core)
// a kanonickym modelom NEXUS (Pricing Engine, SafeOrder, Vouchery).
//
// ZASADA: Adapter NIKDY nepocita ceny ani zlevy -- len preklada
// Medusa Product / Variant / Cart / Order DTOs na Canonical DTOs a srazu.

import type { Connector, ConnectorCapabilities, ConnectorType } from '../Connector.js';

export interface MedusaProductVariantDTO {
    id: string;
    product_id: string;
    sku: string;
    title: string;
    calculated_price?: number; // v minor units (cents / halere)
    original_price?: number;
    metadata?: Record<string, unknown>;
}

export interface CanonicalMedusaPrice {
    variantId: string;
    sku: string;
    priceMinor: number;
    currency: string;
    tenantId: string;
}

export class MedusaConnector implements Connector<MedusaProductVariantDTO, CanonicalMedusaPrice> {
    readonly connectorId: string;
    readonly connectorType: ConnectorType = 'medusa';
    readonly capabilities: ConnectorCapabilities = {
        canRead: true,
        canWrite: true,
        requiresApi: true,
    };

    constructor(connectorId = 'medusa-connector') {
        this.connectorId = connectorId;
    }

    toCanonical(external: MedusaProductVariantDTO): CanonicalMedusaPrice {
        return {
            variantId: external.id,
            sku: external.sku,
            priceMinor: external.calculated_price ?? external.original_price ?? 0,
            currency: (external.metadata?.currency as string) || 'EUR',
            tenantId: (external.metadata?.tenantId as string) || 'anastasia',
        };
    }

    toExternal(canonical: CanonicalMedusaPrice): MedusaProductVariantDTO {
        return {
            id: canonical.variantId,
            product_id: '',
            sku: canonical.sku,
            title: '',
            calculated_price: canonical.priceMinor,
            original_price: canonical.priceMinor,
            metadata: {
                currency: canonical.currency,
                tenantId: canonical.tenantId,
            },
        };
    }
}
