import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, CheckCircle, XCircle, FileText, Plus, Trash2, Edit2 } from 'lucide-react';
import { crmService } from '../services/crmService';
import { Quote, QuoteLine, QuoteStatus } from '../types/crm';

const statusConfig: Record<QuoteStatus, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-slate-500/20', text: 'text-slate-300', label: 'Draft' },
    pending_approval: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Pending Approval' },
    approved: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Approved' },
    rejected: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Rejected' },
    converted: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Converted' },
    expired: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Expired' },
};

const QuoteDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [quote, setQuote] = useState<Quote | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Editable fields
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [lines, setLines] = useState<QuoteLine[]>([]);

    // Action modals
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showConvertModal, setShowConvertModal] = useState(false);

    useEffect(() => {
        if (id) {
            fetchQuote();
        }
    }, [id]);

    const fetchQuote = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await crmService.getQuoteById(id!);
            setQuote(data);
            setTitle(data.title || '');
            setNotes(data.notes || '');
            setTermsAndConditions(data.terms_and_conditions || '');
            setValidUntil(data.valid_until ? data.valid_until.split('T')[0] : '');
            setLines(data.lines || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load quote');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!quote) return;
        setIsSaving(true);
        try {
            const updatedQuote = await crmService.updateQuote(quote.id, {
                title,
                notes,
                terms_and_conditions: termsAndConditions,
                valid_until: validUntil || undefined,
                lines: lines.map(l => ({
                    item_id: l.item_id,
                    description: l.description,
                    quantity: l.quantity,
                    unit_price: l.unit_price,
                    discount_percent: l.discount_percent,
                    tax_rate: l.tax_rate,
                })),
            });
            setQuote(updatedQuote);
            setIsEditing(false);
        } catch (err: any) {
            setError(err.message || 'Failed to save quote');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitForApproval = async () => {
        if (!quote) return;
        try {
            const updated = await crmService.submitQuoteForApproval(quote.id);
            setQuote(updated);
        } catch (err: any) {
            setError(err.message || 'Failed to submit quote');
        }
    };

    const handleApprove = async () => {
        if (!quote) return;
        try {
            const updated = await crmService.approveQuote(quote.id);
            setQuote(updated);
        } catch (err: any) {
            setError(err.message || 'Failed to approve quote');
        }
    };

    const handleReject = async () => {
        if (!quote || !rejectReason) return;
        try {
            const updated = await crmService.rejectQuote(quote.id, rejectReason);
            setQuote(updated);
            setShowRejectModal(false);
            setRejectReason('');
        } catch (err: any) {
            setError(err.message || 'Failed to reject quote');
        }
    };

    const handleConvert = async () => {
        if (!quote) return;
        try {
            await crmService.convertQuoteToOrder(quote.id);
            setShowConvertModal(false);
            fetchQuote();
        } catch (err: any) {
            setError(err.message || 'Failed to convert quote');
        }
    };

    const addLine = () => {
        setLines([
            ...lines,
            {
                description: '',
                quantity: 1,
                unit_price: 0,
                discount_percent: 0,
                tax_rate: 0,
            },
        ]);
    };

    const updateLine = (index: number, field: keyof QuoteLine, value: any) => {
        const newLines = [...lines];
        newLines[index] = { ...newLines[index], [field]: value };
        setLines(newLines);
    };

    const removeLine = (index: number) => {
        setLines(lines.filter((_, i) => i !== index));
    };

    const calculateLineTotal = (line: QuoteLine) => {
        const subtotal = line.quantity * line.unit_price;
        const discount = subtotal * ((line.discount_percent || 0) / 100);
        const afterDiscount = subtotal - discount;
        const tax = afterDiscount * ((line.tax_rate || 0) / 100);
        return afterDiscount + tax;
    };

    const calculateTotals = () => {
        const subtotal = lines.reduce((acc, l) => acc + l.quantity * l.unit_price, 0);
        const discountTotal = lines.reduce((acc, l) => acc + (l.quantity * l.unit_price * ((l.discount_percent || 0) / 100)), 0);
        const afterDiscount = subtotal - discountTotal;
        const taxTotal = lines.reduce((acc, l) => {
            const lineSubtotal = l.quantity * l.unit_price;
            const lineDiscount = lineSubtotal * ((l.discount_percent || 0) / 100);
            return acc + ((lineSubtotal - lineDiscount) * ((l.tax_rate || 0) / 100));
        }, 0);
        return {
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal: afterDiscount + taxTotal,
        };
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    if (isLoading) {
        return (
            <div className="p-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-slate-800 rounded w-64" />
                    <div className="h-96 bg-slate-800 rounded" />
                </div>
            </div>
        );
    }

    if (!quote) {
        return (
            <div className="p-8">
                <div className="text-center py-16">
                    <FileText className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                    <h2 className="text-xl font-semibold text-slate-300 mb-2">Quote not found</h2>
                    <button
                        onClick={() => navigate('/crm/quotes')}
                        className="text-blue-400 hover:text-blue-300"
                    >
                        Back to Quotes
                    </button>
                </div>
            </div>
        );
    }

    const status = statusConfig[quote.status];
    const totals = calculateTotals();
    const canEdit = quote.status === 'draft';
    const canSubmit = quote.status === 'draft' && lines.length > 0;
    const canApprove = quote.status === 'pending_approval';
    const canConvert = quote.status === 'approved';

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/crm/quotes')}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold text-slate-100">
                                {quote.quote_number || `Quote #${quote.id.slice(0, 8)}`}
                            </h1>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.bg} ${status.text}`}>
                                {status.label}
                            </span>
                        </div>
                        <p className="text-slate-400 mt-1">
                            Created {formatDate(quote.created_at)}
                            {quote.valid_until && ` • Valid until ${formatDate(quote.valid_until)}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {canEdit && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                            Edit
                        </button>
                    )}
                    {isEditing && (
                        <>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    fetchQuote();
                                }}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </>
                    )}
                    {canSubmit && !isEditing && (
                        <button
                            onClick={handleSubmitForApproval}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            Submit for Approval
                        </button>
                    )}
                    {canApprove && (
                        <>
                            <button
                                onClick={() => setShowRejectModal(true)}
                                className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-white border border-red-500/50 hover:bg-red-600 rounded-lg transition-colors"
                            >
                                <XCircle className="w-4 h-4" />
                                Reject
                            </button>
                            <button
                                onClick={handleApprove}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                            >
                                <CheckCircle className="w-4 h-4" />
                                Approve
                            </button>
                        </>
                    )}
                    {canConvert && (
                        <button
                            onClick={() => setShowConvertModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Convert to Order
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
                    {error}
                </div>
            )}

            {/* Quote Details */}
            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-slate-100 mb-4">Quote Details</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Title</label>
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter quote title..."
                                    />
                                ) : (
                                    <p className="text-slate-200">{quote.title || 'Untitled Quote'}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Valid Until</label>
                                {isEditing ? (
                                    <input
                                        type="date"
                                        value={validUntil}
                                        onChange={(e) => setValidUntil(e.target.value)}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                ) : (
                                    <p className="text-slate-200">
                                        {quote.valid_until ? formatDate(quote.valid_until) : 'Not set'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-slate-100">Line Items</h2>
                            {isEditing && (
                                <button
                                    onClick={addLine}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 border border-blue-500/50 hover:border-blue-400 rounded-lg transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Line
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-700">
                                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Description</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Qty</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-32">Unit Price</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Disc %</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Tax %</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-32">Total</th>
                                        {isEditing && <th className="w-12"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line, index) => (
                                        <tr key={index} className="border-b border-slate-700/50">
                                            <td className="py-3 px-4">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={line.description}
                                                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                                                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="Item description..."
                                                    />
                                                ) : (
                                                    <span className="text-slate-200">{line.description}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={line.quantity}
                                                        onChange={(e) => updateLine(index, 'quantity', Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="1"
                                                    />
                                                ) : (
                                                    <span className="text-slate-200">{line.quantity}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={line.unit_price}
                                                        onChange={(e) => updateLine(index, 'unit_price', Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        step="0.01"
                                                    />
                                                ) : (
                                                    <span className="text-slate-200">{formatCurrency(line.unit_price)}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={line.discount_percent || 0}
                                                        onChange={(e) => updateLine(index, 'discount_percent', Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        max="100"
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">{line.discount_percent || 0}%</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="number"
                                                        value={line.tax_rate || 0}
                                                        onChange={(e) => updateLine(index, 'tax_rate', Number(e.target.value))}
                                                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded text-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        min="0"
                                                        max="100"
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">{line.tax_rate || 0}%</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <span className="text-slate-200 font-medium">
                                                    {formatCurrency(calculateLineTotal(line))}
                                                </span>
                                            </td>
                                            {isEditing && (
                                                <td className="py-3 px-4">
                                                    <button
                                                        onClick={() => removeLine(index)}
                                                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                    {lines.length === 0 && (
                                        <tr>
                                            <td colSpan={isEditing ? 7 : 6} className="py-8 text-center text-slate-400">
                                                No line items added yet
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="mt-6 pt-4 border-t border-slate-700">
                            <div className="flex justify-end">
                                <div className="w-64 space-y-2">
                                    <div className="flex justify-between text-slate-400">
                                        <span>Subtotal</span>
                                        <span>{formatCurrency(totals.subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Discount</span>
                                        <span>-{formatCurrency(totals.discountTotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                        <span>Tax</span>
                                        <span>{formatCurrency(totals.taxTotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-semibold text-slate-100 pt-2 border-t border-slate-700">
                                        <span>Total</span>
                                        <span>{formatCurrency(totals.grandTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes & Terms */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-slate-100 mb-4">Notes & Terms</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Notes</label>
                                {isEditing ? (
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        rows={3}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Add any notes..."
                                    />
                                ) : (
                                    <p className="text-slate-300">{quote.notes || 'No notes'}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Terms & Conditions</label>
                                {isEditing ? (
                                    <textarea
                                        value={termsAndConditions}
                                        onChange={(e) => setTermsAndConditions(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Add terms and conditions..."
                                    />
                                ) : (
                                    <p className="text-slate-300 whitespace-pre-wrap">
                                        {quote.terms_and_conditions || 'No terms specified'}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                        <h2 className="text-lg font-semibold text-slate-100 mb-4">Summary</h2>
                        <div className="space-y-4">
                            <div>
                                <span className="text-sm text-slate-400">Grand Total</span>
                                <p className="text-2xl font-bold text-slate-100">{formatCurrency(totals.grandTotal)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                                <div>
                                    <span className="text-sm text-slate-400">Items</span>
                                    <p className="text-lg font-semibold text-slate-200">{lines.length}</p>
                                </div>
                                <div>
                                    <span className="text-sm text-slate-400">Status</span>
                                    <p className={`text-lg font-semibold ${status.text}`}>{status.label}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {quote.deal && (
                        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                            <h2 className="text-lg font-semibold text-slate-100 mb-4">Related Deal</h2>
                            <button
                                onClick={() => navigate(`/crm/deal/${quote.deal_id}`)}
                                className="w-full text-left p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                            >
                                <p className="font-medium text-slate-200">{quote.deal.name}</p>
                                <p className="text-sm text-slate-400">{quote.deal.company_name}</p>
                            </button>
                        </div>
                    )}

                    {quote.rejection_reason && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
                            <h2 className="text-lg font-semibold text-red-300 mb-2">Rejection Reason</h2>
                            <p className="text-red-200">{quote.rejection_reason}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-4">Reject Quote</h2>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-2">
                                Reason for rejection *
                            </label>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Please provide a reason..."
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setRejectReason('');
                                }}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={!rejectReason}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                            >
                                Reject Quote
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Convert Modal */}
            {showConvertModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-4">Convert to Sales Order</h2>
                        <p className="text-slate-400 mb-6">
                            This will convert the approved quote to a sales order. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConvertModal(false)}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConvert}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                            >
                                Convert to Order
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuoteDetailPage;
