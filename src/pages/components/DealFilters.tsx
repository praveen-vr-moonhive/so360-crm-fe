import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/crmService';
import { User, DealFilters as Filters } from '../../types/crm';
import { X, Calendar, Search, Filter } from 'lucide-react';

interface DealFiltersProps {
    filters: Filters;
    onChange: (filters: Filters) => void;
}

export const DealFilters: React.FC<DealFiltersProps> = ({ filters, onChange }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [showCustomDate, setShowCustomDate] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await crmService.getUsers();
                setUsers(data);
            } catch (error) {
                console.error('Failed to fetch users', error);
            }
        };
        fetchUsers();
    }, []);

    const handleChange = (key: keyof Filters, value: any) => {
        const newFilters = { ...filters };

        if (value === '' || value === undefined || value === null) {
            delete newFilters[key];
        } else {
            newFilters[key] = value;
        }

        if (key === 'date_range') {
            setShowCustomDate(value === 'custom');
            if (value !== 'custom') {
                delete newFilters.start_date;
                delete newFilters.end_date;
            }
        }

        onChange(newFilters);
    };

    const clearFilters = () => {
        onChange({});
        setShowCustomDate(false);
    };

    const hasActiveFilters = Object.keys(filters).length > 0;

    return (
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl mb-6 flex flex-wrap gap-4 items-end">
            {/* Date Range */}
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Date Range</label>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <select
                            value={filters.date_range || ''}
                            onChange={(e) => handleChange('date_range', e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded-lg pl-9 pr-4 py-2 outline-none focus:border-blue-500 appearance-none min-w-[160px]"
                        >
                            <option value="">All Time</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="this_week">This Week</option>
                            <option value="last_week">Last Week</option>
                            <option value="this_month">This Month</option>
                            <option value="last_month">Last Month</option>
                            <option value="this_year">This Year</option>
                            <option value="custom">Custom Range</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Custom Date Range */}
            {showCustomDate && (
                <>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Start Date</label>
                        <input
                            type="date"
                            value={filters.start_date || ''}
                            onChange={(e) => handleChange('start_date', e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">End Date</label>
                        <input
                            type="date"
                            value={filters.end_date || ''}
                            onChange={(e) => handleChange('end_date', e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                        />
                    </div>
                </>
            )}

            {/* Owner */}
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Owner</label>
                <select
                    value={filters.owner_id || ''}
                    onChange={(e) => handleChange('owner_id', e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded-lg px-3 py-2 outline-none focus:border-blue-500 min-w-[140px]"
                >
                    <option value="">All Owners</option>
                    {users.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                </select>
            </div>

            {/* Company Name */}
            <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest block">Company</label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                        type="text"
                        placeholder="Search company..."
                        value={filters.company_name || ''}
                        onChange={(e) => handleChange('company_name', e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-sm font-bold text-white rounded-lg pl-9 pr-4 py-2 outline-none focus:border-blue-500 w-[180px]"
                    />
                </div>
            </div>

            {/* Clear Button */}
            {hasActiveFilters && (
                <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-xs font-bold"
                >
                    <X size={14} />
                    Clear
                </button>
            )}
        </div>
    );
};
