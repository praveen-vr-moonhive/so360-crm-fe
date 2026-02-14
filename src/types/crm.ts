export type LeadStatus = 'Open' | 'Qualified' | 'Won' | 'Lost';

export interface User {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
    role?: string;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean';

export interface CustomFieldDefinition {
    id: string;
    label: string;
    type: CustomFieldType;
    required: boolean;
}

export interface Attachment {
    id: string;
    name: string;
    size: number;
    type: string;
    uploaded_at: string;
    uploaded_by: User;
    url: string;
    created_at: string;
}

export interface Lead {
    id: string;
    company_name: string;
    contact_name: string;
    contact_email: string;
    phone?: string;
    source: string;
    owner: User;
    status: LeadStatus;
    created_at: string;
    updated_at?: string;
    activities: Activity[];
    notes: Note[];
    documents?: Attachment[];
    custom_fields?: Record<string, any>;
    creator?: User;
}

export type DealStage = 'Lead' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';

export interface Deal {
    id: string;
    name: string;
    company_name: string;
    value: number;
    expected_close_date: string;
    stage: DealStage;
    stage_id?: string;
    owner: User;
    owner_id?: string;  // Used for updating owner
    last_activity_at?: string;
    notes: Note[];
    activities: Activity[];
    documents?: Attachment[];
    lead_id?: string;
    project_id?: string;
    custom_fields?: Record<string, any>;
    created_at: string;
}

export type ActivityType = 'CALL' | 'MEETING' | 'EMAIL' | 'NOTE' | 'STATUS_CHANGE' | 'STAGE_CHANGE' | 'OWNER_CHANGE' | 'PROFILE_UPDATE' | 'TASK';

export interface Activity {
    id: string;
    type: ActivityType;
    notes: string;
    date: string;
    follow_up_date?: string;
    author: User;
    created_at: string;
}

export interface Note {
    id: string;
    content: string;
    author: User;
    created_at: string;
}

export type TaskType = 'EMAIL' | 'TODO' | 'REMINDER' | 'CALL' | 'MEETING';

export interface Task {
    id: string;
    title: string;
    due_date: string;
    status: 'Open' | 'Done';
    type: TaskType;
    deal_id?: string;
    deal_name?: string;
    lead_id?: string;
    description?: string;
    assigned_to: User;
    created_at: string;
    reminder_minutes_before?: number;
}

export interface LeadScoringRule {
    id: string;
    criteria: string;
    points: number;
    type: 'source' | 'activity' | 'field';
}

export interface CRMSettings {
    deal_stages: { id: string; name: string; type: 'OPEN' | 'WON' | 'LOST' }[];
    lead_stages: { id: string; name: string }[];
    default_owner_id: string;
    lead_sources: { id: string; name: string; archived: boolean }[];
    lead_custom_fields: CustomFieldDefinition[];
    deal_custom_fields: CustomFieldDefinition[];
    lead_scoring: LeadScoringRule[];
}

export interface DealFilters {
    date_range?: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';
    start_date?: string;
    end_date?: string;
    owner_id?: string;
    lead_id?: string;
    company_name?: string;
}

// Quote Types
export type QuoteStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted' | 'expired';

export interface QuoteLine {
    id?: string;
    item_id?: string;
    description: string;
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    tax_rate?: number;
    line_total?: number;
}

export interface Quote {
    id: string;
    quote_number: string;
    deal_id: string;
    deal?: Deal;
    customer_id?: string;
    customer_name?: string;
    title?: string;
    status: QuoteStatus;
    lines: QuoteLine[];
    subtotal: number;
    tax_total: number;
    discount_total: number;
    grand_total: number;
    notes?: string;
    terms_and_conditions?: string;
    valid_until?: string;
    created_by: User;
    approved_by?: User;
    approved_at?: string;
    rejection_reason?: string;
    created_at: string;
    updated_at?: string;
}

export interface CreateQuoteDto {
    deal_id: string;
    customer_id?: string;
    title?: string;
    notes?: string;
    terms_and_conditions?: string;
    valid_until?: string;
    lines: Omit<QuoteLine, 'id' | 'line_total'>[];
}

export interface UpdateQuoteDto {
    title?: string;
    notes?: string;
    terms_and_conditions?: string;
    valid_until?: string;
    lines?: Omit<QuoteLine, 'id' | 'line_total'>[];
}

export interface QuoteFilters {
    status?: QuoteStatus;
    deal_id?: string;
    customer_id?: string;
}

