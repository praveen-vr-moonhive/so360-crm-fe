import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crmService } from './crmService';

const REAL_TENANT = '3cf1c619-c8f6-49ac-9207-447418d5beee';

const makeProject = (overrides: Record<string, unknown> = {}) => ({
    id: 'proj-1',
    title: 'Sobha Dream Acres',
    status: 'ACTIVE',
    budget_total: 5000000,
    completion_percentage: 42,
    ...overrides,
});

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

// Regression coverage for: DealDetailPage's Project card previously used a
// raw `fetch('/projects-api/projects/:id')` with NO auth/tenant/org headers
// at all, resolvable only via a Vite dev-server-only proxy rule absent in
// staging/production, and would have been rejected by the route's own
// PermissionsGuard even if the URL had resolved. Replaced with
// crmService.getProjectById(), routed through the same projectsClient fixed
// alongside getProjects() (same PROJECTS_API_ORIGIN, same auth headers).
describe('crmService.getProjectById()', () => {
    beforeEach(() => {
        crmService.setTenantId(REAL_TENANT);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('Given the Projects backend has the project', () => {
        it('When getProjectById(id) is called / Then it GETs the Projects backend\'s own /projects/:id (never /projects-api) and returns the project', async () => {
            const project = makeProject();
            const fetchSpy = mockFetchOk(project);
            vi.stubGlobal('fetch', fetchSpy);

            const result = await crmService.getProjectById('proj-1');

            const [url] = fetchSpy.mock.calls[0];
            expect(url).toContain('/projects/proj-1');
            expect(url).not.toContain('/projects-api');
            expect(result).toEqual(project);
        });

        it('When getProjectById(id) is called / Then it sends the tenant header the old raw fetch never sent', async () => {
            const fetchSpy = mockFetchOk(makeProject());
            vi.stubGlobal('fetch', fetchSpy);

            await crmService.getProjectById('proj-1');

            const [, init] = fetchSpy.mock.calls[0];
            expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBe(REAL_TENANT);
        });
    });

    describe('Given the project does not exist or access is denied', () => {
        it('When the backend returns a non-2xx / Then it logs and resolves null rather than throwing', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.stubGlobal('fetch', mockFetchFail(404, 'Project not found in this organization'));

            const result = await crmService.getProjectById('missing-id');

            expect(result).toBeNull();
            expect(errorSpy).toHaveBeenCalledWith(
                '[CRM] Failed to fetch project details:',
                expect.any(String),
            );
            errorSpy.mockRestore();
        });
    });

    describe('Given a network error (fetch itself rejects)', () => {
        it('When getProjectById(id) is called / Then it resolves null rather than propagating the rejection', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

            await expect(crmService.getProjectById('proj-1')).resolves.toBeNull();
        });
    });
});
