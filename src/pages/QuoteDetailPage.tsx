import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Send, CheckCircle, XCircle, FileText, Plus, Trash2, Edit2, Package, Printer, RotateCcw, Clock, Users, ShieldAlert } from 'lucide-react';
import DetailBackLink from '../components/common/DetailBackLink';
import { EDITABLE_FIELD_CLASS, EDITABLE_FIELD_SM_CLASS, EDITABLE_FIELD_SM_NUMERIC_CLASS } from '../components/common/fieldStyles';
import { Modal } from '../components/common/Modal';
import { crmService } from '../services/crmService';
import { toast, getErrorMessage } from '@so360/design-system';
import { Quote, QuoteLine, QuoteStatus, ProductPickerSelection, Lead } from '../types/crm';
import { INCOTERMS_2020, INCOTERM_LABELS } from '../utils/incoterms';
import { useBusinessSettings, useActivity, useShellBridge, useOrganization } from '@so360/shell-context';
import { useFormatters } from '@so360/formatters';
import { ProductPickerModal } from '../components/ProductPickerModal';
import { quoteToDocumentData } from '../utils/quoteToDocumentData';
import { QuoteApprovalModal } from '../components/quotes/QuoteApprovalModal';
import { QuoteApprovalHistory, ApprovalRequestRecord } from '../components/quotes/QuoteApprovalHistory';

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
    const { recordActivity } = useActivity();
    const shell = useShellBridge();
    const canCreateQuote = (shell?.permissionsLoaded === true) && (shell?.hasPermission?.('quotes.create') ?? false) && (shell?.effectiveFlagsLoaded !== false) && (shell?.isFeatureEnabled?.('action:crm:quotes:create') ?? true);
    const canApproveQuote = (shell?.permissionsLoaded === true) && (shell?.hasPermission?.('quotes.approve') ?? false) && (shell?.effectiveFlagsLoaded !== false) && (shell?.isFeatureEnabled?.('action:crm:quotes:approve') ?? true);
    const canConvertQuote = (shell?.permissionsLoaded === true) && (shell?.hasPermission?.('quotes.convert') ?? false) && (shell?.effectiveFlagsLoaded !== false) && (shell?.isFeatureEnabled?.('action:crm:quotes:convert') ?? true);

    // Use dynamic formatters from business settings
    const { settings } = useBusinessSettings();
    const { currentOrg } = useOrganization();
    const formatters = useFormatters({
        currency: settings?.base_currency || 'XXX',
        locale: settings?.document_language || 'en-US',
        timezone: settings?.timezone || 'UTC',
    });

    const [quote, setQuote] = useState<Quote | null>(null);
    // The linked customer record, resolved so the printed quotation can carry a
    // complete "Quotation To" block (address, tax registration, contact) rather
    // than the customer's name alone.
    const [customer, setCustomer] = useState<Lead | null>(null);
    // Emailing the quotation: the PDF is built server-side, so this is a real
    // attachment rather than the print dialog the Print button opens.
    const [showSendModal, setShowSendModal] = useState(false);
    const [sendTo, setSendTo] = useState('');
    const [sendMessage, setSendMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);

    // Editable fields
    const [title, setTitle] = useState('');
    const [notes, setNotes] = useState('');
    const [termsAndConditions, setTermsAndConditions] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('');
    const [deliveryTerms, setDeliveryTerms] = useState('');
    const [incoterm, setIncoterm] = useState('');
    const [customerReference, setCustomerReference] = useState('');
    const [validUntil, setValidUntil] = useState('');
    const [lines, setLines] = useState<QuoteLine[]>([]);
    // Tracks raw string values while user is mid-typing in numeric fields (prevents Number() from swallowing "5." or "")
    const [draftValues, setDraftValues] = useState<Record<string, string>>({});

    // Stock availability per item_id (available_quantity)
    const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());

    // Product picker modal — tracks which line is being edited (-1 = closed)
    const [pickerLineIndex, setPickerLineIndex] = useState<number>(-1);

    // Action modals
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showConvertModal, setShowConvertModal] = useState(false);
    const [showApprovalModal, setShowApprovalModal] = useState(false);
    const [approvalHistory, setApprovalHistory] = useState<ApprovalRequestRecord[]>([]);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawReason, setWithdrawReason] = useState('');
    const [isWithdrawing, setIsWithdrawing] = useState(false);

    useEffect(() => {
        if (id) {
            fetchQuote();
        }
    }, [id]);

    // Fetch live stock whenever lines change and any have an item_id
    useEffect(() => {
        const itemIds = lines.map(l => l.item_id).filter(Boolean) as string[];
        if (itemIds.length === 0) {
            // Only reset if map isn't already empty — avoids spurious re-renders on every keystroke
            setStockMap(prev => prev.size === 0 ? prev : new Map());
            return;
        }
        crmService.getStockAvailability(itemIds).then(result => {
            const map = new Map<string, number>();
            (result.items || []).forEach(i => map.set(i.item_id, i.available_quantity));
            setStockMap(map);
        }).catch(() => {});
    }, [lines]);

    const openSendModal = () => {
        // Prefill with the address on file; the user can redirect it to a
        // procurement mailbox, which is common for B2B quotes.
        setSendTo(customer?.contact_email || '');
        setSendMessage('');
        setShowSendModal(true);
    };

    const handleSendQuote = async () => {
        if (!id) return;
        setIsSending(true);
        try {
            const result = await crmService.sendQuote(id, {
                to: sendTo.trim() || undefined,
                message: sendMessage.trim() || undefined,
            });
            if (result.sent) {
                toast.success(`Quotation emailed to ${result.to}`);
                setShowSendModal(false);
            } else {
                // The backend refuses rather than sending to nobody — surface its
                // reason instead of a generic failure.
                toast.error(result.reason || 'Could not send the quotation.');
            }
        } catch (err) {
            toast.error(getErrorMessage(err, 'Could not send the quotation.'));
        } finally {
            setIsSending(false);
        }
    };

    const fetchApprovalHistory = async (quoteId: string) => {
        try {
            const data = await crmService.getQuoteApprovalHistory(quoteId);
            setApprovalHistory(data || []);
        } catch {
            // Ignore error if approval history endpoint fails
        }
    };

    const fetchQuote = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await crmService.getQuoteById(id!);
            setQuote(data);
            setCustomer(null);
            fetchApprovalHistory(id!);
            if (data.customer_id) {
                crmService
                    .getLeadById(data.customer_id)
                    .then((c) => setCustomer(c ?? null))
                    .catch(() => {
                        // Customer deleted or not visible — the quote still prints,
                        // just without the expanded party block.
                    });
            }
            setTitle(data.title || '');
            setNotes(data.notes || '');
            setTermsAndConditions(data.terms_and_conditions || '');
            setPaymentTerms(data.payment_terms || '');
            setDeliveryTerms(data.delivery_terms || '');
            setIncoterm(data.incoterm || '');
            setCustomerReference(data.customer_reference || '');
            setValidUntil(data.valid_until ? data.valid_until.split('T')[0] : '');
            setLines((data.lines || []).map((l: any) => ({
                ...l,
                quantity: Number(l.quantity) || 0,
                unit_price: Number(l.unit_price) || 0,
                discount_percent: Number(l.discount_percent) || 0,
                tax_rate: Number(l.tax_rate) || 0,
            })));
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
                payment_terms: paymentTerms || undefined,
                delivery_terms: deliveryTerms || undefined,
                incoterm: incoterm || undefined,
                customer_reference: customerReference || undefined,
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
            setDraftValues({});
            fetchApprovalHistory(quote.id);
            recordActivity({ eventType: 'quote.updated', eventCategory: 'crm', description: `Updated quote "${quote.quote_number || quote.id}"`, resourceType: 'quote', resourceId: quote.id }).catch(() => {});
        } catch (err: any) {
            setError(err.message || 'Failed to save quote');
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenApprovalModal = () => {
        if (!quote) return;
        // Warn if any line exceeds available stock
        const oosLines = lines.filter(l => l.item_id && stockMap.has(l.item_id) && (stockMap.get(l.item_id) ?? 0) < l.quantity);
        if (oosLines.length > 0) {
            const names = oosLines.map(l => l.description || l.item_id).join(', ');
            if (!window.confirm(`Warning: ${oosLines.length} line item(s) may have insufficient stock (${names}). Submit anyway?`)) return;
        }
        setShowApprovalModal(true);
    };

    const handleSubmitForApproval = async (approverUserIds: string[], notes?: string) => {
        if (!quote) return;
        try {
            const updated = await crmService.submitQuoteForApproval(quote.id, {
                approver_user_ids: approverUserIds,
                notes,
            });
            setQuote(updated);
            fetchApprovalHistory(quote.id);
            toast.success('Quote submitted for approval');
            recordActivity({ eventType: 'quote.sent', eventCategory: 'crm', description: `Submitted quote "${quote.quote_number || quote.id}" for approval`, resourceType: 'quote', resourceId: quote.id }).catch(() => {});
        } catch (err: any) {
            toast.error(getErrorMessage(err, 'Failed to submit quote for approval'));
            throw err;
        }
    };

    const handleWithdraw = async () => {
        if (!quote) return;
        setIsWithdrawing(true);
        try {
            const updated = await crmService.withdrawQuoteApproval(quote.id, withdrawReason.trim() || undefined);
            setQuote(updated);
            setShowWithdrawModal(false);
            setWithdrawReason('');
            fetchApprovalHistory(quote.id);
            toast.success('Approval request withdrawn');
            recordActivity({ eventType: 'quote.updated', eventCategory: 'crm', description: `Withdrew approval request for quote "${quote.quote_number || quote.id}"`, resourceType: 'quote', resourceId: quote.id }).catch(() => {});
        } catch (err: any) {
            toast.error(getErrorMessage(err, 'Failed to withdraw approval request'));
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleApprove = async () => {
        if (!quote) return;
        try {
            const updated = await crmService.approveQuote(quote.id);
            setQuote(updated);
            fetchApprovalHistory(quote.id);
            toast.success('Quote approved');
            recordActivity({ eventType: 'quote.accepted', eventCategory: 'crm', description: `Approved quote "${quote.quote_number || quote.id}"`, resourceType: 'quote', resourceId: quote.id }).catch(() => {});
        } catch (err: any) {
            toast.error(getErrorMessage(err, 'Failed to approve quote'));
        }
    };

    const handleReject = async () => {
        if (!quote || !rejectReason.trim()) {
            toast.error('Please provide a reason for rejection');
            return;
        }
        try {
            const updated = await crmService.rejectQuote(quote.id, rejectReason.trim());
            setQuote(updated);
            setShowRejectModal(false);
            setRejectReason('');
            fetchApprovalHistory(quote.id);
            toast.success('Quote rejected');
            recordActivity({ eventType: 'quote.rejected', eventCategory: 'crm', description: `Rejected quote "${quote.quote_number || quote.id}"`, resourceType: 'quote', resourceId: quote.id }).catch(() => {});
        } catch (err: any) {
            toast.error(getErrorMessage(err, 'Failed to reject quote'));
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

    const handleProductSelect = (selection: ProductPickerSelection) => {
        if (pickerLineIndex < 0) return;
        const newLines = [...lines];
        newLines[pickerLineIndex] = {
            ...newLines[pickerLineIndex],
            item_id: selection.item_id,
            variant_id: selection.variant_id,
            item_name: selection.name,
            sku: selection.sku,
            sub_sku: selection.sub_sku,
            item_image_url: selection.image_url,
            unit_price: selection.unit_price,
            description: newLines[pickerLineIndex].description || selection.name,
        };
        setLines(newLines);
        setDraftValues(prev => {
            const next = { ...prev };
            delete next[`${pickerLineIndex}_unit_price`];
            return next;
        });
        setPickerLineIndex(-1);
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
        // Functional updater ensures we always mutate the latest committed state,
        // preventing stale-closure bugs when rapid keystrokes interleave with re-renders
        setLines(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const removeLine = (index: number) => {
        setLines(prev => prev.filter((_, i) => i !== index));
        // Clean up any draft values for this line
        setDraftValues(prev => {
            const next = { ...prev };
            Object.keys(next).filter(k => k.startsWith(`${index}_`)).forEach(k => delete next[k]);
            return next;
        });
    };

    const handleNumericInput = (index: number, field: keyof QuoteLine, rawValue: string) => {
        setDraftValues(prev => ({ ...prev, [`${index}_${field as string}`]: rawValue }));
        const num = parseFloat(rawValue);
        if (!isNaN(num)) updateLine(index, field, num);
    };

    const commitNumericInput = (index: number, field: keyof QuoteLine, rawValue: string, fallback: number) => {
        const num = parseFloat(rawValue);
        updateLine(index, field, isNaN(num) ? fallback : num);
        setDraftValues(prev => { const n = { ...prev }; delete n[`${index}_${field as string}`]; return n; });
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

    // Format functions now use dynamic settings
    const formatCurrency = (value: number) => formatters.formatCurrency(value);
    const formatDate = (dateString: string) => formatters.formatDate(dateString, { year: 'numeric', month: 'long', day: 'numeric' });

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
                    <FileText className="w-16 h-16 mx-auto text-slate-400 mb-4" />
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

    const currentUserId = shell?.user?.id;
    const currentApprovalRequest = quote.current_approval_request;
    const hasApproversList = Boolean(currentApprovalRequest?.approvers && currentApprovalRequest.approvers.length > 0);
    const isAuthorizedApprover = hasApproversList
        ? Boolean(currentApprovalRequest?.approvers?.some((a: any) => a.approver_user_id === currentUserId && a.status === 'pending'))
        : true;
    const canApprove = quote.status === 'pending_approval' && canApproveQuote && isAuthorizedApprover;
    const isSubmitter = Boolean(
        currentUserId && (
            quote.submitted_by === currentUserId ||
            (quote.created_by as any)?.id === currentUserId ||
            (quote as any).created_by === currentUserId ||
            currentApprovalRequest?.requested_by === currentUserId
        )
    );
    const canWithdraw = quote.status === 'pending_approval' && isSubmitter;
    const canEdit = (quote.status === 'draft' || quote.status === 'rejected');
    const canSubmit = (quote.status === 'draft' || quote.status === 'rejected') && lines.length > 0;
    const canConvert = quote.status === 'approved';

    return (
        <div className="p-8">
            {/* Header */}
            <DetailBackLink fallbackTo="/crm/quotes" className="mb-4" />
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
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
                    {canCreateQuote && canEdit && !isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-slate-50 border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
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
                                    setDraftValues({});
                                    fetchQuote();
                                }}
                                className="px-4 py-2 text-slate-300 hover:text-slate-50 transition-colors"
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
                            onClick={handleOpenApprovalModal}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            Submit for Approval
                        </button>
                    )}
                    {canWithdraw && !isEditing && (
                        <button
                            onClick={() => setShowWithdrawModal(true)}
                            className="flex items-center gap-2 px-4 py-2 text-amber-300 hover:text-amber-100 border border-amber-500/40 hover:bg-amber-500/20 rounded-lg transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Withdraw Request
                        </button>
                    )}
                    {canApproveQuote && canApprove && (
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
                    {canConvertQuote && canConvert && (
                        <button
                            onClick={() => setShowConvertModal(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Convert to Order
                        </button>
                    )}
                    {!isEditing && (
                        <button
                            onClick={() => shell?.printDocument?.('sales_quote', quoteToDocumentData(quote, {
                                currency: settings?.base_currency || 'XXX',
                                seller: {
                                    name: currentOrg?.name || '',
                                    address: (currentOrg as any)?.billing_address
                                        ? [
                                            (currentOrg as any).billing_address.street,
                                            (currentOrg as any).billing_address.city,
                                            (currentOrg as any).billing_address.country,
                                          ].filter(Boolean).join(', ')
                                        : undefined,
                                    tax_number: (currentOrg as any)?.tax_id,
                                    pan: (currentOrg as any)?.pan,
                                },
                                customer,
                                // Compared against the buyer's state to decide
                                // whether the supply is intra- or inter-state.
                                sellerState: (currentOrg as any)?.billing_address?.state,
                                sellerCountry: (currentOrg as any)?.billing_address?.country,
                            }))}
                            className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-slate-50 border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            Print Quote
                        </button>
                    )}
                    {!isEditing && (
                        <button
                            onClick={openSendModal}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                            <Send className="w-4 h-4" />
                            Email to Customer
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
                    {error}
                </div>
            )}

            {/* Approval in Progress Banner */}
            {quote.status === 'pending_approval' && (
                <div className="mb-6 p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                            <Clock className="w-5 h-5 text-amber-400" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-slate-100 text-base">
                                        Approval in Progress
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-semibold border border-amber-400/30">
                                        Locked
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-slate-400 leading-relaxed">
                        This quote is currently undergoing approval review. Material details and line items cannot be modified until a decision is reached or the request is withdrawn.
                        {isSubmitter && !isAuthorizedApprover && (
                            <span className="block mt-1 text-xs text-amber-300 font-medium">
                                You submitted this quote. Self-review is not permitted.
                            </span>
                        )}
                        {isAuthorizedApprover && (
                            <span className="block mt-1 text-xs text-emerald-400 font-medium">
                                You are an assigned reviewer for this quote. Please examine the commercial terms using the action buttons above.
                            </span>
                        )}
                    </p>
                    {currentApprovalRequest?.approvers && currentApprovalRequest.approvers.length > 0 && (
                        <div className="pt-3 border-t border-amber-500/20 flex flex-wrap gap-2 items-center">
                            <span className="text-xs font-semibold text-slate-400">Required Approvers:</span>
                            {currentApprovalRequest.approvers.map((a: any, idx: number) => (
                                <span
                                    key={a.id || idx}
                                    className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                                        a.status === 'approved'
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                            : a.status === 'rejected'
                                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                            : 'bg-slate-800/90 border-slate-700 text-slate-300'
                                    }`}
                                >
                                    <span className="font-medium text-slate-200">{a.approver_name || a.approver_email || 'Approver'}</span>
                                    <span className="text-[10px] uppercase font-bold opacity-80">({a.status})</span>
                                </span>
                            ))}
                        </div>
                    )}
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
                                        className={EDITABLE_FIELD_CLASS}
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
                                        className={EDITABLE_FIELD_CLASS}
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
                            {canCreateQuote && isEditing && (
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
                                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase w-28">Stock</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Qty</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-32">Unit Price</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Disc %</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-24">Tax %</th>
                                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase w-32">Total</th>
                                        {isEditing && <th className="w-12"></th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((line, index) => {
                                        const stock = line.item_id ? stockMap.get(line.item_id) : undefined;
                                        const isLowStock = stock !== undefined && stock > 0 && stock < line.quantity;
                                        const isOOS = stock !== undefined && stock <= 0;
                                        return (
                                        <tr key={line.id || `new-${index}`} className="border-b border-slate-700/50">
                                            <td className="py-3 px-4">
                                                {isEditing ? (
                                                    <div className="space-y-1.5">
                                                        {/* Product selector button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setPickerLineIndex(index)}
                                                            className="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-700 hover:border-blue-500/50 rounded text-sm transition-colors text-left"
                                                        >
                                                            {line.item_image_url ? (
                                                                <img src={line.item_image_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
                                                            ) : (
                                                                <Package className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                                            )}
                                                            {line.item_name ? (
                                                                <span className="flex-1 min-w-0">
                                                                    <span className="text-slate-200 truncate block">{line.item_name}</span>
                                                                    <span className="flex items-center gap-1 mt-0.5">
                                                                        <span className="text-xs px-1.5 py-0.5 bg-slate-400/20 text-slate-400 rounded">{line.sku}</span>
                                                                        {line.sub_sku && line.sub_sku !== 'NIL' && (
                                                                            <span className="text-xs px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded">{line.sub_sku}</span>
                                                                        )}
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-500">Select product...</span>
                                                            )}
                                                        </button>
                                                        {/* Free-text description */}
                                                        <input
                                                            type="text"
                                                            value={line.description}
                                                            onChange={(e) => updateLine(index, 'description', e.target.value)}
                                                            className={EDITABLE_FIELD_SM_CLASS}
                                                            placeholder="Description / notes..."
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-2">
                                                        {line.item_image_url && (
                                                            <img src={line.item_image_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 mt-0.5" />
                                                        )}
                                                        <div className="min-w-0">
                                                            <span className="text-slate-200 block">{line.description}</span>
                                                            {line.sku && (
                                                                <span className="flex items-center gap-1 mt-0.5">
                                                                    <span className="text-xs px-1.5 py-0.5 bg-slate-400/20 text-slate-400 rounded">{line.sku}</span>
                                                                    {line.sub_sku && line.sub_sku !== 'NIL' && (
                                                                        <span className="text-xs px-1.5 py-0.5 bg-blue-900/40 text-blue-400 rounded">{line.sub_sku}</span>
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                {line.item_id ? (
                                                    stock === undefined ? (
                                                        <span className="text-xs text-slate-500">—</span>
                                                    ) : isOOS ? (
                                                        <span className="text-xs font-medium text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">OOS</span>
                                                    ) : isLowStock ? (
                                                        <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">{stock} avail</span>
                                                    ) : (
                                                        <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{stock} avail</span>
                                                    )
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={draftValues[`${index}_quantity`] ?? String(line.quantity)}
                                                        onChange={(e) => handleNumericInput(index, 'quantity', e.target.value)}
                                                        onBlur={(e) => commitNumericInput(index, 'quantity', e.target.value, 1)}
                                                        className={EDITABLE_FIELD_SM_NUMERIC_CLASS}
                                                    />
                                                ) : (
                                                    <span className="text-slate-200">{line.quantity}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={draftValues[`${index}_unit_price`] ?? String(line.unit_price)}
                                                        onChange={(e) => handleNumericInput(index, 'unit_price', e.target.value)}
                                                        onBlur={(e) => commitNumericInput(index, 'unit_price', e.target.value, 0)}
                                                        className={EDITABLE_FIELD_SM_NUMERIC_CLASS}
                                                    />
                                                ) : (
                                                    <span className="text-slate-200">{formatCurrency(line.unit_price)}</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={draftValues[`${index}_discount_percent`] ?? String(line.discount_percent || 0)}
                                                        onChange={(e) => handleNumericInput(index, 'discount_percent', e.target.value)}
                                                        onBlur={(e) => commitNumericInput(index, 'discount_percent', e.target.value, 0)}
                                                        className={EDITABLE_FIELD_SM_NUMERIC_CLASS}
                                                    />
                                                ) : (
                                                    <span className="text-slate-300">{line.discount_percent || 0}%</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={draftValues[`${index}_tax_rate`] ?? String(line.tax_rate || 0)}
                                                        onChange={(e) => handleNumericInput(index, 'tax_rate', e.target.value)}
                                                        onBlur={(e) => commitNumericInput(index, 'tax_rate', e.target.value, 0)}
                                                        className={EDITABLE_FIELD_SM_NUMERIC_CLASS}
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
                                    ); })}
                                    {lines.length === 0 && (
                                        <tr>
                                            <td colSpan={isEditing ? 8 : 7} className="py-8 text-center text-slate-400">
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
                                        className={EDITABLE_FIELD_CLASS}
                                        placeholder="Add any notes..."
                                    />
                                ) : (
                                    <p className="text-slate-300">{quote.notes || 'No notes'}</p>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Payment Terms</label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={paymentTerms}
                                            onChange={(e) => setPaymentTerms(e.target.value)}
                                            className={EDITABLE_FIELD_CLASS}
                                            placeholder="e.g. Net 30"
                                        />
                                    ) : (
                                        <p className="text-slate-300">{quote.payment_terms || '—'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Customer Reference</label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={customerReference}
                                            onChange={(e) => setCustomerReference(e.target.value)}
                                            className={EDITABLE_FIELD_CLASS}
                                            placeholder="Buyer's RFQ / PO number"
                                        />
                                    ) : (
                                        <p className="text-slate-300">{quote.customer_reference || '—'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Delivery Terms</label>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={deliveryTerms}
                                            onChange={(e) => setDeliveryTerms(e.target.value)}
                                            className={EDITABLE_FIELD_CLASS}
                                            placeholder="e.g. Ex-stock, 2-3 weeks from PO"
                                        />
                                    ) : (
                                        <p className="text-slate-300">{quote.delivery_terms || '—'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">
                                        Incoterm <span className="text-slate-500 font-normal">(Incoterms&reg; 2020)</span>
                                    </label>
                                    {isEditing ? (
                                        <select
                                            value={incoterm}
                                            onChange={(e) => setIncoterm(e.target.value)}
                                            className={EDITABLE_FIELD_CLASS}
                                        >
                                            <option value="">Not specified</option>
                                            {INCOTERMS_2020.map((t) => (
                                                <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="text-slate-300">
                                            {quote.incoterm
                                                ? `${quote.incoterm} — ${INCOTERM_LABELS[quote.incoterm] ?? ''}`.trim()
                                                : '—'}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Terms & Conditions</label>
                                {isEditing ? (
                                    <textarea
                                        value={termsAndConditions}
                                        onChange={(e) => setTermsAndConditions(e.target.value)}
                                        rows={4}
                                        className={EDITABLE_FIELD_CLASS}
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

                    {/* Approval History Audit Trail */}
                    <QuoteApprovalHistory
                        history={approvalHistory}
                        currentRequestId={quote.current_approval_request_id}
                        formatDate={formatDate}
                        formatCurrency={formatCurrency}
                    />
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

                    {/* The customer the quote is raised for — resolved from the deal
                        when the quote was created. Read-only here: the record lives
                        in Customers, and a quote must reference it rather than keep
                        its own divergent copy. */}
                    {customer && (
                        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
                            <h2 className="text-lg font-semibold text-slate-100 mb-4">Customer</h2>
                            <button
                                onClick={() => navigate(`/crm/customers/${customer.id}`)}
                                className="w-full text-left p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                            >
                                <p className="font-medium text-slate-200">
                                    {customer.company_name || customer.contact_name || '—'}
                                </p>
                                {customer.company_name && customer.contact_name && (
                                    <p className="text-sm text-slate-400">{customer.contact_name}</p>
                                )}
                            </button>
                            <div className="mt-4 space-y-2 text-sm">
                                {customer.contact_email && (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-slate-400">Email</span>
                                        <span className="text-slate-300 truncate">{customer.contact_email}</span>
                                    </div>
                                )}
                                {customer.phone && (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-slate-400">Phone</span>
                                        <span className="text-slate-300">{customer.phone}</span>
                                    </div>
                                )}
                                {customer.tax_id && (
                                    <div className="flex justify-between gap-3">
                                        <span className="text-slate-400">Tax ID</span>
                                        <span className="text-slate-300 truncate">{customer.tax_id}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

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

            {/* Product Picker Modal */}
            <ProductPickerModal
                isOpen={pickerLineIndex >= 0}
                onClose={() => setPickerLineIndex(-1)}
                onSelect={handleProductSelect}
            />

            {/* Reject Modal */}
            {showRejectModal && createPortal(
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60">
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
                                className={EDITABLE_FIELD_CLASS}
                                placeholder="Please provide a reason..."
                            />
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowRejectModal(false);
                                    setRejectReason('');
                                }}
                                className="px-4 py-2 text-slate-300 hover:text-slate-50 transition-colors"
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
                </div>,
                document.body
            )}

            {/* Convert Modal */}
            {showConvertModal && createPortal(
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-4">Convert to Sales Order</h2>
                        <p className="text-slate-400 mb-6">
                            This will convert the approved quote to a sales order. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowConvertModal(false)}
                                className="px-4 py-2 text-slate-300 hover:text-slate-50 transition-colors"
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
                </div>,
                document.body
            )}

            <Modal
                isOpen={showSendModal}
                onClose={() => !isSending && setShowSendModal(false)}
                title="Email quotation to customer"
                size="lg"
            >
                <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-slate-400">
                        The quotation PDF is generated and attached automatically.
                    </p>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Send to</label>
                        <input
                            type="email"
                            value={sendTo}
                            onChange={(e) => setSendTo(e.target.value)}
                            placeholder="customer@example.com"
                            className={EDITABLE_FIELD_CLASS}
                        />
                        {!customer?.contact_email && (
                            <p className="mt-1 text-xs text-amber-400">
                                This quote has no linked customer email — enter an address to send it.
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">
                            Message <span className="text-slate-500 font-normal">(optional)</span>
                        </label>
                        <textarea
                            value={sendMessage}
                            onChange={(e) => setSendMessage(e.target.value)}
                            rows={3}
                            placeholder="As discussed, please find our quotation attached."
                            className={EDITABLE_FIELD_CLASS}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-700/50">
                    <button
                        type="button"
                        onClick={() => setShowSendModal(false)}
                        disabled={isSending}
                        className="px-4 py-2 text-slate-400 hover:text-slate-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSendQuote}
                        disabled={isSending || !sendTo.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                        {isSending ? 'Sending…' : 'Send quotation'}
                    </button>
                </div>
            </Modal>

            {/* Withdraw Modal */}
            {showWithdrawModal && createPortal(
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center gap-2 mb-2 text-amber-400">
                            <RotateCcw className="w-5 h-5" />
                            <h2 className="text-xl font-semibold text-slate-100">Withdraw Approval Request</h2>
                        </div>
                        <p className="text-sm text-slate-400 mb-4 leading-relaxed">
                            This will cancel the active approval cycle and return this quote to <strong>Draft</strong> status, unlocking it for edits and resubmission.
                        </p>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Reason for withdrawal <span className="text-slate-500 font-normal">(optional)</span>
                            </label>
                            <textarea
                                value={withdrawReason}
                                onChange={(e) => setWithdrawReason(e.target.value)}
                                rows={3}
                                className={EDITABLE_FIELD_CLASS}
                                placeholder="e.g. Updating line item quantities or pricing..."
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setShowWithdrawModal(false);
                                    setWithdrawReason('');
                                }}
                                disabled={isWithdrawing}
                                className="px-4 py-2 text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleWithdraw}
                                disabled={isWithdrawing}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2 font-medium"
                            >
                                <RotateCcw className="w-4 h-4" />
                                {isWithdrawing ? 'Withdrawing...' : 'Confirm Withdrawal'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Quote Approval Modal (Approver Selection & Submission) */}
            <QuoteApprovalModal
                quote={quote}
                currentUserId={currentUserId}
                currencyFormatter={formatCurrency}
                isOpen={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                onSubmit={handleSubmitForApproval}
            />
        </div>
    );
};

export default QuoteDetailPage;
