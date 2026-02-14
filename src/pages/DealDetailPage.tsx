import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ChevronLeft, Calendar, DollarSign, Clock, MessageSquare,
    AtSign, Phone, FileText, Plus, CheckCircle2, User as UserIcon, Users,
    Tag, Edit2, Trash2, X, Download, UploadCloud, FileIcon, File,
    ExternalLink, Briefcase, Receipt, Info, LayoutDashboard, Loader2, Zap
} from 'lucide-react';
import { crmService, dealsApi, tasksApi, activitiesApi, TimelineEvent } from '../services/crmService';
import { Deal, Activity, Task, Note, CustomFieldDefinition, User, Attachment, ActivityType } from '../types/crm';
import { ToastContainer, useToast } from '../components/common/Toast';
import TaskModal from './components/TaskModal';
import { FEATURES } from '../config/features';

type TabType = 'activity' | 'notes' | 'tasks' | 'documents' | 'custom';

const DealDetailPage = () => {
    const { id = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { toasts, showSuccess, showError, dismissToast } = useToast();

    const [deal, setDeal] = useState<Deal | null>(null);
    const [associatedLead, setAssociatedLead] = useState<any>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [dealStages, setDealStages] = useState<{ id: string, name: string }[]>([]);

    const [activeTab, setActiveTab] = useState<TabType>('activity');
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // UI Modals / States
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [isChangingStage, setIsChangingStage] = useState(false);
    const [isChangingOwner, setIsChangingOwner] = useState(false);
    const [isCreatingTask, setIsCreatingTask] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [newNoteContent, setNewNoteContent] = useState('');

    // Edit state for summary fields (separate from deal to avoid direct mutation)
    const [editedValue, setEditedValue] = useState<number | null>(null);
    const [editedCloseDate, setEditedCloseDate] = useState<string | null>(null);
    const [editedOwnerId, setEditedOwnerId] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [availableProjects, setAvailableProjects] = useState<any[]>([]);
    const [isFetchingProjects, setIsFetchingProjects] = useState(false);
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [projectDetails, setProjectDetails] = useState<{
        id: string;
        title: string;
        status: string;
        budget_total: number;
        completion_percentage: number;
    } | null>(null);

    const fetchProjectDetails = async (projectId: string) => {
        try {
            const response = await fetch(`/projects-api/projects/${projectId}`);
            if (response.ok) {
                const project = await response.json();
                setProjectDetails(project);
            } else {
                console.error('Failed to fetch project details:', response.statusText);
                setProjectDetails(null);
            }
        } catch (error) {
            console.error('Failed to fetch project details:', error);
            setProjectDetails(null);
        }
    };

    const fetchData = useCallback(async () => {
        try {
            if (deal) setIsRefreshing(true);
            else setIsLoading(true);

            const [dealData, settingsData, usersData, tasksData, activitiesData, notesData, docsData] = await Promise.all([
                crmService.getDealById(id),
                crmService.getSettings(),
                crmService.getUsers(),
                crmService.getTasksByDealId(id),
                crmService.getActivitiesByDealId(id),
                crmService.getNotesByDealId(id),
                crmService.getDocumentsByDealId(id)
            ]);

            if (dealData) {
                // Set deal with nested data merged in
                setDeal({
                    ...dealData,
                    activities: activitiesData,
                    notes: notesData,
                    documents: docsData
                });
                setActivities(activitiesData);
                setTasks(tasksData);

                // Fetch lead context if exists
                if (dealData.lead_id) {
                    const leadData = await crmService.getLeadById(dealData.lead_id);
                    setAssociatedLead(leadData);
                }

                // Fetch project details if linked
                if (dealData.project_id) {
                    await fetchProjectDetails(dealData.project_id);
                }
            }

            setCustomFieldDefs(settingsData.deal_custom_fields);
            setDealStages(settingsData.deal_stages);
            setAllUsers(usersData);
        } catch (error) {
            console.error('Failed to fetch deal workspace', error);
            showError('Failed to load deal details');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [id]);

    const getAggregatedTimeline = (): TimelineEvent[] => {
        if (!deal) return [];
        const events: TimelineEvent[] = [];

        // 1. Manual Activities
        activities.forEach(a => {
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
        (deal.notes || []).forEach(n => {
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
        (deal.documents || []).forEach(d => {
            events.push({
                id: d.id,
                type: 'DOCUMENT',
                title: d.type === 'contract' ? 'Contract Uploaded' : 'Document Uploaded',
                description: `${d.name} (${(d.size / (1024 * 1024)).toFixed(2)} MB)`,
                date: d.created_at || d.uploaded_at,
                author: d.uploaded_by
            });
        });

        // 4. Tasks
        tasks.forEach(t => {
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

        // Sort by date descending
        return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    const handleUpdateDeal = async (updates: Partial<Deal>) => {
        if (!deal) return;
        try {
            await dealsApi.update(deal.id, updates);
            setDeal(prev => prev ? { ...prev, ...updates } : null);
            showSuccess('Deal updated successfully');

            // Auto-log activity
            await crmService.logActivity({
                lead_id: deal.lead_id,
                deal_id: deal.id,
                type: 'NOTE',
                notes: `Deal updated: ${Object.keys(updates).join(', ')}`,
                date: new Date().toISOString()
            });
            fetchData();
        } catch (error) {
            showError('Failed to update deal');
        }
    };

    const handleTaskToggle = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'Open' : 'Done';
        try {
            await crmService.updateTask(task.id, { status: newStatus });
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

            await crmService.logActivity({
                lead_id: deal?.lead_id,
                deal_id: deal?.id,
                type: 'TASK',
                notes: `Task "${task.title}" marked as ${newStatus}`,
                date: new Date().toISOString()
            });
            showSuccess(`Task ${newStatus}`);
        } catch (error) {
            showError('Failed to update task');
        }
    };

    const handleInvoiceRequest = async () => {
        try {
            await crmService.requestInvoice(id);
            showSuccess('Invoice request sent to accounting team');
            await crmService.logActivity({
                lead_id: deal?.lead_id,
                deal_id: id,
                type: 'NOTE',
                notes: 'Requested invoice for deal from accounting',
                date: new Date().toISOString()
            });
        } catch (error: any) {
            if (error?.response?.status === 404 || error?.message?.includes('404')) {
                showError('Invoice request feature is not yet configured. Contact your administrator.');
            } else {
                showError('Failed to request invoice. Please try again later.');
            }
            console.warn('Invoice request failed:', error);
        }
    };

    const handleOpenProjectModal = async () => {
        setIsProjectModalOpen(true);
        setIsFetchingProjects(true);
        try {
            const projects = await crmService.getProjects();
            setAvailableProjects(projects);
        } catch (error) {
            showError('Failed to fetch available projects');
        } finally {
            setIsFetchingProjects(false);
        }
    };

    const handleCreateProject = async () => {
        try {
            const project = await crmService.createProjectFromDeal(id);
            showSuccess('Project created and linked successfully');
            await crmService.logActivity({
                lead_id: deal?.lead_id,
                deal_id: id,
                type: 'NOTE',
                notes: `System: Created new project from this deal (ID: ${project.id})`,
                date: new Date().toISOString()
            });
            setIsProjectModalOpen(false);
            fetchData();
        } catch (error: any) {
            showError('Failed to create project. Please ensure Projects service is reachable.');
            console.warn('Project creation failed:', error);
        }
    };

    const handleLinkExistingProject = async () => {
        if (!selectedProjectId) {
            showError('Please select a project to link');
            return;
        }
        try {
            await crmService.linkProject(id, selectedProjectId);
            showSuccess('Project linked successfully');
            await crmService.logActivity({
                lead_id: deal?.lead_id,
                deal_id: id,
                type: 'NOTE',
                notes: `System: Linked existing project (ID: ${selectedProjectId}) to this deal`,
                date: new Date().toISOString()
            });
            setIsProjectModalOpen(false);
            fetchData();
        } catch (error) {
            showError('Failed to link project');
        }
    };

    const handleUnlinkProject = async () => {
        if (!deal || !window.confirm('Are you sure you want to unlink this project?')) return;

        try {
            await crmService.unlinkProject(id);
            showSuccess('Project unlinked successfully');

            // Log activity
            await crmService.logActivity({
                lead_id: deal?.lead_id,
                deal_id: id,
                type: 'NOTE',
                notes: 'System: Unlinked project from deal',
                date: new Date().toISOString()
            });

            // Refresh deal data
            setProjectDetails(null);
            setIsProjectModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Failed to unlink project:', error);
            showError('Failed to unlink project. Please try again.');
        }
    };

    // Handle saving deal profile edits
    const handleSaveProfile = async () => {
        if (!deal) return;
        setIsSavingProfile(true);
        try {
            const updates: Partial<Deal> = {};
            if (editedValue !== null && editedValue !== deal.value) {
                updates.value = editedValue;
            }
            if (editedCloseDate !== null && editedCloseDate !== deal.expected_close_date) {
                updates.expected_close_date = editedCloseDate;
            }
            if (editedOwnerId !== null && editedOwnerId !== deal.owner.id) {
                updates.owner_id = editedOwnerId;
            }

            if (Object.keys(updates).length > 0) {
                await handleUpdateDeal(updates);
            }
            setIsEditingSummary(false);
            resetEditState();
        } catch (error) {
            showError('Failed to save profile changes');
        } finally {
            setIsSavingProfile(false);
        }
    };

    // Cancel editing and reset fields
    const handleCancelEdit = () => {
        setIsEditingSummary(false);
        resetEditState();
    };

    // Reset edit state to current deal values
    const resetEditState = () => {
        setEditedValue(null);
        setEditedCloseDate(null);
        setEditedOwnerId(null);
    };

    // Initialize edit state when entering edit mode
    const handleStartEditing = () => {
        if (deal) {
            setEditedValue(deal.value);
            setEditedCloseDate(deal.expected_close_date || '');
            setEditedOwnerId(deal.owner.id);
        }
        setIsEditingSummary(true);
    };

    const handleDeleteDeal = async () => {
        setIsDeleting(true);
        try {
            await crmService.deleteDeal(id);
            showSuccess('Deal deleted successfully');
            navigate('/crm/pipeline');
        } catch (error: any) {
            showError(error.message || 'Failed to delete deal');
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Initializing deal workspace...</span>
            </div>
        );
    }

    if (!deal) {
        return (
            <div className="p-8 text-center text-slate-500">
                <p>Deal not found.</p>
                <Link to=".." className="text-blue-500 hover:underline mt-4 inline-block">Back to Pipeline</Link>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            <header className="mb-8 overflow-hidden">
                <div className="flex justify-between items-start mb-4">
                    <Link to=".." className="flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors group">
                        <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                        Back to Pipeline
                    </Link>
                    {isRefreshing && (
                        <div className="flex items-center gap-1 text-[10px] font-black text-blue-400 uppercase tracking-widest animate-pulse">
                            <Loader2 size={10} className="animate-spin" /> Syncing...
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2 relative">
                            {isChangingStage ? (
                                <select
                                    value={deal.stage_id || deal.stage}
                                    onChange={async (e) => {
                                        await handleUpdateDeal({ stage_id: e.target.value });
                                        setIsChangingStage(false);
                                    }}
                                    onBlur={() => setIsChangingStage(false)}
                                    autoFocus
                                    className="bg-slate-900 border border-slate-700 text-xs font-black uppercase text-white rounded px-2 py-1 outline-none"
                                >
                                    {dealStages.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsChangingStage(true)}>
                                    <h1 className="text-4xl font-black text-white tracking-tight leading-tight">{deal.name}</h1>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border bg-blue-500/10 text-blue-400 border-blue-500/20 transition-all group-hover:scale-105">
                                        {deal.stage}
                                    </span>
                                    <Edit2 size={12} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                        <p className="text-slate-400 flex items-center gap-2 mt-1">
                            <span className="font-semibold text-white">{deal.company_name}</span>
                            {deal.expected_close_date && (
                                <>
                                    <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                    <span className="text-xs">Closing: {new Date(deal.expected_close_date).toLocaleDateString()}</span>
                                </>
                            )}
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-400 px-4 py-2.5 rounded-xl font-black text-[10px] transition-all flex items-center gap-2 uppercase tracking-widest border border-slate-700 hover:border-red-500/50"
                        >
                            <Trash2 size={14} /> Delete
                        </button>
                        {FEATURES.DEAL_INVOICE_REQUEST && (
                            <button
                                onClick={handleInvoiceRequest}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl font-black text-[10px] transition-all flex items-center gap-2 uppercase tracking-widest border border-slate-700"
                            >
                                <Receipt size={14} /> Request Invoice
                            </button>
                        )}
                        {FEATURES.DEAL_PROJECT_CREATION && (
                            <button
                                onClick={handleOpenProjectModal}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-black text-[10px] transition-all shadow-lg active:scale-95 flex items-center gap-2 uppercase tracking-widest border border-blue-400/20"
                            >
                                <Briefcase size={14} /> {deal.project_id ? 'Manage Project' : 'Link Project'}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Workspace Column */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Summary & Identity Dual-Tab */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex border-b border-slate-800 bg-slate-900/50">
                            <button className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-blue-400 border-b-2 border-blue-500 flex items-center gap-2">
                                <Plus size={14} /> Deal Profile
                            </button>
                            <div className="ml-auto flex items-center gap-2 px-6">
                                {isEditingSummary ? (
                                    <>
                                        <button
                                            onClick={handleCancelEdit}
                                            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
                                            title="Cancel"
                                        >
                                            <X size={16} />
                                        </button>
                                        <button
                                            onClick={handleSaveProfile}
                                            disabled={isSavingProfile}
                                            className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center gap-1"
                                            title="Save Changes"
                                        >
                                            {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={handleStartEditing}
                                        className="p-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-all"
                                        title="Edit Profile"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="p-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Financial Value</span>
                                    {isEditingSummary ? (
                                        <input
                                            type="number"
                                            value={editedValue ?? deal.value}
                                            onChange={(e) => setEditedValue(parseFloat(e.target.value) || 0)}
                                            className="bg-slate-950 border border-slate-800 text-emerald-400 font-black rounded px-2 py-1 w-full outline-none focus:border-emerald-500"
                                        />
                                    ) : (
                                        <p className="text-xl font-black text-emerald-400 flex items-center gap-1.5">
                                            <DollarSign size={18} />{deal.value.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Expected Close</span>
                                    {isEditingSummary ? (
                                        <input
                                            type="date"
                                            value={editedCloseDate ?? deal.expected_close_date ?? ''}
                                            onChange={(e) => setEditedCloseDate(e.target.value)}
                                            className="bg-slate-950 border border-slate-800 text-white font-bold rounded px-2 py-1 w-full outline-none focus:border-blue-500"
                                        />
                                    ) : (
                                        <p className="text-sm font-bold text-white flex items-center gap-1.5">
                                            <Calendar size={16} />{deal.expected_close_date || '—'}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Deal Owner</span>
                                    {isEditingSummary ? (
                                        <select
                                            value={editedOwnerId ?? deal.owner.id}
                                            onChange={(e) => setEditedOwnerId(e.target.value)}
                                            className="bg-slate-950 border border-slate-800 text-white font-bold rounded px-2 py-1 w-full outline-none focus:border-blue-500"
                                        >
                                            {allUsers.map(u => (
                                                <option key={u.id} value={u.id}>{u.full_name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold overflow-hidden border border-slate-700">
                                                {deal.owner.avatar_url ? <img src={deal.owner.avatar_url} alt={deal.owner.full_name} /> : deal.owner.full_name.charAt(0)}
                                            </div>
                                            <span className="text-sm font-bold text-slate-200">{deal.owner.full_name}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Activity</span>
                                    <p className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
                                        <Clock size={16} className="text-slate-500" />
                                        {deal.last_activity_at ? new Date(deal.last_activity_at).toLocaleDateString() : 'None'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Navigation Tabs */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                        <div className="flex border-b border-slate-800 bg-slate-900/50">
                            {[
                                { id: 'activity', name: 'Activity', icon: MessageSquare },
                                { id: 'notes', name: 'Notes', icon: FileText },
                                { id: 'tasks', name: `Tasks (${tasks.length})`, icon: CheckCircle2 },
                                { id: 'documents', name: `Docs (${deal.documents?.length || 0})`, icon: FileIcon },
                                { id: 'custom', name: 'Additional Info', icon: Tag }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    <tab.icon size={14} /> {tab.name}
                                </button>
                            ))}
                        </div>

                        <div className="p-8">
                            {/* ACTIVITY TAB */}
                            {activeTab === 'activity' && (
                                <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
                                    {getAggregatedTimeline().length === 0 ? (
                                        <div className="text-center py-12 ml-6">
                                            <MessageSquare size={48} className="mx-auto mb-4 text-slate-700 opacity-30" />
                                            <p className="text-slate-400 font-semibold mb-2">No activity history yet</p>
                                            <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                                                Activities like calls, meetings, and emails will appear here as you interact with this deal.
                                            </p>
                                        </div>
                                    ) : (
                                        getAggregatedTimeline().map((ev) => (
                                            <div key={ev.id} className="relative pl-10">
                                                <div className="absolute left-0 top-1.5 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center z-10">
                                                    {(ev.type === 'Activity' && ev.subType === 'CALL') && <Phone size={14} className="text-blue-400" />}
                                                    {(ev.type === 'Activity' && ev.subType === 'MEETING') && <Users size={14} className="text-purple-400" />}
                                                    {(ev.type === 'Activity' && ev.subType === 'EMAIL') && <AtSign size={14} className="text-emerald-400" />}
                                                    {ev.type === 'NOTE' && <FileText size={14} className="text-amber-400" />}
                                                    {ev.type === 'TASK' && <CheckCircle2 size={14} className="text-indigo-400" />}
                                                    {ev.type === 'DOCUMENT' && <UploadCloud size={14} className="text-sky-400" />}
                                                    {['STATUS_CHANGE', 'STAGE_CHANGE', 'OWNER_CHANGE', 'PROFILE_UPDATE'].includes(ev.type) && <Zap size={14} className="text-yellow-400" />}
                                                </div>
                                                <div className="bg-slate-950/50 border border-slate-800/40 p-4 rounded-xl group hover:border-slate-700 transition-all">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="font-black text-white text-[10px] uppercase tracking-widest">
                                                            {ev.title}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {ev.type === 'Activity' && (
                                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                                    <button
                                                                        onClick={async () => {
                                                                            const newNotes = prompt('Edit activity notes:', ev.description);
                                                                            if (newNotes !== null) {
                                                                                await activitiesApi.update(ev.id, { notes: newNotes });
                                                                                fetchData();
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
                                                                                await activitiesApi.delete(ev.id);
                                                                                fetchData();
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
                                                                {new Date(ev.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <p className="text-slate-400 text-sm leading-relaxed">{ev.description}</p>
                                                    {ev.author && (
                                                        <div className="mt-4 flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black overflow-hidden border border-slate-700">
                                                                {ev.author.avatar_url ? <img src={ev.author.avatar_url} /> : ev.author.full_name?.charAt(0)}
                                                            </div>
                                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{ev.author.full_name}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* NOTES TAB */}
                            {activeTab === 'notes' && (
                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        {deal.notes.map(note => (
                                            <div key={note.id} className="text-sm border-l-2 border-amber-500/30 pl-4 py-1 group relative">
                                                <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                    <button
                                                        onClick={async () => {
                                                            const content = prompt('Edit note:', note.content);
                                                            if (content) {
                                                                await crmService.updateNote(note.id, content);
                                                                fetchData();
                                                            }
                                                        }}
                                                        className="text-slate-500 hover:text-blue-400"
                                                    ><Edit2 size={12} /></button>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete note?')) {
                                                                await crmService.deleteNote(note.id);
                                                                fetchData();
                                                            }
                                                        }}
                                                        className="text-slate-500 hover:text-rose-400"
                                                    ><Trash2 size={12} /></button>
                                                </div>
                                                <p className="text-slate-300 leading-relaxed mb-2 pr-12">{note.content}</p>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{note.author.full_name}</span>
                                                    <span className="text-[10px] text-slate-600 font-bold">{new Date(note.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                                        <textarea
                                            placeholder="Capture commercial context..."
                                            value={newNoteContent}
                                            onChange={(e) => setNewNoteContent(e.target.value)}
                                            className="w-full bg-transparent border-none p-0 text-sm font-medium text-white focus:ring-0 resize-none h-24 mb-3"
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                onClick={async () => {
                                                    await crmService.createNote({ deal_id: id, content: newNoteContent });
                                                    setNewNoteContent('');
                                                    fetchData();
                                                }}
                                                className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest"
                                            >Save Note</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TASKS TAB */}
                            {activeTab === 'tasks' && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-6">
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Planned actions</h4>
                                        <button onClick={() => setIsCreatingTask(true)} className="text-[10px] font-black text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest flex items-center gap-1.5">
                                            <Plus size={12} /> Add Task
                                        </button>
                                    </div>
                                    <div className="grid gap-3">
                                        {tasks.length === 0 ? (
                                            <div className="text-center py-10 text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                                                <CheckCircle2 size={32} className="mx-auto mb-3 opacity-20" />
                                                <p className="text-sm font-medium uppercase tracking-tight">Zero pending actions</p>
                                            </div>
                                        ) : (
                                            tasks.map(task => (
                                                <div key={task.id} className={`flex items-start gap-4 p-4 bg-slate-950 border rounded-xl group relative transition-all ${task.status === 'Done' ? 'border-emerald-500/10 opacity-60' : 'border-slate-800 hover:border-blue-500/50'}`}>
                                                    <button
                                                        onClick={() => handleTaskToggle(task)}
                                                        className={`mt-1 w-5 h-5 rounded border transition-colors flex items-center justify-center ${task.status === 'Done' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'border-slate-700'}`}
                                                    >
                                                        {task.status === 'Done' && <CheckCircle2 size={12} />}
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between">
                                                            <h4 className={`text-sm font-bold text-white truncate ${task.status === 'Done' ? 'line-through text-slate-500' : ''}`}>
                                                                {task.title}
                                                            </h4>
                                                        </div>
                                                        <div className="flex items-center gap-4 mt-3 text-[10px] font-black text-slate-500 uppercase tracking-widest pt-2 border-t border-slate-800/50">
                                                            <span className="flex items-center gap-1 text-rose-400/70">
                                                                <Clock size={10} /> Due {new Date(task.due_date).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                                                        <button onClick={() => setEditingTask(task)} className="p-1 hover:text-blue-400"><Edit2 size={14} /></button>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete task?')) {
                                                                    await tasksApi.delete(task.id);
                                                                    fetchData();
                                                                }
                                                            }}
                                                            className="p-1 hover:text-rose-400"
                                                        ><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* DOCUMENTS TAB */}
                            {activeTab === 'documents' && (
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Attachments & Contracts</p>
                                        <label className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${isUploading ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg active:scale-95'}`}>
                                            {isUploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                                            {isUploading ? 'Uploading...' : 'Upload File'}
                                            <input type="file" className="hidden" disabled={isUploading} onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setIsUploading(true);
                                                    try {
                                                        await crmService.uploadDocument({ dealId: id }, file);
                                                        fetchData();
                                                    } finally { setIsUploading(false); }
                                                }
                                            }} />
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {(deal.documents || []).map(doc => (
                                            <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-xl group hover:border-slate-700">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-slate-800 p-2 rounded-lg text-blue-400"><FileIcon size={20} /></div>
                                                    <div>
                                                        <p className="text-sm font-bold text-white truncate max-w-[150px]">{doc.name}</p>
                                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{(doc.size / 1024).toFixed(1)} KB</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <a href={doc.url} download className="p-2 text-slate-500 hover:text-white transition-colors"><Download size={16} /></a>
                                                    <button
                                                        onClick={async () => {
                                                            if (confirm('Delete file?')) {
                                                                await crmService.deleteDocument(id, doc.id);
                                                                fetchData();
                                                            }
                                                        }}
                                                        className="p-2 text-slate-500 hover:text-rose-400 transition-colors"
                                                    ><Trash2 size={16} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* CUSTOM FIELDS TAB */}
                            {activeTab === 'custom' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10">
                                    {customFieldDefs.length === 0 ? (
                                        <p className="text-slate-500 italic text-sm col-span-2">No additional fields configured in Deals settings.</p>
                                    ) : (
                                        customFieldDefs.map(field => (
                                            <div key={field.id} className="flex flex-col gap-1.5">
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{field.label}</span>
                                                <p className="text-sm font-bold text-white border-l-2 border-slate-800 pl-3 py-1">
                                                    {field.type === 'boolean'
                                                        ? (deal.custom_fields?.[field.id] ? 'Yes' : 'No')
                                                        : field.type === 'date' && deal.custom_fields?.[field.id]
                                                            ? new Date(deal.custom_fields[field.id]).toLocaleDateString()
                                                            : deal.custom_fields?.[field.id] || '—'}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar Context */}
                <div className="space-y-8">
                    {/* Contact Details Card */}
                    {associatedLead && (
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors" />
                            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                                <Users size={14} className="text-blue-400" /> Primary Contact
                            </h3>
                            <div className="space-y-6">
                                <Link to={`/crm/leads/${associatedLead.id}`} className="group/link block">
                                    <h4 className="text-lg font-black text-white group-hover/link:text-blue-400 transition-colors">{associatedLead.contact_name}</h4>
                                    <p className="text-xs font-bold text-slate-400 flex items-center gap-1">
                                        <Building2 size={12} /> {associatedLead.company_name}
                                    </p>
                                </Link>
                                <div className="space-y-3 pt-4 border-t border-slate-800/50">
                                    <a href={`mailto:${associatedLead.contact_email}`} className="flex items-center gap-3 text-xs font-bold text-slate-300 hover:text-white transition-colors">
                                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center"><Mail size={14} /></div>
                                        {associatedLead.contact_email}
                                    </a>
                                    {associatedLead.phone && (
                                        <a href={`tel:${associatedLead.phone}`} className="flex items-center gap-3 text-xs font-bold text-slate-300 hover:text-white transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center"><Phone size={14} /></div>
                                            {associatedLead.phone}
                                        </a>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Stats & Metadata */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                            System Intelligence
                        </h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-2 border-b border-slate-800/50">
                                <span className="text-[10px] font-black text-slate-500 uppercase">Created On</span>
                                <span className="text-[10px] font-bold text-slate-300">{new Date(deal.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase">Last Sync</span>
                                <span className="text-[10px] font-bold text-slate-300">Just now</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* PROJECT LINKING MODAL */}
            {isProjectModalOpen && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <h3 className="text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
                                <Briefcase size={16} className="text-blue-400" />
                                Project Management
                            </h3>
                            <button onClick={() => setIsProjectModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-8">
                            {/* CREATE OPTION */}
                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 space-y-4 hover:border-blue-500/30 transition-colors group cursor-pointer" onClick={handleCreateProject}>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h4 className="text-slate-200 font-bold text-sm mb-1 group-hover:text-blue-400 transition-colors">Create New Project</h4>
                                        <p className="text-slate-500 text-[10px] leading-relaxed max-w-[200px]">
                                            Spawn a project in the Projects module using this deal's value and client info.
                                        </p>
                                    </div>
                                    <div className="bg-blue-600 group-hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-lg">
                                        Execute
                                    </div>
                                </div>
                            </div>

                            <div className="relative flex items-center gap-4">
                                <div className="flex-1 h-px bg-slate-800"></div>
                                <span className="text-[9px] font-black text-slate-700 uppercase tracking-widest">OR</span>
                                <div className="flex-1 h-px bg-slate-800"></div>
                            </div>

                            {/* LINK OPTION */}
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-slate-200 font-bold text-sm mb-1">Link Existing Project</h4>
                                    <p className="text-slate-500 text-[10px]">Reference a project already existing in the system.</p>
                                </div>

                                <div className="space-y-3">
                                    {isFetchingProjects ? (
                                        <div className="flex items-center gap-2 text-slate-500 text-[10px] py-2">
                                            <Loader2 size={12} className="animate-spin" /> Fetching list...
                                        </div>
                                    ) : (
                                        <>
                                            <select
                                                value={selectedProjectId}
                                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 outline-none focus:border-blue-500 appearance-none"
                                            >
                                                <option value="">Select current project...</option>
                                                {availableProjects.map(proj => (
                                                    <option key={proj.id} value={proj.id}>
                                                        {proj.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleLinkExistingProject}
                                                disabled={!selectedProjectId}
                                                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700"
                                            >
                                                Confirm Link
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {projectDetails && (
                            <div className="p-4 bg-blue-500/5 border-t border-slate-800">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                        Linked Project
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                        projectDetails.status === 'COMPLETED'
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-blue-500/10 text-blue-400'
                                    }`}>
                                        {projectDetails.status}
                                    </span>
                                </div>
                                <h4 className="text-sm font-bold text-white mb-2">{projectDetails.title}</h4>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-slate-400">
                                        Budget: ${projectDetails.budget_total?.toLocaleString() || 0}
                                    </span>
                                    {projectDetails.completion_percentage > 0 && (
                                        <span className="text-slate-400">
                                            {projectDetails.completion_percentage}% Complete
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <a
                                        href={`/projects/${projectDetails.id}`}
                                        className="flex-1 text-center py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all"
                                    >
                                        View Project Details →
                                    </a>
                                    <button
                                        onClick={handleUnlinkProject}
                                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg font-bold text-xs border border-slate-700"
                                    >
                                        Unlink
                                    </button>
                                </div>
                            </div>
                        )}

                        {!projectDetails && deal.project_id && (
                            <div className="p-4 bg-slate-800/50 border-t border-slate-800 text-center">
                                <span className="text-slate-500 text-xs">
                                    Project ID: {deal.project_id}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modals */}
            {(isCreatingTask || editingTask) && (
                <TaskModal
                    task={editingTask}
                    dealId={id}
                    onClose={() => { setIsCreatingTask(false); setEditingTask(null); }}
                    onSuccess={() => { fetchData(); showSuccess('Timeline updated'); }}
                />
            )}

            {/* Delete Deal Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-slate-100 mb-2">Delete Deal</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this deal? This will remove all associated notes, activities, tasks, and documents. This action cannot be undone.
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
                                onClick={handleDeleteDeal}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isDeleting && <Loader2 size={16} className="animate-spin" />}
                                Delete Deal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </div>
    );
};

// Internal Mini Icon for Sidebar
const Building2 = ({ size }: { size: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="10" width="20" height="12" rx="2" /><path d="M7 22V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" /><path d="M10 8h4" /><path d="M10 12h4" /><path d="M10 16h4" /></svg>;
const Mail = ({ size }: { size: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>;

export default DealDetailPage;
