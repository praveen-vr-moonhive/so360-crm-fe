import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Clock, CheckCircle2, User as UserIcon, UserPlus, ChevronDown, Link2 } from 'lucide-react';
import { crmService } from '../../services/crmService';
import { composeDueDate, dueDateCalendarDay, inputValueToApiValue, splitStoredDueDate } from '../../utils/datetime';
import { Task, TaskType, TaskPriority, TASK_PRIORITY_OPTIONS, User, Lead, Deal } from '../../types/crm';
import { toast } from '@so360/design-system';
import { useShell, useNotify, useActivity } from '@so360/shell-context';

interface TaskModalProps {
    task?: Task | null; // If null, creating new task
    leadId?: string;
    dealId?: string;
    stakeholderId?: string;
    // The connected Deal's linked Project, when known — used only to
    // auto-suggest a Project on this task; the user may still change or
    // clear it. Passed by callers that already have the Deal loaded (e.g.
    // DealDetailPage); optional so callers without that context are unaffected.
    dealProjectId?: string;
    onClose: () => void;
    onSuccess: (task: Task) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, leadId, dealId, stakeholderId, dealProjectId, onClose, onSuccess }) => {
    const shell = useShell();
    const { emitNotification } = useNotify();
    const { recordActivity } = useActivity();
    const currentUser = shell?.user;
    const currentUserId = currentUser?.id;
    const isEditing = !!task;
    // Use local date/time (not UTC) so min constraint is correct in all timezones
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayDatetime = `${todayDate}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [startDate, setStartDate] = useState(() => {
        if (!task?.start_date) return '';
        return dueDateCalendarDay(task.start_date);
    });
    const [dueDate, setDueDate] = useState(() => splitStoredDueDate(task?.due_date).date);
    const [dueTime, setDueTime] = useState(() => splitStoredDueDate(task?.due_date).time);
    const [status, setStatus] = useState<Task['status']>(task?.status || 'OPEN');
    const [type, setType] = useState<TaskType>(task?.type || 'TODO');
    const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'MEDIUM');
    const [assignedToId, setAssignedToId] = useState(task?.assigned_to?.id || '');
    const [reminderMinutes, setReminderMinutes] = useState(task?.reminder_minutes_before?.toString() || '');
    const [users, setUsers] = useState<User[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const showAssociatePicker = !leadId && !dealId && !isEditing;
    const [associateType, setAssociateType] = useState<'none' | 'lead' | 'deal'>('none');
    const [associateId, setAssociateId] = useState('');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    // Optional Project connection. Pre-selected from the task's existing
    // connection when editing, or from the parent Deal's project when
    // creating from a Deal context — either way the user can change/clear it.
    const [projectId, setProjectId] = useState(task?.project_id || dealProjectId || '');
    const [projects, setProjects] = useState<any[]>([]);

    useEffect(() => {
        const fetchUsers = async () => {
            const usersData = await crmService.getUsers();

            // If API returns no users but we have the current user from shell, use them as fallback
            let finalUsers = usersData;
            if (usersData.length === 0 && currentUser?.id) {
                finalUsers = [{
                    id: currentUser.id,
                    full_name: (currentUser as any).full_name || (currentUser as any).email || 'Me',
                    email: (currentUser as any).email || '',
                    avatar_url: (currentUser as any).avatar_url || null
                }];
            }

            setUsers(finalUsers);
            if (!assignedToId && finalUsers.length > 0) {
                setAssignedToId(finalUsers[0].id);
            }
        };
        const fetchAssociateOptions = async () => {
            if (!showAssociatePicker) return;
            const [leadsData, dealsData] = await Promise.all([
                crmService.getLeads({ take: 200 }).catch(() => []),
                crmService.getDeals().catch(() => []),
            ]);
            setLeads(leadsData);
            setDeals(dealsData);
        };
        const fetchProjects = async () => {
            // getProjects() already swallows its own network errors and
            // resolves []; the extra try/catch guards call sites (older test
            // doubles, etc.) that don't stub this method at all.
            try {
                const projectsData = await crmService.getProjects();
                setProjects(projectsData || []);
            } catch {
                setProjects([]);
            }
        };
        fetchUsers();
        fetchAssociateOptions();
        fetchProjects();
    }, []);

    const handleAssignToMe = () => {
        if (!currentUserId) return;
        setAssignedToId(currentUserId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!dueDate) {
            toast.error('Please select a due date.');
            return;
        }
        // A reminder is an alarm — it is meaningless without the moment to ring.
        // Every other kind may stay date-only.
        if (type === 'REMINDER' && !dueTime) {
            toast.error('Please pick a date AND time for the reminder.');
            return;
        }
        // Compare calendar days as strings: both sides are the user's own local
        // date, so no instant — and no timezone shift — enters the comparison.
        if (dueDate < todayDate) {
            toast.error('Due Date cannot be in the past. Please select today or a future date.');
            return;
        }
        // A time already gone by today is past too, now that tasks carry one.
        if (dueTime && dueDate === todayDate && `${dueDate}T${dueTime}` < todayDatetime) {
            toast.error('Due time cannot be in the past. Please pick a later time.');
            return;
        }

        setIsSubmitting(true);
        try {
            const data: any = {
                title,
                description,
                status: status.toUpperCase(),
                type: type.toUpperCase(),
                priority,
                assignee_id: assignedToId
            };

            if (startDate) {
                // Send the calendar day itself. Anchoring it to local midnight and
                // normalising to UTC rolled it back a day east of Greenwich.
                data.start_date = inputValueToApiValue(startDate);
            }

            data.due_date = composeDueDate(dueDate, dueTime);
            if (type === 'REMINDER' && reminderMinutes) {
                data.reminder_minutes_before = parseInt(reminderMinutes);
            }

            if (leadId) data.lead_id = leadId;
            if (dealId) data.deal_id = dealId;
            if (stakeholderId) data.stakeholder_id = stakeholderId;
            if (showAssociatePicker && associateId) {
                if (associateType === 'lead') data.lead_id = associateId;
                if (associateType === 'deal') data.deal_id = associateId;
            }

            let result: Task;
            if (isEditing && task) {
                result = await crmService.updateTask(task.id, data);
            } else {
                result = await crmService.createTask(data);
            }

            // Project connection is best-effort: the task itself is already
            // saved by this point, so a connect failure must not roll that back
            // or block the modal from closing — just tell the user quietly.
            if (projectId && projectId !== task?.project_id && result?.id) {
                try {
                    await crmService.connectTaskToProject(result.id, projectId);
                } catch (connectError) {
                    const reason = (connectError as Error)?.message || 'Unknown error';
                    toast.warning(`Task ${isEditing ? 'updated' : 'created'}, but couldn't connect to Project: ${reason}`);
                }
            }

            if (!isEditing && assignedToId && assignedToId !== currentUserId) {
                emitNotification({ event: 'CRM_TASK_ASSIGNED', userIds: [assignedToId], variables: { taskTitle: title, actorName: currentUser?.full_name || 'Someone' }, relatedResource: { type: 'task', id: result?.id } }).catch(() => {});
            }
            recordActivity({ eventType: isEditing ? 'task.updated' : 'task.created', eventCategory: 'crm', description: `${isEditing ? 'Updated' : 'Created'} task "${title}"`, resourceType: 'task', resourceId: result?.id }).catch(() => {});
            onSuccess(result);
            onClose();
        } catch (error) {
            console.error('Failed to save task', error);
            // ApiClient already unwraps the API body (class-validator returns an
            // array of messages, joined). Discarding it turned every rejection —
            // including precise field validation — into a bare "Failed to save
            // task", which is what made the priority mismatch so hard to trace.
            const status = (error as { status?: number })?.status;
            const detail = (error as Error)?.message;
            const isActionable = !!detail && status !== undefined && status < 500;
            toast.error(isActionable ? detail : 'Failed to save task. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-8 py-6 border-b border-slate-700/50 bg-slate-800/20 flex items-center justify-between flex-shrink-0">
                    <h2 className="text-xl font-black text-slate-50 uppercase tracking-tight flex items-center gap-2">
                        <CheckCircle2 className={isEditing ? "text-blue-500" : "text-emerald-500"} size={24} />
                        {isEditing ? 'Edit Task' : 'New Task'}
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-50 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                <div className="p-8 space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Task Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                required
                                placeholder="e.g. Follow up email..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold resize-none h-20"
                                placeholder="Add details..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</label>
                            <div className="relative">
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                                    className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 pr-9 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                >
                                    {TASK_PRIORITY_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</label>
                            <div className="relative">
                                <select
                                    value={type}
                                    onChange={(e) => {
                                        const nextType = e.target.value as TaskType;
                                        setType(nextType);
                                        // A reminder must ring at a moment; offer a
                                        // sensible one rather than an empty field.
                                        if (nextType === 'REMINDER' && !dueTime) setDueTime('09:00');
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 pr-9 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="TODO">To Do</option>
                                    <option value="CALL">Call</option>
                                    <option value="EMAIL">Email</option>
                                    <option value="MEETING">Meeting</option>
                                    <option value="REMINDER">Reminder</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Start Date</label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label htmlFor="task-due-date" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    Due Date
                                </label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                    <input
                                        id="task-due-date"
                                        type="date"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        min={todayDate}
                                        className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Due time is optional for every kind except Reminder, which
                            is an alarm. Left blank the task stays a plain calendar
                            date — no invented 9am, no invented midnight. */}
                        <div className="space-y-2">
                            <label htmlFor="task-due-time" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                Due Time {type === 'REMINDER' ? <span className="text-red-500">*</span> : <span className="text-slate-600 normal-case tracking-normal font-bold">(optional)</span>}
                            </label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />
                                    <input
                                        id="task-due-time"
                                        type="time"
                                        value={dueTime}
                                        onChange={(e) => setDueTime(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                        required={type === 'REMINDER'}
                                    />
                                </div>
                                {dueTime && type !== 'REMINDER' && (
                                    <button
                                        type="button"
                                        onClick={() => setDueTime('')}
                                        className="px-3 py-3 rounded-xl border border-slate-700/50 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-50 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {type === 'REMINDER' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Remind me before</label>
                                <select
                                    value={reminderMinutes}
                                    onChange={(e) => setReminderMinutes(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="">No reminder notification</option>
                                    <option value="15">15 minutes before</option>
                                    <option value="30">30 minutes before</option>
                                    <option value="60">1 hour before</option>
                                    <option value="1440">1 day before</option>
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assigned To</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <select
                                        value={assignedToId}
                                        onChange={(e) => setAssignedToId(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                    >
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>
                                                {u.full_name}
                                                {u.id === currentUserId ? ' (You)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAssignToMe}
                                    disabled={!currentUserId || assignedToId === currentUserId}
                                    className="flex items-center gap-1.5 px-3 py-3 text-sm bg-blue-600/10 border border-blue-600/20 rounded-xl text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    title={
                                        !currentUserId
                                            ? "User session not available"
                                            : assignedToId === currentUserId
                                            ? "Already assigned to you"
                                            : "Assign this task to yourself"
                                    }
                                >
                                    <UserPlus className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Me</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Link2 size={12} />
                                Project <span className="text-slate-600 normal-case tracking-normal font-bold">(optional)</span>
                            </label>
                            <div className="relative">
                                <select
                                    value={projectId}
                                    onChange={(e) => setProjectId(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 pr-9 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="">No Project</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name || p.title || p.id}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                            </div>
                            {projectId && (
                                <p className="text-[11px] text-slate-500">
                                    This task will be synchronized with the selected Project.
                                </p>
                            )}
                        </div>

                        {showAssociatePicker && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <Link2 size={12} />
                                    Associate With
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="relative">
                                        <select
                                            value={associateType}
                                            onChange={(e) => { setAssociateType(e.target.value as any); setAssociateId(''); }}
                                            className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 pr-9 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                        >
                                            <option value="none">None</option>
                                            <option value="lead">Lead</option>
                                            <option value="deal">Deal</option>
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                    </div>
                                    {associateType !== 'none' && (
                                        <div className="relative">
                                            <select
                                                value={associateId}
                                                onChange={(e) => setAssociateId(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-700/50 text-slate-50 rounded-xl px-4 py-3 pr-9 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                            >
                                                <option value="">Select {associateType === 'lead' ? 'Lead' : 'Deal'}…</option>
                                                {associateType === 'lead'
                                                    ? leads.map(l => (
                                                        <option key={l.id} value={l.id}>
                                                            {l.company_name || l.contact_name}
                                                        </option>
                                                    ))
                                                    : deals.map(d => (
                                                        <option key={d.id} value={d.id}>
                                                            {d.name || d.company_name}
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {isEditing && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as Task['status'])}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                                >
                                    <option value="OPEN">Open</option>
                                    <option value="IN_PROGRESS">In Progress</option>
                                    <option value="DONE">Done</option>
                                    <option value="ON_HOLD">On Hold</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                            </div>
                        )}
                    </div>

                </div>
                <div className="px-8 pb-6 pt-4 flex justify-end gap-3 border-t border-slate-800/50 flex-shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`px-8 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 ${isEditing ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'}`}
                        >
                            {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                            {isEditing ? 'Save Changes' : 'Create Task'}
                        </button>
                </div>
                </form>
            </div>
        </div>
    );
};

export default TaskModal;
