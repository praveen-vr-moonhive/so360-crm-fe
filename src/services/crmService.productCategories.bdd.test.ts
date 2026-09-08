import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crmService } from './crmService';

/**
 * BDD spec — getProductCategories (Inventory settings lookup)
 *
 * Regression guard: this used to call the unprefixed `/settings/:orgId`
 * first, which Inventory answers 404 (it serves the route under its
 * /v1/inventory prefix), logging a console error on every Custom Product
 * Build modal open before falling through to the correct path. Same
 * missing-prefix class as the CRM→Inventory draft-item 404→502.
 */

const REAL_TENANT = '3cf1c619-c8f6-49ac-9207-447418d5beee';

const mockFetchOk = (body: unknown) =>
    vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: async () => body,
    });

const mockFetchFail = (status: number, message: string) =>
    vi.fn().mockResolvedValue({
        ok: false,
        status,
        text: () => Promise.resolve(JSON.stringify({ message })),
        json: async () => ({ message }),
    });

describe('crmService.getProductCategories — Inventory settings prefix', () => {
    beforeEach(() => {
        crmService.setTenantId(REAL_TENANT);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('Given Inventory serves settings under its /v1/inventory prefix', () => {
        it('When categories are fetched / Then it GETs the prefixed settings path', async () => {
            const fetchSpy = mockFetchOk({
                categories: [{ id: 'cat-1', name: 'Packaging & Storage' }],
            });
            vi.stubGlobal('fetch', fetchSpy);

            const categories = await crmService.getProductCategories();

            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('/v1/inventory/settings/'),
                expect.objectContaining({ method: 'GET' })
            );
            expect(categories).toEqual([
                { id: 'cat-1', name: 'Packaging & Storage' },
            ]);
        });

        it('When categories are fetched / Then it never calls the unprefixed /settings path that 404s', async () => {
            const fetchSpy = mockFetchOk({ categories: [] });
            vi.stubGlobal('fetch', fetchSpy);

            await crmService.getProductCategories();

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            const calledUrl = String(fetchSpy.mock.calls[0][0]);
            expect(calledUrl).not.toMatch(/\/settings\/[^/]+$/);
            expect(calledUrl).not.toContain('/v1/v1/');
        });
    });

    describe('Given Inventory is unavailable or returns no categories', () => {
        it('When the request fails / Then it resolves to an empty list instead of throwing', async () => {
            vi.stubGlobal('fetch', mockFetchFail(503, 'Service Unavailable'));

            await expect(crmService.getProductCategories()).resolves.toEqual([]);
        });

        it('When the response has no categories array / Then it resolves to an empty list', async () => {
            vi.stubGlobal('fetch', mockFetchOk({ settings: {} }));

            await expect(crmService.getProductCategories()).resolves.toEqual([]);
        });
    });
});
