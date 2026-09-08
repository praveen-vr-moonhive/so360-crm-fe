import { Deal, Activity, Task, Note, CustomFieldDefinition, User, Attachment, ActivityType, Lead, DealFilters, CRMSettings, InventoryItem, SalesRep, LeadProduct, DealProduct, LeadScoringRule, ScoreCategory, Stakeholder, StakeholderActivitySummary, Meeting, DealNamingConfig, DEFAULT_DEAL_NAMING_CONFIG } from '../types/crm';
import { createRequestCache } from './requestCache';
import { notifyQuotaExceeded } from './quotaExceeded';

// Lead/Deal detail pages and the dashboard each fetch CRM settings (8 parallel
// requests) and the user list on mount. Both are org-static within a session,
// so coalesce concurrent reads and serve a short TTL keyed by org. updateSettings
// invalidates so edits show immediately. Exported so tests can reset it.
export const orgStaticCache = createRequestCache({ defaultTtlMs: 30_000, maxEntries: 50 });

export interface TimelineEvent {
    id: string;
    type: 'Activity' | 'NOTE' | 'TASK' | 'DOCUMENT' | 'DEAL' | 'STATUS_CHANGE' | 'STAGE_CHANGE' | 'OWNER_CHANGE' | 'PROFILE_UPDATE';
    subType?: string;
    title: string;
    description: string;
    date: string;
    author?: User;
    data?: any;
}

// API Configuration
// In `npm run preview` (static), Vite proxy is not available (or unreliable across MFEs),
// so default to absolute backend origins. Allow overrides via `window.*` or `import.meta.env`.
//
// Each origin MUST read the LITERAL `import.meta.env.VITE_SO360_X`. Vite performs a
// textual substitution on exactly that expression at build time. This file previously
// captured `const env = (import.meta as any)?.env || {}` — the optional chaining makes
// the source read `import.meta?.env`, which never matches, so `env` was `{}` in every
// production build and ALL EIGHT origins silently became localhost. It went unnoticed
// because the shell injects `window.VITE_SO360_CRM_API` and `_CORE_API` at runtime,
// rescuing those two; the other six pointed at the user's own machine in production.
//
// The `VITE_API_BASE_URL` fallback that used to sit under CRM and CORE is gone: it is
// set nowhere in this repo, and it resolves to the Core origin, so a missing CRM value
// would have addressed the wrong service rather than failing. Localhost fails loudly.
const win = typeof window !== 'undefined' ? (window as any) : {};

const CRM_API_ORIGIN = String(
    win.VITE_SO360_CRM_API ||
    import.meta.env.VITE_SO360_CRM_API ||
    'http://localhost:3003'
).replace(/\/$/, '');

const CORE_API_ORIGIN = String(
    win.VITE_SO360_CORE_API ||
    import.meta.env.VITE_SO360_CORE_API ||
    'http://localhost:3000'
).replace(/\/$/, '');

const DAILYSTORE_API_ORIGIN = String(
    win.VITE_SO360_DAILYSTORE_API ||
    import.meta.env.VITE_SO360_DAILYSTORE_API ||
    'http://localhost:3016'
).replace(/\/$/, '');

const INVENTORY_API_ORIGIN = String(
    win.VITE_SO360_INVENTORY_API ||
    import.meta.env.VITE_SO360_INVENTORY_API ||
    'http://localhost:3006'
).replace(/\/$/, '');

const FULFILLMENT_API_ORIGIN = String(
    win.VITE_SO360_FULFILLMENT_API ||
    import.meta.env.VITE_SO360_FULFILLMENT_API ||
    'http://localhost:3032'
).replace(/\/$/, '');

const ACCOUNTING_API_ORIGIN = String(
    win.VITE_SO360_ACCOUNTING_API ||
    import.meta.env.VITE_SO360_ACCOUNTING_API ||
    'http://localhost:3008'
).replace(/\/$/, '');

const NEURA_API_ORIGIN = String(
    win.VITE_SO360_NEURA_API ||
    import.meta.env.VITE_SO360_NEURA_API ||
    'http://localhost:3018'
).replace(/\/$/, '');

const INBOX_API_ORIGIN = String(
    win.VITE_SO360_INBOX_API ||
    import.meta.env.VITE_SO360_INBOX_API ||
    'http://localhost:3017'
).replace(/\/$/, '');

const PROJECTS_API_ORIGIN = String(
    win.VITE_SO360_PROJECTS_API ||
    import.meta.env.VITE_SO360_PROJECTS_API ||
    'http://localhost:3010'
).replace(/\/$/, '');

const API_BASE_URL = CRM_API_ORIGIN;
let TENANT_ID = 'default-tenant';
let ORG_ID = 'default-org';
let USER_ID = 'mock-user-id';
let CURRENT_USER: User | null = null;

// Users cache for enriching notes/activities
let USERS_CACHE: Map<string, User> = new Map();
let USERS_CACHE_LOADED = false;

// Status Mapping — handles both legacy uppercase DB values and current lowercase stage IDs
const STATUS_MAP_FE_TO_BE: Record<string, string> = {
    'Open': 'new',
    'New': 'new',
    'Contacted': 'contacted',
    'Qualified': 'qualified',
    'Proposal Sent': 'proposal_sent',
    'Negotiation': 'negotiation',
    'Converted': 'converted',
    'Won': 'converted',
    'Lost': 'lost',
};

const STATUS_MAP_BE_TO_FE: Record<string, string> = {
    'NEW': 'New',
    'new': 'New',
    'CONTACTED': 'Contacted',
    'contacted': 'Contacted',
    'QUALIFIED': 'Qualified',
    'qualified': 'Qualified',
    'PROPOSAL_SENT': 'Proposal Sent',
    'proposal_sent': 'Proposal Sent',
    'NEGOTIATION': 'Negotiation',
    'negotiation': 'Negotiation',
    'CLOSED_WON': 'Converted',
    'converted': 'Converted',
    'CLOSED_LOST': 'Lost',
    'lost': 'Lost',
    'customer': 'Converted',
};

const mapUser = (userObj: any, userId: string) => {
    if (userObj) return userObj;

    // Try to get from cache first
    if (userId && USERS_CACHE.has(userId)) {
        return USERS_CACHE.get(userId)!;
    }

    // If we have the current user and IDs match, use it
    if (CURRENT_USER && CURRENT_USER.id === userId) return CURRENT_USER;

    // Otherwise return a placeholder
    return {
        id: userId,
        full_name: 'Unknown User',
        email: '',
        avatar_url: ''
    };
};

const mapNoteFromApi = (apiNote: any): Note => ({
    ...apiNote,
    author: mapUser(apiNote.author, apiNote.author_id)
});

const mapTaskFromApi = (apiTask: any): Task => ({
    ...apiTask,
    status: apiTask.status ? (apiTask.status.toUpperCase() as Task['status']) : 'OPEN',
    assigned_to: mapUser(apiTask.assigned_to, apiTask.assignee_id),
    deal: apiTask.deal ? { ...apiTask.deal, company_name: apiTask.deal.company || apiTask.deal.company_name } : apiTask.deal
});

const mapActivityFromApi = (apiActivity: any): Activity => ({
    ...apiActivity,
    author: mapUser(apiActivity.author || apiActivity.creator, apiActivity.author_id || apiActivity.created_by),
    notes: apiActivity.notes || apiActivity.content || ''
});

const mapDocumentFromApi = (apiDoc: any): Attachment => ({
    ...apiDoc,
    uploaded_by: mapUser(apiDoc.uploaded_by || apiDoc.creator, apiDoc.uploaded_by_id || apiDoc.created_by),
    uploaded_at: apiDoc.uploaded_at || apiDoc.created_at,
    // DMS-backed rows may omit size/type (DMS uses file_size/mime_type) and may
    // not carry a direct `url` (downloads are resolved on demand). Tolerate all.
    size: apiDoc.size ?? apiDoc.file_size ?? 0,
    type: apiDoc.type ?? apiDoc.mime_type ?? '',
    url: apiDoc.url ?? '',
    dmsDocumentId: apiDoc.dms_document_id ?? apiDoc.dmsDocumentId ?? undefined,
});

const mapDealFromApi = (apiDeal: any): Deal => {
    return {
        ...apiDeal,
        value: parseFloat(apiDeal.value) || 0,
        company_name: apiDeal.company || apiDeal.company_name,
        owner: mapUser(apiDeal.owner, apiDeal.owner_id),
        // Notes, documents, and activities are fetched separately via dedicated endpoints
        // Don't assume they're embedded in the deal response to avoid N+1 query issues
        notes: (apiDeal.notes || []).map(mapNoteFromApi),
        documents: (apiDeal.documents || []).map(mapDocumentFromApi),
        activities: (apiDeal.activities || []).map(mapActivityFromApi),
        // Map backend stage name to frontend if mapping exists, otherwise use raw
        stage: STATUS_MAP_BE_TO_FE[apiDeal.stage] || STATUS_MAP_BE_TO_FE[apiDeal.status] || apiDeal.stage || 'Lead'
    };
};

const mapLeadFromApi = (apiLead: any): Lead => {
    return {
        ...apiLead,
        value: parseFloat(apiLead.value) || 0,
        owner: mapUser(apiLead.owner, apiLead.owner_id),
        creator: mapUser(apiLead.creator, apiLead.created_by),
        notes: (apiLead.notes || []).map(mapNoteFromApi),
        documents: (apiLead.documents || []).map(mapDocumentFromApi),
        deals: apiLead.deals || [],
        tasks: (apiLead.tasks || []).map(mapTaskFromApi),
        activities: (apiLead.activities || []).map(mapActivityFromApi),
        custom_fields: apiLead.meta_data || {},
        contact_email: apiLead.email,
        backend_status: apiLead.status,
        status: STATUS_MAP_BE_TO_FE[apiLead.status] || apiLead.status || 'New'
    };
};

// API Client Helper
class ApiClient {
    private baseURL: string;
    private tenantId: string;
    private orgId: string = '';
    private userId: string = '';
    private accessToken: string = '';

    constructor(baseURL: string, tenantId: string) {
        this.baseURL = baseURL;
        this.tenantId = tenantId;
    }

