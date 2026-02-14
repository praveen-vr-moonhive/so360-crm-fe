import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ChevronLeft, Mail, Phone, Building2,
    Calendar, Tag, Clock, Plus,
    LayoutDashboard, Briefcase, CheckCircle2,
    Loader2, ExternalLink, MessageSquare, AtSign, Users, FileText,
    DollarSign, BarChart3, PieChart, Edit2, Trash2, X,
    File, Download, UploadCloud, FileIcon
} from 'lucide-react';
import { crmService, activitiesApi } from '../services/crmService';
import { Lead, Deal, Task, Activity, ActivityType, CustomFieldDefinition, LeadScoringRule, User, Attachment, Note } from '../types/crm';
import { ToastContainer, useToast } from '../components/common/Toast';
import { Trophy, Zap, Info, TrendingUp } from 'lucide-react';
import CreateDealModal from './components/CreateDealModal';
import TaskModal from './components/TaskModal';

type TabType = 'activity' | 'notes' | 'tasks' | 'documents';

interface TimelineEvent {
    id: string;
    type: 'Activity' | 'NOTE' | 'TASK' | 'DOCUMENT' | 'DEAL' | 'STATUS_CHANGE' | 'STAGE_CHANGE' | 'OWNER_CHANGE' | 'PROFILE_UPDATE';
    subType?: string;
    title: string;
    description: string;
    date: string;
    author?: User;
    data?: any;
}

