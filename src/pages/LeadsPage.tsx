import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, User as UserIcon, Mail, Phone, Calendar, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { crmService } from '../services/crmService';
import { Lead, User } from '../types/crm';
import { Table } from '../components/common/Table';
import { CreateLeadModal } from '../components/leads/CreateLeadModal';
import { useNotify, useActivity } from '@so360/shell-context';

type SortField = 'company_name' | 'contact_name' | 'status' | 'created_at' | 'owner';
type SortDirection = 'asc' | 'desc' | null;

const LeadsPage = () => {
    const navigate = useNavigate();
    const { emitNotification } = useNotify();
    const { recordActivity } = useActivity();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [ownerFilter, setOwnerFilter] = useState('All');
    const [creatorFilter, setCreatorFilter] = useState('All');
    const [dateRangeFilter, setDateRangeFilter] = useState('All');
    const [customDateStart, setCustomDateStart] = useState('');
    const [customDateEnd, setCustomDateEnd] = useState('');

    const [leadStages, setLeadStages] = useState<{ id: string, name: string }[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const fetchInitialData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [leadsData, settingsData, usersData] = await Promise.all([
                crmService.getLeads(),
                crmService.getSettings(),
                crmService.getUsers()
            ]);
            setLeads(leadsData);
            setLeadStages(settingsData.lead_stages);
            setUsers(usersData);
        } catch (err: any) {
            console.error('Failed to fetch initial data', err);
            setError(err.message || 'Failed to initialize page');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();
    }, []);

    const isDateInRange = (dateString: string) => {
        if (dateRangeFilter === 'All') return true;

        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday as start
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startOfLastWeek = new Date(startOfWeek);
        startOfLastWeek.setDate(startOfWeek.getDate() - 7);
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        switch (dateRangeFilter) {
            case 'Today':
                return date >= today;
            case 'Yesterday':
                return date >= yesterday && date < today;
            case 'This Week':
                return date >= startOfWeek;
            case 'Last Week':
                return date >= startOfLastWeek && date <= endOfLastWeek;
            case 'This Month':
                return date >= startOfMonth;
            case 'Last Month':
                return date >= startOfLastMonth && date <= endOfLastMonth;
            case 'Custom':
                if (customDateStart && customDateEnd) {
                    const start = new Date(customDateStart);
                    const end = new Date(customDateEnd);
                    end.setHours(23, 59, 59, 999);
                    return date >= start && date <= end;
                }
                return true;
            default:
                return true;
        }
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') setSortDirection('desc');
            else if (sortDirection === 'desc') { setSortField(null); setSortDirection(null); }
            else setSortDirection('asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ChevronsUpDown size={14} className="text-slate-600" />;
        if (sortDirection === 'asc') return <ChevronUp size={14} className="text-blue-400" />;
        if (sortDirection === 'desc') return <ChevronDown size={14} className="text-blue-400" />;
        return <ChevronsUpDown size={14} className="text-slate-600" />;
    };

    const sortedAndFilteredLeads = useMemo(() => {
        let result = leads.filter(lead => {
            const matchesSearch =
                lead.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.contact_name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'All' || lead.status === statusFilter;
            const matchesOwner = ownerFilter === 'All' || lead.owner?.id === ownerFilter;
            const matchesCreator = creatorFilter === 'All' || lead.creator?.id === creatorFilter;
            const matchesDate = isDateInRange(lead.created_at);

            return matchesSearch && matchesStatus && matchesOwner && matchesCreator && matchesDate;
        });

        // Apply sorting
        if (sortField && sortDirection) {
            result = [...result].sort((a, b) => {
                let aVal: any, bVal: any;
                switch (sortField) {
                    case 'company_name': aVal = a.company_name; bVal = b.company_name; break;
                    case 'contact_name': aVal = a.contact_name; bVal = b.contact_name; break;
                    case 'status': aVal = a.status; bVal = b.status; break;
                    case 'created_at': aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); break;
                    case 'owner': aVal = a.owner?.full_name || ''; bVal = b.owner?.full_name || ''; break;
                    default: return 0;
                }
                if (typeof aVal === 'string') {
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }

        return result;
    }, [leads, searchTerm, statusFilter, ownerFilter, creatorFilter, dateRangeFilter, customDateStart, customDateEnd, sortField, sortDirection]);

    // Pagination
    const totalPages = Math.ceil(sortedAndFilteredLeads.length / pageSize);
    const paginatedLeads = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedAndFilteredLeads.slice(start, start + pageSize);
    }, [sortedAndFilteredLeads, currentPage, pageSize]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, ownerFilter, creatorFilter, dateRangeFilter]);

    const handleOwnerChange = async (lead: Lead, newOwnerId: string) => {
        const newOwner = users.find(u => u.id === newOwnerId);
        if (!newOwner) return;

        try {
            await crmService.updateLead(lead.id, { owner: newOwner });
            await crmService.logActivity({
                lead_id: lead.id,
                type: 'OWNER_CHANGE',
                notes: `Assigned owner changed to ${newOwner.full_name}`,
                date: new Date().toISOString()
            });
            emitNotification({ event: 'CRM_LEAD_ASSIGNED', userIds: [newOwnerId], variables: { leadName: lead.company_name, actorName: 'You' }, relatedResource: { type: 'lead', id: lead.id } }).catch(() => {});
            recordActivity({ eventType: 'lead.assigned', eventCategory: 'crm', description: `Assigned lead "${lead.company_name}" to ${newOwner.full_name}`, resourceType: 'lead', resourceId: lead.id }).catch(() => {});
            // Optimistic update
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, owner: newOwner } : l));
        } catch (error) {
            console.error('Failed to update owner:', error);
        }
    };

    const handleStatusChange = async (lead: Lead, newStatus: string) => {
        try {
            await crmService.updateLead(lead.id, { status: newStatus as any });
            await crmService.logActivity({
                lead_id: lead.id,
                type: 'STATUS_CHANGE',
                notes: `Lead status changed to ${newStatus}`,
                date: new Date().toISOString()
            });
            recordActivity({ eventType: newStatus === 'Converted' ? 'lead.converted' : 'lead.status_changed', eventCategory: 'crm', description: `Lead "${lead.company_name}" status changed to ${newStatus}`, resourceType: 'lead', resourceId: lead.id }).catch(() => {});
            // Optimistic update
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus as any } : l));
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    };

    const handleDeleteLead = async (leadId: string) => {
        setIsDeleting(true);
        try {
            await crmService.deleteLead(leadId);
            setLeads(prev => prev.filter(l => l.id !== leadId));
            setShowDeleteConfirm(null);
        } catch (err: any) {
            setError(err.message || 'Failed to delete lead');
        } finally {
            setIsDeleting(false);
        }
    };

    // Sortable header component
    const SortableHeader = ({ label, field }: { label: string, field: SortField }) => (
        <button
            onClick={() => toggleSort(field)}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
            {label}
            <SortIcon field={field} />
        </button>
    );

    const columns = [
        {
            header: <SortableHeader label="Company & Contact" field="company_name" />,
            accessor: (lead: Lead) => (
                <div className="flex flex-col gap-1">
                    <span className="font-semibold text-white">{lead.company_name}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                        <UserIcon size={12} /> {lead.contact_name}
                    </span>
                </div>
            )
        },
        {
            header: 'Communication',
            accessor: (lead: Lead) => (
                <div className="flex flex-col gap-1 text-slate-400">
                    <span className="flex items-center gap-1.5"><Mail size={14} /> {lead.contact_email}</span>
                    {lead.phone && <span className="flex items-center gap-1.5"><Phone size={14} /> {lead.phone}</span>}
                </div>
            )
        },
        {
            header: <SortableHeader label="Owner" field="owner" />,
            accessor: (lead: Lead) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <select
                        value={lead.owner.id}
                        onChange={(e) => handleOwnerChange(lead, e.target.value)}
                        className="bg-transparent text-slate-300 text-sm focus:outline-none cursor-pointer hover:text-white transition-colors py-1"
                    >
                        {users.map(user => (
                            <option key={user.id} value={user.id} className="bg-slate-900 text-slate-300">
                                {user.full_name}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        {
            header: <SortableHeader label="Status" field="status" />,
            accessor: (lead: Lead) => {
                const colors: any = {
                    'Open': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                    'Qualified': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
                    'Won': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    'Lost': 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                };
                const colorClass = colors[lead.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';

                return (
                    <div onClick={(e) => e.stopPropagation()}>
                        <select
                            value={lead.status}
                            onChange={(e) => handleStatusChange(lead, e.target.value)}
                            className={`px-2 py-1 rounded-full text-xs font-medium border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-950 focus:ring-blue-500 ${colorClass}`}
                        >
                            {leadStages.map(stage => (
                                <option key={stage.id} value={stage.name} className="bg-slate-900 text-slate-300">
                                    {stage.name}
                                </option>
                            ))}
                        </select>
                    </div>
                );
            }
        },
        {
            header: <SortableHeader label="Created" field="created_at" />,
            accessor: (lead: Lead) => (
                <div className="flex flex-col gap-0.5">
                    <span className="text-slate-300 text-xs font-medium">{lead.creator?.full_name || 'Unknown'}</span>
                    <span className="text-slate-500 text-[10px] flex items-center gap-1">
                        <Calendar size={10} />
                        {new Date(lead.created_at).toLocaleDateString()}
                    </span>
                </div>
            )
        },
        {
            header: '',
            accessor: (lead: Lead) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => setShowDeleteConfirm(lead.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                        title="Delete lead"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="p-8">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Leads & Accounts</h1>
                    <p className="text-slate-400 mt-1">Single source of truth for business deals</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg font-semibold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                >
                    <Plus size={20} />
                    Create Lead
                </button>
            </header>

            <CreateLeadModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={fetchInitialData}
                existingLeads={leads.map(l => l.company_name)}
            />

            <div className="flex flex-col gap-4 mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[200px] relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                        <input
                            type="text"
                            placeholder="Search leads..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filters:</span>
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                        <option value="All">All Statuses</option>
                        {leadStages.map(stage => (
                            <option key={stage.id} value={stage.name}>{stage.name}</option>
                        ))}
                    </select>

                    <select
                        value={ownerFilter}
                        onChange={(e) => setOwnerFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                        <option value="All">All Owners</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.full_name}</option>
                        ))}
                    </select>

                    <select
                        value={creatorFilter}
                        onChange={(e) => setCreatorFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                        <option value="All">Created By: All</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.full_name}</option>
                        ))}
                    </select>

                    <select
                        value={dateRangeFilter}
                        onChange={(e) => setDateRangeFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                        <option value="All">All Time</option>
                        <option value="Today">Today</option>
                        <option value="Yesterday">Yesterday</option>
                        <option value="This Week">This Week</option>
                        <option value="Last Week">Last Week</option>
                        <option value="This Month">This Month</option>
                        <option value="Last Month">Last Month</option>
                        <option value="Custom">Custom Range</option>
                    </select>

                    {dateRangeFilter === 'Custom' && (
                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                            <input
                                type="date"
                                value={customDateStart}
                                onChange={(e) => setCustomDateStart(e.target.value)}
                                className="bg-transparent text-slate-300 text-xs focus:outline-none [&::-webkit-calendar-picker-indicator]:invert"
                            />
                            <span className="text-slate-500">-</span>
                            <input
                                type="date"
                                value={customDateEnd}
                                onChange={(e) => setCustomDateEnd(e.target.value)}
                                className="bg-transparent text-slate-300 text-xs focus:outline-none [&::-webkit-calendar-picker-indicator]:invert"
                            />
                        </div>
                    )}

                    {(statusFilter !== 'All' || ownerFilter !== 'All' || creatorFilter !== 'All' || dateRangeFilter !== 'All') && (
                        <button
                            onClick={() => {
                                setStatusFilter('All');
                                setOwnerFilter('All');
                                setCreatorFilter('All');
                                setDateRangeFilter('All');
                                setCustomDateStart('');
                                setCustomDateEnd('');
                            }}
                            className="text-xs text-rose-400 hover:text-rose-300 underline"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>

            <Table
                data={paginatedLeads}
                columns={columns}
                isLoading={isLoading}
                onRowClick={(lead) => navigate(`${lead.id}`)}
                emptyMessage={error || "No leads found. Start by adding your first lead."}
            />

            {/* Pagination Controls */}
            {sortedAndFilteredLeads.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>Show</span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        >
                            {[10, 25, 50, 100].map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span>of {sortedAndFilteredLeads.length} leads</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            First
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <span className="px-3 py-1 text-slate-300">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Last
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-2">Delete Lead</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this lead? This will also remove all associated notes, activities, and documents. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteLead(showDeleteConfirm)}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isDeleting && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsPage;