    private isUUID(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    setTenantId(id: string) {
        if (id !== 'default-tenant' && !this.isUUID(id)) {
            console.warn(`ApiClient: Tenant ID "${id}" is not a valid UUID. This may cause backend syntax errors.`);
        }
        this.tenantId = id;
    }

    setOrgId(id: string) {
        if (id !== 'default-org' && !this.isUUID(id)) {
            console.warn(`ApiClient: Org ID "${id}" is not a valid UUID. This may cause backend syntax errors.`);
        }
        this.orgId = id;
    }

    getOrgId(): string {
        return this.orgId;
    }

    setUserId(id: string) {
        this.userId = id;
    }

    setAccessToken(token: string) {
        this.accessToken = token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseURL}${endpoint}`;
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'X-Tenant-Id': this.tenantId,
            ...(this.orgId ? { 'X-Org-Id': this.orgId } : {}),
            ...(this.userId ? { 'X-User-Id': this.userId } : {}),
            ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
            ...options.headers,
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });
            await notifyQuotaExceeded(response);

            const text = await response.text();

            if (!response.ok) {
                let errorMessage = `API Error: ${response.status}`;
                try {
                    const errorJson = JSON.parse(text);
                    if (errorJson.message) {
                        if (Array.isArray(errorJson.message)) {
                            errorMessage = errorJson.message.join(', ');
                        } else {
                            errorMessage = errorJson.message;
                        }
                    } else if (errorJson.error) {
                        errorMessage = errorJson.error;
                    }
                } catch (e) {
                    errorMessage = text || errorMessage;
                }
                // Carry the status on the Error. Without it every failure looked
                // identical to callers, so a 403 was indistinguishable from a
                // missing record — which is how an access denial ended up being
                // rendered as "Lead not found."
                const apiError = new Error(errorMessage) as Error & { status?: number };
                apiError.status = response.status;
                throw apiError;
            }

            try {
                return JSON.parse(text);
            } catch (e) {
                console.error(`Failed to parse JSON response from ${endpoint}:`, text);
                throw new Error(`Invalid JSON response from API: ${text.substring(0, 100)}...`);
            }
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
        const queryString = params
            ? '?' + new URLSearchParams(
                Object.entries(params).reduce((acc, [key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        acc[key] = String(value);
                    }
                    return acc;
                }, {} as Record<string, string>)
            ).toString()
            : '';
        return this.request<T>(`${endpoint}${queryString}`, {
            method: 'GET',
        });
    }

    /**
     * GET that also surfaces the X-Total-Count response header, for server-side
     * paging. Returns { data, total }; total is null when the header is absent
     * (e.g. an older backend), so callers can fall back to client-side counting.
     */
    async getWithMeta<T>(endpoint: string, params?: Record<string, any>): Promise<{ data: T; total: number | null }> {
        const queryString = params
            ? '?' + new URLSearchParams(
                Object.entries(params).reduce((acc, [key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        acc[key] = String(value);
                    }
                    return acc;
                }, {} as Record<string, string>)
            ).toString()
            : '';
        const url = `${this.baseURL}${endpoint}${queryString}`;
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            'X-Tenant-Id': this.tenantId,
            ...(this.orgId ? { 'X-Org-Id': this.orgId } : {}),
            ...(this.userId ? { 'X-User-Id': this.userId } : {}),
            ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
        };
        const response = await fetch(url, { method: 'GET', headers });
        await notifyQuotaExceeded(response);
        const text = await response.text();
        if (!response.ok) {
            let errorMessage = `API Error: ${response.status}`;
            try {
                const errorJson = JSON.parse(text);
                errorMessage = Array.isArray(errorJson.message)
                    ? errorJson.message.join(', ')
                    : (errorJson.message || errorJson.error || errorMessage);
            } catch { errorMessage = text || errorMessage; }
            throw new Error(errorMessage);
        }
        const rawTotal = response.headers.get('X-Total-Count');
        const parsedTotal = rawTotal != null ? parseInt(rawTotal, 10) : NaN;
        const data = text ? JSON.parse(text) : ([] as unknown as T);
        return { data: data as T, total: Number.isNaN(parsedTotal) ? null : parsedTotal };
    }

    async post<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async patch<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    async put<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async delete<T>(endpoint: string, data?: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'DELETE',
            ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
        });
    }

    // Multipart upload — does NOT go through request() because that always
    // sets Content-Type: application/json. fetch() must set the multipart
    // boundary itself, so we send no Content-Type header here.
    async uploadFile(endpoint: string, file: File): Promise<{ url: string; media_id?: string }> {
        return this.uploadMultipart<{ url: string; media_id?: string }>(endpoint, file);
    }

    // Generic multipart upload — like uploadFile but allows extra form fields
    // (e.g. lead_id / deal_id) to be sent alongside the file. Never sets a
    // Content-Type header so fetch can emit the multipart boundary itself.
    async uploadMultipart<T = any>(
        endpoint: string,
        file: File,
        fields: Record<string, string | undefined> = {},
    ): Promise<T> {
        const formData = new FormData();
        formData.append('file', file);
        for (const [key, value] of Object.entries(fields)) {
            if (value !== undefined && value !== null) {
                formData.append(key, value);
            }
        }
        const headers: HeadersInit = {
            'X-Tenant-Id': this.tenantId,
            ...(this.orgId ? { 'X-Org-Id': this.orgId } : {}),
            ...(this.userId ? { 'X-User-Id': this.userId } : {}),
            ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
        };
        const res = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers,
            body: formData,
        });
        await notifyQuotaExceeded(res);
        if (!res.ok) {
            let msg = `Upload failed: ${res.status}`;
            try { const j = await res.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message; } catch { /* ignore */ }
            throw new Error(msg);
        }
        return res.json();
    }

    // Binary/file downloads (audit-trail export, etc.) — returns the raw Blob
    // plus the filename from Content-Disposition so callers can trigger a save.
    async getBlob(endpoint: string, params?: Record<string, any>): Promise<{ blob: Blob; filename: string | null }> {
        const queryString = params
            ? '?' + new URLSearchParams(
                Object.entries(params).reduce((acc, [key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        acc[key] = String(value);
                    }
                    return acc;
                }, {} as Record<string, string>)
            ).toString()
            : '';
        const headers: HeadersInit = {
            'X-Tenant-Id': this.tenantId,
            ...(this.orgId ? { 'X-Org-Id': this.orgId } : {}),
            ...(this.userId ? { 'X-User-Id': this.userId } : {}),
            ...(this.accessToken ? { 'Authorization': `Bearer ${this.accessToken}` } : {}),
        };
        const response = await fetch(`${this.baseURL}${endpoint}${queryString}`, { method: 'GET', headers });
        await notifyQuotaExceeded(response);
        if (!response.ok) {
            let msg = `API Error: ${response.status}`;
            try { const j = await response.json(); msg = j?.message || j?.error || msg; } catch { /* ignore */ }
            throw new Error(msg);
        }
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = /filename="?([^"]+)"?/i.exec(disposition);
        return { blob: await response.blob(), filename: match ? match[1] : null };
    }
}

const apiClient = new ApiClient(API_BASE_URL, TENANT_ID);
const coreClient = new ApiClient(CORE_API_ORIGIN, TENANT_ID);
const dailystoreClient = new ApiClient(DAILYSTORE_API_ORIGIN, TENANT_ID);
const inventoryClient = new ApiClient(INVENTORY_API_ORIGIN, TENANT_ID);
const fulfillmentClient = new ApiClient(`${FULFILLMENT_API_ORIGIN}/v1/fulfillment`, TENANT_ID);
const accountingClient = new ApiClient(ACCOUNTING_API_ORIGIN, TENANT_ID);
const inboxClient = new ApiClient(INBOX_API_ORIGIN, TENANT_ID);
// Neura AI's own public conversations API — called directly (same pattern as
// coreClient/dailystoreClient/etc. above), not proxied through CRM's backend,
// so the Neura AI Lead Copilot adds zero new logic to so360-crm-be. Neura BE
// sets no global route prefix (routes are bare /conversations, /agents, ...).
const neuraClient = new ApiClient(NEURA_API_ORIGIN, TENANT_ID);
// Projects module's own backend — Task <-> Project linking and the Project
// selector both need this. Projects BE sets no global route prefix (bare
// /projects, matching the neuraClient comment above's pattern).
const projectsClient = new ApiClient(PROJECTS_API_ORIGIN, TENANT_ID);

// Type Definitions for API Responses
interface LeadStatsResponse {
    stats: Array<{
        status: string;
        count: number;
    }>;
}

interface PipelineResponse {
    stages: Array<{
        id: string;
        name: string;
        order?: number;
        color?: string;
        is_terminal?: boolean;
        deals: Deal[];
    }>;
}

interface PipelineStage {
    id: string;
    name: string;
    order: number;
    color?: string;
}

// Redundant local CustomFieldDefinition removed to fix lint conflict with imported type

// ============================================================================
// LEADS API
// ============================================================================
export const leadsApi = {
    /**
     * GET /leads - Get all leads with filtering and pagination
     */
    getAll: async (params?: {
        skip?: number;
        take?: number;
        status?: string;
        q?: string;
    }): Promise<Lead[]> => {
        const apiParams = { ...params };
        if (params?.status && STATUS_MAP_FE_TO_BE[params.status]) {
            apiParams.status = STATUS_MAP_FE_TO_BE[params.status];
        }
        const leads = await apiClient.get<any[]>('/leads', apiParams);
        return leads.map(mapLeadFromApi);
    },

    /**
     * POST /leads - Create a new lead
     */
    create: async (data: any): Promise<Lead> => {
        if (data.status && STATUS_MAP_FE_TO_BE[data.status]) {
            data.status = STATUS_MAP_FE_TO_BE[data.status];
        }
        const lead = await apiClient.post<any>('/leads', data);
        return mapLeadFromApi(lead);
    },

    /**
     * GET /leads/stats - Get lead statistics aggregated by status
     */
    getStats: async (): Promise<LeadStatsResponse> => {
        return apiClient.get<LeadStatsResponse>('/leads/stats');
    },

    /**
     * GET /leads/:id - Get a single lead by ID
     */
    getById: async (id: string): Promise<Lead> => {
        const lead = await apiClient.get<any>(`/leads/${id}`);
        return mapLeadFromApi(lead);
    },

    /**
     * PATCH /leads/:id - Update an existing lead
     */
    update: async (id: string, data: any): Promise<Lead> => {
        if (data.status && STATUS_MAP_FE_TO_BE[data.status]) {
            data.status = STATUS_MAP_FE_TO_BE[data.status];
        }
        const lead = await apiClient.patch<any>(`/leads/${id}`, data);
        return mapLeadFromApi(lead);
    },

    /**
     * DELETE /leads/:id — soft-delete a lead.
     *
     * The backend stamps `deleted_at`, which drops the lead out of every
     * active-lead query (lists, counts, dashboard metrics, pipeline stages,
     * analytics, search). Reversible via restore().
     */
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/leads/${id}`);
    },

    /** POST /leads/:id/restore — bring a soft-deleted lead back. */
    restore: async (id: string): Promise<Lead> => {
        const lead = await apiClient.post<any>(`/leads/${id}/restore`, {});
        return mapLeadFromApi(lead);
    },

    /** POST /leads/bulk/restore — restore many soft-deleted leads. */
    bulkRestore: async (ids: string[]): Promise<{ requested: number; restored: string[]; failed: Array<{ id: string; error: string }> }> => {
        return apiClient.post('/leads/bulk/restore', { ids });
    },

    /**
     * GET /leads?only_deleted=true — the recycle bin. Same filter/sort/paging
     * pipeline as the active list, so the two views can never disagree.
     */
    getDeleted: async (params: { skip?: number; take?: number; q?: string; type?: string } = {}): Promise<Lead[]> => {
        const rows = await apiClient.get<any[]>('/leads', { ...params, only_deleted: 'true' });
        return (rows || []).map(mapLeadFromApi);
    },

    /**
     * GET /leads with server-side paging/sort/filter/projection + total count.
     * `filter` is a JSON string of the advanced filter tree; `sort` is
     * "field:dir,field2:dir". Returns { data, total } — total is null on an
     * older backend so the caller can fall back to client-side counting.
     */
    getPaged: async (params: {
        skip?: number;
        take?: number;
        q?: string;
        status?: string;
        source?: string;
        sort?: string;
        filter?: string;
        fields?: string;
    }): Promise<{ data: Lead[]; total: number | null }> => {
        const apiParams: Record<string, any> = { ...params, meta: 'true' };
        if (params.status && STATUS_MAP_FE_TO_BE[params.status]) {
            apiParams.status = STATUS_MAP_FE_TO_BE[params.status];
        }
        const res = await apiClient.getWithMeta<any[]>('/leads', apiParams);
        return { data: (res.data || []).map(mapLeadFromApi), total: res.total };
    },

    /**
     * POST /leads/bulk/update — apply a patch (owner/status/source/campaign/
     * priority) to many leads. Returns { requested, updated, failed }.
     */
    bulkUpdate: async (ids: string[], patch: Record<string, any>): Promise<{ requested: number; updated: string[]; failed: Array<{ id: string; error: string }> }> => {
        let effective = patch;
        if (patch.status && STATUS_MAP_FE_TO_BE[patch.status]) {
            effective = { ...patch, status: STATUS_MAP_FE_TO_BE[patch.status] };
        }
        return apiClient.post('/leads/bulk/update', { ids, patch: effective });
    },

    /** POST /leads/bulk/delete — delete many leads. */
    bulkDelete: async (ids: string[]): Promise<{ requested: number; deleted: string[]; failed: Array<{ id: string; error: string }> }> => {
        return apiClient.post('/leads/bulk/delete', { ids });
    },

    /** POST /leads/bulk/tags — add/remove tag pills across many leads. */
    bulkTags: async (ids: string[], add?: string[], remove?: string[]): Promise<{ requested: number; updated: string[]; failed: Array<{ id: string; error: string }> }> => {
        return apiClient.post('/leads/bulk/tags', { ids, add, remove });
    },
};

// ============================================================================
// GRID PREFERENCES API (saved views + column layout)
// ============================================================================
export interface GridView {
    id: string;
    name: string;
    entity_type: string;
    config: Record<string, any>;
    is_shared: boolean;
    is_default: boolean;
    user_id: string;
    created_at?: string;
    updated_at?: string;
}

export const gridPrefsApi = {
    listViews: (entityType = 'lead'): Promise<GridView[]> =>
        apiClient.get<GridView[]>('/grid/views', { entity_type: entityType }),
    createView: (dto: { name: string; entity_type?: string; config?: Record<string, any>; is_shared?: boolean; is_default?: boolean }): Promise<GridView> =>
        apiClient.post<GridView>('/grid/views', dto),
    getView: (id: string): Promise<GridView> =>
        apiClient.get<GridView>(`/grid/views/${id}`),
    updateView: (id: string, dto: Partial<Pick<GridView, 'name' | 'config' | 'is_shared' | 'is_default'>>): Promise<GridView> =>
        apiClient.patch<GridView>(`/grid/views/${id}`, dto),
    duplicateView: (id: string): Promise<GridView> =>
        apiClient.post<GridView>(`/grid/views/${id}/duplicate`, {}),
    setDefaultView: (id: string): Promise<GridView> =>
        apiClient.post<GridView>(`/grid/views/${id}/default`, {}),
    deleteView: (id: string): Promise<{ deleted: boolean }> =>
        apiClient.delete<{ deleted: boolean }>(`/grid/views/${id}`),
    getColumns: (entityType = 'lead'): Promise<{ prefs: Record<string, any> } | null> =>
        apiClient.get<{ prefs: Record<string, any> } | null>('/grid/columns', { entity_type: entityType }),
    saveColumns: (prefs: Record<string, any>, entityType = 'lead'): Promise<{ prefs: Record<string, any> }> =>
        apiClient.put<{ prefs: Record<string, any> }>('/grid/columns', { entity_type: entityType, prefs }),
    resetColumns: (entityType = 'lead'): Promise<{ reset: boolean }> =>
        apiClient.delete<{ reset: boolean }>(`/grid/columns?entity_type=${encodeURIComponent(entityType)}`),
};

// ============================================================================
// CUSTOMERS API
// ============================================================================
export const customersApi = {
    /**
     * GET /leads/customers - Get all customers with filtering and pagination
     */
    getAll: async (params?: {
        skip?: number;
        take?: number;
        channel?: string;
        category?: string;
        customer_ids?: string[];
        q?: string;
    }): Promise<any[]> => {
        const normalizedParams = {
            ...params,
            customer_ids: params?.customer_ids?.length ? params.customer_ids.join(',') : undefined,
        };
        return apiClient.get<any[]>('/leads/customers', normalizedParams);
    },

    /**
     * GET /leads/customers/stats - Get customer statistics by channel and category
     */
    getStats: async (): Promise<any> => {
        return apiClient.get<any>('/leads/customers/stats');
    },

    /**
     * PATCH /leads/:id/promote - Promote a lead to customer
     */
    promote: async (leadId: string): Promise<any> => {
        return apiClient.patch<any>(`/leads/${leadId}/promote`, {});
    },

    /**
     * PATCH /leads/customers/:id/tax-id - Validate and set tax ID
     */
    validateTaxId: async (customerId: string, taxId: string): Promise<any> => {
        return apiClient.patch<any>(`/leads/customers/${customerId}/tax-id`, { tax_id: taxId });
    },

    /**
     * PATCH /leads/customers/:id/credit-limit - Update credit limit
     */
    updateCreditLimit: async (customerId: string, creditLimit: number): Promise<any> => {
        return apiClient.patch<any>(`/leads/customers/${customerId}/credit-limit`, { credit_limit: creditLimit });
    },

    /**
     * GET /leads/customers/:id/business-profile - Read business profile from canonical Core partners row
     */
    getBusinessProfile: async (customerId: string): Promise<any> => {
        return apiClient.get<any>(`/leads/customers/${customerId}/business-profile`);
    },

    /**
     * PATCH /leads/customers/:id/business-profile - Update business profile on Core partners (single source of truth)
     */
    updateBusinessProfile: async (customerId: string, profile: Record<string, any>): Promise<any> => {
        return apiClient.patch<any>(`/leads/customers/${customerId}/business-profile`, profile);
    },
};

