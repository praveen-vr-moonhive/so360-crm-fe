export type LeadStatus = 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Negotiation' | 'Converted' | 'Lost';

export interface User {
    id: string;
    full_name: string;
    avatar_url?: string;
    email: string;
    role?: string;
}

export type CustomFieldType = 'text' | 'number' | 'date' | 'boolean' | 'SELECT';

export interface CustomFieldDefinition {
    id: string;
    label: string;
    type: CustomFieldType;
    field_type?: string;
    required?: boolean;
    is_required?: boolean;
    options?: string[];
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
    /** DMS document id when the file is stored via the Document Management Service.
     *  When present, downloads must be resolved via a signed download-url endpoint
     *  rather than the (possibly absent) legacy `url`. */
    dmsDocumentId?: string;
}

export interface Lead {
    id: string;
    company_name: string;
    first_name?: string;
    last_name?: string;
    contact_name?: string;
    contact_email: string;
    phone?: string;
    source: string;
    owner: User;
    status: LeadStatus;
    type?: 'lead' | 'customer' | 'partner';
    referred_by?: string;
    created_at: string;
    updated_at?: string;
    activities: Activity[];
    notes: Note[];
    documents?: Attachment[];
    custom_fields?: Record<string, any>;
    creator?: User;
    customer_category?: 'b2b' | 'b2c';
    tax_id?: string;
    tax_id_verified?: boolean;
    tax_id_verified_at?: string;
    credit_limit?: number;
    credit_balance?: number;
    acquisition_source?: string;
    first_order_id?: string;
    first_order_at?: string;
    channel?: string;
    auto_score?: number;
    score_breakdown?: ScoreBreakdownItem[];
}

export type DealStage = 'Lead' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';

export interface FlowState {
    id: string;           // flow state code, e.g. 'qualified'
    name: string;         // display name, e.g. 'Qualified'
    color: string;
    is_terminal: boolean;
    deals?: Deal[];
}

export interface Deal {
    id: string;
    name: string;
    company_name: string;
    value: number;
    expected_close_date: string;
    stage: DealStage;
    stage_id?: string;
    current_flow_state?: string;
    owner: User;
    owner_id?: string;  // Used for updating owner
    // Sales Rep — a People Connect person, not a CRM user. The deal stores only
    // the id; `owner_person` is resolved by crm-be from the People Registry and
    // is null when that person can no longer be resolved.
    owner_person_id?: string | null;
    owner_person?: SalesRep | null;
    last_activity_at?: string;
    notes: Note[];
    activities: Activity[];
    documents?: Attachment[];
    lead_id?: string;
    partner_id?: string;
    company?: string;
    contact_email?: string;
    project_id?: string;
    invoice_id?: string;
    invoice_number?: string;
    custom_fields?: Record<string, any>;
    created_at: string;
    fulfillment_status?: 'pending' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | null;
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
    updated_at?: string;
    parent_note_id?: string | null;
    replies?: Note[];
}

export type TaskType = 'EMAIL' | 'TODO' | 'REMINDER' | 'CALL' | 'MEETING';

/**
 * Task priority. `tasks` is shared with the Projects module, which owns the
 * column and its CHECK — projects-be migration 002 pinned the uppercase
 * vocabulary LOW | MEDIUM | HIGH | CRITICAL. CRM must speak that set; a
 * lowercase value violates tasks_priority_check and 500s the insert.
 */
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
    { value: 'LOW', label: 'Low' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' },
    { value: 'CRITICAL', label: 'Critical' },
];

export const TASK_PRIORITY_STYLES: Record<TaskPriority, string> = {
    LOW: 'bg-slate-700/40 text-slate-300',
    MEDIUM: 'bg-sky-500/15 text-sky-400',
    HIGH: 'bg-amber-500/15 text-amber-400',
    CRITICAL: 'bg-rose-500/15 text-rose-400',
};

export interface Task {
    id: string;
    title: string;
    due_date: string;
    start_date?: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'ON_HOLD' | 'CANCELLED';
    priority?: TaskPriority;
    type: TaskType;
    deal_id?: string;
    deal_name?: string;
    lead_id?: string;
    lead?: { id: string; company_name: string; contact_name: string } | null;
    deal?: { id: string; name: string; company_name: string } | null;
    description?: string;
    assigned_to: User;
    created_at: string;
    reminder_minutes_before?: number;
    // Project sync — populated once the connect-project migration lands on the
    // backend. Absent/undefined on a task means "no project connection", which
    // is the current unaffected behavior — every consumer must treat it that way.
    project_id?: string;
    project_task_id?: string;
    sync_status?: 'connected' | 'syncing' | 'sync_failed' | 'disconnected' | null;
    last_synced_at?: string;
}

