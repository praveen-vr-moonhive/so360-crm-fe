import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common/Modal';
import { PartnerSearchDropdown } from '../common/PartnerSearchDropdown';
import { crmService, settingsApi } from '../../services/crmService';
import { AlertCircle } from 'lucide-react';
import { CustomFieldDefinition, User, Lead, SourceTypeOption } from '../../types/crm';
import { useNotify, useActivity, useIdentity } from '@so360/shell-context';
import {
    validatePhone,
    validatePhoneRequired,
    phoneDigitCount,
    MIN_PHONE_DIGITS,
    MAX_PHONE_DIGITS,
} from '../../utils/phoneValidation';
import { validateEmail, validateEmailRequired } from '../../utils/emailValidation';
import {
    validateAddress,
    validateCity,
    validateCompanyName,
    validateFirstNameRequired,
    validateLastName,
    validatePinCode,
} from '../../utils/leadFieldValidation';
import {
    getPostalCodeRule,
    countryOptions,
    validatePostalCode,
    DEFAULT_COUNTRY,
} from '../../utils/postalCodeRules';
import { describeApiError } from '../../utils/apiErrorMessage';
import { RequiredMark } from '../common/RequiredMark';

/**
 * One rule per field, so the blur handler, the submit guard and the
 * enable/disable state on Create Lead all read from the same place. Before
 * this, only phone and email were checked and everything else — company,
 * names, address, city, PIN — reached the database unexamined.
 *
 * Built per country because the postal-code rule is the one field whose
 * definition of "valid" depends on another answer on the form.
 */
const buildFieldValidators = (
    country: string,
): Record<string, (value: string) => string | null> => ({
    company_name: validateCompanyName,
    first_name: validateFirstNameRequired,
    last_name: validateLastName,
    contact_email: (v) => validateEmailRequired(v),
    phone: (v) => validatePhoneRequired(v),
    alt_phone: validatePhone,
    address: validateAddress,
    city: validateCity,
    pin_code: (v) => validatePostalCode(v, country),
});

type FieldErrors = Partial<Record<string, string | null>>;

/**
 * Digits typed against the allowed range, so the limit is visible before the
 * user hits it rather than only as an error afterwards. Declaring +91 pins the
 * expectation to a single number, since that path allows exactly 10 subscriber
 * digits — showing "7–15" there would be misleading.
 */
const phoneCountLabel = (value: string): string => {
    const typed = phoneDigitCount(value);
    if (value.trim().startsWith('+91')) return `${typed}/12 digits`;
    return `${typed}/${MIN_PHONE_DIGITS}–${MAX_PHONE_DIGITS} digits`;
};

const INPUT_BASE =
    'w-full bg-slate-950 border px-3 py-2 rounded-lg focus:outline-none focus:ring-2 text-slate-50 placeholder:text-slate-500';
const inputCls = (hasError: boolean) =>
    `${INPUT_BASE} ${hasError ? 'border-red-500 focus:ring-red-500/50' : 'border-slate-800 focus:ring-blue-500/50'}`;

interface CreateLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    existingLeads: string[]; // List of company names to detect duplicates
}

