import React, { useState, useEffect, useContext } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    ChevronLeft, CheckCircle2, Circle, Calendar,
    User as UserIcon, Briefcase, Clock, AlertCircle, Trash2, Edit2
} from 'lucide-react';
import { crmService } from '../services/crmService';
import { Task } from '../types/crm';
import { Loader2 } from 'lucide-react';
import TaskModal from './components/TaskModal';
import { RescheduleModal } from './components/RescheduleModal';
import { ShellContext } from '@so360/shell-context';

const TaskDetailPage = () => {
    const { id = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const shell = useContext(ShellContext);
    const currentUserId = shell?.user?.id;
    const [task, setTask] = useState<Task | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditingTask, setIsEditingTask] = useState(false);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [notes, setNotes] = useState<any[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isAddingNote, setIsAddingNote] = useState(false);
    const [notesSupported, setNotesSupported] = useState(true);
    const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
    const [editingNote, setEditingNote] = useState<{ id: string; content: string } | null>(null);

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

                // Fetch notes data (optional - may fail if migration not run)
                try {
                    const notesData = await crmService.getTaskNotes(id);
                    setNotes(notesData || []);
                    setNotesSupported(true);
                } catch (notesError) {
                    console.warn('Failed to fetch task notes (migration may not be run yet):', notesError);
                    setNotes([]);
                    setNotesSupported(false);
                }
            } catch (error) {
                console.error('Failed to fetch task', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTask();
    }, [id]);

    const handleTaskToggle = async () => {
        if (!task) return;
        const newStatus = task.status === 'Done' ? 'Open' : 'Done';
        try {
            // Optimistic update
            setTask({ ...task, status: newStatus });

            await crmService.updateTask(task.id, { status: newStatus });
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
        try {
            await crmService.updateTask(task.id, { due_date: date });
            setTask({ ...task, due_date: date });
            setIsRescheduling(false);
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
                <Link to=".." className="text-blue-500 hover:underline mt-4 inline-block">Back to Tasks</Link>
            </div>
        );
    }

    const isOverdue = task.status === 'Open' && new Date(task.due_date) < new Date();

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <header className="mb-8">
                <Link to=".." className="flex items-center gap-1 text-slate-400 hover:text-slate-100 transition-colors mb-4 group">
                    <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Tasks
                </Link>
                <div className="flex justify-between items-start">
                    <div className="flex items-start gap-4">
                        <button className="mt-1 text-slate-500 hover:text-blue-400 transition-colors">
                            {task.status === 'Done' ? <CheckCircle2 size={32} className="text-emerald-500" /> : <Circle size={32} />}
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className={`text-4xl font-black tracking-tight ${task.status === 'Done' ? 'text-slate-500 line-through' : 'text-white'}`}>
                                    {task.title}
                                </h1>
                                <button
                                    onClick={() => setIsEditingTask(true)}
                                    className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-all"
                                >
                                    <Edit2 size={16} />
                                </button>
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${task.status === 'Done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'
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
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-slate-500 hover:text-rose-400 p-2 transition-colors"
                    >
                        <Trash2 size={20} />
                    </button>
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
                                        <Link to={`/deals/${task.deal_id}`} className="text-lg font-bold text-white hover:text-blue-400 transition-colors truncate block">
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
                                        <Link to={`/leads/${task.lead_id}`} className="text-lg font-bold text-white hover:text-blue-400 transition-colors truncate block">
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
                                    <p className={`text-lg font-bold ${isOverdue ? 'text-rose-400' : 'text-white'}`}>
                                        {new Date(task.due_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                    </p>
                                </div>
                            </div>
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
                            {notesSupported && (
                                <button
                                    onClick={() => setIsAddingNote(!isAddingNote)}
                                    className="text-xs text-blue-400 hover:text-blue-300 font-bold"
                                >
                                    {isAddingNote ? 'Cancel' : '+ Add Note'}
                                </button>
                            )}
                        </div>

                        {!notesSupported && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
                                <p className="text-xs text-yellow-400">
                                    <strong>Notes feature not yet available.</strong> Database migration required.
                                    Contact your administrator to run: <code className="bg-slate-950 px-1 py-0.5 rounded">migrations/add_task_notes.sql</code>
                                </p>
                            </div>
                        )}

                        {isAddingNote && (
                            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
                                <textarea
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder="Add a note or comment..."
                                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 outline-none focus:border-blue-500 resize-none h-24"
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button
                                        onClick={() => { setNewNote(''); setIsAddingNote(false); }}
                                        className="px-4 py-2 text-slate-400 hover:text-white text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!task || !newNote.trim()) return;
                                            try {
                                                await crmService.createNote({ content: newNote, task_id: task.id });
                                                const updated = await crmService.getTaskNotes(task.id);
                                                setNotes(updated);
                                                setNewNote('');
                                                setIsAddingNote(false);
                                            } catch (error) {
                                                console.error('Failed to create note:', error);
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
                                <p className="text-slate-500 text-sm italic">No notes yet</p>
                            ) : (
                                notes.map(note => {
                                    const isAuthor = currentUserId && note.author?.id === currentUserId;

                                    return (
                                        <div key={note.id} className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 group">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-blue-600/20 flex items-center justify-center">
                                                        <span className="text-xs font-bold text-blue-400">
                                                            {note.author?.full_name?.[0] || 'U'}
                                                        </span>
                                                    </div>
                                                    <span className="text-sm font-medium text-slate-300">
                                                        {note.author?.full_name || 'Unknown User'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-slate-500">
                                                        {new Date(note.created_at).toLocaleDateString()}
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
                                <p className="font-bold text-white">{task.assigned_to.full_name}</p>
                                <p className="text-xs text-slate-500">Sales Representative</p>
                            </div>
                        </div>
                    </section>

                    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Task Actions</h3>
                        <div className="space-y-2">
                            <button
                                onClick={handleTaskToggle}
                                className={`w-full py-2 rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 text-white ${task.status === 'Done' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'}`}
                            >
                                {task.status === 'Done' ? 'Mark as Open' : 'Mark as Complete'}
                            </button>
                            <button
                                onClick={() => setIsRescheduling(true)}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 py-2 rounded-lg text-xs font-bold transition-all border border-slate-700"
                            >
                                Reschedule
                            </button>
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
            {editingNote && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                                <Edit2 className="text-blue-400" size={20} />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-white mb-1">Edit Note</h3>
                                <p className="text-sm text-slate-400">
                                    Update your note content below.
                                </p>
                            </div>
                        </div>
                        <textarea
                            value={editingNote.content}
                            onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-3 outline-none focus:border-blue-500 resize-none h-32 mb-4"
                            placeholder="Note content..."
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setEditingNote(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-sm transition-all border border-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!editingNote.content.trim()) {
                                        alert('Note content cannot be empty.');
                                        return;
                                    }
                                    try {
                                        await crmService.updateNote(editingNote.id, editingNote.content);
                                        const updated = await crmService.getTaskNotes(task.id);
                                        setNotes(updated);
                                        setEditingNote(null);
                                    } catch (error) {
                                        console.error('Failed to update note:', error);
                                        alert('Failed to update note. Please try again.');
                                    }
                                }}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Note Confirmation Modal */}
            {deleteNoteId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center shrink-0">
                                <Trash2 className="text-rose-400" size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Delete Note</h3>
                                <p className="text-sm text-slate-400">
                                    Are you sure you want to delete this note? This action cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteNoteId(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-bold text-sm transition-all border border-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await crmService.deleteNote(deleteNoteId);
                                        const updated = await crmService.getTaskNotes(task.id);
                                        setNotes(updated);
                                        setDeleteNoteId(null);
                                    } catch (error) {
                                        console.error('Failed to delete note:', error);
                                        alert('Failed to delete note. Please try again.');
                                    }
                                }}
                                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-sm transition-all shadow-lg shadow-rose-500/20 active:scale-95"
                            >
                                Delete Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Task</h3>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this task? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-slate-400 hover:text-white"
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
                </div>
            )}
        </div>
    );
};

export default TaskDetailPage;
