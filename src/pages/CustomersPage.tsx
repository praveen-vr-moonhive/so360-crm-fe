import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Users, Globe, Smartphone, ShoppingCart, UserPlus, ChevronUp, ChevronDown, ChevronsUpDown, Mail, Phone, Calendar, Store, Building2, CreditCard, Shield, CheckCircle2, Tag } from 'lucide-react';
import { crmService } from '../services/crmService';
import { Table } from '../components/common/Table';

type SortField = 'contact_name' | 'email' | 'channel' | 'created_at';
type SortDirection = 'asc' | 'desc' | null;

const CHANNEL_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
    storefront_web: { label: 'Web', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Globe },
    storefront_mobile: { label: 'Mobile', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: Smartphone },
    pos: { label: 'POS', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: ShoppingCart },
    manual: { label: 'Manual', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: UserPlus },
};

const ACQUISITION_SOURCE_CONFIG: Record<string, { label: string; color: string }> = {
    storefront_registration: { label: 'Registration', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    guest_checkout: { label: 'Guest Checkout', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
    pos_inline: { label: 'POS', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    manual_entry: { label: 'Manual', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
    lead_promotion: { label: 'Promoted', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
};

const CustomersPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [customers, setCustomers] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('All');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [sortField, setSortField] = useState<SortField | null>('created_at');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [activeSegmentName, setActiveSegmentName] = useState<string | null>(null);
    const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const segmentId = queryParams.get('segmentId');
            const q = queryParams.get('q') || undefined;
            const channel = queryParams.get('channel') || undefined;
            const category = queryParams.get('category') || undefined;
            const customerIds = (queryParams.get('customer_ids') || '')
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean);

            const statsPromise = crmService.getCustomerStats();
            let customersData: any[] = [];

            if (segmentId) {
                const resolved = await crmService.getCustomerSegmentCustomers(segmentId);
                customersData = Array.isArray(resolved?.customers) ? resolved.customers : [];
                setActiveSegmentName(
                    queryParams.get('segmentName') ||
                    resolved?.segment?.name ||
                    'Segment',
                );
            } else {
                customersData = await crmService.getCustomers({
                    ...(q ? { q } : {}),
                    ...(channel ? { channel } : {}),
                    ...(category ? { category } : {}),
                    ...(customerIds.length > 0 ? { customer_ids: customerIds } : {}),
                });
                setActiveSegmentName(null);
            }

            const statsData = await statsPromise;
            setCustomers(customersData || []);
            setStats(statsData || {});
        } catch (err: any) {
            console.error('Failed to fetch customers', err);
            setError(err.message || 'Failed to load customers');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setSearchTerm(queryParams.get('q') || '');
        setChannelFilter(queryParams.get('channel') || 'All');
        setCategoryFilter(queryParams.get('category') || 'All');
        fetchData();
    }, [location.search]);

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

    const SortableHeader = ({ label, field }: { label: string; field: SortField }) => (
        <button
            onClick={() => toggleSort(field)}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
            {label}
            <SortIcon field={field} />
        </button>
    );

    const filteredCustomers = useMemo(() => {
        let result = customers.filter((c) => {
            const matchesSearch =
                !searchTerm ||
                (c.contact_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.phone || '').includes(searchTerm) ||
                (c.company_name || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesChannel = channelFilter === 'All' || c.channel === channelFilter;
            const matchesCategory = categoryFilter === 'All' || c.customer_category === categoryFilter;
            return matchesSearch && matchesChannel && matchesCategory;
        });

        if (sortField && sortDirection) {
            result = [...result].sort((a, b) => {
                let aVal: any, bVal: any;
                switch (sortField) {
                    case 'contact_name': aVal = a.contact_name || ''; bVal = b.contact_name || ''; break;
                    case 'email': aVal = a.email || ''; bVal = b.email || ''; break;
                    case 'channel': aVal = a.channel || ''; bVal = b.channel || ''; break;
                    case 'created_at': aVal = new Date(a.created_at).getTime(); bVal = new Date(b.created_at).getTime(); break;
                    default: return 0;
                }
                if (typeof aVal === 'string') {
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }

        return result;
    }, [customers, searchTerm, channelFilter, categoryFilter, sortField, sortDirection]);

    const totalPages = Math.ceil(filteredCustomers.length / pageSize);
    const paginatedCustomers = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredCustomers.slice(start, start + pageSize);
    }, [filteredCustomers, currentPage, pageSize]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, channelFilter, categoryFilter]);

    const ChannelBadge = ({ channel }: { channel: string }) => {
        const config = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.manual;
        const Icon = config.icon;
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
                <Icon size={12} />
                {config.label}
            </span>
        );
    };

    const CategoryBadge = ({ category }: { category: string }) => {
        if (category === 'b2b') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Building2 size={11} /> B2B
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                B2C
            </span>
        );
    };

    const AcquisitionBadge = ({ source }: { source: string }) => {
        const config = ACQUISITION_SOURCE_CONFIG[source] || { label: source || '-', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
        return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${config.color}`}>
                {config.label}
            </span>
        );
    };

    const columns = [
        {
            header: <SortableHeader label="Name" field="contact_name" />,
            accessor: (c: any) => (
                <div className="flex items-center gap-2">
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{c.contact_name}</span>
                            <CategoryBadge category={c.customer_category || 'b2c'} />
                        </div>
                        {c.company_name && c.company_name !== c.contact_name && (
                            <span className="text-xs text-slate-500">{c.company_name}</span>
                        )}
                    </div>
                </div>
            ),
        },
        {
            header: <SortableHeader label="Email" field="email" />,
            accessor: (c: any) => (
                <div className="flex flex-col gap-1 text-slate-400">
                    <span className="flex items-center gap-1.5"><Mail size={14} /> {c.email}</span>
                    {c.phone && <span className="flex items-center gap-1.5"><Phone size={14} /> {c.phone}</span>}
                </div>
            ),
        },
        ...(categoryFilter !== 'b2c' ? [
            {
                header: 'Tax ID',
                accessor: (c: any) =>
                    c.customer_category === 'b2c' ? null :
                    c.tax_id ? (
                        <div className="flex items-center gap-1.5 text-sm">
                            <span className="text-slate-300 font-mono text-xs">{c.tax_id}</span>
                            {c.tax_id_verified && <CheckCircle2 size={14} className="text-emerald-400" />}
                        </div>
                    ) : (
                        <span className="text-slate-600 text-sm">-</span>
                    ),
            },
            {
                header: 'Credit Limit',
                accessor: (c: any) => {
                    if (c.customer_category === 'b2c') return null;
                    const limit = parseFloat(c.credit_limit);
                    return limit > 0 ? (
                        <span className="flex items-center gap-1.5 text-slate-300 text-sm">
                            <CreditCard size={14} />
                            {limit.toLocaleString()}
                        </span>
                    ) : (
                        <span className="text-slate-600 text-sm">-</span>
                    );
                },
            },
        ] : []),
        {
            header: <SortableHeader label="Channel" field="channel" />,
            accessor: (c: any) => <ChannelBadge channel={c.channel} />,
        },
        {
            header: 'Source',
            accessor: (c: any) => <AcquisitionBadge source={c.acquisition_source} />,
        },
        {
            header: <SortableHeader label="Joined" field="created_at" />,
            accessor: (c: any) => (
                <span className="text-slate-400 text-sm flex items-center gap-1.5">
                    <Calendar size={14} />
                    {new Date(c.created_at).toLocaleDateString()}
                </span>
            ),
        },
    ];

    return (
        <div className="p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">Customers</h1>
                <p className="text-slate-400 mt-1">Customers from Storefront, POS, guest checkout, and promoted leads</p>
            </header>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                        <Users size={14} /> Total
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.total || 0}</div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium mb-1">
                        <Building2 size={14} /> B2B
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.b2b_count || 0}</div>
                </div>
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                        <Users size={14} /> B2C
                    </div>
                    <div className="text-2xl font-bold text-white">{stats.b2c_count || 0}</div>
                </div>
                {Object.entries(CHANNEL_CONFIG).map(([key, config]) => (
                    <div key={key} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-medium mb-1">
                            <config.icon size={14} /> {config.label}
                        </div>
                        <div className="text-2xl font-bold text-white">{stats[key] || 0}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                {activeSegmentName && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">
                        <Tag size={12} />
                        Segment: {activeSegmentName}
                    </span>
                )}
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                    <input
                        type="text"
                        placeholder="Search customers by name, email, phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 pl-10 pr-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>
                <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                    <option value="All">All Channels</option>
                    <option value="storefront_web">Web</option>
                    <option value="storefront_mobile">Mobile</option>
                    <option value="pos">POS</option>
                    <option value="manual">Manual</option>
                </select>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                    <option value="All">All Categories</option>
                    <option value="b2b">B2B</option>
                    <option value="b2c">B2C</option>
                </select>
                {(activeSegmentName || searchTerm || channelFilter !== 'All' || categoryFilter !== 'All') && (
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            setChannelFilter('All');
                            setCategoryFilter('All');
                            navigate('/crm/customers');
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 underline"
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Table */}
            <Table
                data={paginatedCustomers}
                columns={columns}
                isLoading={isLoading}
                onRowClick={(customer) => navigate(`../customers/${customer.id}`)}
                emptyMessage={error || 'No customers found. Customers appear here when they register via Storefront, POS, guest checkout, or are promoted from Leads.'}
            />

            {/* Pagination */}
            {filteredCustomers.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>Show</span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        >
                            {[10, 25, 50, 100].map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span>of {filteredCustomers.length} customers</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">First</button>
                        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">Prev</button>
                        <span className="px-3 py-1 text-slate-300">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed">Last</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomersPage;
