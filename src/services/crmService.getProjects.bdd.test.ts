import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crmService } from './crmService';

const REAL_TENANT = '3cf1c619-c8f6-49ac-9207-447418d5beee';

const makeProject = (overrides: Record<string, unknown> = {}) => ({
    id: 'proj-1',
    name: 'Sobha Dream Acres',
    status: 'ACTIVE',
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

// Regression coverage for: New Task modal's Project dropdown always showed
// only "No Project". Root cause was two independent bugs in getProjects():
//   1. It called apiClient.get('/projects-api/projects') — apiClient is
//      bound to CRM_API_ORIGIN, so the request resolved to
//      `${CRM_API_ORIGIN}/projects-api/projects`, a path that doesn't exist
//      on the CRM backend (404, silently swallowed by the try/catch).
//   2. Even with the right origin, the Projects backend's GET /projects
//      returns { data, pagination }, not a flat array — the old code did
//      `return projects || []` with no unwrapping, so a correctly-shaped
//      response would still have produced an empty/broken list.
describe('crmService.getProjects()', () => {
    beforeEach(() => {
        crmService.setTenantId(REAL_TENANT);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('Given the Projects backend returns a paginated { data, pagination } response', () => {
        it('When getProjects() is called / Then it GETs the Projects backend\'s own /projects (never /projects-api) and returns the unwrapped data array', async () => {
            const projects = [makeProject(), makeProject({ id: 'proj-2', name: 'HomeLane Whitefield' })];
            const fetchSpy = mockFetchOk({ data: projects, pagination: { page: 1, limit: 100, total: 2, totalPages: 1 } });
            vi.stubGlobal('fetch', fetchSpy);

            const result = await crmService.getProjects();

            const [url] = fetchSpy.mock.calls[0];
            expect(url).toContain('/projects');
            expect(url).not.toContain('/projects-api');
            expect(result).toEqual(projects);
        });
    });

    describe('Given the Projects backend (hypothetically) returns a flat array directly', () => {
        it('When getProjects() is called / Then it returns that array as-is', async () => {
            const projects = [makeProject({ id: 'proj-3', name: 'Brigade Cornerstone' })];
            vi.stubGlobal('fetch', mockFetchOk(projects));

            const result = await crmService.getProjects();

            expect(result).toEqual(projects);
        });
    });

    describe('Given the response has neither a top-level array nor a data array', () => {
        it('When getProjects() is called / Then it returns [] instead of throwing', async () => {
            vi.stubGlobal('fetch', mockFetchOk({ unexpected: 'shape' }));

            const result = await crmService.getProjects();

            expect(result).toEqual([]);
        });
    });

    describe('Given the Projects backend request fails', () => {
        it('When getProjects() is called / Then it logs the failure and returns [] rather than throwing (the modal must still open)', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            vi.stubGlobal('fetch', mockFetchFail(500, 'Internal Server Error'));

            const result = await crmService.getProjects();

            expect(result).toEqual([]);
            expect(errorSpy).toHaveBeenCalledWith(
                '[CRM] Failed to fetch projects list:',
                expect.any(String),
            );
            errorSpy.mockRestore();
        });
    });

    describe('Given a network error (fetch itself rejects)', () => {
        it('When getProjects() is called / Then it returns [] rather than propagating the rejection', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

            await expect(crmService.getProjects()).resolves.toEqual([]);
        });
    });
});
