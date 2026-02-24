import { Deal, Activity, Task, Note, CustomFieldDefinition, User, Attachment, ActivityType, Lead, DealFilters, CRMSettings } from '../types/crm';

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
const env = (import.meta as any)?.env || {};
const win = typeof window !== 'undefined' ? (window as any) : {};

const CRM_API_ORIGIN = String(
    win.VITE_SO360_CRM_API ||
    env.VITE_SO360_CRM_API ||
    env.VITE_API_BASE_URL ||
    'http://localhost:3003'
).replace(/\/$/, '');

const CORE_API_ORIGIN = String(
    win.VITE_SO360_CORE_API ||
    env.VITE_SO360_CORE_API ||
    env.VITE_API_BASE_URL ||
    'http://localhost:3000'
).replace(/\/$/, '');
const DAILYSTORE_API_ORIGIN = String(
    win.VITE_SO360_DAILYSTORE_API ||
    env.VITE_SO360_DAILYSTORE_API ||
    'http://localhost:3016'
).replace(/\/$/, '');

const INVENTORY_API_ORIGIN = String(
    win.VITE_SO360_INVENTORY_API ||
    env.VITE_SO360_INVENTORY_API ||
    'http://localhost:3006'
).replace(/\/$/, '');

const API_BASE_URL = CRM_API_ORIGIN;
let TENANT_ID = 'default-tenant';
let ORG_ID = 'default-org';
let USER_ID = 'mock-user-id';
let CURRENT_USER: User | null = null;

// Users cache for enriching notes/activities
let USERS_CACHE: Map<string, User> = new Map();
let USERS_CACHE_LOADED = false;

// Status Mapping
const STATUS_MAP_FE_TO_BE: Record<string, string> = {
    'Open': 'NEW',
    'Qualified': 'QUALIFIED',
    'Won': 'CLOSED_WON',
    'Lost': 'CLOSED_LOST'
};

const STATUS_MAP_BE_TO_FE: Record<string, string> = {
    'NEW': 'Open',
    'CONTACTED': 'Open',
    'QUALIFIED': 'Qualified',
    'PROPOSAL_SENT': 'Qualified',
    'NEGOTIATION': 'Qualified',
    'CLOSED_WON': 'Won',
    'CLOSED_LOST': 'Lost'
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
    status: apiTask.status ? (apiTask.status.charAt(0).toUpperCase() + apiTask.status.slice(1).toLowerCase()) : 'Open',
    assigned_to: mapUser(apiTask.assigned_to, apiTask.assignee_id)
});

const mapActivityFromApi = (apiActivity: any): Activity => ({
    ...apiActivity,
    author: mapUser(apiActivity.author || apiActivity.creator, apiActivity.author_id || apiActivity.created_by),
    notes: apiActivity.notes || apiActivity.content || ''
});

const mapDocumentFromApi = (apiDoc: any): Attachment => ({
    ...apiDoc,
    uploaded_by: mapUser(apiDoc.uploaded_by || apiDoc.creator, apiDoc.uploaded_by_id || apiDoc.created_by),
    uploaded_at: apiDoc.uploaded_at || apiDoc.created_at
});