export interface LeadScoringRule {
    id: string;
    name: string;
    rule_type: 'source' | 'activity' | 'field';
    target_field: string;
    condition: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
    value?: string;
    score_points: number;
    is_active: boolean;
    priority: number;
    // Legacy field kept for backwards compat during transition
    criteria?: string;
    points?: number;
    type?: 'source' | 'activity' | 'field';
}

export interface ScoreCategory {
    id: string;
    label: string;
    min_score: number;
    max_score: number | null;
    color: string;
    sort_order: number;
}

export interface ScoreBreakdownItem {
    rule_id: string;
    rule_name: string;
    points: number;
}

export interface SourceTypeOption {
    id: string;
    label: string;
    value: string;
    is_system: boolean;
    is_active: boolean;
    sort_order: number;
}

export type DealNamingResetMode = 'none' | 'daily' | 'monthly' | 'yearly' | 'continuous';

export interface DealNamingSequenceConfig {
    enabled: boolean;
    reset_mode: DealNamingResetMode;
    padding: number;
    start_at: number;
}

export interface DealNamingConfig {
    enabled: boolean;
    template: string;
    prefix: string;
    suffix: string;
    separator: string;
    sequence: DealNamingSequenceConfig;
}

export const DEFAULT_DEAL_NAMING_CONFIG: DealNamingConfig = {
    enabled: true,
    template: '{lead_name} - {YYYYMMDD}',
    prefix: '',
    suffix: '',
    separator: ' - ',
    sequence: { enabled: false, reset_mode: 'none', padding: 4, start_at: 1 },
};

export interface CRMSettings {
    deal_stages: { id: string; name: string; type: 'OPEN' | 'WON' | 'LOST' }[];
    lead_stages: { id: string; name: string }[];
    default_owner_id: string;
    lead_sources: { id: string; name: string; archived: boolean }[];
    source_type_options: SourceTypeOption[];
    lead_custom_fields: CustomFieldDefinition[];
    deal_custom_fields: CustomFieldDefinition[];
    partner_custom_fields: CustomFieldDefinition[];
    lead_scoring: LeadScoringRule[];
    score_categories: ScoreCategory[];
    deal_naming: DealNamingConfig;
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
    variant_id?: string;
    item_name?: string;
    sku?: string;
    sub_sku?: string;
    item_image_url?: string | null;
    description: string;
    quantity: number;
    /** Unit of measure, e.g. "pcs", "kg", "hrs". */
    unit?: string;
    /** HSN/SAC tax classification code. */
    hsn_code?: string;
    unit_price: number;
    discount_percent?: number;
    tax_rate?: number;
    line_total?: number;
}

// Inventory item types — used by ProductPickerModal
export interface InventoryVariant {
    id: string;
    name: string;
    sku: string;
    price: number;
    variant_attributes: Record<string, string>;
    image_url: string | null;
    /** On-hand minus reserved, summed across warehouses. */
    available_stock?: number;
}

export interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    price: number;
    cost: number;
    image_url: string | null;
    metadata: Record<string, any>;
    has_variants: boolean;
    /** On-hand minus reserved, summed across warehouses (and variants). */
    available_stock?: number;
    variants: InventoryVariant[];
}

/**
 * A person from People Connect's People Registry, as served to CRM ownership
 * pickers. People Connect stays the source of truth — CRM stores only the
 * person id on the record and re-resolves display data from here.
 */
export interface SalesRep {
    id: string;
    full_name: string;
    email: string | null;
    avatar_url: string | null;
    job_title: string | null;
    employee_id: string | null;
    department_id: string | null;
    department_name: string | null;
    status: string;
}