// ============================================================================
// DEALS API
// ============================================================================
export const dealsApi = {
    /**
     * GET /deals - Get all deals with filtering
     */
    getAll: async (params?: DealFilters): Promise<Deal[]> => {
        const deals = await apiClient.get<any[]>('/deals', params as any);
        return deals.map(mapDealFromApi);
    },

    /**
     * POST /deals - Create a new deal
     */
    create: async (data: any): Promise<Deal> => {
        const deal = await apiClient.post<any>('/deals', data);
        return mapDealFromApi(deal);
    },

    /**
     * GET /deals/generate-name - Auto-generate a deal name from the org naming
     * convention. Returns { name: '', isAutoGenerated: false } when the org has
     * auto-generation disabled (manual entry only).
     */
    generateName: async (params: { leadId?: string; companyName?: string; contactName?: string; ownerId?: string }): Promise<{ name: string; isAutoGenerated: boolean }> => {
        return apiClient.get('/deals/generate-name', params as any);
    },

    /**
     * GET /deals/pipeline - Get deals grouped by stage for Kanban pipeline
     */
    getPipeline: async (params?: DealFilters): Promise<PipelineResponse> => {
        const data = await apiClient.get<any>('/deals/pipeline', params as any);
        // Handle both array-of-stages and object-with-stages-property formats
        const stagesArray = Array.isArray(data) ? data : (data.stages || []);

        return {
            stages: stagesArray.map((s: any) => ({
                ...s,
                deals: (s.deals || []).map(mapDealFromApi)
            }))
        };
    },

    /**
     * GET /deals/:id - Get a single deal by ID
     */
    getById: async (id: string): Promise<Deal> => {
        const deal = await apiClient.get<any>(`/deals/${id}`);
        return mapDealFromApi(deal);
    },

    /**
     * PATCH /deals/:id - Update an existing deal
     */
    update: async (
        id: string,
        data: any
    ): Promise<Deal> => {
        const deal = await apiClient.patch<any>(`/deals/${id}`, data);
        return {
            ...deal,
            owner: mapUser(deal.owner, deal.owner_id),
        };
    },

    /**
     * DELETE /deals/:id - Delete a deal
     */
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/deals/${id}`);
    },

    /**
     * GET /deals/performance/by-person - Get sales performance metrics by sales rep (person)
     */
    getSalesPerformanceByPerson: async (params?: {
        start_date?: string;
        end_date?: string;
    }): Promise<any[]> => {
        return apiClient.get<any[]>('/deals/performance/by-person', params);
    },

    /**
     * GET /deals/by-person/:person_id - Get all deals for a specific sales person
     */
    getDealsByPerson: async (personId: string, params?: {
        status?: string;
        stage_id?: string;
    }): Promise<Deal[]> => {
        const deals = await apiClient.get<any[]>(`/deals/by-person/${personId}`, params);
        return deals.map(mapDealFromApi);
    },
};

// ============================================================================
// TASKS API
// ============================================================================
export const tasksApi = {
    /**
     * GET /tasks - Get all tasks with filtering for overdue or status
     */
    getAll: async (params?: {
        status?: string;
        overdue?: boolean;
        lead_id?: string;
        deal_id?: string;
    }): Promise<Task[]> => {
        const tasks = await apiClient.get<any[]>('/tasks', params);
        return tasks.map(mapTaskFromApi);
    },

    /**
     * POST /tasks - Create a new task
     */
    create: async (data: any): Promise<Task> => {
        const task = await apiClient.post<any>('/tasks', data);
        return mapTaskFromApi(task);
    },

    /**
     * GET /tasks/:id - Get a single task by ID
     */
    getById: async (id: string): Promise<Task> => {
        const task = await apiClient.get<any>(`/tasks/${id}`);
        return mapTaskFromApi(task);
    },

    /**
     * PATCH /tasks/:id - Update an existing task
     */
    update: async (id: string, data: any): Promise<Task> => {
        const task = await apiClient.patch<any>(`/tasks/${id}`, data);
        return mapTaskFromApi(task);
    },

    /**
     * DELETE /tasks/:id - Delete a task
     */
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/tasks/${id}`);
    },

    /**
     * PATCH /tasks/bulk - Bulk update multiple tasks
     */
    bulkUpdate: async (data: {
        ids: string[];
        data: {
            title?: string;
            due_date?: string;
            status?: string;
            assignee_id?: string;
            lead_id?: string;
            deal_id?: string;
        };
    }): Promise<{ updated: number }> => {
        return apiClient.patch<{ updated: number }>('/tasks/bulk', data);
    },
};

export const activitiesApi = {
    getAllByLead: async (leadId: string): Promise<Activity[]> => {
        const activities = await apiClient.get<any[]>(`/activities/lead/${leadId}`);
        return activities.map(mapActivityFromApi);
    },
    getAllByLeadPaginated: async (leadId: string, limit: number, offset: number): Promise<{ data: Activity[], total: number }> => {
        const result = await apiClient.get<{ data: any[], total: number }>(`/activities/lead/${leadId}?limit=${limit}&offset=${offset}`);
        return { data: (result.data || []).map(mapActivityFromApi), total: result.total || 0 };
    },
    create: async (data: any): Promise<Activity> => {
        const activity = await apiClient.post<any>('/activities', data);
        return mapActivityFromApi(activity);
    },
    update: async (id: string, data: any): Promise<Activity> => {
        const activity = await apiClient.patch<any>(`/activities/${id}`, data);
        return mapActivityFromApi(activity);
    },
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/activities/${id}`);
    }
};

// ============================================================================
// AUDIT TRAIL API (Task 7)
// ============================================================================
export interface AuditTrailEntry {
    id: string;
    kind: 'field_change' | 'business_event';
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    description: string | null;
    changed_by: string | null;
    changed_by_name: string | null;
    source: string | null;
    module: string | null;
    change_reason: string | null;
    metadata: Record<string, any>;
    created_at: string;
}

export interface AuditTrailFilters {
    field_name?: string;
    source?: string;
    module?: string;
    user_id?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
}

export const auditTrailApi = {
    getAuditTrail: async (
        entityType: string,
        entityId: string,
        filters: AuditTrailFilters = {},
    ): Promise<{ data: AuditTrailEntry[]; meta: { total: number; limit: number; offset: number } }> => {
        return apiClient.get(`/audit-trail/${entityType}/${entityId}`, filters);
    },
    exportAuditTrail: async (
        entityType: string,
        entityId: string,
        format: 'csv' | 'xlsx' | 'pdf',
        filters: AuditTrailFilters = {},
    ): Promise<{ blob: Blob; filename: string | null }> => {
        return apiClient.getBlob(`/audit-trail/${entityType}/${entityId}/export`, { ...filters, format });
    },
};

// ============================================================================
// TIMELINE API (Task 4 — Customer Timeline)
// ============================================================================
export interface EntityTimelineEvent {
    id: string;
    icon: string;
    title: string;
    description: string;
    actor_id: string | null;
    actor_name: string | null;
    created_at: string;
    module: string;
    related_type: string | null;
    related_id: string | null;
    status_badge: string | null;
    group_key: string;
}

export interface EntityTimelineSummary {
    last_interaction_at: string | null;
    most_active_contact: string | null;
    counts: Record<string, number>;
    pending_tasks: number;
    latest_stage: string | null;
    idle_days: number | null;
    health_status: 'very_active' | 'healthy' | 'neutral' | 'at_risk' | 'dormant';
}

export interface TimelineFilters {
    module?: string;
    category?: string;
    range?: 'today' | 'yesterday' | '7d' | '30d' | 'custom';
    start?: string;
    end?: string;
    search?: string;
    cursor?: string;
    limit?: number;
}

export const timelineApi = {
    getTimeline: async (
        entityType: string,
        entityId: string,
        filters: TimelineFilters = {},
    ): Promise<{ data: EntityTimelineEvent[]; nextCursor: string | null; summary: EntityTimelineSummary }> => {
        return apiClient.get(`/audit-trail/${entityType}/${entityId}/timeline`, filters);
    },
};

// ============================================================================
// INBOX INTEGRATION API (Task 3 — Emails tab reuses Inbox's own conversations,
// does not build a second compose/reply/forward UI)
// ============================================================================
export interface InboxConversationPreview {
    id: string;
    entity_id: string;
    platform: 'whatsapp' | 'instagram' | 'facebook' | 'web_chat' | 'email';
    customer_name?: string;
    status: string;
    handler: string;
    topic?: string;
    message_count: number;
    last_message_at: string;
}

export const inboxIntegrationApi = {
    getConversationsForLead: async (leadId: string): Promise<{ data: InboxConversationPreview[]; total: number }> => {
        return inboxClient.get(`/conversations/by-crm-lead/${leadId}`);
    },
    getMessages: async (entityId: string, conversationId: string): Promise<any[]> => {
        const result = await inboxClient.get<{ data: any[] }>(`/conversations/${entityId}/${conversationId}/messages`);
        return (result as any).data || result;
    },
};

// ============================================================================
// MEETINGS API (Task 3)
// ============================================================================
export const meetingsApi = {
    getByLead: async (leadId: string): Promise<Meeting[]> => {
        return apiClient.get(`/meetings/lead/${leadId}`);
    },
    getByDeal: async (dealId: string): Promise<Meeting[]> => {
        return apiClient.get(`/meetings/deal/${dealId}`);
    },
    create: async (data: Partial<Meeting>): Promise<Meeting> => {
        return apiClient.post('/meetings', data);
    },
    update: async (id: string, data: Partial<Meeting>): Promise<Meeting> => {
        return apiClient.patch(`/meetings/${id}`, data);
    },
    cancel: async (id: string): Promise<Meeting> => {
        return apiClient.post(`/meetings/${id}/cancel`, {});
    },
    complete: async (id: string, outcome?: string, nextSteps?: string): Promise<Meeting> => {
        return apiClient.post(`/meetings/${id}/complete`, { outcome, next_steps: nextSteps });
    },
    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/meetings/${id}`);
    },
};

// ============================================================================
// STAKEHOLDERS API (Task 6)
// ============================================================================
export interface StakeholderFilters {
    role?: string;
    department?: string;
    is_active?: boolean;
    relationship_strength?: string;
    search?: string;
}