const mapDealFromApi = (apiDeal: any): Deal => {
    return {
        ...apiDeal,
        value: parseFloat(apiDeal.value) || 0,
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
        // Ensure arrays are initialized if null
        deals: apiLead.deals || [],
        tasks: (apiLead.tasks || []).map(mapTaskFromApi),
        activities: (apiLead.activities || []).map(mapActivityFromApi),
        custom_fields: apiLead.meta_data || {},
        contact_email: apiLead.email,
        status: STATUS_MAP_BE_TO_FE[apiLead.status] || apiLead.status || 'Open'
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
                throw new Error(errorMessage);
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
}

const apiClient = new ApiClient(API_BASE_URL, TENANT_ID);
const coreClient = new ApiClient(CORE_API_ORIGIN, TENANT_ID);
const dailystoreClient = new ApiClient(DAILYSTORE_API_ORIGIN, TENANT_ID);

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
        order: number;
        color?: string;
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
     * DELETE /leads/:id - Delete a lead
     */
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/leads/${id}`);
    },
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
            entity_type?: 'LEAD' | 'DEAL';
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
            entity_type: 'LEAD' | 'DEAL';
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
    delete: async (id: string): Promise<void> => {
        return apiClient.delete<void>(`/documents/${id}`);
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

    // Leads
    getLeads: async (params?: { skip?: number; take?: number; status?: string; q?: string }): Promise<Lead[]> => {
        return leadsApi.getAll(params);
    },

    getDashboardStats: async (params?: {
        period?: 'yearly' | 'quarterly' | 'monthly';
        year?: number;
        quarter?: number;
        month?: number;
    }) => {
        try {
            // If period filtering is requested, use the new backend endpoint
            if (params?.period) {
                const queryParams = new URLSearchParams();
                queryParams.append('period', params.period);
                if (params.year) queryParams.append('year', params.year.toString());
                if (params.quarter) queryParams.append('quarter', params.quarter.toString());
                if (params.month) queryParams.append('month', params.month.toString());

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
                    t.status === 'Open' && t.type === 'REMINDER'
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
                        tasks: tasks.filter(t => t.status === 'Open').length,
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
                const activeLeads = userLeads.filter((l: any) => l.status !== 'Won' && l.status !== 'Lost').length;

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
                t.status === 'Open' && t.type === 'REMINDER'
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
                    tasks: tasks.filter(t => t.status === 'Open').length,
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

    createLead: async (lead: Omit<Lead, 'id' | 'created_at' | 'owner'>): Promise<Lead> => {
        const status = (lead.status && STATUS_MAP_FE_TO_BE[lead.status])
            ? STATUS_MAP_FE_TO_BE[lead.status]
            : (lead.status || 'NEW');
        return leadsApi.create({
            company_name: lead.company_name,
            contact_name: lead.contact_name,
            email: lead.contact_email,
            phone: lead.phone,
            status: status,
            source: lead.source,
            owner_id: USER_ID,
            meta_data: lead.custom_fields,
        });
    },

    getLeadById: async (id: string): Promise<Lead | undefined> => {
        try {
            return await leadsApi.getById(id);
        } catch (error) {
            return undefined;
        }
    },

    updateLead: async (id: string, updates: Partial<Lead>): Promise<Lead> => {
        // Whitelist updateable fields to avoid sending relation objects to backend
        const data: any = {};
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

        return leadsApi.update(id, data);
    },

    deleteLead: async (id: string): Promise<void> => {
        return leadsApi.delete(id);
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
        // Find stage_id based on stage name (would need to fetch stages first)
        // For now, just update with the stage as-is
        await dealsApi.update(id, { stage_id: stage });
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
        const allDeals = await dealsApi.getAll();
        return allDeals.filter((d) => d.lead_id === leadId);
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
        const allTasks = await tasksApi.getAll();
        return allTasks.filter((t) => t.lead_id === leadId);
    },

    async getTasksByDealId(dealId: string): Promise<Task[]> {
        const allTasks = await tasksApi.getAll();
        return allTasks.filter((t) => t.deal_id === dealId);
    },

    async deleteTask(id: string): Promise<void> {
        return tasksApi.delete(id);
    },

    // Settings
    getSettings: async (): Promise<CRMSettings> => {
        try {
            const [stages, leadStages, leadFields, dealFields] = await Promise.all([
                apiClient.get<any[]>('/settings/pipeline-stages'),
                apiClient.get<any[]>('/settings/lead-stages'),
                apiClient.get<any[]>('/settings/custom-fields?entity_type=LEAD'),
                apiClient.get<any[]>('/settings/custom-fields?entity_type=DEAL')
            ]);

            return {
                deal_stages: stages.map(s => ({
                    id: s.id,
                    name: s.name,
                    type: s.type || (['Won', 'Closed Won'].includes(s.name) ? 'WON' : ['Lost', 'Closed Lost'].includes(s.name) ? 'LOST' : 'OPEN')
                })),
                lead_stages: leadStages.map(s => ({ id: s.id, name: s.name })),
                default_owner_id: USER_ID,
                lead_sources: [],
                lead_custom_fields: leadFields,
                deal_custom_fields: dealFields,
                lead_scoring: []
            };
        } catch (error) {
            console.error('Failed to fetch settings', error);
            return {
                deal_stages: [],
                lead_stages: [],
                default_owner_id: USER_ID,
                lead_sources: [],
                lead_custom_fields: [],
                deal_custom_fields: [],
                lead_scoring: []
            };
        }
    },

    updateSettings: async (settings: CRMSettings): Promise<CRMSettings> => {
        console.log('crmService.updateSettings called', settings);
        try {
            console.log('Syncing pipeline stages...');
            const currentStages = await apiClient.get<any[]>('/settings/pipeline-stages');
            console.log('Current stages from server:', currentStages);
            const newStages = settings.deal_stages;

            // Identify changes
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

            // 1.b Sync Lead Stages
            console.log('Syncing lead stages...');
            const currentLeadStages = await apiClient.get<any[]>('/settings/lead-stages');
            const newLeadStages = settings.lead_stages;

            const lsToCreate = newLeadStages.filter(s => s.id.startsWith('st-'));
            const lsToUpdate = newLeadStages.filter(s => !s.id.startsWith('st-'));
            const lsToDelete = currentLeadStages.filter(cs => !newLeadStages.find(ns => ns.id === cs.id));

            await Promise.all([
                ...lsToCreate.map(s => apiClient.post('/settings/lead-stages', { name: s.name, order: newLeadStages.indexOf(s) + 1, color: '#3b82f6' })),
                ...lsToUpdate.map(s => apiClient.patch(`/settings/lead-stages/${s.id}`, { name: s.name, order: newLeadStages.indexOf(s) + 1 })),
                ...lsToDelete.map(s => apiClient.delete(`/settings/lead-stages/${s.id}`))
            ]);

            // 2. Sync Custom Fields (Lead)
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
                    is_required: f.required
                })),
                ...lfToUpdate.map(f => apiClient.patch(`/settings/custom-fields/${f.id}`, {
                    label: f.label,
                    field_type: f.type,
                    is_required: f.required
                })),
                ...lfToDelete.map(f => apiClient.delete(`/settings/custom-fields/${f.id}`))
            ]);

            // 3. Sync Custom Fields (Deal)
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
                    is_required: f.required
                })),
                ...dfToUpdate.map(f => apiClient.patch(`/settings/custom-fields/${f.id}`, {
                    label: f.label,
                    field_type: f.type,
                    is_required: f.required
                })),
                ...dfToDelete.map(f => apiClient.delete(`/settings/custom-fields/${f.id}`))
            ]);

            return settings;
        } catch (error) {
            console.error('Failed to update settings', error);
            throw error;
        }
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
    async createNote(data: { content: string; lead_id?: string; deal_id?: string; task_id?: string }): Promise<Note> {
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
    getUsers: async (): Promise<User[]> => {
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
    },

    // Documents
    async getDocumentsByLeadId(leadId: string): Promise<Attachment[]> {
        return documentsApi.getAllByLead(leadId);
    },
    async getDocumentsByDealId(dealId: string): Promise<Attachment[]> {
        return documentsApi.getAllByDeal(dealId);
    },
    uploadDocument: async (entity: string | { leadId?: string, dealId?: string }, file: File): Promise<Attachment> => {
        // Mock upload -> In real app, upload to storage first, get URL
        const mockUrl = URL.createObjectURL(file);
        const entityObj = typeof entity === 'string' ? { leadId: entity } : entity;
        return documentsApi.create({
            name: file.name,
            size: file.size,
            type: file.type,
            url: mockUrl,
            lead_id: entityObj.leadId,
            deal_id: entityObj.dealId,
            uploaded_by_id: USER_ID,
        });
    },

    deleteDocument: async (entityId: string, documentId: string): Promise<void> => {
        return documentsApi.delete(documentId);
    },

    // Activities
    async getActivitiesByLeadId(leadId: string): Promise<Activity[]> {
        return activitiesApi.getAllByLead(leadId);
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
            // Call the Projects Microservice (proxied through shell)
            const projects = await apiClient.get<any[]>('/projects-api/projects');
            return projects || [];
        } catch (error: any) {
            console.error('[CRM] Failed to fetch projects list:', error.message);
            // Return empty array instead of mock data - let UI handle empty state
            return [];
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
        valid_until?: string;
        lines: { item_id?: string; description: string; quantity: number; unit_price: number; discount_percent?: number; tax_rate?: number }[];
    }): Promise<any> {
        return apiClient.post<any>('/quotes', data);
    },

    async updateQuote(quoteId: string, data: {
        title?: string;
        notes?: string;
        terms_and_conditions?: string;
        valid_until?: string;
        lines?: { item_id?: string; description: string; quantity: number; unit_price: number; discount_percent?: number; tax_rate?: number }[];
    }): Promise<any> {
        return apiClient.patch<any>(`/quotes/${quoteId}`, data);
    },

    async deleteQuote(quoteId: string): Promise<void> {
        return apiClient.delete(`/quotes/${quoteId}`);
    },

    async submitQuoteForApproval(quoteId: string): Promise<any> {
        return apiClient.post<any>(`/quotes/${quoteId}/submit`, {});
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
            if (!res.ok) return { items: [] };
            return res.json();
        } catch {
            return { items: [] };
        }
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
    getStorefrontOrders: async (leadId: string): Promise<any[]> =>
        apiClient.get<any[]>(`/leads/${leadId}/storefront-orders`),
    getStorefrontCoupons: async (leadId: string): Promise<any[]> =>
        apiClient.get<any[]>(`/leads/${leadId}/storefront-coupons`),
    getStorefrontNewsletters: async (leadId: string): Promise<any[]> =>
        apiClient.get<any[]>(`/leads/${leadId}/storefront-newsletters`),
    getStorefrontIntelligence: async (leadId: string): Promise<any> =>
        apiClient.get<any>(`/leads/${leadId}/storefront-intelligence`),
    getStorefrontRecommendations: async (leadId: string): Promise<any[]> =>
        apiClient.get<any[]>(`/leads/${leadId}/storefront-recommendations`),
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
        period?: 'yearly' | 'quarterly' | 'monthly';
        year?: number;
        quarter?: number;
        month?: number;
    }): Promise<{
        revenue: number;
        orderCount: number;
        aov: number;
        repeatPurchaseRate: number;
        refundRate: number;
        orderChartData: { labels: string[]; values: number[] };
    }> => apiClient.get('/analytics/commerce-kpis', params as any),

    // Configuration
    setTenantId: (id: string) => {
        apiClient.setTenantId(id);
        dailystoreClient.setTenantId(id);
    },
    setOrgId: (id: string) => {
        ORG_ID = id;
        apiClient.setOrgId(id);
        coreClient.setOrgId(id);
        dailystoreClient.setOrgId(id);
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
    },
};
