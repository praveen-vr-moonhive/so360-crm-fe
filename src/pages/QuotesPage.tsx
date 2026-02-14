import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Search, Filter, MoreHorizontal, CheckCircle, XCircle, Clock, Send, Trash2 } from 'lucide-react';
import { crmService } from '../services/crmService';
import { Quote, QuoteStatus, Deal } from '../types/crm';
import { Table } from '../components/common/Table';

const statusColors: Record<QuoteStatus, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-slate-500/20', text: 'text-slate-300', label: 'Draft' },
    pending_approval: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Pending Approval' },
    approved: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Approved' },
    rejected: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Rejected' },
    converted: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Converted' },
    expired: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Expired' },
};

const QuotesPage = () => {
    const navigate = useNavigate();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDealId, setSelectedDealId] = useState<string>('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [quotesData, dealsData] = await Promise.all([
                crmService.getQuotes(),
                crmService.getDeals()
            ]);
            setQuotes(quotesData || []);
            setDeals(dealsData || []);
        } catch (err: any) {
            console.error('Failed to fetch quotes', err);
            setError(err.message || 'Failed to load quotes');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredQuotes = quotes.filter(quote => {
        const matchesSearch = !searchTerm ||
            quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            quote.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            quote.customer_name?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All' || quote.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleCreateQuote = async () => {
        if (!selectedDealId) return;
        try {
            const newQuote = await crmService.createQuote({
                deal_id: selectedDealId,
                title: 'New Quote',
                lines: []
            });
            navigate(`/crm/quotes/${newQuote.id}`);
        } catch (err: any) {
            setError(err.message || 'Failed to create quote');
        }
    };

    const handleDeleteQuote = async (quoteId: string) => {
        try {
            await crmService.deleteQuote(quoteId);
            setQuotes(quotes.filter(q => q.id !== quoteId));
            setShowDeleteConfirm(null);
        } catch (err: any) {
            setError(err.message || 'Failed to delete quote');
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const columns = [
        {
            key: 'quote_number',
            header: 'Quote #',
            accessor: (quote: Quote) => (
                <button
                    onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                    className="text-blue-400 hover:text-blue-300 font-medium"
                >
                    {quote.quote_number || `Q-${quote.id.slice(0, 8)}`}
                </button>
            )
        },
        {
            key: 'title',
            header: 'Title',
            accessor: (quote: Quote) => (
                <span className="text-slate-200">{quote.title || 'Untitled Quote'}</span>
            )
        },
        {
            key: 'customer',
            header: 'Customer',
            accessor: (quote: Quote) => (
                <span className="text-slate-300">{quote.customer_name || quote.deal?.company_name || '-'}</span>
            )
        },
        {
            key: 'total',
            header: 'Total',
            accessor: (quote: Quote) => (
                <span className="text-slate-200 font-medium">{formatCurrency(quote.grand_total || 0)}</span>
            )
        },
        {
            key: 'status',
            header: 'Status',
            accessor: (quote: Quote) => {
                const status = statusColors[quote.status] || statusColors.draft;
                return (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                    </span>
                );
            }
        },
        {
            key: 'valid_until',
            header: 'Valid Until',
            accessor: (quote: Quote) => (
                <span className="text-slate-400">
                    {quote.valid_until ? formatDate(quote.valid_until) : '-'}
                </span>
            )
        },
        {
            key: 'created_at',
            header: 'Created',
            accessor: (quote: Quote) => (
                <span className="text-slate-400">{formatDate(quote.created_at)}</span>
            )
        },
        {
            key: 'actions',
            header: '',
            accessor: (quote: Quote) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate(`/crm/quotes/${quote.id}`)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded"
                        title="View"
                    >
                        <FileText className="w-4 h-4" />
                    </button>
                    {quote.status === 'draft' && (
                        <button
                            onClick={() => setShowDeleteConfirm(quote.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded"
                            title="Delete"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )
        }
    ];

    if (isLoading) {
        return (
            <div className="p-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-800 rounded w-48" />
                    <div className="h-64 bg-slate-800 rounded" />
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Quotes</h1>
                    <p className="text-sm text-slate-400 mt-1">Manage sales quotes and proposals</p>
                </div>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Quote
                </button>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
                    {error}
                </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search quotes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="All">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="converted">Converted</option>
                    <option value="expired">Expired</option>
                </select>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Quotes', value: quotes.length, icon: FileText, color: 'blue' },
                    { label: 'Draft', value: quotes.filter(q => q.status === 'draft').length, icon: Clock, color: 'slate' },
                    { label: 'Pending', value: quotes.filter(q => q.status === 'pending_approval').length, icon: Send, color: 'amber' },
                    { label: 'Approved', value: quotes.filter(q => q.status === 'approved').length, icon: CheckCircle, color: 'green' },
                ].map((stat) => (
                    <div key={stat.label} className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg bg-${stat.color}-500/20`}>
                                <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
                                <p className="text-sm text-slate-400">{stat.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            {filteredQuotes.length === 0 ? (
                <div className="text-center py-16 bg-slate-900/50 border border-slate-700 rounded-lg">
                    <FileText className="w-12 h-12 mx-auto text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-slate-300 mb-2">No quotes found</h3>
                    <p className="text-slate-400 mb-4">
                        {searchTerm || statusFilter !== 'All'
                            ? 'Try adjusting your filters'
                            : 'Create your first quote to get started'}
                    </p>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create Quote
                    </button>
                </div>
            ) : (
                <Table
                    data={filteredQuotes}
                    columns={columns}
                    onRowClick={(quote) => navigate(`/crm/quotes/${quote.id}`)}
                />
            )}

            {/* Create Quote Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h2 className="text-xl font-semibold text-slate-100 mb-4">Create New Quote</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-2">
                                        Select Deal *
                                    </label>
                                    <select
                                        value={selectedDealId}
                                        onChange={(e) => setSelectedDealId(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Select a deal...</option>
                                        {deals.map((deal) => (
                                            <option key={deal.id} value={deal.id}>
                                                {deal.name} - {deal.company_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-800/50 border-t border-slate-700 rounded-b-lg">
                            <button
                                onClick={() => {
                                    setIsCreateModalOpen(false);
                                    setSelectedDealId('');
                                }}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateQuote}
                                disabled={!selectedDealId}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                Create Quote
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-2">Delete Quote</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this quote? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteQuote(showDeleteConfirm)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuotesPage;