export const CreateLeadModal = ({ isOpen, onClose, onSuccess, existingLeads }: CreateLeadModalProps) => {
    const { emitNotification } = useNotify();
    const { recordActivity } = useActivity();
    const { user: currentUser } = useIdentity();
    const [formData, setFormData] = useState({
        company_name: '',
        first_name: '',
        last_name: '',
        contact_email: '',
        phone: '',
        alt_phone: '',
        address: '',
        city: '',
        pin_code: '',
        // Postal-code rules differ by country, so the record carries its own
        // rather than inheriting a platform-wide assumption. `leads.country`
        // already existed as a column; nothing was writing to it.
        country: DEFAULT_COUNTRY,
        source: '',
        status: 'New' as any,
        owner_id: '',
        referred_by: '',
        custom_fields: {} as Record<string, any>
    });

    const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
    const [leadStages, setLeadStages] = useState<{ id: string, name: string }[]>([]);
    const [sourceTypes, setSourceTypes] = useState<SourceTypeOption[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [partners, setPartners] = useState<Lead[]>([]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const [settings, fetchedUsers, fetchedPartners, fetchedSourceTypes] = await Promise.all([
                    crmService.getSettings(),
                    crmService.getUsers(),
                    crmService.getPartners(),
                    settingsApi.sourceTypes.getAll().catch(() => [] as any[]),
                ]);
                setCustomFieldDefs(settings.lead_custom_fields);
                setLeadStages(settings.lead_stages);
                setSourceTypes(fetchedSourceTypes);
                setUsers(fetchedUsers);
                setPartners(fetchedPartners);
                setFormData(prev => ({
                    ...prev,
                    ...(settings.lead_stages.length > 0 && !prev.status ? { status: settings.lead_stages[0].name } : {}),
                    ...(fetchedSourceTypes.length > 0 && !prev.source ? { source: fetchedSourceTypes[0].value } : {}),
                    owner_id: prev.owner_id || currentUser?.id || fetchedUsers[0]?.id || '',
                }));
            } catch (error) {
                console.error('Failed to fetch lead settings', error);
            }
        };
        if (isOpen) {
            setErrors({});
            setError(null);
            setExistingRecord(null);
            fetchSettings();
        }
    }, [isOpen]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    /** A 409 from the backend: the address already belongs to this record. */
    const [existingRecord, setExistingRecord] = useState<{ id: string; type: string | null } | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const fieldRefs = useRef<Record<string, HTMLElement | null>>({});

    const phoneError = errors.phone || null;
    const emailError = errors.contact_email || null;

    const postalRule = getPostalCodeRule(formData.country);
    const fieldValidators = React.useMemo(
        () => buildFieldValidators(formData.country),
        [formData.country],
    );

    /** Re-run a field's rule and store the result. */
    const validateField = (name: string, value: string) => {
        const message = fieldValidators[name]?.(value) ?? null;
        setErrors(prev => ({ ...prev, [name]: message }));
        return message;
    };

    /**
     * Typing should clear a standing error the moment the value becomes valid,
     * but must not start nagging a field the user has not finished yet.
     */
    const handleChange = (name: string, value: string) => {
        setFormData(prev => ({ ...prev, [name]: value }));
        setErrors(prev => (prev[name] ? { ...prev, [name]: fieldValidators[name]?.(value) ?? null } : prev));
    };

    const missingRequiredCustomField = customFieldDefs.some(
        f => f.required && !String(formData.custom_fields[f.id] ?? '').trim(),
    );

    /**
     * Create Lead stays disabled until every mandatory field holds a valid
     * value and no optional field is currently invalid — so the button state
     * itself tells the user whether the form is ready.
     */
    const isFormValid =
        Object.keys(fieldValidators).every(
            name => !fieldValidators[name]((formData as any)[name] || ''),
        ) && !missingRequiredCustomField;

    const isDuplicate = existingLeads.some(
        name => name && (name as string).toLowerCase() === (formData.company_name || '').toLowerCase() && (formData.company_name || '').length > 0
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Format errors are caught here too, not only on blur: a value pasted
        // and submitted without ever leaving the field must still be checked.
        // Every field is re-run so the user sees the full set of corrections at
        // once, and focus lands on the first one that needs attention.
        const nextErrors: FieldErrors = {};
        for (const name of Object.keys(fieldValidators)) {
            nextErrors[name] = fieldValidators[name]((formData as any)[name] || '');
        }
        setErrors(nextErrors);

        const firstInvalid = Object.keys(fieldValidators).find(name => nextErrors[name]);
        if (firstInvalid) {
            fieldRefs.current[firstInvalid]?.focus();
            return;
        }

        setIsSubmitting(true);

        try {
            const newLead = await crmService.createLead({
                ...formData,
                phone: formData.phone.trim(),
                activities: [],
                notes: [],
                owner_id: formData.owner_id,
                referred_by: formData.referred_by || undefined,
            } as any);
            // Fire-and-forget notification + activity
            recordActivity({ eventType: 'lead.created', eventCategory: 'crm', description: `Created lead "${formData.company_name}"`, resourceType: 'lead', resourceId: newLead?.id }).catch(() => {});
            onSuccess();
            onClose();
        } catch (err) {
            const body = (err as { body?: { code?: string; existing_id?: string; existing_type?: string | null } })?.body;
            setExistingRecord(
                body?.code === 'DUPLICATE_EMAIL' && body.existing_id
                    ? { id: body.existing_id, type: body.existing_type ?? null }
                    : null,
            );
            // A rejection the backend explains (a 4xx: validation, duplicate,
            // quota, permission) carries a message worth showing verbatim.
            // Flattening every one of those into "Failed to create lead" was
            // exactly what left users with nothing to act on. Genuine
            // server-side faults keep a generic, honest message.
            setError(
                describeApiError(
                    err,
                    "We couldn't create the lead due to a server error. Please try again.",
                ),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Lead" size="xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                {isDuplicate && (
                    <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
                        <AlertCircle size={18} className="shrink-0" />
                        <p>Potential duplicate detected. A lead with this company name already exists.</p>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm" role="alert">
                        <AlertCircle size={18} className="shrink-0" />
                        <div>
                            <p>{error}</p>
                            {existingRecord && (
                                <a
                                    href={`/crm/${existingRecord.type === 'customer' ? 'customers' : 'leads'}/${existingRecord.id}`}
                                    className="underline text-red-300 hover:text-red-200"
                                    data-testid="open-existing-record"
                                >
                                    Open the existing {existingRecord.type || 'record'} →
                                </a>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-1.5">
                    <label htmlFor="lead-company-name" className="text-sm font-medium text-slate-400">Company Name</label>
                    <input
                        id="lead-company-name"
                        ref={(el) => { fieldRefs.current.company_name = el; }}
                        type="text"
                        value={formData.company_name}
                        onChange={(e) => handleChange('company_name', e.target.value)}
                        onBlur={(e) => validateField('company_name', e.target.value)}
                        className={inputCls(!!errors.company_name)}
                        placeholder="e.g. Acme Corp"
                        aria-invalid={!!errors.company_name}
                        aria-describedby={errors.company_name ? 'lead-company-name-error' : undefined}
                    />
                    {errors.company_name && (
                        <p id="lead-company-name-error" className="text-xs text-red-400 mt-1">{errors.company_name}</p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="lead-first-name" className="text-sm font-medium text-slate-400">First Name <RequiredMark /></label>
                        <input
                            id="lead-first-name"
                            ref={(el) => { fieldRefs.current.first_name = el; }}
                            type="text"
                            value={formData.first_name}
                            onChange={(e) => handleChange('first_name', e.target.value)}
                            onBlur={(e) => validateField('first_name', e.target.value)}
                            className={inputCls(!!errors.first_name)}
                            placeholder="e.g. John"
                            aria-required="true"
                            aria-invalid={!!errors.first_name}
                            aria-describedby={errors.first_name ? 'lead-first-name-error' : undefined}
                        />
                        {errors.first_name && (
                            <p id="lead-first-name-error" className="text-xs text-red-400 mt-1">{errors.first_name}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="lead-last-name" className="text-sm font-medium text-slate-400">Last Name</label>
                        <input
                            id="lead-last-name"
                            ref={(el) => { fieldRefs.current.last_name = el; }}
                            type="text"
                            value={formData.last_name}
                            onChange={(e) => handleChange('last_name', e.target.value)}
                            onBlur={(e) => validateField('last_name', e.target.value)}
                            className={inputCls(!!errors.last_name)}
                            placeholder="e.g. Doe"
                            aria-invalid={!!errors.last_name}
                            aria-describedby={errors.last_name ? 'lead-last-name-error' : undefined}
                        />
                        {errors.last_name && (
                            <p id="lead-last-name-error" className="text-xs text-red-400 mt-1">{errors.last_name}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="lead-contact-email" className="text-sm font-medium text-slate-400">Contact Email <RequiredMark /></label>
                        <input
                            id="lead-contact-email"
                            ref={(el) => { fieldRefs.current.contact_email = el; }}
                            /* `type="text"` deliberately: the browser's own popup
                               ("Please enter a part following '@'") pre-empted the
                               inline message and looked nothing like the rest of
                               the form. Validation is the app's job here. */
                            type="text"
                            inputMode="email"
                            autoComplete="email"
                            value={formData.contact_email}
                            onChange={(e) => handleChange('contact_email', e.target.value)}
                            // Blur is the point the value is "finished", so an
                            // empty optional-looking field is reported as a format
                            // problem only once it holds something.
                            onBlur={(e) => setErrors(prev => ({ ...prev, contact_email: validateEmail(e.target.value) }))}
                            className={inputCls(!!emailError)}
                            placeholder="name@company.com"
                            aria-required="true"
                            aria-invalid={!!emailError}
                            aria-describedby={emailError ? 'lead-contact-email-error' : undefined}
                        />
                        {emailError && (
                            <p id="lead-contact-email-error" className="text-xs text-red-400 mt-1">{emailError}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="lead-phone" className="text-sm font-medium text-slate-400">
                            Phone <RequiredMark />
                            <span className="ml-2 text-xs font-normal text-slate-500">{phoneCountLabel(formData.phone)}</span>
                        </label>
                        <input
                            id="lead-phone"
                            ref={(el) => { fieldRefs.current.phone = el; }}
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFormData(prev => ({ ...prev, phone: val }));
                                setErrors(prev => ({ ...prev, phone: val.trim() ? validatePhone(val) : null }));
                            }}
                            onBlur={(e) => validateField('phone', e.target.value)}
                            className={inputCls(!!phoneError)}
                            placeholder="+91 98765 43210"
                            aria-required="true"
                            aria-invalid={!!phoneError}
                            aria-describedby={phoneError ? 'lead-phone-error' : undefined}
                        />
                        {phoneError && (
                            <p id="lead-phone-error" className="text-xs text-red-400 mt-1">{phoneError}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="lead-alt-phone" className="text-sm font-medium text-slate-400">
                            Alt. Phone
                            <span className="ml-2 text-xs font-normal text-slate-500">{phoneCountLabel(formData.alt_phone)}</span>
                        </label>
                        <input
                            id="lead-alt-phone"
                            ref={(el) => { fieldRefs.current.alt_phone = el; }}
                            type="tel"
                            value={formData.alt_phone}
                            onChange={(e) => handleChange('alt_phone', e.target.value)}
                            onBlur={(e) => validateField('alt_phone', e.target.value)}
                            className={inputCls(!!errors.alt_phone)}
                            placeholder="+91 98765 43211"
                            aria-invalid={!!errors.alt_phone}
                            aria-describedby={errors.alt_phone ? 'lead-alt-phone-error' : undefined}
                        />
                        {errors.alt_phone && (
                            <p id="lead-alt-phone-error" className="text-xs text-red-400 mt-1">{errors.alt_phone}</p>
                        )}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="lead-address" className="text-sm font-medium text-slate-400">Address</label>
                    <input
                        id="lead-address"
                        ref={(el) => { fieldRefs.current.address = el; }}
                        type="text"
                        value={formData.address}
                        onChange={(e) => handleChange('address', e.target.value)}
                        onBlur={(e) => validateField('address', e.target.value)}
                        className={inputCls(!!errors.address)}
                        placeholder="Street / area"
                        aria-invalid={!!errors.address}
                        aria-describedby={errors.address ? 'lead-address-error' : undefined}
                    />
                    {errors.address && (
                        <p id="lead-address-error" className="text-xs text-red-400 mt-1">{errors.address}</p>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label htmlFor="lead-country" className="text-sm font-medium text-slate-400">Country</label>
                    <select
                        id="lead-country"
                        value={formData.country}
                        // Changing country changes what a valid postal code is,
                        // so a standing error has to be re-judged against the
                        // new rule rather than left over from the old one.
                        onChange={(e) => {
                            const country = e.target.value;
                            setFormData(prev => ({ ...prev, country }));
                            setErrors(prev => ({ ...prev, pin_code: validatePostalCode(formData.pin_code, country) }));
                        }}
                        className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50"
                    >
                        {countryOptions().map(c => (
                            <option key={c.code} value={c.code}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label htmlFor="lead-city" className="text-sm font-medium text-slate-400">City</label>
                        <input
                            id="lead-city"
                            ref={(el) => { fieldRefs.current.city = el; }}
                            type="text"
                            value={formData.city}
                            onChange={(e) => handleChange('city', e.target.value)}
                            onBlur={(e) => validateField('city', e.target.value)}
                            className={inputCls(!!errors.city)}
                            placeholder="Bangalore"
                            aria-invalid={!!errors.city}
                            aria-describedby={errors.city ? 'lead-city-error' : undefined}
                        />
                        {errors.city && (
                            <p id="lead-city-error" className="text-xs text-red-400 mt-1">{errors.city}</p>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="lead-pin-code" className="text-sm font-medium text-slate-400">
                            {postalRule.label}
                            {postalRule.digits && (
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                    {formData.pin_code.replace(/\D/g, '').length}/{postalRule.digits} digits
                                </span>
                            )}
                            {!postalRule.pattern && (
                                <span className="ml-2 text-xs font-normal text-slate-500">not used in {postalRule.name}</span>
                            )}
                        </label>
                        <input
                            id="lead-pin-code"
                            ref={(el) => { fieldRefs.current.pin_code = el; }}
                            type="text"
                            inputMode={postalRule.numericOnly ? 'numeric' : 'text'}
                            maxLength={postalRule.maxLength}
                            value={formData.pin_code}
                            // Where the country's format is digits-only, a letter is
                            // never intended — drop it at the keystroke rather than
                            // reporting it back. Alphanumeric formats (UK, Canada)
                            // must be left alone.
                            onChange={(e) => handleChange(
                                'pin_code',
                                postalRule.numericOnly
                                    ? e.target.value.replace(/\D/g, '').slice(0, postalRule.maxLength)
                                    : e.target.value,
                            )}
                            onBlur={(e) => validateField('pin_code', e.target.value)}
                            className={inputCls(!!errors.pin_code)}
                            placeholder={postalRule.example}
                            aria-invalid={!!errors.pin_code}
                            aria-describedby={errors.pin_code ? 'lead-pin-code-error' : undefined}
                        />
                        {errors.pin_code && (
                            <p id="lead-pin-code-error" className="text-xs text-red-400 mt-1">{errors.pin_code}</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-400">Lead Source</label>
                        <select
                            value={formData.source}
                            onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50"
                        >
                            <option value="">— Select source —</option>
                            {sourceTypes.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-400">Lead Stage</label>
                        <select
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50"
                        >
                            {leadStages.map(stage => (
                                <option key={stage.id} value={stage.name}>{stage.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-400">Referred By</label>
                    <PartnerSearchDropdown
                        partners={partners}
                        value={formData.referred_by}
                        onChange={(id) => setFormData({ ...formData, referred_by: id })}
                        placeholder="Search and select partner..."
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-400">Owner</label>
                    <select
                        value={formData.owner_id}
                        onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50"
                    >
                        {users.length === 0 && (
                            <option value="">Loading...</option>
                        )}
                        {users.map(u => (
                            <option key={u.id} value={u.id}>{u.full_name}</option>
                        ))}
                    </select>
                </div>

                {customFieldDefs.length > 0 && (
                    <div className="pt-4 border-t border-slate-800 space-y-4">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Additional Details</p>
                        <div className="grid grid-cols-2 gap-4">
                            {customFieldDefs.map(field => (
                                <div key={field.id} className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-400">{field.label} {field.required && <RequiredMark />}</label>
                                    {field.type === 'boolean' ? (
                                        <div className="flex items-center h-10">
                                            <input
                                                type="checkbox"
                                                checked={formData.custom_fields[field.id] || false}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    custom_fields: { ...formData.custom_fields, [field.id]: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-blue-500/50"
                                            />
                                        </div>
                                    ) : field.type === 'SELECT' || field.field_type === 'SELECT' ? (
                                        <select
                                            required={field.required}
                                            value={formData.custom_fields[field.id] || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                custom_fields: { ...formData.custom_fields, [field.id]: e.target.value }
                                            })}
                                            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50"
                                        >
                                            <option value="">— Select —</option>
                                            {(field.options || []).map((opt: string) => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            required={field.required}
                                            type={field.type === 'number' || field.field_type === 'NUMBER' ? 'number' : field.type === 'date' || field.field_type === 'DATE' ? 'date' : 'text'}
                                            value={formData.custom_fields[field.id] || ''}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                custom_fields: { ...formData.custom_fields, [field.id]: e.target.value }
                                            })}
                                            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-50 placeholder:text-slate-500"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        // Disabled — not hidden — until the form is complete and
                        // valid: the button stays visible so users can see the
                        // action exists, and Cancel is always reachable.
                        disabled={isSubmitting || !isFormValid}
                        aria-disabled={isSubmitting || !isFormValid}
                        title={!isFormValid ? 'Complete all required fields with valid values to create the lead' : undefined}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Lead'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};
