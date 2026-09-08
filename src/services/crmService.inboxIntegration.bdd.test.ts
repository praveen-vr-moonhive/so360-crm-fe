import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crmService, inboxIntegrationApi } from './crmService';

const REAL_TENANT = '3cf1c619-c8f6-49ac-9207-447418d5beee';

const mockFetchOk = (body: unknown) =>
    vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(body)),
        json: async () => body,
    });

// Regression coverage for: the Customers detail page (which renders
// LeadDetailPage's EmailsTab / NeuraAiSummaryCard for a converted lead)
// called inbox-be's /conversations/by-crm-lead/:leadId without inbox-be's
// own `app.setGlobalPrefix('v1/inbox')` segment, so every request 404'd
// with "Cannot GET /conversations/by-crm-lead/:leadId". inboxClient's base
// URL now carries /v1/inbox itself, same as fulfillmentClient carries
// /v1/fulfillment for the same class of prefixed backend.
describe('inboxIntegrationApi (inbox-be is served behind /v1/inbox)', () => {
    beforeEach(() => {
        crmService.setTenantId(REAL_TENANT);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('Given a lead/customer id', () => {
        it('When getConversationsForLead(leadId) is called / Then it GETs the /v1/inbox-prefixed route, never the bare /conversations route', async () => {
            const fetchSpy = mockFetchOk({ data: [], total: 0 });
            vi.stubGlobal('fetch', fetchSpy);

            await inboxIntegrationApi.getConversationsForLead('4f5d264f-40c4-4a95-8248-a188cbb28631');

            const [url] = fetchSpy.mock.calls[0];
            expect(url).toContain('/v1/inbox/conversations/by-crm-lead/4f5d264f-40c4-4a95-8248-a188cbb28631');
        });

        it('When getMessages(entityId, conversationId) is called / Then it also GETs the /v1/inbox-prefixed route', async () => {
            const fetchSpy = mockFetchOk({ data: [] });
            vi.stubGlobal('fetch', fetchSpy);

            await inboxIntegrationApi.getMessages('entity-1', 'conv-1');

            const [url] = fetchSpy.mock.calls[0];
            expect(url).toContain('/v1/inbox/conversations/entity-1/conv-1/messages');
        });

        it('When getConversationsForLead(leadId) is called / Then it sends the tenant header', async () => {
            const fetchSpy = mockFetchOk({ data: [], total: 0 });
            vi.stubGlobal('fetch', fetchSpy);

            await inboxIntegrationApi.getConversationsForLead('lead-1');

            const [, init] = fetchSpy.mock.calls[0];
            expect((init.headers as Record<string, string>)['X-Tenant-Id']).toBe(REAL_TENANT);
        });
    });
});
