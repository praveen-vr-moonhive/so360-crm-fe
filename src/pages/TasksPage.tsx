import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, CheckCircle2, Circle, Clock, AlertCircle, Calendar, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, UserPlus } from 'lucide-react';
import { crmService } from '../services/crmService';
import { Task } from '../types/crm';
import { Table } from '../components/common/Table';
import { useShell } from '@so360/shell-context';
import { canCurrentUserBeAssigned, isTaskAssignedToUser } from '../utils/taskUtils';
import { ToastContainer, useToast } from '../components/common/Toast';

type SortField = 'title' | 'due_date' | 'status' | 'assigned_to';
type SortDirection = 'asc' | 'desc' | null;

const TasksPage = () => {
    const navigate = useNavigate();
    const shell = useShell();
    const currentUser = shell?.user;
    const currentUserId = currentUser?.id;
    const { toasts, showSuccess, showError, dismissToast } = useToast();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [users, setUsers] = useState<any[]>([]); // Using any for User to avoid import issues if not exported
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [tasksData, usersData] = await Promise.all([
                    crmService.getTasks(),
                    crmService.getUsers()
                ]);
                setTasks(tasksData);
                setUsers(usersData);
            } catch (error) {
                console.error('Failed to fetch data', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleStatusChange = async (task: Task, newStatus: string) => {
        try {
            await crmService.updateTask(task.id, { status: newStatus });
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus as any } : t));
        } catch (error) {
            console.error('Failed to update task status', error);
        }
    };

    const handleAssigneeChange = async (task: Task, newAssigneeId: string) => {
        const newAssignee = users.find(u => u.id === newAssigneeId);
        if (!newAssignee) return;

        try {
            await crmService.updateTask(task.id, { assignee_id: newAssigneeId });
            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, assigned_to: newAssignee } : t));
        } catch (error) {
            console.error('Failed to update task assignee', error);
        }
    };

    const handleQuickAssignToMe = async (task: Task) => {
        if (!currentUserId) {
            showError?.('User context not available');
            return;
        }

        if (!canCurrentUserBeAssigned(currentUser, users)) {
            showError?.("You don't have permission to be assigned tasks");
            return;
        }

        try {
            await crmService.updateTask(task.id, { assignee_id: currentUserId });
            showSuccess?.('Task assigned to you');

            // Optimistic update
            const currentUserObj = users.find(u => u.id === currentUserId);
            if (currentUserObj) {
                setTasks(prev => prev.map(t =>
                    t.id === task.id ? { ...t, assigned_to: currentUserObj } : t
                ));
            }
        } catch (error) {
            console.error('Failed to assign task:', error);
            showError?.('Failed to assign task to yourself');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        setIsDeleting(true);
        try {
            await crmService.deleteTask(taskId);
            setTasks(prev => prev.filter(t => t.id !== taskId));
            setShowDeleteConfirm(null);
        } catch (err: any) {
            setError(err.message || 'Failed to delete task');
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') setSortDirection('desc');
            else if (sortDirection === 'desc') { setSortField(null); setSortDirection(null); }
            else setSortDirection('asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ChevronsUpDown size={14} className="text-slate-600" />;
        if (sortDirection === 'asc') return <ChevronUp size={14} className="text-blue-400" />;
        if (sortDirection === 'desc') return <ChevronDown size={14} className="text-blue-400" />;
        return <ChevronsUpDown size={14} className="text-slate-600" />;
    };

    const SortableHeader = ({ label, field }: { label: string, field: SortField }) => (
        <button
            onClick={() => toggleSort(field)}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
            {label}
            <SortIcon field={field} />
        </button>
    );

    const sortedAndFilteredTasks = useMemo(() => {
        let result = tasks.filter(task => {
            const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                task.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                task.deal_name?.toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            if (filter === 'All') return true;
            if (filter === 'Open') return task.status === 'Open';
            if (filter === 'Done') return task.status === 'Done';
            if (filter === 'Overdue') {
                return task.status === 'Open' && new Date(task.due_date) < new Date();
            }
            return true;
        });

        // Apply sorting
        if (sortField && sortDirection) {
            result = [...result].sort((a, b) => {
                let aVal: any, bVal: any;
                switch (sortField) {
                    case 'title': aVal = a.title; bVal = b.title; break;
                    case 'due_date': aVal = new Date(a.due_date).getTime(); bVal = new Date(b.due_date).getTime(); break;
                    case 'status': aVal = a.status; bVal = b.status; break;
                    case 'assigned_to': aVal = a.assigned_to?.full_name || ''; bVal = b.assigned_to?.full_name || ''; break;
                    default: return 0;
                }
                if (typeof aVal === 'string') {
                    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            });
        }

        return result;
    }, [tasks, searchTerm, filter, sortField, sortDirection]);

    // Pagination
    const totalPages = Math.ceil(sortedAndFilteredTasks.length / pageSize);
    const paginatedTasks = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedAndFilteredTasks.slice(start, start + pageSize);
    }, [sortedAndFilteredTasks, currentPage, pageSize]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filter]);

    const columns = [
        {
            header: <SortableHeader label="Task" field="title" />,
            accessor: (task: Task) => (
                <div className="flex items-start gap-3">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(task, task.status === 'Done' ? 'Open' : 'Done');
                        }}
                        className="mt-0.5 text-slate-500 hover:text-blue-400 transition-colors"
                    >
                        {task.status === 'Done' ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} />}
                    </button>
                    <div className="flex flex-col gap-0.5">
                        <span className={`font-semibold ${task.status === 'Done' ? 'text-slate-500 line-through' : 'text-white'}`}>
                            {task.title}
                        </span>
                        {task.deal_name && <span className="text-xs text-slate-400">Related to: <span className="text-blue-400/80">{task.deal_name}</span></span>}
                    </div>
                </div>
            )
        },
        {
            header: <SortableHeader label="Due Date" field="due_date" />,
            accessor: (task: Task) => {
                const isOverdue = task.status === 'Open' && new Date(task.due_date) < new Date();
                return (
                    <div className={`flex items-center gap-2 text-xs font-medium ${isOverdue ? 'text-rose-400' : 'text-slate-400'}`}>
                        {isOverdue ? <AlertCircle size={14} /> : <Calendar size={14} />}
                        {new Date(task.due_date).toLocaleDateString()}
                        {isOverdue && <span className="uppercase text-[9px] font-black tracking-tighter ml-1">Overdue</span>}
                    </div>
                );
            }
        },
        {
            header: <SortableHeader label="Assigned To" field="assigned_to" />,
            accessor: (task: Task) => (
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                    <select
                        value={task.assigned_to.id}
                        onChange={(e) => handleAssigneeChange(task, e.target.value)}
                        className="flex-1 bg-transparent text-slate-300 text-sm focus:outline-none cursor-pointer hover:text-white transition-colors py-1"
                    >
                        {users.map(user => (
                            <option key={user.id} value={user.id} className="bg-slate-900 text-slate-300">
                                {user.full_name}
                                {user.id === currentUserId ? ' (You)' : ''}
                            </option>
                        ))}
                    </select>

                    {!isTaskAssignedToUser(task, currentUserId) && (
                        <button
                            onClick={() => handleQuickAssignToMe(task)}
                            disabled={!canCurrentUserBeAssigned(currentUser, users)}
                            className="p-1 text-slate-400 hover:text-blue-400 hover:bg-blue-600/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={
                                canCurrentUserBeAssigned(currentUser, users)
                                    ? "Assign to me"
                                    : "You don't have permission to be assigned tasks"
                            }
                        >
                            <UserPlus className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )
        },
        {
            header: <SortableHeader label="Status" field="status" />,
            accessor: (task: Task) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value)}
                        className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-950 ${task.status === 'Done'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 focus:ring-emerald-500'
                            : 'bg-slate-800 text-slate-400 border-slate-700 focus:ring-slate-500'
                            }`}
                    >
                        <option value="Open" className="bg-slate-900 text-slate-300">OPEN</option>
                        <option value="Done" className="bg-slate-900 text-slate-300">DONE</option>
                    </select>
                </div>
            )
        },
        {
            header: '',
            accessor: (task: Task) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => setShowDeleteConfirm(task.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors"
                        title="Delete task"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="p-8">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight leading-none">Tasks & Follow-ups</h1>
                    <p className="text-slate-400 mt-2">Personal execution discipline and daily tasks</p>
                </div>
            </header>

            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={18} />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900/50 border border-slate-800 pl-12 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-slate-200"
                    />
                </div>
                <div className="flex gap-2">
                    {['All', 'Open', 'Overdue', 'Done'].map((btn) => (
                        <button
                            key={btn}
                            onClick={() => setFilter(btn)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all border ${filter === btn
                                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-900/20'
                                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-100 hover:bg-slate-800'
                                }`}
                        >
                            {btn}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300">
                    {error}
                    <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-300">×</button>
                </div>
            )}

            <Table
                data={paginatedTasks}
                columns={columns}
                isLoading={isLoading}
                onRowClick={(task) => navigate(`${task.id}`)}
                emptyMessage="No tasks found for the selected filter."
            />

            {/* Pagination Controls */}
            {sortedAndFilteredTasks.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <span>Show</span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        >
                            {[10, 25, 50, 100].map(size => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                        <span>of {sortedAndFilteredTasks.length} tasks</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            First
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Prev
                        </button>
                        <span className="px-3 py-1 text-slate-300">
                            Page {currentPage} of {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Next
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Last
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md p-6">
                        <h2 className="text-xl font-semibold text-slate-100 mb-2">Delete Task</h2>
                        <p className="text-slate-400 mb-6">
                            Are you sure you want to delete this task? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteTask(showDeleteConfirm)}
                                disabled={isDeleting}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                {isDeleting && <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TasksPage;