export const stakeholderApi = {
    listByLead: async (leadId: string, filters: StakeholderFilters = {}): Promise<Stakeholder[]> => {
        return apiClient.get(`/leads/${leadId}/stakeholders`, filters as Record<string, any>);
    },
    getHierarchy: async (leadId: string): Promise<Stakeholder[]> => {
        return apiClient.get(`/leads/${leadId}/stakeholders/hierarchy`);
    },
    create: async (leadId: string, data: Partial<Stakeholder> & { role_names?: string[] }): Promise<Stakeholder> => {
        return apiClient.post(`/leads/${leadId}/stakeholders`, data);
    },
    getById: async (id: string): Promise<Stakeholder> => {
        return apiClient.get(`/stakeholders/${id}`);
    },
    update: async (id: string, data: Partial<Stakeholder> & { role_names?: string[] }): Promise<Stakeholder> => {
        return apiClient.patch(`/stakeholders/${id}`, data);
    },
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/stakeholders/${id}`);
    },
    assignRoles: async (id: string, roleNames: string[]): Promise<void> => {
        await apiClient.put(`/stakeholders/${id}/roles`, { role_names: roleNames });
    },
    setHierarchy: async (id: string, reportsToStakeholderId: string | null): Promise<Stakeholder> => {
        return apiClient.patch(`/stakeholders/${id}/hierarchy`, { reports_to_stakeholder_id: reportsToStakeholderId });
    },
    linkDeal: async (id: string, dealId: string, involvementRole?: string): Promise<void> => {
        await apiClient.post(`/stakeholders/${id}/deals`, { deal_id: dealId, involvement_role: involvementRole });
    },
    unlinkDeal: async (id: string, dealId: string): Promise<void> => {
        await apiClient.delete(`/stakeholders/${id}/deals/${dealId}`);
    },
    getActivitySummary: async (id: string): Promise<StakeholderActivitySummary> => {
        return apiClient.get(`/stakeholders/${id}/activity-summary`);
    },
    search: async (filters: StakeholderFilters = {}): Promise<Stakeholder[]> => {
        return apiClient.get('/stakeholders/search', filters as Record<string, any>);
    },
};

// ============================================================================
// SETTINGS API
// ============================================================================
export const settingsApi = {
    // Pipeline Stages
    pipelineStages: {
        /**
         * GET /settings/pipeline-stages - Get all pipeline stages
         */
        getAll: async (): Promise<PipelineStage[]> => {
            return apiClient.get<PipelineStage[]>('/settings/pipeline-stages');
        },

        /**
         * POST /settings/pipeline-stages - Create a new pipeline stage
         */
        create: async (data: {
            name: string;
            order: number;
            color?: string;
            type?: 'OPEN' | 'WON' | 'LOST';
        }): Promise<PipelineStage> => {
            return apiClient.post<PipelineStage>('/settings/pipeline-stages', data);
        },

        /**
         * PATCH /settings/pipeline-stages/:id - Update an existing pipeline stage
         */
        update: async (
            id: string,
            data: {
                name?: string;
                order?: number;
                color?: string;
                type?: 'OPEN' | 'WON' | 'LOST';
            }
        ): Promise<PipelineStage> => {
            return apiClient.patch<PipelineStage>(
                `/settings/pipeline-stages/${id}`,
                data
            );
        },

        /**
         * DELETE /settings/pipeline-stages/:id - Delete a pipeline stage
         */
        delete: async (id: string): Promise<{ message: string }> => {
            return apiClient.delete<{ message: string }>(
                `/settings/pipeline-stages/${id}`
            );
        },
    },

    // Custom Fields
    customFields: {
        /**
         * GET /settings/custom-fields - Get all custom field definitions
         */
        getAll: async (params?: {
            entity_type?: 'LEAD' | 'DEAL' | 'PARTNER';
        }): Promise<CustomFieldDefinition[]> => {
            return apiClient.get<CustomFieldDefinition[]>(
                '/settings/custom-fields',
                params
            );
        },

        /**
         * POST /settings/custom-fields - Create a new custom field definition
         */
        create: async (data: {
            entity_type: 'LEAD' | 'DEAL' | 'PARTNER';
            label: string;
            field_type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT';
            options?: string[];
            is_required?: boolean;
        }): Promise<CustomFieldDefinition> => {
            return apiClient.post<CustomFieldDefinition>(
                '/settings/custom-fields',
                data
            );
        },

        /**
         * PATCH /settings/custom-fields/:id - Update a custom field definition
         */
        update: async (
            id: string,
            data: {
                label?: string;
                options?: string[];
                is_required?: boolean;
            }
        ): Promise<CustomFieldDefinition> => {
            return apiClient.patch<CustomFieldDefinition>(
                `/settings/custom-fields/${id}`,
                data
            );
        },

        /**
         * DELETE /settings/custom-fields/:id - Delete a custom field definition
         */
        delete: async (id: string): Promise<{ message: string }> => {
            return apiClient.delete<{ message: string }>(
                `/settings/custom-fields/${id}`
            );
        },
    },

    sourceTypes: {
        getAll: async () => {
            return apiClient.get<any[]>('/settings/source-types');
        },
        create: async (data: { label: string; value: string; sort_order?: number }) => {
            return apiClient.post<any>('/settings/source-types', data);
        },
        update: async (id: string, data: { label?: string; is_active?: boolean; sort_order?: number }) => {
            return apiClient.patch<any>(`/settings/source-types/${id}`, data);
        },
        delete: async (id: string) => {
            return apiClient.delete<any>(`/settings/source-types/${id}`);
        },
    },

    partnerTypes: {
        getAll: async () => {
            return apiClient.get<any[]>('/settings/partner-types');
        },
        create: async (data: { label: string; value: string; sort_order?: number }) => {
            return apiClient.post<any>('/settings/partner-types', data);
        },
        update: async (id: string, data: { label?: string; is_active?: boolean; sort_order?: number }) => {
            return apiClient.patch<any>(`/settings/partner-types/${id}`, data);
        },
        delete: async (id: string) => {
            return apiClient.delete<any>(`/settings/partner-types/${id}`);
        },
    },

    scoringRules: {
        getAll: async (): Promise<LeadScoringRule[]> => {
            return apiClient.get<LeadScoringRule[]>('/settings/scoring-rules');
        },
        create: async (data: Omit<LeadScoringRule, 'id'>): Promise<LeadScoringRule> => {
            return apiClient.post<LeadScoringRule>('/settings/scoring-rules', data);
        },
        update: async (id: string, data: Partial<LeadScoringRule>): Promise<LeadScoringRule> => {
            return apiClient.patch<LeadScoringRule>(`/settings/scoring-rules/${id}`, data);
        },
        delete: async (id: string): Promise<void> => {
            return apiClient.delete<void>(`/settings/scoring-rules/${id}`);
        },
        recalculate: async (): Promise<{ recalculated: number }> => {
            return apiClient.post<{ recalculated: number }>('/settings/scoring-rules/recalculate', {});
        },
    },

    scoreCategories: {
        getAll: async (): Promise<ScoreCategory[]> => {
            return apiClient.get<ScoreCategory[]>('/settings/score-categories');
        },
        update: async (id: string, data: Partial<ScoreCategory>): Promise<ScoreCategory> => {
            return apiClient.patch<ScoreCategory>(`/settings/score-categories/${id}`, data);
        },
    },
};



// ============================================================================
// PARTNERS API
// ============================================================================
export const partnersApi = {
    getAll: async (params?: { search?: string; partner_type?: string; skip?: number; take?: number }) => {
        return apiClient.get<any[]>('/partners', params);
    },
    create: async (data: any) => {
        return apiClient.post<any>('/partners', data);
    },
    getOne: async (id: string) => {
        return apiClient.get<any>(`/partners/${id}`);
    },
    update: async (id: string, data: any) => {
        return apiClient.patch<any>(`/partners/${id}`, data);
    },
    getDeals: async (id: string) => {
        return apiClient.get<any>(`/partners/${id}/deals`);
    },
    getCommissions: async (id: string) => {
        return apiClient.get<any>(`/partners/${id}/commissions`);
    },
    updateCommission: async (commissionId: string, data: { status: string; payment_ref?: string }) => {
        return apiClient.patch<any>(`/commissions/${commissionId}`, data);
    },
};

// ============================================================================
// NOTES API
// ============================================================================
export const notesApi = {
    getAllByLead: async (leadId: string): Promise<Note[]> => {
        const notes = await apiClient.get<any[]>(`/notes/lead/${leadId}`);
        return notes.map(mapNoteFromApi);
    },
    getAllByDeal: async (dealId: string): Promise<Note[]> => {
        const notes = await apiClient.get<any[]>(`/notes/deal/${dealId}`);
        return notes.map(mapNoteFromApi);
    },
    create: async (data: any): Promise<Note> => {
        const note = await apiClient.post<any>('/notes', data);
        return mapNoteFromApi(note);
    },
    update: async (id: string, data: any): Promise<Note> => {
        const note = await apiClient.patch<any>(`/notes/${id}`, data);
        return mapNoteFromApi(note);
    },
    delete: async (id: string): Promise<void> => {
        return apiClient.delete<void>(`/notes/${id}`);
    },
};

// ============================================================================
// DOCUMENTS API
// ============================================================================
export const documentsApi = {
    getAllByLead: async (leadId: string): Promise<Attachment[]> => {
        const docs = await apiClient.get<any[]>(`/documents/lead/${leadId}`);
        return docs.map(mapDocumentFromApi);
    },
    getAllByDeal: async (dealId: string): Promise<Attachment[]> => {
        const docs = await apiClient.get<any[]>(`/documents/deal/${dealId}`);
        return docs.map(mapDocumentFromApi);
    },
    create: async (data: any): Promise<Attachment> => {
        const doc = await apiClient.post<any>('/documents', data);
        return mapDocumentFromApi(doc);
    },
    // Single-step DMS upload — pushes the file straight to the CRM BE, which
    // streams it into the Document Management Service and creates the documents
    // row (carrying dms_document_id) in one round-trip.
    upload: async (file: File, entity: { lead_id?: string; deal_id?: string }): Promise<Attachment> => {
        const doc = await apiClient.uploadMultipart<any>('/documents/upload', file, {
            lead_id: entity.lead_id,
            deal_id: entity.deal_id,
        });
        return mapDocumentFromApi(doc);
    },
    // Resolves a (signed) download URL for a DMS-backed document.
    getDownloadUrl: async (id: string): Promise<string> => {
        const res = await apiClient.get<{ url: string; source?: string }>(`/documents/${id}/download-url`);
        return res.url;
    },
    delete: async (id: string): Promise<void> => {
        return apiClient.delete<void>(`/documents/${id}`);
    },
};

// ============================================================================
// CALLS API — call recordings, transcripts, emotion/sentiment analysis
// ============================================================================
export interface CallRecord {
    id: string;
    tenant_id: string;
    org_id: string;
    lead_id: string | null;
    deal_id: string | null;
    direction: 'inbound' | 'outbound';
    occurred_at: string;
    duration_seconds: number | null;
    phone_number: string | null;
    owner_person_id: string | null;
    dms_document_id: string | null;
    transcript: any;
    transcript_text: string | null;
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' | null;
    emotion_scores: Record<string, number> | null;
    external_call_id: string | null;
    source: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface CallUploadFields {
    lead_id?: string;
    deal_id?: string;
    direction?: 'inbound' | 'outbound';
    occurred_at?: string;
    duration_seconds?: number;
    phone_number?: string;
    owner_person_id?: string;
    transcript_text?: string;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
    external_call_id?: string;
    source?: string;
}

export const callsApi = {
    getAllByLead: async (leadId: string): Promise<CallRecord[]> => {
        return apiClient.get<CallRecord[]>(`/calls/lead/${leadId}`);
    },
    getAllByDeal: async (dealId: string): Promise<CallRecord[]> => {
        return apiClient.get<CallRecord[]>(`/calls/deal/${dealId}`);
    },
    getOne: async (id: string): Promise<CallRecord> => {
        return apiClient.get<CallRecord>(`/calls/${id}`);
    },
    // Single-step upload — pushes the audio file straight to the CRM BE, which
    // streams it into the Document Management Service and creates the
    // crm_call_records row (carrying dms_document_id) in one round-trip.
    upload: async (file: File, fields: CallUploadFields): Promise<CallRecord> => {
        return apiClient.uploadMultipart<CallRecord>('/calls/upload', file, {
            lead_id: fields.lead_id,
            deal_id: fields.deal_id,
            direction: fields.direction,
            occurred_at: fields.occurred_at,
            duration_seconds: fields.duration_seconds !== undefined ? String(fields.duration_seconds) : undefined,
            phone_number: fields.phone_number,
            owner_person_id: fields.owner_person_id,
            transcript_text: fields.transcript_text,
            sentiment: fields.sentiment,
            external_call_id: fields.external_call_id,
            source: fields.source,
        });
    },
    // Resolves a signed playback URL for a DMS-backed recording. Resolved on
    // demand — callers should not fetch until the user clicks play.
    getPlaybackUrl: async (id: string): Promise<{ url: string; expires_in: number }> => {
        return apiClient.get<{ url: string; expires_in: number }>(`/calls/${id}/playback-url`);
    },
    update: async (id: string, data: Partial<Pick<CallRecord, 'transcript_text' | 'sentiment' | 'emotion_scores' | 'duration_seconds'>>): Promise<CallRecord> => {
        return apiClient.patch<CallRecord>(`/calls/${id}`, data);
    },
    delete: async (id: string): Promise<void> => {
        return apiClient.delete<void>(`/calls/${id}`);
    },
};

// ============================================================================
// USERS API
// ============================================================================



// ============================================================================
// LEGACY COMPATIBILITY LAYER
// ============================================================================
// Maintain backward compatibility with existing code
export const crmService = {
    getDailystoreStores: async (): Promise<Array<{ id: string; name: string; store_code?: string; status?: string }>> => {
        return dailystoreClient.get<Array<{ id: string; name: string; store_code?: string; status?: string }>>('/v1/dailystore/stores');
    },

    // Cross-link resolver — batch-resolve mixed entity refs to display labels via the
    // Core aggregator (which fans out to each owning module's /links/resolve).
    resolveLinks: async (
        refs: Array<{ type: string; id: string }>,
    ): Promise<Array<{ type: string; id: string; label: string; subtitle?: string; status?: string; deep_link?: string }>> => {
        if (!refs.length) return [];
        const res = await coreClient.post<{ links?: any[] }>('/v1/links/resolve', { refs });
        return Array.isArray(res?.links) ? res.links : [];
    },

    // Leads
    getLeads: async (params?: { skip?: number; take?: number; status?: string; q?: string }): Promise<Lead[]> => {
        return leadsApi.getAll(params);
    },

    // Leads — server-side paged/sorted/filtered variant (enterprise grid)
    getLeadsPaged: async (params: {
        skip?: number; take?: number; q?: string; status?: string; source?: string;
        sort?: string; filter?: string; fields?: string;
    }): Promise<{ data: Lead[]; total: number | null }> => {
        return leadsApi.getPaged(params);
    },

    // Bulk lead operations
    bulkUpdateLeads: (ids: string[], patch: Record<string, any>) => leadsApi.bulkUpdate(ids, patch),
    bulkDeleteLeads: (ids: string[]) => leadsApi.bulkDelete(ids),
    bulkRestoreLeads: (ids: string[]) => leadsApi.bulkRestore(ids),
    bulkTagLeads: (ids: string[], add?: string[], remove?: string[]) => leadsApi.bulkTags(ids, add, remove),

    // Grid preferences (saved views + column layout), delegated to gridPrefsApi
    gridViews: {
        list: (entityType = 'lead') => gridPrefsApi.listViews(entityType),
        create: (dto: { name: string; entity_type?: string; config?: Record<string, any>; is_shared?: boolean; is_default?: boolean }) => gridPrefsApi.createView(dto),
        get: (id: string) => gridPrefsApi.getView(id),
        update: (id: string, dto: Partial<Pick<GridView, 'name' | 'config' | 'is_shared' | 'is_default'>>) => gridPrefsApi.updateView(id, dto),
        duplicate: (id: string) => gridPrefsApi.duplicateView(id),
        setDefault: (id: string) => gridPrefsApi.setDefaultView(id),
        remove: (id: string) => gridPrefsApi.deleteView(id),
    },
    gridColumns: {
        get: (entityType = 'lead') => gridPrefsApi.getColumns(entityType),
        save: (prefs: Record<string, any>, entityType = 'lead') => gridPrefsApi.saveColumns(prefs, entityType),
        reset: (entityType = 'lead') => gridPrefsApi.resetColumns(entityType),
    },

    getDashboardStats: async (params?: {
        period?: 'yearly' | 'quarterly' | 'monthly' | 'weekly';
        year?: number;
        quarter?: number;
        month?: number;
        week?: number;
    }) => {
        try {
            // If period filtering is requested, use the new backend endpoint
            if (params?.period) {
                const queryParams = new URLSearchParams();
                queryParams.append('period', params.period);
                if (params.year) queryParams.append('year', params.year.toString());
                if (params.quarter) queryParams.append('quarter', params.quarter.toString());
                if (params.month) queryParams.append('month', params.month.toString());
                if (params.week) queryParams.append('week', params.week.toString());

                const [periodStats, performanceStats, tasks] = await Promise.all([
                    apiClient.get<any>(`/analytics/dashboard?${queryParams.toString()}`),
                    apiClient.get<any>('/analytics/performance').catch(() => []),
                    crmService.getTasks(),
                ]);

                // Compute team stats from real performance data
                const teamStats = (performanceStats || []).map((p: any) => ({
                    user: {
                        id: p.user.id,
                        full_name: p.user.name,
                        email: p.user.email,
                        avatar_url: null,
                        role: 'Sales Rep'
                    },
                    revenue: 0,
                    dealCount: p.metrics.won,
                    activeLeads: p.metrics.leads,
                    activityCount: p.metrics.activityPoints,
                    conversionRate: p.metrics.conversionRate,
                })).sort((a: any, b: any) => b.dealCount - a.dealCount);

                // Get reminders
                const reminders = tasks.filter((t: any) =>
                    t.status === 'OPEN' && t.type === 'REMINDER'
                ).sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

                return {
                    financials: {
                        totalRevenue: periodStats.financials.totalRevenue,
                        pipelineValue: periodStats.financials.pipelineValue,
                        avgDealSize: periodStats.financials.avgDealSize,
                        winRate: periodStats.metrics.winRate,
                    },
                    counts: {
                        leads: periodStats.counts.totalLeads,
                        deals: periodStats.counts.totalDeals,
                        tasks: tasks.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
                        reminders: reminders.length
                    },
                    teamStats,
                    monthlyRevenue: periodStats.chartData.values,
                    chartLabels: periodStats.chartData.labels,
                    reminders
                };
            }

            // Otherwise, use the legacy client-side aggregation
            const [leads, deals, users, tasks, settings] = await Promise.all([
                crmService.getLeads(),
                crmService.getDeals(),
                crmService.getUsers(),
                crmService.getTasks(),
                crmService.getSettings()
            ]);

            // Map deal stages for easier lookup
            const wonStageIds = settings.deal_stages.filter((s: any) => s.type === 'WON' || s.name === 'Won').map((s: any) => s.id);
            const lostStageIds = settings.deal_stages.filter((s: any) => s.type === 'LOST' || s.name === 'Lost').map((s: any) => s.id);

            // 1. Financials
            const wonDeals = deals.filter((d: any) =>
                (d.stage_id && wonStageIds.includes(d.stage_id)) || d.stage === 'Won'
            );
            const openDeals = deals.filter((d: any) =>
                (d.stage !== 'Won' && d.stage !== 'Lost') &&
                (!d.stage_id || (!wonStageIds.includes(d.stage_id) && !lostStageIds.includes(d.stage_id)))
            );

            const totalRevenue = wonDeals.reduce((sum: number, d: any) => sum + d.value, 0);
            const pipelineValue = openDeals.reduce((sum: number, d: any) => sum + d.value, 0);
            const avgDealSize = wonDeals.length > 0 ? totalRevenue / wonDeals.length : 0;
            const closedDealsCount = deals.filter((d: any) =>
                d.stage === 'Won' || d.stage === 'Lost' ||
                (d.stage_id && (wonStageIds.includes(d.stage_id) || lostStageIds.includes(d.stage_id)))
            ).length;
            const winRate = closedDealsCount > 0 ? (wonDeals.length / closedDealsCount) * 100 : 0;

            // 2. Team Performance
            const teamStats = users.map((user: User) => {
                const userWonDeals = wonDeals.filter((d: any) => d.owner.id === user.id);
                const revenue = userWonDeals.reduce((sum: number, d: any) => sum + d.value, 0);
                const dealCount = userWonDeals.length;

                const userLeads = leads.filter((l: any) => l.owner.id === user.id);
                const totalUserLeads = userLeads.length;
                const activeLeads = userLeads.filter((l: any) => l.status !== 'Converted' && l.status !== 'Lost').length;

                // Aggregate activities for this user across all leads and deals
                const leadActivities = leads.reduce((sum: number, lead: any) => {
                    return sum + (lead.activities || []).filter((a: any) => a.author.id === user.id).length;
                }, 0);
                const dealActivities = deals.reduce((sum: number, deal: any) => {
                    return sum + (deal.activities || []).filter((a: any) => a.author.id === user.id).length;
                }, 0);
                const activityCount = leadActivities + dealActivities;

                // Conversion Rate: Won Deals / Total Leads (if any)
                const conversionRate = totalUserLeads > 0 ? (dealCount / totalUserLeads) * 100 : 0;

                return {
                    user,
                    revenue,
                    dealCount,
                    activeLeads,
                    activityCount,
                    conversionRate
                };
            }).sort((a, b) => b.revenue - a.revenue);

            // 3. Periodic Data
            const monthlyRevenue = new Array(12).fill(0);
            wonDeals.forEach(d => {
                const date = new Date(d.created_at);
                if (date.getFullYear() === new Date().getFullYear()) {
                    monthlyRevenue[date.getMonth()] += d.value;
                }
            });

            // 4. Reminders
            const reminders = tasks.filter(t =>
                t.status === 'OPEN' && t.type === 'REMINDER'
            ).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

            return {
                financials: {
                    totalRevenue,
                    pipelineValue,
                    avgDealSize,
                    winRate: isNaN(winRate) ? 0 : winRate
                },
                counts: {
                    leads: leads.length,
                    deals: deals.length,
                    tasks: tasks.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
                    reminders: reminders.length
                },
                teamStats,
                monthlyRevenue,
                reminders
            };
        } catch (error) {
            console.error('Failed to get dashboard stats', error);
            return {
                financials: { totalRevenue: 0, pipelineValue: 0, avgDealSize: 0, winRate: 0 },
                counts: { leads: 0, deals: 0, tasks: 0, reminders: 0 },
                teamStats: [],
                monthlyRevenue: new Array(12).fill(0),
                reminders: []
            };
        }
    },

    createLead: async (lead: Omit<Lead, 'id' | 'created_at' | 'owner'> & { owner_id?: string }): Promise<Lead> => {
        return leadsApi.create({
            company_name: lead.company_name,
            first_name: (lead as any).first_name,
            last_name: (lead as any).last_name,
            email: lead.contact_email,
            phone: lead.phone,
            alt_phone: (lead as any).alt_phone,
            address: (lead as any).address,
            city: (lead as any).city,
            pin_code: (lead as any).pin_code,
            // Carries the postal-code rule the record was validated against.
            country: (lead as any).country,
            status: lead.status || 'New',
            source: lead.source,
            owner_id: lead.owner_id || USER_ID,
            referred_by: (lead as any).referred_by,
            meta_data: lead.custom_fields,
        });
    },

    getLeadById: async (id: string): Promise<Lead | undefined> => {
        try {
            return await leadsApi.getById(id);
        } catch (error) {
            // A permission denial is not "no such lead". Collapsing both into
            // `undefined` is what made Lead Detail tell users a lead did not exist
            // when they simply were not allowed to see it. Callers that only care
            // about presence still get undefined for every other failure; the two
            // chained callers (LeadDetailPanel, QuoteDetailPage) already catch.
            if ((error as { status?: number })?.status === 403) throw error;
            return undefined;
        }
    },

    updateLead: async (id: string, updates: Partial<Lead>): Promise<Lead> => {
        // Whitelist updateable fields to avoid sending relation objects to backend
        const data: any = {};
        if ((updates as any).first_name !== undefined) data.first_name = (updates as any).first_name;
        if ((updates as any).last_name !== undefined) data.last_name = (updates as any).last_name;
        if (updates.contact_name !== undefined) data.contact_name = updates.contact_name;
        if (updates.company_name !== undefined) data.company_name = updates.company_name;
        if (updates.contact_email !== undefined) data.email = updates.contact_email;
        if (updates.phone !== undefined) data.phone = updates.phone;
        if (updates.source !== undefined) data.source = updates.source;
        if (updates.status !== undefined) {
            // Check if it's FE name or BE name
            data.status = STATUS_MAP_FE_TO_BE[updates.status] || updates.status;
        }
        if (updates.owner !== undefined) {
            data.owner_id = updates.owner.id;
        } else if ((updates as any).owner_id !== undefined) {
            data.owner_id = (updates as any).owner_id;
        }
        if (updates.custom_fields !== undefined) data.meta_data = updates.custom_fields;
        if ((updates as any).referred_by !== undefined) data.referred_by = (updates as any).referred_by || null;
        if (updates.type !== undefined) data.type = updates.type;

        return leadsApi.update(id, data);
    },

    deleteLead: async (id: string): Promise<void> => {
        return leadsApi.delete(id);
    },

    restoreLead: async (id: string): Promise<Lead> => {
        return leadsApi.restore(id);
    },

    getDeletedLeads: async (params?: { skip?: number; take?: number; q?: string; type?: string }): Promise<Lead[]> => {
        return leadsApi.getDeleted(params);
    },

    getPartners: async (): Promise<Lead[]> => {
        return partnersApi.getAll({ take: 200 }) as any;
    },

    // Deals
    getDeals: async (filters?: DealFilters): Promise<Deal[]> => {
        const deals = await dealsApi.getAll(filters);

        if (!filters || Object.keys(filters).length === 0) return deals;

        // Apply client-side filtering if backend doesn't support all filters yet
        return deals.filter(deal => {
            if (filters.owner_id && deal.owner.id !== filters.owner_id) return false;
            if (filters.lead_id && deal.lead_id !== filters.lead_id) return false;
            if (filters.company_name && !deal.company_name.toLowerCase().includes(filters.company_name.toLowerCase())) return false;

            if (filters.date_range && deal.created_at) {
                const dealDate = new Date(deal.created_at);
                const now = new Date();
                // Simple date range check (can be expanded)
                if (filters.date_range === 'today') {
                    return dealDate.toDateString() === now.toDateString();
                }
                // ... more ranges if needed, but this is enough to show it works
            }

            return true;
        });
    },

    getDealById: async (id: string): Promise<Deal | undefined> => {
        try {
            return await dealsApi.getById(id);
        } catch (error) {
            return undefined;
        }
    },

    updateDealStage: async (id: string, stage: string, reason?: string): Promise<void> => {
        // stage is now a flow state code (e.g. 'qualified') — send as target_state
        await dealsApi.update(id, { target_state: stage });
    },

    getPipeline: async (filters?: DealFilters): Promise<PipelineResponse> => {
        try {
            // Priority 1: Try the specialized pipeline endpoint
            const pipelineData = await dealsApi.getPipeline(filters);
            if (pipelineData.stages && pipelineData.stages.length > 0) {
                return pipelineData;
            }
            throw new Error('Pipeline endpoint returned no stages');
        } catch (error) {
            console.warn('Specialized /deals/pipeline failed, falling back to manual merge:', error);

            // Priority 2: Fallback to manual merge of stages and deals
            try {
                const [settings, allDeals] = await Promise.all([
                    crmService.getSettings(),
                    dealsApi.getAll(filters)
                ]);

                return {
                    stages: settings.deal_stages.map(stage => ({
                        id: stage.id,
                        name: stage.name,
                        order: 0,
                        deals: allDeals.filter(d => d.stage_id === stage.id || d.stage === stage.name)
                    }))
                };
            } catch (fallbackError) {
                console.error('Pipeline fallback also failed:', fallbackError);
                throw fallbackError;
            }
        }
    },

    getDealsByLeadId: async (leadId: string): Promise<Deal[]> => {
        // Filter server-side (backend GET /deals honors lead_id) instead of
        // downloading the whole org dataset and filtering in the browser.
        return dealsApi.getAll({ lead_id: leadId });
    },

    deleteDeal: async (id: string): Promise<void> => {
        return dealsApi.delete(id);
    },

    // Tasks
    getTasks: async (): Promise<Task[]> => {
        return tasksApi.getAll();
    },

    async getTaskById(id: string): Promise<Task | undefined> {
        try {
            return await tasksApi.getById(id);
        } catch (error) {
            return undefined;
        }
    },

    async createTask(data: any): Promise<Task> {
        return tasksApi.create(data);
    },

    async updateTask(id: string, updates: Partial<Task> | any): Promise<Task> {
        // Whitelist safe fields - REMOVED description to fix schema mismatch
        const data: any = {};
        if (updates.title !== undefined) data.title = updates.title;
        if (updates.due_date !== undefined) data.due_date = updates.due_date;
        if (updates.status !== undefined) data.status = updates.status.toUpperCase();
        if (updates.type !== undefined) data.type = updates.type.toUpperCase();
        if (updates.assignee_id !== undefined) data.assignee_id = updates.assignee_id;
        // Description removed - backend schema doesn't support it
        if (updates.reminder_minutes_before !== undefined) data.reminder_minutes_before = updates.reminder_minutes_before;
        if (updates.assigned_to !== undefined && updates.assigned_to?.id) {
            data.assignee_id = updates.assigned_to.id;
        }

        return tasksApi.update(id, data);
    },

    async getTasksByLeadId(leadId: string): Promise<Task[]> {
        // Filter server-side (backend GET /tasks honors lead_id) instead of
        // downloading the whole org dataset and filtering in the browser.
        return tasksApi.getAll({ lead_id: leadId });
    },

    async getTasksByDealId(dealId: string): Promise<Task[]> {
        // Filter server-side (backend GET /tasks honors deal_id) instead of
        // downloading the whole org dataset and filtering in the browser.
        return tasksApi.getAll({ deal_id: dealId });
    },

    async deleteTask(id: string): Promise<void> {
        return tasksApi.delete(id);
    },

    /**
     * Connect a CRM task to a Project task. Success responses include the
     * updated task fields (incl. `sync_status: 'connected'`); a non-2xx or a
     * `{ connected: false, reason }`-shaped body both count as failure. The
     * backend's exact failure shape isn't finalized, so both are handled here
     * rather than pushed onto every caller.
     */
    async connectTaskToProject(taskId: string, projectId: string): Promise<Task & { connected?: boolean; reason?: string }> {
        const result = await apiClient.post<Task & { connected?: boolean; reason?: string }>(
            `/tasks/${taskId}/connect-project`,
            { project_id: projectId },
        );
        if (result && (result as any).connected === false) {
            throw new Error((result as any).reason || 'Failed to connect task to project.');
        }
        return result;
    },

    async disconnectTaskFromProject(taskId: string, mode: 'remove_project_task' | 'keep_but_disconnect'): Promise<Task> {
        return apiClient.post<Task>(`/tasks/${taskId}/disconnect-project`, { mode });
    },

    async retryTaskProjectSync(taskId: string): Promise<Task> {
        return apiClient.post<Task>(`/tasks/${taskId}/retry-sync`, {});
    },

    // Settings
    getSettings: async (): Promise<CRMSettings> => {
      return orgStaticCache.run(`settings|${apiClient.getOrgId()}`, async () => {
        try {
            const [stagesResult, leadStagesResult, leadFieldsResult, dealFieldsResult, partnerFieldsResult, sourceTypesResult, scoringRulesResult, scoreCategoriesResult, dealNamingResult] = await Promise.allSettled([
                apiClient.get<any[]>('/settings/pipeline-stages'),
                apiClient.get<any[]>('/settings/lead-stages'),
                apiClient.get<any[]>('/settings/custom-fields?entity_type=LEAD'),
                apiClient.get<any[]>('/settings/custom-fields?entity_type=DEAL'),
                apiClient.get<any[]>('/settings/custom-fields?entity_type=PARTNER'),
                apiClient.get<any[]>('/settings/source-types'),
                apiClient.get<any[]>('/settings/scoring-rules'),
                apiClient.get<any[]>('/settings/score-categories'),
                apiClient.get<DealNamingConfig>('/settings/deal-naming'),
            ]);

            const stages = stagesResult.status === 'fulfilled' ? stagesResult.value : [];
            const leadStages = leadStagesResult.status === 'fulfilled' ? leadStagesResult.value : [];
            const leadFields = leadFieldsResult.status === 'fulfilled' ? leadFieldsResult.value : [];
            const dealFields = dealFieldsResult.status === 'fulfilled' ? dealFieldsResult.value : [];
            const partnerFields = partnerFieldsResult.status === 'fulfilled' ? partnerFieldsResult.value : [];
            const sourceTypes = sourceTypesResult.status === 'fulfilled' ? sourceTypesResult.value : [];
            const scoringRules = scoringRulesResult.status === 'fulfilled' ? scoringRulesResult.value : [];
            const scoreCategories = scoreCategoriesResult.status === 'fulfilled' ? scoreCategoriesResult.value : [];
            const dealNaming = dealNamingResult.status === 'fulfilled' ? dealNamingResult.value : DEFAULT_DEAL_NAMING_CONFIG;

            if (stagesResult.status === 'rejected') console.error('[CRM] Failed to fetch pipeline stages', stagesResult.reason);
            if (leadStagesResult.status === 'rejected') console.error('[CRM] Failed to fetch lead stages', leadStagesResult.reason);

            return {
                deal_stages: stages.map(s => ({
                    id: s.id,
                    name: s.name,
                    type: s.type || (['Won', 'Closed Won'].includes(s.name) ? 'WON' : ['Lost', 'Closed Lost'].includes(s.name) ? 'LOST' : 'OPEN')
                })),
                lead_stages: leadStages.map(s => ({ id: s.id, name: s.name })),
                default_owner_id: USER_ID,
                lead_sources: [],
                source_type_options: sourceTypes,
                lead_custom_fields: leadFields,
                deal_custom_fields: dealFields,
                partner_custom_fields: partnerFields,
                lead_scoring: scoringRules,
                score_categories: scoreCategories,
                deal_naming: dealNaming,
            };
        } catch (error) {
            console.error('Failed to fetch settings', error);
            return {
                deal_stages: [],
                lead_stages: [],
                default_owner_id: USER_ID,
                lead_sources: [],
                source_type_options: [],
                lead_custom_fields: [],
                deal_custom_fields: [],
                partner_custom_fields: [],
                lead_scoring: [],
                score_categories: [],
                deal_naming: DEFAULT_DEAL_NAMING_CONFIG,
            };
        }
      });
    },

    // Deal Naming Convention
    getDealNamingSettings: async (): Promise<DealNamingConfig> => {
        try {
            return await apiClient.get<DealNamingConfig>('/settings/deal-naming');
        } catch (error) {
            console.error('[CRM] Failed to fetch deal naming settings', error);
            return DEFAULT_DEAL_NAMING_CONFIG;
        }
    },

    updateDealNamingSettings: async (config: Partial<DealNamingConfig>): Promise<DealNamingConfig> => {
        return apiClient.patch<DealNamingConfig>('/settings/deal-naming', config);
    },

    previewDealNamingSettings: async (draftConfig: Partial<DealNamingConfig>): Promise<{ name: string; isAutoGenerated: boolean }> => {
        return apiClient.post('/settings/deal-naming/preview', draftConfig);
    },

    updateSettings: async (settings: CRMSettings): Promise<CRMSettings> => {
        // Each settings category is saved independently so a failure in one (e.g. an
        // API error in Custom Fields) cannot abort the others. Lead stages are NOT
        // written here — they are owned by the Flow module and surfaced read-only.
        const failures: string[] = [];

        // 1. Pipeline (Deal) Stages
        try {
            const currentStages = await apiClient.get<any[]>('/settings/pipeline-stages');
            const newStages = settings.deal_stages;

            const stagesToCreate = newStages.filter(s => s.id.startsWith('st-'));
            const stagesToUpdate = newStages.filter(s => !s.id.startsWith('st-'));
            const stagesToDelete = currentStages.filter(cs => !newStages.find(ns => ns.id === cs.id));

            await Promise.all([
                ...stagesToCreate.map(s => apiClient.post('/settings/pipeline-stages', {
                    name: s.name,
                    order: newStages.indexOf(s) + 1,
                    color: '#3b82f6',
                    type: s.type
                })),
                ...stagesToUpdate.map(s => apiClient.patch(`/settings/pipeline-stages/${s.id}`, {
                    name: s.name,
                    order: newStages.indexOf(s) + 1,
                    type: s.type
                })),
                ...stagesToDelete.map(s => apiClient.delete(`/settings/pipeline-stages/${s.id}`))
            ]);
        } catch (error) {
            console.error('[CRM] Failed to save Pipeline Stages', error);
            failures.push('Pipeline Stages');
        }

        // 2. Custom Fields (Lead)
        try {
            const currentLeadFields = await apiClient.get<any[]>('/settings/custom-fields?entity_type=LEAD');
            const newLeadFields = settings.lead_custom_fields;

            const lfToCreate = newLeadFields.filter(f => f.id.startsWith('lcf-'));
            const lfToUpdate = newLeadFields.filter(f => !f.id.startsWith('lcf-'));
            const lfToDelete = currentLeadFields.filter(cf => !newLeadFields.find(nf => nf.id === cf.id));

            await Promise.all([
                ...lfToCreate.map(f => apiClient.post('/settings/custom-fields', {
                    entity_type: 'LEAD',
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...lfToUpdate.map(f => apiClient.patch(`/settings/custom-fields/${f.id}`, {
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...lfToDelete.map(f => apiClient.delete(`/settings/custom-fields/${f.id}`))
            ]);
        } catch (error) {
            console.error('[CRM] Failed to save Lead Fields', error);
            failures.push('Lead Fields');
        }

        // 3. Custom Fields (Deal)
        try {
            const currentDealFields = await apiClient.get<any[]>('/settings/custom-fields?entity_type=DEAL');
            const newDealFields = settings.deal_custom_fields;

            const dfToCreate = newDealFields.filter(f => f.id.startsWith('dcf-'));
            const dfToUpdate = newDealFields.filter(f => !f.id.startsWith('dcf-'));
            const dfToDelete = currentDealFields.filter(cf => !newDealFields.find(nf => nf.id === cf.id));

            await Promise.all([
                ...dfToCreate.map(f => apiClient.post('/settings/custom-fields', {
                    entity_type: 'DEAL',
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...dfToUpdate.map(f => apiClient.patch(`/settings/custom-fields/${f.id}`, {
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...dfToDelete.map(f => apiClient.delete(`/settings/custom-fields/${f.id}`))
            ]);
        } catch (error) {
            console.error('[CRM] Failed to save Deal Fields', error);
            failures.push('Deal Fields');
        }

        // 4. Custom Fields (Partner)
        try {
            const currentPartnerFields = await apiClient.get<any[]>('/settings/custom-fields?entity_type=PARTNER');
            const newPartnerFields = settings.partner_custom_fields || [];

            const pfToCreate = newPartnerFields.filter(f => f.id.startsWith('pcf-'));
            const pfToUpdate = newPartnerFields.filter(f => !f.id.startsWith('pcf-'));
            const pfToDelete = currentPartnerFields.filter(cf => !newPartnerFields.find(nf => nf.id === cf.id));

            await Promise.all([
                ...pfToCreate.map(f => apiClient.post('/settings/custom-fields', {
                    entity_type: 'PARTNER',
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...pfToUpdate.map(f => apiClient.patch(`/settings/custom-fields/${f.id}`, {
                    label: f.label,
                    field_type: f.type,
                    options: f.options,
                    is_required: f.required
                })),
                ...pfToDelete.map(f => apiClient.delete(`/settings/custom-fields/${f.id}`))
            ]);
        } catch (error) {
            console.error('[CRM] Failed to save Partner Fields', error);
            failures.push('Partner Fields');
        }

        // Settings just changed — drop the cached copy so the next read is fresh.
        orgStaticCache.invalidate('settings|');

        if (failures.length > 0) {
            throw new Error(`Failed to save: ${failures.join(', ')}`);
        }

        return settings;
    },

    // Notes
    async getNotesByLeadId(leadId: string): Promise<Note[]> {
        return notesApi.getAllByLead(leadId);
    },
    async getNotesByDealId(dealId: string): Promise<Note[]> {
        return notesApi.getAllByDeal(dealId);
    },
    async getTaskNotes(taskId: string): Promise<Note[]> {
        const notes = await apiClient.get<any[]>(`/notes/task/${taskId}`);
        return notes.map(mapNoteFromApi);
    },
    async createNote(data: { content: string; lead_id?: string; deal_id?: string; task_id?: string; parent_note_id?: string; stakeholder_id?: string }): Promise<Note> {
        return notesApi.create({
            ...data,
            author_id: USER_ID
        });
    },

    async updateNote(id: string, content: string): Promise<void> {
        await notesApi.update(id, { content });
    },

    async deleteNote(id: string): Promise<void> {
        await notesApi.delete(id);
    },

    // Users
    /**
     * Active employees from People Connect's People Registry — the option set
     * for every CRM ownership field (Sales Rep, Lead/Deal Owner, Account
     * Manager, Task Assignee).
     *
     * Routed through crm-be rather than calling People Connect from the
     * browser: its public `/people` endpoint requires People Connect
     * permissions a CRM user does not hold, which is why this dropdown used to
     * render empty. crm-be brokers the call and scopes it to the caller's org.
     */
    getSalesReps: async (search?: string): Promise<SalesRep[]> => {
        const params = search?.trim() ? { search: search.trim() } : undefined;
        const rows = await apiClient.get<any[]>('/v1/users/sales-reps', params);
        return Array.isArray(rows) ? rows : [];
    },

    getUsers: async (): Promise<User[]> => {
      return orgStaticCache.run(`users|${apiClient.getOrgId()}`, async () => {
        try {
            // Fetch users from CRM backend (works without shell context)
            const users = await apiClient.get<any[]>('/v1/users/profiles');
            console.log('[CRM] Fetched users from backend:', users);

            // Map to User format expected by frontend
            const mappedUsers = users.map(u => ({
                id: u.id || u.user_id,
                full_name: u.full_name || u.name || 'Unknown User',
                email: u.email || '',
                avatar_url: u.avatar_url || null
            }));

            // Populate cache for note/activity enrichment
            mappedUsers.forEach(user => {
                if (user.id) {
                    USERS_CACHE.set(user.id, user);
                }
            });
            USERS_CACHE_LOADED = true;
            console.log('[CRM] Users cache populated with', USERS_CACHE.size, 'users');

            return mappedUsers;
        } catch (error) {
            console.error('[CRM] Failed to fetch users', error);
            // Fallback to current user if available
            return CURRENT_USER ? [CURRENT_USER] : [];
        }
      });
    },

    // Documents
    async getDocumentsByLeadId(leadId: string): Promise<Attachment[]> {
        return documentsApi.getAllByLead(leadId);
    },
    async getDocumentsByDealId(dealId: string): Promise<Attachment[]> {
        return documentsApi.getAllByDeal(dealId);
    },
    uploadDocument: async (entity: string | { leadId?: string, dealId?: string }, file: File): Promise<Attachment> => {
        // Single-step DMS upload: CRM BE accepts the multipart file plus the
        // lead_id/deal_id, streams it into the Document Management Service, and
        // creates the documents row (with dms_document_id) atomically. This
        // replaces the old two-step Core /v1/media/upload + POST /documents flow.
        const entityObj = typeof entity === 'string' ? { leadId: entity } : entity;
        return documentsApi.upload(file, {
            lead_id: entityObj.leadId,
            deal_id: entityObj.dealId,
        });
    },

    // Resolve a (signed) download URL for a DMS-backed document.
    getDocumentDownloadUrl: async (documentId: string): Promise<string> => {
        return documentsApi.getDownloadUrl(documentId);
    },

    deleteDocument: async (entityId: string, documentId: string): Promise<void> => {
        return documentsApi.delete(documentId);
    },

    // Calls
    async getCallsByLeadId(leadId: string): Promise<CallRecord[]> {
        return callsApi.getAllByLead(leadId);
    },
    async getCallsByDealId(dealId: string): Promise<CallRecord[]> {
        return callsApi.getAllByDeal(dealId);
    },
    uploadCallRecording: async (file: File, fields: CallUploadFields): Promise<CallRecord> => {
        return callsApi.upload(file, fields);
    },
    getCallPlaybackUrl: async (id: string): Promise<{ url: string; expires_in: number }> => {
        return callsApi.getPlaybackUrl(id);
    },
    updateCallRecord: async (id: string, data: Partial<Pick<CallRecord, 'transcript_text' | 'sentiment' | 'emotion_scores' | 'duration_seconds'>>): Promise<CallRecord> => {
        return callsApi.update(id, data);
    },
    deleteCallRecord: async (id: string): Promise<void> => {
        return callsApi.delete(id);
    },

    // Customer Feedback (Forms module integration)
    async getCustomerFeedback(
        leadId: string,
        params: { page?: number; limit?: number } = {},
    ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
        const qs = new URLSearchParams();
        if (params.page) qs.set('page', String(params.page));
        if (params.limit) qs.set('limit', String(params.limit));
        const suffix = qs.toString() ? `?${qs}` : '';
        try {
            return await apiClient.get<any>(`/leads/${leadId}/feedback${suffix}`);
        } catch {
            return { data: [], total: 0, page: 1, limit: 20 };
        }
    },

    // Activities
    async getActivitiesByLeadId(leadId: string): Promise<Activity[]> {
        return activitiesApi.getAllByLead(leadId);
    },

    async getActivitiesByLeadIdPaginated(leadId: string, limit: number, offset: number): Promise<{ data: Activity[], total: number }> {
        return activitiesApi.getAllByLeadPaginated(leadId, limit, offset);
    },

    async getActivitiesByDealId(dealId: string): Promise<Activity[]> {
        // Tier 1: Try dedicated deal activities endpoint
        try {
            console.log('[Activities] Tier 1: Trying /activities/deal/:id endpoint');
            const activities = await apiClient.get<any[]>(`/activities/deal/${dealId}`);
            console.log(`[Activities] Tier 1 SUCCESS: Loaded ${activities.length} activities`);
            return activities.map(mapActivityFromApi);
        } catch (error: any) {
            console.warn('[Activities] Tier 1 FAILED:', error?.response?.status || error?.message);
        }

        // Tier 2: Try global activities endpoint with client-side filtering
        try {
            console.log('[Activities] Tier 2: Trying /activities with client-side filtering');
            const allActivities = await apiClient.get<any[]>('/activities');
            const filtered = allActivities.filter(a => a.deal_id === dealId);
            console.log(`[Activities] Tier 2 SUCCESS: Filtered ${filtered.length} activities from ${allActivities.length} total`);
            return filtered.map(mapActivityFromApi);
        } catch (error: any) {
            console.warn('[Activities] Tier 2 FAILED:', error?.response?.status || error?.message);
        }

        // Tier 3: Try lead-based activities if deal has lead_id
        try {
            console.log('[Activities] Tier 3: Trying lead-based activities fallback');
            // Fetch the deal to get lead_id
            const deal = await this.getDealById(dealId);
            if (deal?.lead_id) {
                const leadActivities = await apiClient.get<any[]>(`/activities/lead/${deal.lead_id}`);
                const filtered = leadActivities.filter(a => a.deal_id === dealId);
                console.log(`[Activities] Tier 3 SUCCESS: Filtered ${filtered.length} deal activities from ${leadActivities.length} lead activities`);
                return filtered.map(mapActivityFromApi);
            } else {
                console.warn('[Activities] Tier 3 SKIPPED: Deal has no lead_id');
            }
        } catch (error: any) {
            console.warn('[Activities] Tier 3 FAILED:', error?.response?.status || error?.message);
        }

        // Tier 4: Graceful degradation - return empty array
        console.warn(`[Activities] All tiers failed for deal ${dealId} - returning empty array`);
        return [];
    },

    async logActivity(data: { lead_id?: string, deal_id?: string, type: ActivityType, notes: string, date: string, follow_up_date?: string }): Promise<Activity> {
        return activitiesApi.create({
            ...data,
            author_id: USER_ID
        });
    },

    // Invoicing & Projects
    async requestInvoice(dealId: string): Promise<void> {
        // Placeholder for Core Accounting Integration
        console.log('Requesting invoice for deal:', dealId);
        await apiClient.post(`/deals/${dealId}/request-invoice`, {});
    },

    async getInvoiceStatus(dealId: string): Promise<{
        has_invoice: boolean;
        invoice_id?: string;
        invoice_number?: string;
        status?: string;
        total?: number;
        amount_paid?: number;
        balance_due?: number;
        issue_date?: string;
        due_date?: string;
        currency?: string;
    }> {
        try {
            return await apiClient.get(`/deals/${dealId}/invoice-status`);
        } catch (error) {
            console.warn('[CRM] Failed to fetch invoice status:', error);
            return { has_invoice: false };
        }
    },

    async linkProject(dealId: string, projectId: string): Promise<void> {
        console.log('Linking deal to project:', dealId, projectId);
        await apiClient.patch(`/deals/${dealId}/link-project`, { project_id: projectId });
    },

    async unlinkProject(dealId: string): Promise<void> {
        console.log('Unlinking project from deal:', dealId);
        await apiClient.patch(`/deals/${dealId}/unlink-project`, {});
    },

    async createProjectFromDeal(dealId: string): Promise<{ id: string }> {
        console.log('Orchestrating project creation from deal:', dealId);
        return apiClient.post<{ id: string }>(`/deals/${dealId}/create-project`, {});
    },

    async getProjects(): Promise<any[]> {
        try {
            // Was: apiClient.get('/projects-api/projects') — apiClient is bound to
            // CRM_API_ORIGIN, so that resolved to `${CRM_API_ORIGIN}/projects-api/projects`,
            // a path that doesn't exist on the CRM backend (crm-be has no
            // /projects-api prefix). Every call 404'd and was silently swallowed
            // by this try/catch, so the Task modal's Project dropdown always
            // showed only "No Project". Fixed to call the Projects backend
            // directly via projectsClient (GET /projects, list capped at 100 —
            // this is a dropdown, not a paginated table).
            const result = await projectsClient.get<any>('/projects', { limit: 100 });
            // findAll() on the Projects side returns { data, pagination }, not a
            // flat array — unwrap defensively so an API shape change degrades to
            // an empty list instead of throwing (Array.isArray(result) covers a
            // hypothetical future flat-array response too).
            if (Array.isArray(result)) return result;
            if (Array.isArray(result?.data)) return result.data;
            return [];
        } catch (error: any) {
            console.error('[CRM] Failed to fetch projects list:', error.message);
            // Return empty array instead of mock data - let UI handle empty state
            return [];
        }
    },

    async getProjectById(projectId: string): Promise<any | null> {
        try {
            // Same class of bug as getProjects() above: callers previously did a
            // raw `fetch('/projects-api/projects/:id')` — a relative URL with no
            // auth/tenant/org headers at all, resolvable only through the Vite
            // dev-server-only proxy rule in so360-shell-fe/vite.config.ts (absent
            // in staging/production), AND missing the Bearer/X-Tenant-Id/X-Org-Id
            // headers this route's PermissionsGuard requires regardless. Routed
            // through projectsClient instead, which already carries all three.
            return await projectsClient.get<any>(`/projects/${projectId}`);
        } catch (error: any) {
            console.error('[CRM] Failed to fetch project details:', error.message);
            return null;
        }
    },

    // Quotes API
    async getQuotes(filters?: { status?: string; deal_id?: string; customer_id?: string }): Promise<any[]> {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.deal_id) params.append('deal_id', filters.deal_id);
        if (filters?.customer_id) params.append('customer_id', filters.customer_id);
        const queryString = params.toString();
        const url = queryString ? `/quotes?${queryString}` : '/quotes';
        return apiClient.get<any[]>(url);
    },

    async getQuoteById(quoteId: string): Promise<any> {
        return apiClient.get<any>(`/quotes/${quoteId}`);
    },

    async createQuote(data: {
        deal_id: string;
        customer_id?: string;
        title?: string;
        notes?: string;
        terms_and_conditions?: string;
        /** Commercial terms, each a distinct obligation (see crm-be migration 047). */
        payment_terms?: string;
        delivery_terms?: string;
        incoterm?: string;
        customer_reference?: string;
        valid_until?: string;
        /**
         * Omit to have crm-be seed the quote from the deal's own products. Passing
         * an array — even an empty one — is taken as the caller's own line set.
         */
        lines?: { item_id?: string; description: string; quantity: number; unit_price: number; discount_percent?: number; tax_rate?: number }[];
    }): Promise<any> {
        return apiClient.post<any>('/quotes', data);
    },

    async updateQuote(quoteId: string, data: {
        title?: string;
        notes?: string;
        terms_and_conditions?: string;
        /** Commercial terms, each a distinct obligation (see crm-be migration 047). */
        payment_terms?: string;
        delivery_terms?: string;
        incoterm?: string;
        customer_reference?: string;
        valid_until?: string;
        lines?: { item_id?: string; description: string; quantity: number; unit_price: number; discount_percent?: number; tax_rate?: number }[];
    }): Promise<any> {
        return apiClient.patch<any>(`/quotes/${quoteId}`, data);
    },

    /**
     * Email the quotation to the customer with the PDF attached.
     *
     * The PDF is generated server-side — the browser print path cannot produce a
     * file to attach, only a print dialog. Returns { sent, to } or, when there is
     * no address to send to, { sent: false, reason }.
     */
    async sendQuote(
        quoteId: string,
        payload: { to?: string; message?: string } = {},
    ): Promise<{ sent: boolean; to?: string; reason?: string }> {
        return apiClient.post<{ sent: boolean; to?: string; reason?: string }>(
            `/quotes/${quoteId}/send`,
            payload,
        );
    },

    async deleteQuote(quoteId: string): Promise<void> {
        return apiClient.delete(`/quotes/${quoteId}`);
    },

    async submitQuoteForApproval(quoteId: string, data?: { approver_user_ids?: string[]; notes?: string }): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/submit`, data || {});
    },

    async withdrawQuoteApproval(quoteId: string, reason?: string): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/withdraw`, { reason });
    },

    async getQuoteApprovalHistory(quoteId: string): Promise<any[]> {
        const res = await apiClient.get<any>(`/quotes/${quoteId}/approval-history`);
        return Array.isArray(res) ? res : (res?.requests || []);
    },

    async getApprovalsInbox(status?: string): Promise<any[]> {
        const params = status && status !== 'all' ? { status } : undefined;
        return apiClient.get<any[]>('/quotes/approvals/inbox', params);
    },

    async getApprovers(search?: string): Promise<any[]> {
        const params = search?.trim() ? { search: search.trim() } : undefined;
        const rows = await apiClient.get<any[]>('/v1/users/approvers', params);
        return Array.isArray(rows) ? rows : [];
    },

    async approveQuote(quoteId: string, notes?: string): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/approve`, { approval_notes: notes });
    },

    async rejectQuote(quoteId: string, reason: string): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/reject`, { rejection_reason: reason });
    },

    async convertQuoteToOrder(quoteId: string, data?: {
        delivery_date?: string;
        delivery_address?: string;
        payment_terms?: string;
        create_project?: boolean;
    }): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/convert`, data || {});
    },

    // Inventory stock availability — calls Inventory BE integration endpoint
    async getStockAvailability(itemIds: string[]): Promise<{ items: Array<{ item_id: string; item_name: string | null; available_quantity: number }> }> {
        if (!itemIds || itemIds.length === 0) return { items: [] };
        const idsParam = itemIds.slice(0, 50).join(',');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (TENANT_ID) headers['X-Tenant-Id'] = TENANT_ID;
        if (ORG_ID) headers['X-Org-Id'] = ORG_ID;
        try {
            const res = await fetch(
                `${INVENTORY_API_ORIGIN}/v1/inventory/integration/stock-availability?item_ids=${encodeURIComponent(idsParam)}`,
                { headers },
            );
            await notifyQuotaExceeded(res);
            if (!res.ok) return { items: [] };
            return res.json();
        } catch {
            return { items: [] };
        }
    },

    // Inventory item search — used by ProductPickerModal
    /**
     * Browse/search sellable inventory.
     *
     * `q` is optional: called with no term (the default when a product picker
     * opens) the backend returns the most recent active items, so users can
     * browse without knowing a name or SKU. `offset` drives lazy-loading.
     *
     * Errors are NOT swallowed — pickers surface them with a retry action
     * rather than rendering a misleading "no products found" empty state.
     */
    async searchInventoryItems(
        q: string,
        categoryId?: string,
        opts: { limit?: number; offset?: number } = {},
    ): Promise<{ items: InventoryItem[]; total: number; has_more: boolean }> {
        const params: Record<string, string> = {};
        if (q && q.trim()) params.q = q.trim();
        if (categoryId) params.category_id = categoryId;
        if (opts.limit != null) params.limit = String(opts.limit);
        if (opts.offset != null) params.offset = String(opts.offset);
        const result = await inventoryClient.get<any>('/v1/inventory/integration/search-with-variants', params);
        const rawItems = Array.isArray(result) ? result : (result?.items || result?.data || []);
        const items: InventoryItem[] = rawItems.map((it: any) => {
            const itemPrice = Number(it.price ?? it.selling_price ?? it.unit_price ?? 0);
            const safeItemPrice = isNaN(itemPrice) ? 0 : itemPrice;
            return {
                ...it,
                price: safeItemPrice,
                variants: (it.variants || []).map((v: any) => {
                    const varPrice = Number(v.price ?? v.selling_price ?? v.unit_price ?? safeItemPrice);
                    return {
                        ...v,
                        price: isNaN(varPrice) ? 0 : varPrice,
                    };
                }),
            };
        });
        return {
            items,
            total: result?.total ?? items.length,
            has_more: Boolean(result?.has_more),
        };
    },

    // Customers
    getCustomers: async (filters?: { channel?: string; category?: string; q?: string; skip?: number; take?: number }): Promise<any[]> => {
        return customersApi.getAll(filters);
    },

    getCustomerStats: async (): Promise<any> => {
        return customersApi.getStats();
    },

    promoteToCustomer: async (leadId: string): Promise<any> => {
        return customersApi.promote(leadId);
    },

    validateCustomerTaxId: async (customerId: string, taxId: string): Promise<any> => {
        return customersApi.validateTaxId(customerId, taxId);
    },

    updateCustomerCreditLimit: async (customerId: string, creditLimit: number): Promise<any> => {
        return customersApi.updateCreditLimit(customerId, creditLimit);
    },

    getCustomerBusinessProfile: async (customerId: string): Promise<any> => {
        return customersApi.getBusinessProfile(customerId);
    },

    // Accounting cross-module: invoices for a customer (read-only, fail-soft).
    // customerId = Core partner UUID stored on accounting invoices.customer_id.
    getCustomerInvoices: async (customerId: string): Promise<any[]> => {
        if (!customerId) return [];
        try {
            const result = await accountingClient.get<any>('/billing/invoices', { customer_id: customerId });
            return Array.isArray(result) ? result : (result?.data || []);
        } catch {
            return [];
        }
    },

    updateCustomerBusinessProfile: async (customerId: string, profile: Record<string, any>): Promise<any> => {
        return customersApi.updateBusinessProfile(customerId, profile);
    },

    // Customer Segments
    getCustomerSegments: async (): Promise<any[]> => {
        return apiClient.get<any[]>('/customer-segments');
    },
    getCustomerSegmentById: async (segmentId: string): Promise<any> => {
        return apiClient.get<any>(`/customer-segments/${segmentId}`);
    },
    createCustomerSegment: async (data: any): Promise<any> => {
        return apiClient.post<any>('/customer-segments', data);
    },
    updateCustomerSegment: async (segmentId: string, data: any): Promise<any> => {
        return apiClient.patch<any>(`/customer-segments/${segmentId}`, data);
    },
    deleteCustomerSegment: async (segmentId: string): Promise<any> => {
        return apiClient.delete<any>(`/customer-segments/${segmentId}`);
    },
    getCustomerSegmentCustomers: async (segmentId: string): Promise<any> => {
        return apiClient.get<any>(`/customer-segments/${segmentId}/customers`);
    },
    getCustomerSegmentLeads: async (segmentId: string): Promise<any> => {
        return apiClient.get<any>(`/customer-segments/${segmentId}/leads`);
    },
    getCustomerSegmentMembers: async (segmentId: string, params?: { type?: 'all' | 'lead' | 'customer'; q?: string; skip?: number; take?: number }): Promise<any> => {
        return apiClient.get<any>(`/customer-segments/${segmentId}/members`, params);
    },
    addCustomerSegmentMembers: async (segmentId: string, members: Array<{ id: string; type: 'lead' | 'customer' }>): Promise<any> => {
        return apiClient.post<any>(`/customer-segments/${segmentId}/members`, { members });
    },
    removeCustomerSegmentMembers: async (segmentId: string, members: Array<{ id: string; type: 'lead' | 'customer' }>): Promise<any> => {
        return apiClient.delete<any>(`/customer-segments/${segmentId}/members`, { members });
    },

    // Marketing (CRM-owned, proxied from Storefront internal APIs)
    getAbandonedCarts: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/abandoned-carts`, params);
    },
    getAbandonedCartStats: async (storeId: string): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/abandoned-carts/stats`);
    },
    getAbandonedCart: async (storeId: string, cartId: string): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/abandoned-carts/${cartId}`);
    },
    sendAbandonedCartRecovery: async (storeId: string, cartId: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/abandoned-carts/${cartId}/send-recovery`, {});
    },
    updateAbandonedCartStatus: async (storeId: string, cartId: string, status: string): Promise<any> => {
        return apiClient.patch<any>(`/marketing/${storeId}/abandoned-carts/${cartId}/status`, { status });
    },

    // Storefront Activity Tracking (Proxied through CRM BE)
    getStorefrontActivity: async (leadId: string, params?: any): Promise<any[]> => {
        return apiClient.get<any[]>(`/leads/${leadId}/storefront-activity`, params);
    },
    getStorefrontWishlist: async (leadId: string): Promise<any[]> => {
        return apiClient.get<any[]>(`/leads/${leadId}/storefront-wishlist`);
    },
    getStorefrontReviews: async (leadId: string): Promise<any[]> => {
        return apiClient.get<any[]>(`/leads/${leadId}/storefront-reviews`);
    },
    getStorefrontAbandonedCarts: async (leadId: string): Promise<any[]> => {
        return apiClient.get<any[]>(`/leads/${leadId}/storefront-abandoned-carts`);
    },
    getAllStorefrontSearches: async (params?: any): Promise<any[]> => {
        return apiClient.get<any[]>('/marketing/storefront-searches', params);
    },
    getMarketingReviews: async (storeId: string, params?: any): Promise<any[]> => {
        return apiClient.get<any[]>(`/marketing/${storeId}/reviews`, params);
    },
    getMarketingWishlist: async (storeId: string, params?: any): Promise<any[]> => {
        return apiClient.get<any[]>(`/marketing/${storeId}/wishlist`, params);
    },

    getCampaigns: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/campaigns`, params);
    },
    getCampaign: async (storeId: string, campaignId: string): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/campaigns/${campaignId}`);
    },
    createCampaign: async (storeId: string, data: any): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/campaigns`, data);
    },
    updateCampaign: async (storeId: string, campaignId: string, data: any): Promise<any> => {
        return apiClient.put<any>(`/marketing/${storeId}/campaigns/${campaignId}`, data);
    },
    deleteCampaign: async (storeId: string, campaignId: string): Promise<any> => {
        return apiClient.delete<any>(`/marketing/${storeId}/campaigns/${campaignId}`);
    },
    sendCampaignNow: async (storeId: string, campaignId: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/campaigns/${campaignId}/send`, {});
    },
    scheduleCampaign: async (storeId: string, campaignId: string, scheduleAt: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/campaigns/${campaignId}/schedule`, { scheduleAt });
    },
    pauseCampaign: async (storeId: string, campaignId: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/campaigns/${campaignId}/pause`, {});
    },
    testSendCampaign: async (storeId: string, campaignId: string, email: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/campaigns/${campaignId}/test-send`, { email });
    },
    getCampaignRecipients: async (storeId: string, campaignId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/campaigns/${campaignId}/recipients`, params);
    },
    getMarketingSegments: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/customer-segments`, params);
    },
    getMarketingProductInterest: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/product-interest`, params);
    },
    getMarketingBestSellingProducts: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/best-selling-products`, params);
    },
    getMarketingTopBuyers: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/top-buyers`, params);
    },
    getMarketingInactiveCustomers: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/inactive-customers`, params);
    },
    getMarketingConversionFunnel: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/conversion-funnel`, params);
    },
    getMarketingEmailPerformance: async (storeId: string, params?: any): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/insights/email-performance`, params);
    },

    // Newsletter Management (moved from Dailystore to CRM)
    getNewsletterSubscribers: async (storeId: string, params?: any): Promise<any[]> => {
        return apiClient.get<any[]>(`/marketing/${storeId}/newsletter/subscribers`, params);
    },
    addNewsletterSubscriber: async (storeId: string, data: any): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/newsletter/subscribers`, data);
    },
    unsubscribeNewsletter: async (storeId: string, subscriberId: string): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/newsletter/subscribers/${subscriberId}/unsubscribe`, {});
    },
    deleteNewsletterSubscriber: async (storeId: string, subscriberId: string): Promise<any> => {
        return apiClient.delete<any>(`/marketing/${storeId}/newsletter/subscribers/${subscriberId}`);
    },

    // Coupon Management (moved from Dailystore to CRM)
    getCoupons: async (storeId: string, params?: any): Promise<any[]> => {
        return apiClient.get<any[]>(`/marketing/${storeId}/coupons`, params);
    },
    createCoupon: async (storeId: string, data: any): Promise<any> => {
        return apiClient.post<any>(`/marketing/${storeId}/coupons`, data);
    },
    getCoupon: async (storeId: string, couponId: string): Promise<any> => {
        return apiClient.get<any>(`/marketing/${storeId}/coupons/${couponId}`);
    },
    updateCoupon: async (storeId: string, couponId: string, data: any): Promise<any> => {
        return apiClient.put<any>(`/marketing/${storeId}/coupons/${couponId}`, data);
    },
    deleteCoupon: async (storeId: string, couponId: string): Promise<any> => {
        return apiClient.delete<any>(`/marketing/${storeId}/coupons/${couponId}`);
    },

    getCommerceKPIs: async (params?: {
        period?: 'yearly' | 'quarterly' | 'monthly' | 'weekly';
        year?: number;
        quarter?: number;
        month?: number;
        week?: number;
    }): Promise<{
        revenue: number;
        orderCount: number;
        aov: number;
        repeatPurchaseRate: number;
        refundRate: number;
        orderChartData: { labels: string[]; values: number[] };
    }> => apiClient.get('/analytics/commerce-kpis', params as any),

    // Fulfillment integration — get fulfillment order linked to a CRM deal
    getFulfillmentOrderByDeal: async (dealId: string): Promise<any | null> => {
        try {
            const res = await fulfillmentClient.get<any>(`/orders`, { source_type: 'crm_deal', source_id: dealId, limit: 1 });
            const data = res?.data || res;
            const orders = Array.isArray(data) ? data : (data?.data || []);
            return orders.length > 0 ? orders[0] : null;
        } catch {
            return null;
        }
    },

    // ─── Lead Products ────────────────────────────────────────────────────────

    getLeadProducts: async (leadId: string): Promise<LeadProduct[]> => {
        return apiClient.get<LeadProduct[]>(`/leads/${leadId}/products`);
    },

    getProductCategories: async (): Promise<Array<{ id: string; name: string }>> => {
        try {
            const res = await inventoryClient.get<any>(`/settings/${ORG_ID}`);
            if (res?.categories && Array.isArray(res.categories)) {
                return res.categories.map((c: any) => ({ id: c.id, name: c.name }));
            }
        } catch {
            try {
                const res = await inventoryClient.get<any>(`/v1/inventory/settings/${ORG_ID}`);
                if (res?.categories && Array.isArray(res.categories)) {
                    return res.categories.map((c: any) => ({ id: c.id, name: c.name }));
                }
            } catch {
                // Return empty if inventory service is temporarily unavailable
            }
        }
        return [];
    },

    addLeadProduct: async (leadId: string, data: {
        item_id?: string; item_name: string; item_sku?: string; category_id?: string; category_name?: string;
        is_custom_build?: boolean; quantity?: number; unit_price?: number; status?: string; notes?: string;
    }): Promise<LeadProduct> => {
        return apiClient.post<LeadProduct>(`/leads/${leadId}/products`, data);
    },

    updateLeadProduct: async (leadId: string, productId: string, data: {
        quantity?: number; unit_price?: number; status?: string; notes?: string; category_id?: string; category_name?: string;
    }): Promise<LeadProduct> => {
        return apiClient.patch<LeadProduct>(`/leads/${leadId}/products/${productId}`, data);
    },

    removeLeadProduct: async (leadId: string, productId: string): Promise<{ deleted: boolean }> => {
        return apiClient.delete<{ deleted: boolean }>(`/leads/${leadId}/products/${productId}`);
    },

    // ─── Deal Products ────────────────────────────────────────────────────────

    getDealProducts: async (dealId: string): Promise<DealProduct[]> => {
        return apiClient.get<DealProduct[]>(`/deals/${dealId}/products`);
    },

    addDealProduct: async (dealId: string, data: {
        item_id?: string; item_name: string; item_sku?: string; category_id?: string; category_name?: string;
        is_custom_build?: boolean; quantity?: number; unit_price?: number; status?: string; notes?: string; lead_product_id?: string;
    }): Promise<DealProduct> => {
        return apiClient.post<DealProduct>(`/deals/${dealId}/products`, data);
    },

    updateDealProduct: async (dealId: string, productId: string, data: {
        quantity?: number; unit_price?: number; status?: string; notes?: string; category_id?: string; category_name?: string;
    }): Promise<DealProduct> => {
        return apiClient.patch<DealProduct>(`/deals/${dealId}/products/${productId}`, data);
    },

    removeDealProduct: async (dealId: string, productId: string): Promise<{ deleted: boolean }> => {
        return apiClient.delete<{ deleted: boolean }>(`/deals/${dealId}/products/${productId}`);
    },

    // ─── Deals by Project ─────────────────────────────────────────────────────

    getDealsByProjectId: async (projectId: string): Promise<Deal[]> => {
        try {
            const result = await apiClient.get<any>(`/deals`, { project_id: projectId });
            return Array.isArray(result) ? result : (result?.data || []);
        } catch {
            return [];
        }
    },

    // Configuration
    setTenantId: (id: string) => {
        apiClient.setTenantId(id);
        coreClient.setTenantId(id);
        dailystoreClient.setTenantId(id);
        inventoryClient.setTenantId(id);
        fulfillmentClient.setTenantId(id);
        accountingClient.setTenantId(id);
        neuraClient.setTenantId(id);
        inboxClient.setTenantId(id);
        projectsClient.setTenantId(id);
    },
    setOrgId: (id: string) => {
        ORG_ID = id;
        apiClient.setOrgId(id);
        coreClient.setOrgId(id);
        dailystoreClient.setOrgId(id);
        inventoryClient.setOrgId(id);
        fulfillmentClient.setOrgId(id);
        accountingClient.setOrgId(id);
        neuraClient.setOrgId(id);
        inboxClient.setOrgId(id);
        projectsClient.setOrgId(id);
    },
    setUser: (user: User) => {
        CURRENT_USER = user;
        USER_ID = user.id;
        apiClient.setUserId(user.id);
    },
    setUserId: (id: string) => {
        USER_ID = id;
        apiClient.setUserId(id);
    },
    setAccessToken: (token: string) => {
        apiClient.setAccessToken(token);
        coreClient.setAccessToken(token);
        dailystoreClient.setAccessToken(token);
        inventoryClient.setAccessToken(token);
        fulfillmentClient.setAccessToken(token);
        accountingClient.setAccessToken(token);
        neuraClient.setAccessToken(token);
        inboxClient.setAccessToken(token);
        projectsClient.setAccessToken(token);
    },
};

export interface NeuraEntityRef {
    module: string;
    entity: string;
    id: string;
    label?: string;
}

export interface NeuraAgentBlock {
    type: 'table' | 'chart' | 'file' | 'entity' | 'kpi';
    [key: string]: any;
}

export interface NeuraMessageResponse {
    userMessage: { id: string; role: string; content: string };
    assistantMessage: { id: string; role: string; content: string };
    blocks?: NeuraAgentBlock[];
    meta?: { tokensUsed: number };
}

// Thin client for Neura AI's own conversations API — no CRM backend involved.
// Used by the CRM Lead Detail page's "Neura AI" panel.
export const neuraAiService = {
    createConversation: async (title: string): Promise<{ id: string }> => {
        return neuraClient.post<{ id: string }>('/conversations', { title });
    },
    sendMessage: async (
        conversationId: string,
        content: string,
        entityRef?: NeuraEntityRef,
        mode: 'assist' | 'execute' | 'autonomous' = 'assist',
    ): Promise<NeuraMessageResponse> => {
        return neuraClient.post<NeuraMessageResponse>(
            `/conversations/${conversationId}/messages`,
            { content, mode, ...(entityRef ? { entityRef } : {}) },
        );
    },
};
