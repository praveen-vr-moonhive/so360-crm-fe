import React, { useState } from 'react';
import { Building2, CreditCard, Shield, CheckCircle2, AlertCircle, Loader2, Tag, ShoppingCart } from 'lucide-react';
import { crmService } from '../services/crmService';

interface CustomerDetailsPanelProps {
    lead: any;
    onUpdate: (updatedLead: any) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ACQUISITION_SOURCE_LABELS: Record<string, string> = {
    storefront_registration: 'Storefront Registration',
    guest_checkout: 'Guest Checkout',
    pos_inline: 'POS Inline',
    manual_entry: 'Manual Entry',
    lead_promotion: 'Lead Promotion',
};

const CustomerDetailsPanel: React.FC<CustomerDetailsPanelProps> = ({ lead, onUpdate, showToast }) => {
    const [taxIdInput, setTaxIdInput] = useState(lead.tax_id || '');
    const [creditLimitInput, setCreditLimitInput] = useState(String(lead.credit_limit || 0));
    const [isValidatingTax, setIsValidatingTax] = useState(false);
    const [isSavingCredit, setIsSavingCredit] = useState(false);
    const [taxError, setTaxError] = useState<string | null>(null);

    const handleValidateTaxId = async () => {
        if (!taxIdInput.trim()) return;
        setIsValidatingTax(true);
        setTaxError(null);
        try {
            const updated = await crmService.validateCustomerTaxId(lead.id, taxIdInput.trim());
            onUpdate(updated);
            showToast('Tax ID validated successfully', 'success');
        } catch (err: any) {
            const msg = err?.response?.data?.message || err?.message || 'Validation failed';
            setTaxError(msg);
            showToast(msg, 'error');
        } finally {
            setIsValidatingTax(false);
        }
    };

    const handleSaveCreditLimit = async () => {
        const limit = parseFloat(creditLimitInput);
        if (isNaN(limit) || limit < 0) return;
        setIsSavingCredit(true);
        try {
            const updated = await crmService.updateCustomerCreditLimit(lead.id, limit);
            onUpdate(updated);
            showToast('Credit limit updated', 'success');
        } catch (err: any) {
            showToast(err?.message || 'Failed to update credit limit', 'error');
        } finally {
            setIsSavingCredit(false);
        }
    };

    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Building2 size={16} className="text-emerald-400" />
                Customer Details
            </h3>

            {/* Category Badge */}
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-24">Category</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold border ${
                    lead.customer_category === 'b2b'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                }`}>
                    {(lead.customer_category || 'b2c').toUpperCase()}
                </span>
            </div>

            {/* Acquisition Source */}
            <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-24">Source</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Tag size={11} />
                    {ACQUISITION_SOURCE_LABELS[lead.acquisition_source] || lead.acquisition_source || lead.channel || '-'}
                </span>
            </div>

            {/* First Order */}
            {lead.first_order_id && (
                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-24">First Order</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-300 font-mono">
                        <ShoppingCart size={11} />
                        {lead.first_order_id.substring(0, 8)}...
                    </span>
                </div>
            )}

            {/* Tax ID Section */}
            <div className="border-t border-slate-800 pt-4">
                <label className="text-xs text-slate-500 mb-2 block flex items-center gap-1.5">
                    <Shield size={12} /> Tax ID (GST/VAT/TIN)
                </label>
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={taxIdInput}
                            onChange={(e) => { setTaxIdInput(e.target.value.toUpperCase()); setTaxError(null); }}
                            placeholder="e.g. 29ABCDE1234F1Z5"
                            className="w-full bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                        />
                        {lead.tax_id_verified && (
                            <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                        )}
                    </div>
                    <button
                        onClick={handleValidateTaxId}
                        disabled={isValidatingTax || !taxIdInput.trim()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        {isValidatingTax ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                        Validate
                    </button>
                </div>
                {taxError && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                        <AlertCircle size={12} /> {taxError}
                    </div>
                )}
                {lead.tax_id_verified && lead.tax_id_verified_at && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                        <CheckCircle2 size={12} /> Verified on {new Date(lead.tax_id_verified_at).toLocaleDateString()}
                    </div>
                )}
            </div>

            {/* Credit Limit Section */}
            <div className="border-t border-slate-800 pt-4">
                <label className="text-xs text-slate-500 mb-2 block flex items-center gap-1.5">
                    <CreditCard size={12} /> Credit Limit
                </label>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        value={creditLimitInput}
                        onChange={(e) => setCreditLimitInput(e.target.value)}
                        min="0"
                        step="1000"
                        className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <button
                        onClick={handleSaveCreditLimit}
                        disabled={isSavingCredit}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                    >
                        {isSavingCredit ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                        Save
                    </button>
                </div>
                {parseFloat(lead.credit_balance) > 0 && (
                    <div className="mt-2 text-xs text-slate-400">
                        Current balance: {parseFloat(lead.credit_balance).toLocaleString()}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CustomerDetailsPanel;
