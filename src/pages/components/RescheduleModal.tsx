import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';

interface RescheduleModalProps {
    currentDate: string;
    onClose: () => void;
    onConfirm: (newDate: string) => void;
}

export const RescheduleModal: React.FC<RescheduleModalProps> = ({
    currentDate,
    onClose,
    onConfirm
}) => {
    const [newDate, setNewDate] = useState(
        new Date(currentDate).toISOString().split('T')[0]
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onConfirm(newDate);
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-white">Reschedule Task</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase">New Due Date</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                            <input
                                type="date"
                                value={newDate}
                                onChange={(e) => setNewDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:border-blue-500"
                                required
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-slate-400 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold"
                        >
                            Reschedule
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
