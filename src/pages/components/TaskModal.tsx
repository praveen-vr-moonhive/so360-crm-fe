import React, { useState, useEffect } from 'react';
import { X, Loader2, Calendar, CheckCircle2, User as UserIcon, UserPlus } from 'lucide-react';
import { crmService } from '../../services/crmService';
import { Task, TaskType, User } from '../../types/crm';
import { ToastContainer, useToast } from '../../components/common/Toast';
import { useShell, useNotify, useActivity } from '@so360/shell-context';
import { canCurrentUserBeAssigned } from '../../utils/taskUtils';

interface TaskModalProps {
    task?: Task | null; // If null, creating new task
    leadId?: string;
    dealId?: string;
    onClose: () => void;
    onSuccess: (task: Task) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, leadId, dealId, onClose, onSuccess }) => {
    const { toasts, showError, dismissToast } = useToast();
    const shell = useShell();
    const { emitNotification } = useNotify();
    const { recordActivity } = useActivity();
    const currentUser = shell?.user;
    const currentUserId = currentUser?.id;
    const isEditing = !!task;
    const [title, setTitle] = useState(task?.title || '');
    const [description, setDescription] = useState(task?.description || '');
    const [dueDate, setDueDate] = useState(() => {
        if (!task?.due_date) return '';
        // If it's a reminder, keep the time. task.due_date is ISO string.
        // For input type="datetime-local", format is YYYY-MM-DDTHH:MM
        if (task.type === 'REMINDER') {
            return new Date(task.due_date).toISOString().slice(0, 16);
        }
        return new Date(task.due_date).toISOString().split('T')[0];
    });
    const [status, setStatus] = useState<'Open' | 'Done'>(task?.status || 'Open');
    const [type, setType] = useState<TaskType>(task?.type || 'TODO');
    const [assignedToId, setAssignedToId] = useState(task?.assigned_to?.id || '');
    const [reminderMinutes, setReminderMinutes] = useState(task?.reminder_minutes_before?.toString() || '');
    const [users, setUsers] = useState<User[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            console.log('[TaskModal] Shell context:', shell);
            console.log('[TaskModal] Current user:', currentUser);
            console.log('[TaskModal] Current user ID:', currentUserId);

            const usersData = await crmService.getUsers();
            console.log('[TaskModal] Fetched users:', usersData);

            setUsers(usersData);
            if (!assignedToId && usersData.length > 0) {
                setAssignedToId(usersData[0].id);
            }

            // Verify current user is in list
            const userInList = usersData.some(u => u.id === currentUserId);
            console.log('[TaskModal] Current user in fetched list:', userInList);
        };
        fetchUsers();
    }, []);

    const handleAssignToMe = () => {
        if (!currentUserId) return;
        setAssignedToId(currentUserId);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const data: any = {
                title,
                description,
                status: status.toUpperCase(),
                type: type.toUpperCase(),
                assignee_id: assignedToId
            };

            // Handle date formatting based on type
            if (type === 'REMINDER') {
                data.due_date = new Date(dueDate).toISOString();
                if (reminderMinutes) {
                    data.reminder_minutes_before = parseInt(reminderMinutes);
                }
            } else {
                // For regular tasks, just the date part matters usually, but we store as ISO
                data.due_date = new Date(dueDate).toISOString();
            }

            if (leadId) data.lead_id = leadId;
            if (dealId) data.deal_id = dealId;

            let result: Task;
            if (isEditing && task) {
                result = await crmService.updateTask(task.id, data);
            } else {
                result = await crmService.createTask(data);
            }
            if (!isEditing && assignedToId && assignedToId !== currentUserId) {
                emitNotification({ event: 'CRM_TASK_ASSIGNED', userIds: [assignedToId], variables: { taskTitle: title, actorName: currentUser?.full_name || 'Someone' }, relatedResource: { type: 'task', id: result?.id } }).catch(() => {});
            }
            recordActivity({ eventType: isEditing ? 'task.updated' : 'task.created', eventCategory: 'crm', description: `${isEditing ? 'Updated' : 'Created'} task "${title}"`, resourceType: 'task', resourceId: result?.id }).catch(() => {});
            onSuccess(result);
            onClose();
        } catch (error) {
            console.error('Failed to save task', error);
            showError('Failed to save task');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <CheckCircle2 className={isEditing ? "text-blue-500" : "text-emerald-500"} size={24} />
                        {isEditing ? 'Edit Task' : 'New Task'}
                    </h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {/* Debug Info Panel */}
                    {import.meta.env.DEV && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4 text-xs space-y-1">
                            <div className="font-bold text-yellow-400 mb-2">Debug Info:</div>
                            <div className="text-slate-300">Shell User ID: <span className="text-white font-mono">{currentUserId || 'null'}</span></div>
                            <div className="text-slate-300">Users Count: <span className="text-white font-mono">{users.length}</span></div>
                            <div className="text-slate-300">Can Be Assigned: <span className={canCurrentUserBeAssigned(currentUser, users) ? 'text-green-400' : 'text-red-400'}>{canCurrentUserBeAssigned(currentUser, users) ? 'Yes' : 'No'}</span></div>
                            <div className="text-slate-300">Current Assignee: <span className="text-white font-mono">{assignedToId || 'none'}</span></div>
                        </div>
                    )}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Task Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                required
                                placeholder="e.g. Follow up email..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold resize-none h-20"
                                placeholder="Add details..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Type</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value as TaskType)}
                                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
                                >
                                    <option value="TODO">To Do</option>
                                    <option value="CALL">Call</option>
                                    <option value="EMAIL">Email</option>
                                    <option value="MEETING">Meeting</option>
                                    <option value="REMINDER">Reminder</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                    {type === 'REMINDER' ? 'Date & Time' : 'Due Date'}
                                </label>
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                    <input
                                        type={type === 'REMINDER' ? "datetime-local" : "date"}
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold"
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {type === 'REMINDER' && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Remind me before</label>
                                <select
                                    value={reminderMinutes}
                                    onChange={(e) => setReminderMinutes(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
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
                                        className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-9 pr-4 py-3 outline-none focus:border-blue-500 transition-all font-bold appearance-none cursor-pointer"
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
                                    disabled={
                                        !canCurrentUserBeAssigned(currentUser, users) ||
                                        assignedToId === currentUserId
                                    }
                                    className="flex items-center gap-1.5 px-3 py-3 text-sm bg-blue-600/10 border border-blue-600/20 rounded-xl text-blue-400 hover:bg-blue-600/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    title={
                                        !canCurrentUserBeAssigned(currentUser, users)
                                            ? "You don't have permission to be assigned tasks"
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

                        {isEditing && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="Open"
                                            checked={status === 'Open'}
                                            onChange={() => setStatus('Open')}
                                            className="text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-800"
                                        />
                                        <span className="text-sm font-bold text-slate-300">Open</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="status"
                                            value="Done"
                                            checked={status === 'Done'}
                                            onChange={() => setStatus('Done')}
                                            className="text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-800"
                                        />
                                        <span className="text-sm font-bold text-slate-300">Done</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
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
