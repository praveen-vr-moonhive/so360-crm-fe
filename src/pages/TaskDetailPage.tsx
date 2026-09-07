import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    CheckCircle2, Circle, Calendar,
    User as UserIcon, Briefcase, Clock, AlertCircle, Trash2, Edit2,
    Link2, Unlink, RefreshCw
} from 'lucide-react';
import { crmService } from '../services/crmService';
import { Task } from '../types/crm';
import { Loader2 } from 'lucide-react';
import TaskModal from './components/TaskModal';
import { RescheduleModal } from './components/RescheduleModal';
import { ShellContext, useActivity, useShellBridge } from '@so360/shell-context';
import { toast, getErrorMessage, CrossLinkChip } from '@so360/design-system';
import DetailBackLink from '../components/common/DetailBackLink';
import { useCRMFormatters } from '../utils/formatters';
import { isTaskLocked, canRescheduleTask, canEditTask, isTaskOverdue, TASK_LOCKED_HINT } from '../utils/taskUtils';
import { dueDateCalendarDay, hasTimeComponent } from '../utils/datetime';

const TaskDetailPage = () => {
    const { id = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const formatters = useCRMFormatters();
    const shell = useContext(ShellContext) as any;
    const currentUserId = shell?.user?.id;
    const { recordActivity } = useActivity();
    const shellBridge = useShellBridge();
    const canCreateTask = (shellBridge?.permissionsLoaded === true) && (shellBridge?.hasPermission?.('activities.create') ?? false) && (shellBridge?.effectiveFlagsLoaded !== false) && (shellBridge?.isFeatureEnabled?.('action:crm:tasks:create') ?? true);
    const [task, setTask] = useState<Task | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingTask, setIsEditingTask] = useState(false);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [notes, setNotes] = useState<any[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [notesError, setNotesError] = useState<string | null>(null);
    const [isRetryingNotes, setIsRetryingNotes] = useState(false);
    const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<{ id: string; content: string } | null>(null);
    const [isRetryingSync, setIsRetryingSync] = useState(false);
    const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
    const [disconnectMode, setDisconnectMode] = useState<'remove_project_task' | 'keep_but_disconnect'>('keep_but_disconnect');
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    const refreshNotes = async (taskId: string) => {
        try {
            const notesData = await crmService.getTaskNotes(taskId);
            setNotes(notesData || []);
            setNotesError(null);
            return true;
        } catch (error) {
            console.error('Failed to fetch task notes:', error);
            setNotesError('Unable to load notes right now. Please try again.');
            return false;
        }
    };

    useEffect(() => {
        const fetchTask = async () => {
            try {
                // Load users first (populates cache for note author enrichment)
                await crmService.getUsers().catch(err => {
                    console.warn('Failed to load users for enrichment:', err);
                });

                // Fetch task data (required)
                const taskData = await crmService.getTaskById(id);
                setTask(taskData || null);

                // Fetch notes data (independent of task load — a notes failure
                // must never block the task itself from rendering)
                await refreshNotes(id);
            } catch (error) {
                console.error('Failed to fetch task', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTask();
    }, [id]);

    const handleRetryNotes = async () => {
        if (!task) return;
        setIsRetryingNotes(true);
        await refreshNotes(task.id);
        setIsRetryingNotes(false);
    };

    const handleTaskToggle = async () => {
        if (!task) return;
        const newStatus = task.status === 'DONE' ? 'OPEN' : 'DONE';
        try {
            // Optimistic update
            setTask({ ...task, status: newStatus });
            // Action availability must update immediately: close any editing
            // surface that is no longer valid for a completed task.
            if (isTaskLocked(newStatus)) {
                setIsRescheduling(false);
                setIsEditingTask(false);
            }

            await crmService.updateTask(task.id, { status: newStatus });
            if (newStatus === 'DONE') {
                recordActivity({ eventType: 'task.completed', eventCategory: 'crm', description: `Completed task "${task.title}"`, resourceType: 'task', resourceId: task.id }).catch(() => {});
            } else {
                recordActivity({ eventType: 'task.updated', eventCategory: 'crm', description: `Reopened task "${task.title}"`, resourceType: 'task', resourceId: task.id }).catch(() => {});
            }
        } catch (error) {
            console.error('Failed to toggle task status:', error);
            // Revert
            setTask({ ...task, status: task.status });
        }
    };

    const handleTaskUpdate = async () => {
        setIsEditingTask(false);
        // Refresh task data
        const data = await crmService.getTaskById(id);
        setTask(data || null);
    };

    const handleReschedule = async (date: string) => {
        if (!task) return;
        if (!canRescheduleTask(task.status)) {
            toast.warning(TASK_LOCKED_HINT);
            setIsRescheduling(false);
            return;
        }
        try {
            await crmService.updateTask(task.id, { due_date: date });
            setTask({ ...task, due_date: date });
            setIsRescheduling(false);
            recordActivity({ eventType: 'task.rescheduled', eventCategory: 'crm', description: `Rescheduled task "${task.title}" to ${formatters.formatDate(date)}`, resourceType: 'task', resourceId: task.id }).catch(() => {});
        } catch (error) {
            console.error('Failed to reschedule task:', error);
        }
    };

    const handleDelete = async () => {
        if (!task) return;
        try {
            await crmService.deleteTask(task.id);
            navigate('/crm/tasks');
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    };

    const handleRetrySync = async () => {
        if (!task) return;
        setIsRetryingSync(true);
        try {
            const updated = await crmService.retryTaskProjectSync(task.id);
            setTask(updated || task);
            toast.success('Project sync retried.');
        } catch (error) {
            console.error('Failed to retry project sync:', error);
            toast.error(getErrorMessage(error, 'Failed to retry sync. Please try again.'));
        } finally {
            setIsRetryingSync(false);
        }
    };

    const handleDisconnect = async () => {
        if (!task) return;
        setIsDisconnecting(true);
        try {
            const updated = await crmService.disconnectTaskFromProject(task.id, disconnectMode);
            setTask(updated || { ...task, sync_status: 'disconnected' });
            setShowDisconnectConfirm(false);
            toast.success('Task disconnected from Project.');
        } catch (error) {
            console.error('Failed to disconnect task from project:', error);
            toast.error(getErrorMessage(error, 'Failed to disconnect from Project. Please try again.'));
        } finally {
            setIsDisconnecting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Loading task details...</span>
            </div>
        );
    }

    if (!task) {
        return (
            <div className="p-8 text-center text-slate-500">
                <p>Task not found.</p>
                <button onClick={() => navigate('/crm/tasks')} className="text-blue-500 hover:underline mt-4 inline-block">Back to Tasks</button>
            </div>
        );
    }

    const isOverdue = isTaskOverdue(task);
    const isLocked = isTaskLocked(task.status);
    const canEdit = canEditTask(task.status);
    const canReschedule = canRescheduleTask(task.status);

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <header className="mb-8">
                <DetailBackLink fallbackTo="/crm/tasks" className="mb-4" />
                <div className="flex justify-between items-start">
                    <div className="flex items-start gap-4">
                        <button className="mt-1 text-slate-500 hover:text-blue-400 transition-colors">
                            {task.status === 'DONE' ? <CheckCircle2 size={32} className="text-emerald-500" /> : <Circle size={32} />}
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className={`text-4xl font-black tracking-tight ${task.status === 'DONE' ? 'text-slate-500 line-through' : 'text-slate-50'}`}>
                                    {task.title}
                                </h1>
                                {/* Task-level actions are grouped together so users find
                                    them in a single place instead of scanning the page. */}
                                <div className="flex items-center gap-1" data-testid="task-actions">
                                    <button
                                        onClick={() => canEdit && setIsEditingTask(true)}
                                        disabled={!canEdit}
                                        aria-label="Edit Task"
                                        title={canEdit ? 'Edit Task' : TASK_LOCKED_HINT}
                                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-500 disabled:hover:bg-transparent"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    {canCreateTask && (
                                        <button
                                            onClick={() => setShowDeleteConfirm(true)}
                                            aria-label="Delete Task"
                                            title="Delete Task"
                                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${task.status === 'DONE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : task.status === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : task.status === 'ON_HOLD' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : task.status === 'CANCELLED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
                                    }`}>
                                    {task.status}
                                </span>
                                {isOverdue && (
                                    <span className="flex items-center gap-1 text-rose-400 text-[10px] font-black uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                                        <AlertCircle size={12} /> Overdue
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-800 pb-2">Related Information</h3>
                        <div className="space-y-6">
                            {(task.deal_name || task.deal_id) && (
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-blue-400 shrink-0">
                                        <Briefcase size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Associated Deal</span>
                                        <Link to={`/deals/${task.deal_id}`} className="text-lg font-bold text-slate-50 hover:text-blue-400 transition-colors truncate block">
                                            {task.deal_name || 'View Deal'}
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {(task.lead_id) && !task.deal_id && (
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-blue-400 shrink-0">
                                        <UserIcon size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Related Lead</span>
                                        <Link to={`/crm/leads/${task.lead_id}`} className="text-lg font-bold text-slate-50 hover:text-blue-400 transition-colors truncate block">
                                            View Lead
                                        </Link>
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-amber-400 shrink-0">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Due Date</span>
                                    <p className={`text-lg font-bold ${isOverdue ? 'text-rose-400' : 'text-slate-50'}`}>
                                        {formatters.formatDate(dueDateCalendarDay(task.due_date), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                        {/* The time appears only when the user chose one. */}
                                        {hasTimeComponent(task.due_date) && (
                                            <span className="ml-2 text-slate-400">{formatters.formatDate(task.due_date, { hour: 'numeric', minute: '2-digit' })}</span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* Project connection status. `sync_status` is only present
                                once the task has (or once had) a Project connection —
                                absent/undefined means unaffected behavior, no UI at all. */}
                            {task.sync_status === 'connected' && (
                                <div className="flex items-center gap-4" data-testid="project-sync-connected">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                                        <Link2 size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Connected to Project</span>
                                        <div className="flex items-center gap-3 flex-wrap">
                                            {task.project_id && <CrossLinkChip type="projects.project" id={task.project_id} />}
                                            {task.last_synced_at && (
                                                <span className="text-xs text-slate-500">
                                                    Last synced {formatters.formatDate(task.last_synced_at, { hour: 'numeric', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setDisconnectMode('keep_but_disconnect'); setShowDisconnectConfirm(true); }}
                                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-all shrink-0"
                                        aria-label="Disconnect from Project"
                                        title="Disconnect from Project"
                                    >
                                        <Unlink size={16} />
                                    </button>
                                </div>
                            )}

                            {task.sync_status === 'sync_failed' && (
                                <div className="flex items-center gap-4" data-testid="project-sync-failed">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 shrink-0">
                                        <AlertCircle size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <span className="text-[10px] font-bold text-rose-400 uppercase block mb-1">Sync Failed</span>
                                        <span className="text-sm text-slate-400">This task couldn't be synchronized with its Project.</span>
                                    </div>
                                    <button
                                        onClick={handleRetrySync}
                                        disabled={isRetryingSync}
                                        className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-widest bg-blue-600/10 border border-blue-600/20 rounded-lg text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-50 shrink-0"
                                    >
                                        {isRetryingSync ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                        Retry Sync
                                    </button>
                                </div>
                            )}

                            {task.sync_status === 'disconnected' && (
                                <p className="text-xs text-slate-600 italic" data-testid="project-sync-disconnected">
                                    Previously connected to a Project.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Description</h3>
                        <p className={`text-slate-300 leading-relaxed ${!task.description ? 'italic' : ''}`}>
                            {task.description || 'No additional description provided for this task.'}
                        </p>
                    </section>

                    {/* Notes & Comments Section */}
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest">Notes & Comments</h3>
                            {/* Only one Cancel exists in this section — inside the editor.
                                The header keeps a single "open editor" affordance. */}
                            {canCreateTask && !notesError && !isAddingNote && (
                                <button
                                    onClick={() => setIsAddingNote(true)}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                                >
                                    + Add Note
                                </button>
                            )}
                        </div>

                        {notesError && (
                            <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 mb-4 flex items-center justify-between gap-3">
                                <p className="text-xs text-slate-400">{notesError}</p>
                                <button
                                    onClick={handleRetryNotes}
                                    disabled={isRetryingNotes}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-bold shrink-0 disabled:opacity-50"
                                >
                                    {isRetryingNotes ? 'Retrying…' : 'Retry'}
                                </button>
                            </div>
                        )}

                        {/* Collapsed state: a compact input that expands into the full
                            editor on click, so the section stays quiet when idle. */}
                        {canCreateTask && !notesError && !isAddingNote && (
                            <button
                                type="button"
                                onClick={() => setIsAddingNote(true)}
                                data-testid="note-composer-trigger"
                                className="w-full text-left bg-slate-950 border border-slate-800 hover:border-blue-500/50 text-slate-500 rounded-lg px-4 py-2.5 text-sm mb-4 transition-colors"
                            >
                                Add a note or comment...
                            </button>
                        )}

                        {isAddingNote && (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
                                <textarea
                                    autoFocus
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder="Add a note or comment..."
                                    className="w-full bg-slate-950 border border-slate-800 text-slate-50 rounded-lg px-4 py-3 outline-none focus:border-blue-500 resize-none h-24"
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button
                                        onClick={() => { setNewNote(''); setIsAddingNote(false); }}
                                        className="px-4 py-2 text-slate-400 hover:text-slate-50 text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!task || !newNote.trim()) return;
                                            try {
                                                await crmService.createNote({ content: newNote, task_id: task.id });
                                                await refreshNotes(task.id);
                                                setNewNote('');
                                                setIsAddingNote(false);
                                                recordActivity({ eventType: 'note.added', eventCategory: 'crm', description: `Added a note on task "${task.title}"`, resourceType: 'task', resourceId: task.id }).catch(() => {});
                                            } catch (error) {
                                                console.error('Failed to create note:', error);
                                                toast.error(getErrorMessage(error, 'Failed to add note. Please try again.'));
                                            }
                                        }}
                                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm"
                                    >
                                        Add Note
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {notes.length === 0 ? (
                                !notesError && (
                                    <p className="text-slate-500 text-sm italic">
                                        No notes added yet. Add the first note to collaborate with your team.
                                    </p>
                                )
                            ) : (
                                notes.map(note => {
                                    const isAuthor = currentUserId && note.author?.id === currentUserId;
                                    const isEdited = !!note.updated_at && note.updated_at !== note.created_at;

                                    return (
                                        <div key={note.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 group">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center overflow-hidden">
                                                        {note.author?.avatar_url ? (
                                                            <img src={note.author.avatar_url} alt={note.author?.full_name || 'User'} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-xs font-bold text-blue-400">
                                                                {note.author?.full_name?.[0] || 'U'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-sm font-medium text-slate-300">
                                                        {note.author?.full_name || 'Unknown User'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-slate-500">
                                                        {formatters.formatDate(note.created_at)}
                                                        {isEdited && <span className="italic"> · Edited</span>}
                                                    </span>
                                                    {isAuthor && (
                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => setEditingNote({ id: note.id, content: note.content })}
                                                                className="text-slate-500 hover:text-blue-400 p-1 transition-colors"
                                                                title="Edit note"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteNoteId(note.id)}
                                                                className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                                                title="Delete note"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.content}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>

                <div className="space-y-8">
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Assignee</h3>
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-slate-700">
                                {task.assigned_to.avatar_url ? <img src={task.assigned_to.avatar_url} alt={task.assigned_to.full_name} /> : task.assigned_to.full_name.charAt(0)}
                            </div>
                            <div>
                                <p className="font-bold text-slate-50">{task.assigned_to.full_name}</p>
                                <p className="text-xs text-slate-500">Sales Representative</p>
                            </div>
                        </div>
                    </section>

                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Task Actions</h3>
                        <div className="space-y-2">
                            <button
                                onClick={handleTaskToggle}
                                className={`w-full py-2 rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 text-white ${task.status === 'DONE' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'}`}
                            >
                                {task.status === 'DONE' ? 'Mark as Open' : 'Mark as Complete'}
                            </button>
                            <button
                                onClick={() => canReschedule && setIsRescheduling(true)}
                                disabled={!canReschedule}
                                title={canReschedule ? 'Reschedule this task' : TASK_LOCKED_HINT}
                                className="w-full bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 py-2 rounded-lg text-xs font-bold transition-all border border-slate-600/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-700/60"
                            >
                                Reschedule
                            </button>
                            {isLocked && (
                                <p className="text-[10px] text-slate-500 leading-snug pt-1" data-testid="task-locked-hint">
                                    {TASK_LOCKED_HINT}
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Task Edit Modal */}
            {isEditingTask && (
                <TaskModal
                    task={task}
                    leadId={task?.lead_id}
                    dealId={task?.deal_id}
                    onClose={() => setIsEditingTask(false)}
                    onSuccess={(updatedTask) => {
                        setTask(updatedTask);
                        setIsEditingTask(false);
                    }}
                />
            )}

            {/* Reschedule Modal */}
            {isRescheduling && task && (
                <RescheduleModal
                    currentDate={task.due_date}
                    onClose={() => setIsRescheduling(false)}
                    onConfirm={async (newDate) => {
                        await handleReschedule(newDate);
                        setIsRescheduling(false);
                    }}
                />
            )}

            {/* Edit Note Modal */}
            {editingNote && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[600]">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                                <Edit2 className="text-blue-400" size={20} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-50 mb-1">Edit Note</h3>
                                <p className="text-sm text-slate-400">
                                    Update your note content below.
                                </p>
                            </div>
                        </div>
                        <textarea
                            value={editingNote.content}
                            onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 text-slate-50 rounded-lg px-4 py-3 outline-none focus:border-blue-500 resize-none h-32 mb-4"
                            placeholder="Note content..."
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setEditingNote(null)}
                                className="px-4 py-2 bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 rounded-lg font-bold text-sm transition-all border border-slate-600/50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!editingNote.content.trim()) {
                                        toast.warning('Note content cannot be empty.');
                                        return;
                                    }
                                    try {
                                        await crmService.updateNote(editingNote.id, editingNote.content);
                                        await refreshNotes(task.id);
                                        setEditingNote(null);
                                        recordActivity({ eventType: 'note.updated', eventCategory: 'crm', description: `Edited a note on task "${task.title}"`, resourceType: 'task', resourceId: task.id }).catch(() => {});
                                    } catch (error) {
                                        console.error('Failed to update note:', error);
                                        toast.error(getErrorMessage(error, 'Failed to update note. Please try again.'));
                                    }
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Note Confirmation Modal */}
            {deleteNoteId && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[600]">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                                <Trash2 className="text-rose-400" size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-50 mb-1">Delete Note</h3>
                                <p className="text-sm text-slate-400">
                                    Are you sure you want to delete this note? This action cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteNoteId(null)}
                                className="px-4 py-2 bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 rounded-lg font-bold text-sm transition-all border border-slate-600/50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await crmService.deleteNote(deleteNoteId);
                                        await refreshNotes(task.id);
                                        setDeleteNoteId(null);
                                        recordActivity({ eventType: 'note.deleted', eventCategory: 'crm', description: `Deleted a note on task "${task.title}"`, resourceType: 'task', resourceId: task.id }).catch(() => {});
                                    } catch (error) {
                                        console.error('Failed to delete note:', error);
                                        toast.error(getErrorMessage(error, 'Failed to delete note. Please try again.'));
                                    }
                                }}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-rose-500/20 active:scale-95"
                            >
                                Delete Note
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Disconnect from Project Confirmation Modal */}
            {showDisconnectConfirm && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[600]">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                                <Unlink className="text-rose-400" size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-50 mb-1">Disconnect from Project</h3>
                                <p className="text-sm text-slate-400">
                                    Choose what happens to the linked Project task.
                                </p>
                            </div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer">
                                <input
                                    type="radio"
                                    name="disconnect-mode"
                                    checked={disconnectMode === 'keep_but_disconnect'}
                                    onChange={() => setDisconnectMode('keep_but_disconnect')}
                                    className="mt-1"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-slate-200">Keep Project task, just disconnect</span>
                                    <span className="block text-xs text-slate-500">The Project task stays as-is; this CRM task stops syncing with it.</span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 hover:border-slate-700 cursor-pointer">
                                <input
                                    type="radio"
                                    name="disconnect-mode"
                                    checked={disconnectMode === 'remove_project_task'}
                                    onChange={() => setDisconnectMode('remove_project_task')}
                                    className="mt-1"
                                />
                                <span>
                                    <span className="block text-sm font-bold text-slate-200">Remove the Project task too</span>
                                    <span className="block text-xs text-slate-500">Deletes the connected task on the Project side as well.</span>
                                </span>
                            </label>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDisconnectConfirm(false)}
                                disabled={isDisconnecting}
                                className="px-4 py-2 bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 rounded-lg font-bold text-sm transition-all border border-slate-600/50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisconnect}
                                disabled={isDisconnecting}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-rose-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDisconnecting && <Loader2 size={12} className="animate-spin" />}
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && createPortal(
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-50 mb-2">Delete Task</h3>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this task? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-slate-400 hover:text-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default TaskDetailPage;