export interface ProductPickerSelection {
    item_id: string;
    variant_id: string;
    name: string;
    sku: string;
    sub_sku: string;
    unit_price: number;
    image_url: string | null;
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
    // The API returns the raw `quotes` columns (`subtotal`, `total_tax`,
    // `total_discount`, `total_amount`). The `*_total` / `grand_total` aliases
    // below are the shapes older FE code reads; both are optional because
    // neither set is guaranteed to be present on a given response.
    subtotal?: number;
    tax_total?: number;
    discount_total?: number;
    grand_total?: number;
    /** Persisted tax total — actual `quotes` column name. */
    total_tax?: number;
    /** Persisted discount total — actual `quotes` column name. */
    total_discount?: number;
    /** Persisted grand total — actual `quotes` column name. */
    total_amount?: number;
    notes?: string;
    /** Standing legal terms text. */
    terms_and_conditions?: string;
    /** When payment falls due, e.g. "Net 30". */
    payment_terms?: string;
    /** Delivery commitment in prose. */
    delivery_terms?: string;
    /** Incoterms 2020 rule governing cost/risk transfer. */
    incoterm?: string;
    /** Buyer's own RFQ/PO number. */
    customer_reference?: string;
    valid_until?: string;
    submitted_by?: string;
    current_approval_request_id?: string | null;
    current_approval_request?: {
        id: string;
        quote_id: string;
        requested_by: string;
        requested_at: string;
        status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
        decision_at?: string | null;
        total_amount_snapshot?: number | null;
        notes?: string | null;
        approvers: {
            id?: string;
            request_id: string;
            quote_id: string;
            approver_user_id: string;
            approver_person_id?: string | null;
            approver_name?: string | null;
            approver_email?: string | null;
            status: 'pending' | 'approved' | 'rejected';
            decision_at?: string | null;
            notes?: string | null;
        }[];
    } | null;
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

// ─── Lead / Deal Products ─────────────────────────────────────────────────────

export type ProductInterestStatus = 'interested' | 'quoted' | 'approved' | 'ordered' | 'cancelled';

export interface LeadProduct {
    id: string;
    lead_id: string;
    item_id?: string;
    item_name: string;
    item_sku?: string;
    category_id?: string;
    category_name?: string;
    is_custom_build?: boolean;
    quantity: number;
    unit_price: number;
    status: ProductInterestStatus;
    notes?: string;
    created_at: string;
    updated_at: string;
}

export interface DealProduct {
    id: string;
    deal_id: string;
    lead_product_id?: string;
    item_id?: string;
    item_name: string;
    item_sku?: string;
    category_id?: string;
    category_name?: string;
    is_custom_build?: boolean;
    quantity: number;
    unit_price: number;
    status: ProductInterestStatus;
    notes?: string;
    created_at: string;
    updated_at: string;
}

// ============================================================================
// Stakeholder Management (Task 6)
// ============================================================================
export type StakeholderRole =
    | 'decision_maker' | 'economic_buyer' | 'technical_evaluator' | 'end_user'
    | 'project_sponsor' | 'procurement' | 'finance' | 'legal' | 'influencer'
    | 'champion' | 'gatekeeper';

export type BuyingCommitteeRole = 'primary_decision_maker' | 'strong_supporter' | 'neutral' | 'opposed' | 'unknown';
export type RelationshipStrength = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'no_relationship';

export interface Stakeholder {
    id: string;
    lead_id: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    job_title?: string;
    department?: string;
    company_id?: string;
    company_name?: string;
    email?: string;
    phone?: string;
    mobile_phone?: string;
    linkedin_url?: string;
    preferred_communication_method?: string;
    time_zone?: string;
    is_active: boolean;
    is_primary_contact: boolean;
    buying_committee_role: BuyingCommitteeRole;
    relationship_strength: RelationshipStrength;
    relationship_confidence_score?: number;
    reports_to_stakeholder_id?: string | null;
    preferred_language?: string;
    preferred_contact_time?: string;
    do_not_contact: boolean;
    marketing_opt_out: boolean;
    roles: StakeholderRole[];
    created_at: string;
    updated_at: string;
}

// ============================================================================
// Meetings (Task 3)
// ============================================================================
export type MeetingStatus = 'upcoming' | 'completed' | 'cancelled' | 'missed';

export interface MeetingAttendee {
    person_id?: string;
    external_email?: string;
    name?: string;
    response?: string;
}

export interface Meeting {
    id: string;
    lead_id?: string | null;
    deal_id?: string | null;
    stakeholder_id?: string | null;
    title: string;
    scheduled_at: string;
    duration_minutes: number;
    location?: string;
    agenda?: string;
    attendees: MeetingAttendee[];
    outcome?: string;
    next_steps?: string;
    status: MeetingStatus;
    owner_person_id?: string;
    created_at: string;
    updated_at: string;
}

export interface StakeholderActivitySummary {
    last_call: string | null;
    last_email: string | null;
    last_meeting: string | null;
    last_interaction: string | null;
    open_tasks: number;
    associated_deals: { deal_id: string; involvement_role: string; deal: { id: string; name: string; company: string; status: string } | null }[];
    meeting_history: any[];
}