const LeadDetailPage = () => {
    const { id = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toasts, showSuccess, showError, dismissToast } = useToast();
    const [lead, setLead] = useState<Lead | null>(null);
    const [associatedDeals, setAssociatedDeals] = useState<Deal[]>([]);
    const [associatedTasks, setAssociatedTasks] = useState<Task[]>([]);
    const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
    const [scoringRules, setScoringRules] = useState<LeadScoringRule[]>([]);
    const [activeTab, setActiveTab] = useState<TabType>('activity');
    const [infoTab, setInfoTab] = useState<'profile' | 'additional'>('profile');
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingInfo, setIsEditingInfo] = useState(false);
    const [isChangingOwner, setIsChangingOwner] = useState(false);
    const [isChangingStatus, setIsChangingStatus] = useState(false);
    const [isChangingStage, setIsChangingStage] = useState(false);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [isCreatingDeal, setIsCreatingDeal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [leadStages, setLeadStages] = useState<{ id: string, name: string }[]>([]);
    const [newNoteContent, setNewNoteContent] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchLeadData = useCallback(async () => {
        try {
            const [leadData, dealsData, tasksData, settingsData, usersData, activitiesData] = await Promise.all([
                crmService.getLeadById(id),
                crmService.getDealsByLeadId(id),
                crmService.getTasksByLeadId(id),
                crmService.getSettings(),
                crmService.getUsers(),
                crmService.getActivitiesByLeadId(id)
            ]);
            setLead(leadData || null);
            if (leadData) {
                setLead({ ...leadData, activities: activitiesData });
            }
            setAssociatedDeals(dealsData);
            setAssociatedTasks(tasksData);
            setCustomFieldDefs(settingsData.lead_custom_fields);
            setScoringRules(settingsData.lead_scoring || []);
            setLeadStages(settingsData.lead_stages || []);
            setAllUsers(usersData);
        } catch (error) {
            console.error('Failed to fetch lead data', error);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchLeadData();
    }, [fetchLeadData]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Loading lead workspace...</span>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="p-8 text-center text-slate-500">
                <p>Lead not found.</p>
                <Link to=".." className="text-blue-500 hover:underline mt-4 inline-block">Back to Leads</Link>
            </div>
        );
    }

    const calculateScore = () => {
        let totalScore = 0;
        const breakdown: { label: string, points: number }[] = [];

        scoringRules.forEach(rule => {
            if (rule.type === 'source' && lead.source.toLowerCase().includes(rule.criteria.toLowerCase().split('is ')[1] || '')) {
                totalScore += rule.points;
                breakdown.push({ label: rule.criteria, points: rule.points });
            }
            if (rule.type === 'activity') {
                const activityType = rule.criteria.toLowerCase().split('a ')[1] || '';
                const count = lead.activities.filter(a => a.type.toLowerCase() === activityType).length;
                if (count > 0) {
                    const points = rule.points * count;
                    totalScore += points;
                    breakdown.push({ label: `${rule.criteria} (${count}x)`, points });
                }
            }
            if (rule.type === 'field') {
                // Check if any custom field value matches the criteria
                const isMatch = Object.values(lead.custom_fields || {}).some(val =>
                    String(val).toLowerCase().includes(rule.criteria.toLowerCase().split('is ')[1] || '')
                );
                if (isMatch) {
                    totalScore += rule.points;
                    breakdown.push({ label: rule.criteria, points: rule.points });
                }
            }
        });

        return { total: totalScore, breakdown };
    };

    const { total: score, breakdown } = calculateScore();

    const getAggregatedTimeline = (): TimelineEvent[] => {
        const events: TimelineEvent[] = [];

        // 1. Manual Activities
        lead.activities.forEach(a => {
            const isSystem = ['STATUS_CHANGE', 'STAGE_CHANGE', 'OWNER_CHANGE', 'PROFILE_UPDATE'].includes(a.type);
            events.push({
                id: a.id,
                type: isSystem ? (a.type as any) : 'Activity',
                subType: isSystem ? undefined : a.type,
                title: isSystem ? a.type.replace('_', ' ') : `${a.type} Logged`,
                description: a.notes,
                date: a.created_at || a.date,
                author: a.author
            });
        });

        // 2. Notes
        lead.notes.forEach(n => {
            events.push({
                id: n.id,
                type: 'NOTE',
                title: 'Note Captured',
                description: n.content,
                date: n.created_at,
                author: n.author
            });
        });

        // 3. Documents
        lead.documents?.forEach(d => {
            events.push({
                id: d.id,
                type: 'DOCUMENT',
                title: 'Document Uploaded',
                description: `${d.name} (${(d.size / (1024 * 1024)).toFixed(2)} MB)`,
                date: d.created_at || d.uploaded_at,
                author: d.uploaded_by
            });
        });

        // 4. Tasks
        associatedTasks.forEach(t => {
            events.push({
                id: t.id,
                type: 'TASK',
                subType: t.type,
                title: `Task: ${t.title}`,
                description: `Status: ${t.status} | Type: ${t.type}`,
                date: t.created_at || t.due_date,
                author: t.assigned_to
            });
        });

        // 5. Deals
        associatedDeals.forEach(d => {
            events.push({
                id: d.id,
                type: 'DEAL',
                title: 'Deal Created',
                description: `${d.name} | Value: $${d.value.toLocaleString()} | Stage: ${d.stage}`,
                date: d.created_at || d.expected_close_date,
                author: d.owner
            });
        });

        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    const timeline = getAggregatedTimeline();


    const calculateLegacyRevenue = () => {
        const earned = associatedDeals
            .filter(d => d.stage === 'Won')
            .reduce((sum, d) => sum + d.value, 0);

        const pipeline = associatedDeals
            .filter(d => d.stage !== 'Won' && d.stage !== 'Lost')
            .reduce((sum, d) => sum + d.value, 0);

        const totalValue = earned + pipeline;
        const dealCount = associatedDeals.length;

        return { earned, pipeline, totalValue, dealCount };
    };

    const { earned, pipeline, totalValue, dealCount } = calculateLegacyRevenue();

    const handleTaskToggle = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'Open' : 'Done';
        try {
            // Optimistic update
            const updatedTask = { ...task, status: newStatus };
            setAssociatedTasks(prev => prev.map(t => t.id === task.id ? updatedTask as Task : t));

            await crmService.updateTask(task.id, { status: newStatus });

            await crmService.logActivity({
                lead_id: lead.id,
                type: 'TASK',
                notes: `Task "${task.title}" marked as ${newStatus}`,
                date: new Date().toISOString()
            });

            fetchLeadData(); // Refresh to ensure consistency
        } catch (error) {
            console.error('Failed to toggle task status:', error);
            showError('Failed to update task status');
            // Revert on error
            setAssociatedTasks(prev => prev.map(t => t.id === task.id ? task : t));
        }
    };

    const handleDeleteLead = async () => {
        setIsDeleting(true);
        try {
            await crmService.deleteLead(id);
            showSuccess('Lead deleted successfully');
            navigate('/crm/leads');
        } catch (error: any) {
            showError(error.message || 'Failed to delete lead');
            setIsDeleting(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <header className="mb-8">
                <Link to=".." className="flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors mb-4 group">
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Leads
                </Link>
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-2 relative">
                            {isChangingStatus ? (
                                <select
                                    value={lead.status}
                                    onChange={async (e) => {
                                        const newStatus = e.target.value as any;
                                        await crmService.updateLead(lead.id, { status: newStatus as any });
                                        await crmService.logActivity({
                                            lead_id: lead.id,
                                            type: 'STATUS_CHANGE',
                                            notes: `Lead status changed to ${newStatus}`,
                                            date: new Date().toISOString()
                                        });
                                        fetchLeadData();
                                        setIsChangingStatus(false);
                                    }}
                                    onBlur={() => setIsChangingStatus(false)}
                                    autoFocus
                                    className="bg-slate-900 border border-slate-700 text-xs font-black uppercase text-white rounded px-2 py-1 outline-none"
                                >
                                    {leadStages.map(stage => (
                                        <option key={stage.id} value={stage.name}>{stage.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsChangingStatus(true)}>
                                    <h1 className="text-4xl font-black text-white tracking-tight">{lead.contact_name}</h1>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border transition-all group-hover:scale-110 ${lead.status === 'Won' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                        lead.status === 'Lost' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                            'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                        }`}>
                                        {lead.status}
                                    </span>
                                    <Edit2 size={12} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                        <p className="text-xl text-slate-400 flex items-center gap-2 font-medium">
                            <Building2 size={20} className="text-slate-500" />
                            {lead.company_name}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-400 px-4 py-3 rounded-xl font-black transition-all text-xs flex items-center gap-2 uppercase tracking-widest border border-slate-700 hover:border-red-500/50"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                        <button
                            onClick={() => setIsCreatingDeal(true)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-black transition-all shadow-xl shadow-blue-900/30 active:scale-95 text-xs flex items-center gap-2 uppercase tracking-widest"
                        >
                            <Plus size={16} />
                            Create Deal
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Lead Information Tabs Card */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-fit">
                        <div className="flex border-b border-slate-800 bg-slate-900/50">
                            <button
                                onClick={() => setInfoTab('profile')}
                                className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${infoTab === 'profile' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Users size={14} /> Full Profile
                            </button>
                            {customFieldDefs.length > 0 && (
                                <button
                                    onClick={() => setInfoTab('additional')}
                                    className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${infoTab === 'additional' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <Info size={14} /> Additional Info
                                </button>
                            )}
                            <div className="ml-auto flex items-center px-6">
                                <button
                                    onClick={async () => {
                                        if (isEditingInfo) {
                                            try {
                                                await crmService.updateLead(lead.id, lead);
                                                await crmService.logActivity({
                                                    lead_id: lead.id,
                                                    type: 'PROFILE_UPDATE',
                                                    notes: 'Lead profile information updated',
                                                    date: new Date().toISOString()
                                                });
                                                fetchLeadData();
                                            } catch (error) {
                                                console.error('Failed to save lead info', error);
                                                showError('Failed to save changes.');
                                            }
                                        }
                                        setIsEditingInfo(!isEditingInfo);
                                    }}
                                    className={`p-2 rounded-lg transition-all ${isEditingInfo ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                                    title={isEditingInfo ? "Save Changes" : "Edit Intelligence"}
                                >
                                    {isEditingInfo ? <CheckCircle2 size={16} /> : <Edit2 size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="p-8">
                            {infoTab === 'profile' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-4 text-slate-300">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-blue-400 shadow-inner">
                                                <Mail size={18} />
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Email</span>
                                                {isEditingInfo ? (
                                                    <input
                                                        type="email"
                                                        value={lead.contact_email}
                                                        onChange={(e) => setLead({ ...lead, contact_email: e.target.value })}
                                                        className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded px-2 py-1 outline-none focus:border-blue-500"
                                                    />
                                                ) : (
                                                    <a href={`mailto:${lead.contact_email}`} className="text-sm font-bold hover:text-blue-400 transition-colors uppercase tracking-tight">{lead.contact_email}</a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-300">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-purple-400 shadow-inner">
                                                <Phone size={18} />
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Phone</span>
                                                {isEditingInfo ? (
                                                    <input
                                                        type="text"
                                                        value={lead.phone || ''}
                                                        onChange={(e) => setLead({ ...lead, phone: e.target.value })}
                                                        placeholder="Add phone..."
                                                        className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded px-2 py-1 outline-none focus:border-blue-500"
                                                    />
                                                ) : (
                                                    <span className="text-sm font-bold uppercase tracking-tight">{lead.phone || 'Not provided'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-4 text-slate-300">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-emerald-400 shadow-inner">
                                                <Tag size={18} />
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Source</span>
                                                {isEditingInfo ? (
                                                    <input
                                                        type="text"
                                                        value={lead.source}
                                                        onChange={(e) => setLead({ ...lead, source: e.target.value })}
                                                        className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded px-2 py-1 outline-none focus:border-blue-500"
                                                    />
                                                ) : (
                                                    <span className="text-sm font-bold uppercase tracking-tight">{lead.source}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-slate-300 text-opacity-50">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 shadow-inner opacity-50">
                                                <Calendar size={18} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">Created</span>
                                                <span className="text-sm font-bold uppercase tracking-tight">{new Date(lead.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {infoTab === 'additional' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
                                    {customFieldDefs.map(field => (
                                        <div key={field.id} className="flex items-center gap-4 text-slate-300">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 shadow-inner">
                                                {field.type === 'date' ? <Calendar size={18} /> : field.type === 'boolean' ? <CheckCircle2 size={18} /> : <Tag size={18} />}
                                            </div>
                                            <div className="flex flex-col flex-1">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">{field.label}</span>
                                                {isEditingInfo ? (
                                                    <input
                                                        type={field.type === 'number' ? 'number' : 'text'}
                                                        value={lead.custom_fields?.[field.id] || ''}
                                                        onChange={(e) => setLead({
                                                            ...lead,
                                                            custom_fields: {
                                                                ...lead.custom_fields,
                                                                [field.id]: e.target.value
                                                            }
                                                        })}
                                                        className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded px-2 py-1 outline-none focus:border-blue-500"
                                                    />
                                                ) : (
                                                    <span className="text-sm font-bold uppercase tracking-tight">
                                                        {field.type === 'boolean'
                                                            ? (lead.custom_fields?.[field.id] ? 'Yes' : 'No')
                                                            : field.type === 'date' && lead.custom_fields?.[field.id]
                                                                ? new Date(lead.custom_fields[field.id]).toLocaleDateString()
                                                                : lead.custom_fields?.[field.id] || '—'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Workspace Tabs - Now below Profile Data */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-fit">
                        <div className="flex border-b border-slate-800 bg-slate-900/50">
                            <button
                                onClick={() => setActiveTab('activity')}
                                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'activity' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <MessageSquare size={14} /> Activity
                            </button>
                            <button
                                onClick={() => setActiveTab('notes')}
                                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'notes' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <FileText size={14} /> Notes
                            </button>
                            <button
                                onClick={() => setActiveTab('tasks')}
                                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'tasks' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <CheckCircle2 size={14} /> Tasks ({associatedTasks.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('documents')}
                                className={`flex items-center gap-2 px-6 py-4 text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'documents' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'
                                    }`}
                            >
                                <File size={14} /> Documents ({lead.documents?.length || 0})
                            </button>
                        </div>

                        <div className="p-6">
                            {activeTab === 'activity' && (
                                <div className="space-y-8">
                                    <div className="flex justify-between items-center mb-4">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Activity Timeline</p>
                                    </div>

                                    <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-800 ml-1">
                                        {timeline.length === 0 ? (
                                            <p className="text-center text-slate-500 py-4 ml-6 italic text-sm">No activities logged yet.</p>
                                        ) : (
                                            timeline.map((event) => (
                                                <div key={event.id} className="relative pl-10">
                                                    <div className="absolute left-0 top-1.5 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center z-10 shadow-lg">
                                                        {event.type === 'Activity' && (
                                                            <>
                                                                {event.subType === 'CALL' && <Phone size={14} className="text-blue-400" />}
                                                                {event.subType === 'MEETING' && <Users size={14} className="text-purple-400" />}
                                                                {event.subType === 'EMAIL' && <AtSign size={14} className="text-emerald-400" />}
                                                                {event.subType === 'NOTE' && <FileText size={14} className="text-amber-400" />}
                                                            </>
                                                        )}
                                                        {event.type === 'NOTE' && <FileText size={14} className="text-amber-400" />}
                                                        {event.type === 'TASK' && <CheckCircle2 size={14} className="text-blue-500" />}
                                                        {event.type === 'DOCUMENT' && <File size={14} className="text-indigo-400" />}
                                                        {event.type === 'DEAL' && <Briefcase size={14} className="text-emerald-400" />}

                                                        {event.type === 'STATUS_CHANGE' && <TrendingUp size={14} className="text-blue-400" />}
                                                        {event.type === 'STAGE_CHANGE' && <BarChart3 size={14} className="text-purple-400" />}
                                                        {event.type === 'OWNER_CHANGE' && <Users size={14} className="text-pink-400" />}
                                                        {event.type === 'PROFILE_UPDATE' && <Info size={14} className="text-slate-400" />}
                                                    </div>
                                                    <div className="bg-slate-950/50 border border-slate-800/40 p-4 rounded-xl group hover:border-slate-700 transition-all">
                                                        {event.type === 'TASK' ? (
                                                            <Link to={`/tasks/${event.id}`} className="block group/link">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-white text-xs uppercase tracking-tight group-hover/link:text-blue-400 transition-colors">{event.title}</span>
                                                                        <span className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">{event.type}</span>
                                                                    </div>
                                                                    <span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                                                                        {new Date(event.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                                <p className="text-slate-400 text-sm leading-relaxed">{event.description}</p>
                                                            </Link>
                                                        ) : (
                                                            <>
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-white text-xs uppercase tracking-tight">{event.title}</span>
                                                                        {event.type !== 'Activity' && (
                                                                            <span className="text-[8px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-widest">{event.type}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        {event.type === 'Activity' && (
                                                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        const newNotes = prompt('Edit activity notes:', event.description);
                                                                                        if (newNotes !== null) {
                                                                                            await activitiesApi.update(event.id, { notes: newNotes });
                                                                                            fetchLeadData();
                                                                                        }
                                                                                    }}
                                                                                    className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                                                                                    title="Edit activity"
                                                                                >
                                                                                    <Edit2 size={12} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        if (confirm('Delete this activity?')) {
                                                                                            await activitiesApi.delete(event.id);
                                                                                            fetchLeadData();
                                                                                        }
                                                                                    }}
                                                                                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                                                                                    title="Delete activity"
                                                                                >
                                                                                    <Trash2 size={12} />
                                                                                </button>
                                                                            </div>
                                                                        )}
                                                                        <span className="text-[9px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                                                                            {new Date(event.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <p className="text-slate-400 text-sm leading-relaxed">{event.description}</p>
                                                            </>
                                                        )}
                                                        {event.author && (
                                                            <div className="mt-4 flex items-center gap-2">
                                                                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black overflow-hidden border border-slate-700">
                                                                    {event.author.avatar_url ? <img src={event.author.avatar_url} alt={event.author.full_name} /> : event.author.full_name?.charAt(0) || '?'}
                                                                </div>
                                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{event.author.full_name}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                            {activeTab === 'notes' && (
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        {lead.notes.length === 0 ? (
                                            <p className="text-slate-400 italic text-sm">No notes captured for this lead yet.</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {lead.notes.map(note => (
                                                    <div className="text-sm border-l-2 border-amber-500/30 pl-4 py-1 group/note relative">
                                                        <div className="absolute right-0 top-0 opacity-0 group-hover/note:opacity-100 transition-opacity flex gap-2">
                                                            <button
                                                                onClick={async () => {
                                                                    const newContent = prompt('Edit note:', note.content);
                                                                    if (newContent !== null) {
                                                                        await crmService.updateNote(note.id, newContent);
                                                                        setLead({
                                                                            ...lead,
                                                                            notes: lead.notes.map(n => n.id === note.id ? { ...n, content: newContent } : n)
                                                                        });
                                                                    }
                                                                }}
                                                                className="text-slate-500 hover:text-blue-400"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    if (confirm('Delete this note?')) {
                                                                        await crmService.deleteNote(note.id);
                                                                        setLead({
                                                                            ...lead,
                                                                            notes: lead.notes.filter(n => n.id !== note.id)
                                                                        });
                                                                    }
                                                                }}
                                                                className="text-slate-500 hover:text-rose-400"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                        <p className="text-slate-300 leading-relaxed mb-2 pr-12">{note.content}</p>
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{note.author.full_name}</span>
                                                            <span className="text-[10px] text-slate-600 font-bold">{new Date(note.created_at).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 transition-all focus-within:ring-1 focus-within:ring-blue-500/30">
                                            <textarea
                                                placeholder="Add a private note about this lead..."
                                                value={newNoteContent}
                                                onChange={(e) => setNewNoteContent(e.target.value)}
                                                className="w-full bg-transparent border-none p-0 text-sm font-medium text-white focus:ring-0 resize-none h-24 mb-3 placeholder:text-slate-700"
                                            />
                                            <div className="flex justify-end">
                                                <button
                                                    onClick={async () => {
                                                        if (!newNoteContent.trim()) return;
                                                        const freshNote = await crmService.createNote({ lead_id: lead.id, content: newNoteContent });
                                                        setLead({
                                                            ...lead,
                                                            notes: [...(lead.notes || []), freshNote]
                                                        });
                                                        setNewNoteContent('');
                                                    }}
                                                    disabled={!newNoteContent.trim()}
                                                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 disabled:opacity-50"
                                                >
                                                    Save Note
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'tasks' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Tasks</p>
                                            {associatedTasks.some(t => t.type === 'REMINDER' && t.status === 'Open' && new Date(t.due_date) <= new Date(new Date().getTime() + 60 * 60 * 1000)) && (
                                                <span className="bg-rose-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                                    Due Reminders
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => setIsCreatingTask(true)}
                                            className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-2 rounded-lg hover:bg-blue-500/20 transition-all uppercase tracking-widest flex items-center gap-2"
                                        >
                                            <Plus size={12} /> Add Task
                                        </button>
                                    </div>

                                    {/* Reminders Alert Section */}
                                    {associatedTasks.filter(t => t.type === 'REMINDER' && t.status === 'Open' && new Date(t.due_date) <= new Date(new Date().getTime() + 24 * 60 * 60 * 1000)).length > 0 && (
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6">
                                            <h4 className="flex items-center gap-2 text-xs font-black text-amber-500 uppercase tracking-widest mb-3">
                                                <Clock size={14} /> upcoming & due reminders
                                            </h4>
                                            <div className="space-y-2">
                                                {associatedTasks
                                                    .filter(t => t.type === 'REMINDER' && t.status === 'Open' && new Date(t.due_date) <= new Date(new Date().getTime() + 24 * 60 * 60 * 1000))
                                                    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
                                                    .map(task => (
                                                        <div key={task.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-amber-500/10">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`w-2 h-2 rounded-full ${new Date(task.due_date) < new Date() ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'}`} />
                                                                <span className="text-sm font-bold text-slate-200">{task.title}</span>
                                                                <span className="text-xs text-slate-500">
                                                                    {new Date(task.due_date).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <Link to={`/tasks/${task.id}`} className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest flex items-center gap-1">
                                                                View <ChevronLeft size={10} className="rotate-180" />
                                                            </Link>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                    {associatedTasks.length === 0 ? (
                                        <div className="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                                            <CheckCircle2 size={32} className="mx-auto mb-3 opacity-20" />
                                            <p className="text-sm font-medium">No active tasks or follow-ups.</p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {associatedTasks.map(task => (
                                                <div key={task.id} className={`flex items-start gap-4 p-4 bg-slate-950 border rounded-xl group shadow-sm relative transition-all ${task.status === 'Done' ? 'border-emerald-500/20 opacity-60' : 'border-slate-800 hover:border-blue-500/50'}`}>
                                                    <button
                                                        onClick={() => handleTaskToggle(task)}
                                                        className={`mt-1 w-5 h-5 rounded border transition-colors shrink-0 flex items-center justify-center ${task.status === 'Done' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'border-slate-700 group-hover:border-blue-500'}`}
                                                    >
                                                        <CheckCircle2 size={12} className={`transition-opacity ${task.status === 'Done' ? 'opacity-100' : 'opacity-0 group-hover:opacity-20 text-blue-500'}`} />
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <Link to={`/tasks/${task.id}`} className="block group/link">
                                                            <div className="flex justify-between items-start gap-2">
                                                                <h4 className={`text-sm font-bold text-white leading-tight truncate group-hover/link:text-blue-400 transition-colors ${task.status === 'Done' ? 'line-through text-slate-500' : ''}`}>
                                                                    {task.title || 'Untitled Task'}
                                                                </h4>
                                                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${task.status === 'Done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                                                                    {task.status}
                                                                </span>
                                                            </div>
                                                            {task.description && (
                                                                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{task.description}</p>
                                                            )}
                                                        </Link>

                                                        <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t border-slate-800/50 pt-2">
                                                            <span className="flex items-center gap-1 text-rose-400/70">
                                                                <Clock size={10} />
                                                                Due {new Date(task.due_date).toLocaleDateString()}
                                                            </span>

                                                            {task.assigned_to && (
                                                                <span className="flex items-center gap-1 text-slate-400">
                                                                    <div className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                                                                        {task.assigned_to.avatar_url ? <img src={task.assigned_to.avatar_url} alt={task.assigned_to.full_name} className="w-full h-full object-cover" /> : task.assigned_to.full_name?.charAt(0)}
                                                                    </div>
                                                                    {task.assigned_to.full_name}
                                                                </span>
                                                            )}

                                                            {task.deal_name && (
                                                                <>
                                                                    <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                                                    <span className="text-blue-500/70 lowercase italic">{task.deal_name}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                        <button
                                                            onClick={() => setEditingTask(task)}
                                                            className="p-1.5 bg-slate-800 rounded hover:text-blue-400 hover:bg-slate-700 transition-colors"
                                                        >
                                                            <Edit2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'documents' && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Digital Assets & Contracts</p>
                                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${isUploading ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 active:scale-95'}`}>
                                            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                                            {isUploading ? 'Uploading...' : 'Upload Document'}
                                            <input
                                                type="file"
                                                className="hidden"
                                                disabled={isUploading}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file && lead) {
                                                        setIsUploading(true);
                                                        try {
                                                            const newDoc = await crmService.uploadDocument(lead.id, file);
                                                            setLead({
                                                                ...lead,
                                                                documents: [...(lead.documents || []), newDoc]
                                                            });
                                                        } finally {
                                                            setIsUploading(false);
                                                        }
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>

                                    {(!lead.documents || lead.documents.length === 0) ? (
                                        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-950/30">
                                            <FileIcon size={48} className="mx-auto mb-4 opacity-10" />
                                            <p className="text-sm font-bold uppercase tracking-widest mb-1">No documents attached</p>
                                            <p className="text-xs text-slate-600 lowercase italic">Centralize proposals, contracts, and requirement docs here.</p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3">
                                            {lead.documents.map(doc => (
                                                <div key={doc.id} className="flex items-center gap-4 p-4 bg-slate-950 border border-slate-800 rounded-2xl group hover:border-slate-700 transition-all shadow-sm">
                                                    <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-blue-500 border border-slate-800 group-hover:scale-105 transition-transform shadow-inner">
                                                        <File size={20} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">{doc.name}</h4>
                                                        <div className="flex items-center gap-3 mt-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                                                            <span>{(doc.size / (1024 * 1024)).toFixed(2)} MB</span>
                                                            <span className="w-1 h-1 bg-slate-800 rounded-full" />
                                                            <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                                                            <span className="w-1 h-1 bg-slate-800 rounded-full" />
                                                            <span className="text-slate-500">by {doc.uploaded_by.full_name}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                                                            title="Download"
                                                        >
                                                            <Download size={16} />
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this document?')) {
                                                                    await crmService.deleteDocument(lead.id, doc.id);
                                                                    setLead({
                                                                        ...lead,
                                                                        documents: lead.documents?.filter(d => d.id !== doc.id)
                                                                    });
                                                                }
                                                            }}
                                                            className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-8">
                    {/* Lead Score Card */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                        <div className="absolute top-0 right-0 p-8 transform translate-x-4 -translate-y-4 opacity-5 pointer-events-none">
                            <Trophy size={120} />
                        </div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Lead Potential</h3>
                            <div className="bg-amber-500/10 text-amber-500 p-1.5 rounded-lg">
                                <Zap size={14} className="fill-amber-500" />
                            </div>
                        </div>

                        <div className="flex items-end gap-3 mb-6">
                            <span className="text-6xl font-black text-white tracking-tighter leading-none">{score}</span>
                            <div className="pb-1">
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest block">Score</span>
                                <div className="flex items-center gap-1 text-emerald-400 font-bold text-[10px] uppercase tracking-tighter">
                                    <TrendingUp size={12} />
                                    <span>Top 10%</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3 pt-6 border-t border-slate-800/50">
                            {breakdown.length === 0 ? (
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest italic text-center py-2 underline decoration-slate-800 decoration-wavy underline-offset-4">No scoring rules applied yet</p>
                            ) : (
                                breakdown.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                                        <span className="text-slate-400">{item.label}</span>
                                        <span className="text-emerald-400">+{item.points}</span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-6 pt-4">
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                                    style={{ width: `${Math.min(100, (score / 150) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </section>
                    {/* Assigned Owner & Engagement Suite Combined */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm overflow-visible relative">
                        <div className="pb-6 border-b border-slate-800/50">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Assigned Owner</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsChangingOwner(!isChangingOwner)}
                                    className="text-[10px] text-blue-400 font-black uppercase tracking-widest hover:text-blue-300 transition-colors"
                                >
                                    {isChangingOwner ? 'CANCEL' : 'CHANGE'}
                                </button>
                            </div>
                            {isChangingOwner ? (
                                <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                    {allUsers.map(user => (
                                        <button
                                            type="button"
                                            key={user.id}
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                try {
                                                    await crmService.updateLead(lead.id, { owner: user });
                                                    await crmService.logActivity({
                                                        lead_id: lead.id,
                                                        type: 'OWNER_CHANGE',
                                                        notes: `Assigned owner changed to ${user.full_name}`,
                                                        date: new Date().toISOString()
                                                    });
                                                    await fetchLeadData();
                                                    setIsChangingOwner(false);
                                                } catch (error) {
                                                    console.error('Failed to update owner:', error);
                                                    showError('Failed to update owner.');
                                                }
                                            }}
                                            className={`w-full flex items-center gap-3 p-2 rounded-xl border transition-all ${user.id === lead.owner.id ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'}`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden flex-shrink-0">
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center font-black text-xs">{user.full_name?.charAt(0)}</div>
                                                )}
                                            </div>
                                            <div className="text-left overflow-hidden">
                                                <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{user.full_name}</p>
                                                <p className="text-[8px] text-slate-500 truncate">{user.email}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-slate-800 shadow-lg">
                                        {lead.owner.avatar_url ? (
                                            <img src={lead.owner.avatar_url} alt={lead.owner.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-xl font-black">{lead.owner.full_name?.charAt(0)}</div>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-black text-white text-sm uppercase tracking-tight leading-none mb-1">{lead.owner.full_name}</p>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{lead.owner.email}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="py-6 border-b border-slate-800/50">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Lead Stage</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsChangingStage(!isChangingStage)}
                                    className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-[0.2em]"
                                >
                                    {isChangingStage ? 'CANCEL' : 'CHANGE'}
                                </button>
                            </div>

                            {isChangingStage ? (
                                <div className="space-y-1">
                                    {leadStages.map(stage => (
                                        <button
                                            type="button"
                                            key={stage.id}
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                try {
                                                    await crmService.updateLead(lead.id, { status: stage.name as any });
                                                    await crmService.logActivity({
                                                        lead_id: lead.id,
                                                        type: 'STAGE_CHANGE',
                                                        notes: `Lead stage updated to ${stage.name}`,
                                                        date: new Date().toISOString()
                                                    });
                                                    await fetchLeadData();
                                                    setIsChangingStage(false);
                                                } catch (error: any) {
                                                    console.error('Failed to update stage:', error);
                                                    showError(error.message || 'Failed to update stage. Please try again.');
                                                }
                                            }}
                                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${stage.name === lead.status
                                                ? 'bg-blue-600/10 border-blue-500/50 text-blue-400'
                                                : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                                                }`}
                                        >
                                            <span>{stage.name}</span>
                                            {stage.name === lead.status && <CheckCircle2 size={12} />}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div
                                    className="flex items-center gap-3 bg-slate-950/50 border border-slate-800/50 p-3 rounded-xl group hover:border-blue-500/20 transition-all cursor-pointer"
                                    onClick={() => setIsChangingStage(true)}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-sm transition-transform group-hover:scale-105 ${lead.status === 'Won' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                        lead.status === 'Lost' ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' :
                                            'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                        }`}>
                                        <TrendingUp size={16} />
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest block leading-none">Status</span>
                                        <p className="font-black text-white text-xs uppercase tracking-tight mt-1">
                                            {lead.status}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-6">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">Engagement Suite</h3>
                            <div className="space-y-3">
                                <button
                                    onClick={() => setIsCreatingTask(true)}
                                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 border border-slate-700/50"
                                >
                                    <Clock size={14} /> Schedule Follow-up
                                </button>
                                {/* <button
                                    onClick={async () => {
                                        try {
                                            await crmService.logActivity({
                                                lead_id: id,
                                                type: 'EMAIL',
                                                notes: 'Outbound email sent to lead contact',
                                                date: new Date().toISOString()
                                            });
                                            fetchLeadData();
                                            setActiveTab('activity');
                                        } catch (error: any) {
                                            console.error('Failed to log email:', error);
                                            showError(error.message || 'Failed to log email.');
                                        }
                                    }}
                                    className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 active:scale-95 border border-slate-700/50"
                                >
                                    <Mail size={14} /> Send Email
                                </button> */}
                            </div>
                        </div>
                    </section>

                    {/* Revenue Intelligence Card */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden relative">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Revenue Intelligence</h3>
                            <div className="bg-emerald-500/10 text-emerald-500 p-1.5 rounded-lg">
                                <DollarSign size={14} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                            <div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Earned</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-white">${earned.toLocaleString()}</span>
                                </div>
                            </div>
                            <div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Pipeline</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-slate-400">${pipeline.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2">
                                    <span className="text-slate-500">Revenue Contribution</span>
                                    <span className="text-emerald-400">{totalValue > 0 ? Math.round((earned / totalValue) * 100) : 0}%</span>
                                </div>
                                <div className="w-full h-3 bg-slate-800/50 rounded-full flex overflow-hidden border border-slate-700/30">
                                    <div
                                        className="h-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all duration-1000"
                                        style={{ width: `${totalValue > 0 ? (earned / totalValue) * 100 : 0}%` }}
                                    />
                                    <div
                                        className="h-full bg-blue-500/40 transition-all duration-1000"
                                        style={{ width: `${totalValue > 0 ? (pipeline / totalValue) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 pt-4 border-t border-slate-800/50">
                                <div className="flex-1 bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 flex flex-col items-center">
                                    <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Active Deals</span>
                                    <span className="text-sm font-black text-blue-400">{associatedDeals.filter(d => d.stage !== 'Won' && d.stage !== 'Lost').length}</span>
                                </div>
                                <div className="flex-1 bg-slate-950/50 rounded-xl p-3 border border-slate-800/50 flex flex-col items-center">
                                    <span className="text-[8px] font-black text-slate-600 uppercase mb-1">Total LTV</span>
                                    <span className="text-sm font-black text-white">${totalValue.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Associated Deals Section */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Deals ({associatedDeals.length})</h3>
                        </div>
                        {associatedDeals.length === 0 ? (
                            <div className="text-center py-6 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                                <Briefcase size={24} className="mx-auto mb-2 opacity-20" />
                                <p className="text-[10px] font-bold uppercase tracking-widest">No deals yet</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {associatedDeals.map(deal => (
                                    <Link
                                        key={deal.id}
                                        to={`../deal/${deal.id}`}
                                        className="block p-4 bg-slate-950 border border-slate-800 rounded-xl hover:border-blue-500/50 transition-all group"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{deal.name}</h4>
                                            <ExternalLink size={12} className="text-slate-600 group-hover:text-blue-400 transition-all" />
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                                            <span className="text-emerald-400/80">${deal.value.toLocaleString()}</span>
                                            <span className="text-slate-500">{deal.stage}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div >
            {/* Task Edit Modal */}
            {
                (editingTask || isCreatingTask) && (
                    <TaskModal
                        task={editingTask}
                        leadId={lead.id}
                        onClose={() => {
                            setEditingTask(null);
                            setIsCreatingTask(false);
                        }}
                        onSuccess={(task) => {
                            if (editingTask) {
                                setAssociatedTasks(associatedTasks.map(t => t.id === task.id ? task : t));
                            } else {
                                setAssociatedTasks([...associatedTasks, task]);
                            }
                        }}
                    />
                )
            }

            {/* Create Deal Modal */}
            {
                isCreatingDeal && (
                    <CreateDealModal
                        leadId={lead.id}
                        leadName={lead.contact_name}
                        companyName={lead.company_name}
                        onClose={() => setIsCreatingDeal(false)}
                        onSuccess={(deal) => {
                            setAssociatedDeals([...associatedDeals, deal]);
                        }}
                    />
                )
            }

            {/* Delete Lead Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-slate-100 mb-2">Delete Lead</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this lead? This will remove all associated deals, notes, activities, tasks, and documents. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteLead}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isDeleting && <Loader2 size={16} className="animate-spin" />}
                                Delete Lead
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default LeadDetailPage;


