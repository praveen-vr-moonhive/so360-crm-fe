import React from 'react';
import { Deal } from '../../types/crm';
import { Calendar, TrendingUp, Lock } from 'lucide-react';

interface KanbanStage {
    id: string;         // flow state code
    name: string;
    color?: string;
    is_terminal?: boolean;
}

interface KanbanBoardProps {
    deals: Deal[];
    stages: KanbanStage[];
    onDealClick: (deal: Deal) => void;
    onStageChange: (deal: Deal, targetState: string) => void;
}

export const KanbanBoard = ({ deals, stages, onDealClick, onStageChange }: KanbanBoardProps) => {
    const [draggedDealId, setDraggedDealId] = React.useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = React.useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, deal: Deal) => {
        setDraggedDealId(deal.id);
        e.dataTransfer.setData('dealId', deal.id);
        e.dataTransfer.effectAllowed = 'move';

        // Add a small delay to make the card semi-transparent while dragging
        setTimeout(() => {
            const target = e.target as HTMLElement;
            target.style.opacity = '0.4';
        }, 0);
    };

    const handleDragEnd = (e: React.DragEvent) => {
        setDraggedDealId(null);
        setDragOverStage(null);
        const target = e.target as HTMLElement;
        target.style.opacity = '1';
    };

    const handleDragOver = (e: React.DragEvent, stageId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverStage(stageId);
    };

    const handleDragLeave = () => {
        setDragOverStage(null);
    };

    const handleDrop = (e: React.DragEvent, targetStageId: string) => {
        e.preventDefault();
        setDragOverStage(null);
        const dealId = e.dataTransfer.getData('dealId');
        const deal = deals.find(d => d.id === dealId);

        if (deal && deal.current_flow_state !== targetStageId) {
            onStageChange(deal, targetStageId);
        }
    };

    return (
        <div className="flex gap-6 overflow-x-auto pb-6 h-full min-h-[650px] scrollbar-hide">
            {stages.map((stage) => {
                const stageDeals = deals.filter(d => d.current_flow_state === stage.id || d.stage === stage.name);
                const isOver = dragOverStage === stage.id;
                const accentColor = stage.color || '#94A3B8';

                return (
                    <div
                        key={stage.id}
                        className="w-80 flex-shrink-0 flex flex-col gap-4"
                    >
                        {/* Stage Header */}
                        <div className="flex items-center justify-between px-2">
                            <h3
                                className="font-black text-slate-100 flex items-center gap-2 text-sm uppercase tracking-wider"
                                style={{ color: accentColor }}
                            >
                                {stage.name}
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-black">
                                    {stageDeals.length}
                                </span>
                                {stage.is_terminal && (
                                    <Lock size={11} className="text-slate-500" />
                                )}
                            </h3>
                            <span className="text-[10px] text-slate-500 font-black tracking-wider">
                                ${stageDeals.reduce((sum, d) => sum + d.value, 0).toLocaleString()}
                            </span>
                        </div>

                        {/* Drop Zone */}
                        {stage.is_terminal ? (
                            /* Terminal columns: no drag handlers — Win/Lose via deal button */
                            <div
                                className="flex-1 flex flex-col gap-3 rounded-2xl p-3 min-h-[550px] bg-slate-900/40 border border-slate-800/60"
                                style={{ borderTopColor: accentColor, borderTopWidth: '3px', borderTopStyle: 'solid' }}
                            >
                                {stageDeals.map((deal) => (
                                    <div
                                        key={deal.id}
                                        onClick={() => onDealClick(deal)}
                                        className="bg-slate-800 border-2 border-slate-700/50 p-4 rounded-xl shadow-sm transition-all cursor-pointer group hover:border-slate-600/50 hover:shadow-xl"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors truncate">
                                                {deal.name}
                                            </h4>
                                        </div>

                                        <p className="text-[11px] text-slate-500 mb-4 line-clamp-1 flex items-center gap-1">
                                            <TrendingUp size={10} className="text-slate-600" />
                                            {deal.company_name}
                                        </p>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black overflow-hidden border border-slate-600">
                                                    {deal.owner.avatar_url ? (
                                                        <img src={deal.owner.avatar_url} alt={deal.owner.full_name} />
                                                    ) : (
                                                        deal.owner.full_name.charAt(0)
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-100">${deal.value.toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded">
                                                <Calendar size={10} className="text-slate-600" /> {deal.expected_close_date}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {stageDeals.length === 0 && (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                        <Lock size={16} className="text-slate-700" />
                                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest text-center">
                                            Win/Lose via<br />deal button
                                        </span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Non-terminal columns: full drag-and-drop */
                            <div
                                onDragOver={(e) => handleDragOver(e, stage.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, stage.id)}
                                className={`flex-1 flex flex-col gap-3 rounded-2xl p-3 min-h-[550px] transition-all duration-200 ${isOver
                                    ? 'bg-blue-600/10 ring-2 ring-blue-500/50 ring-dashed border-transparent'
                                    : 'bg-slate-900/40 border border-slate-800/60'
                                    }`}
                                style={!isOver ? { borderTopColor: accentColor, borderTopWidth: '3px', borderTopStyle: 'solid' } : undefined}
                            >
                                {stageDeals.map((deal) => (
                                    <div
                                        key={deal.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, deal)}
                                        onDragEnd={handleDragEnd}
                                        onClick={() => onDealClick(deal)}
                                        className={`bg-slate-800 border-2 p-4 rounded-xl shadow-sm transition-all cursor-grab active:cursor-grabbing group ${draggedDealId === deal.id
                                            ? 'border-blue-500/50 scale-95'
                                            : 'border-slate-700/50 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/20'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors truncate">
                                                {deal.name}
                                            </h4>
                                        </div>

                                        <p className="text-[11px] text-slate-500 mb-4 line-clamp-1 flex items-center gap-1">
                                            <TrendingUp size={10} className="text-slate-600" />
                                            {deal.company_name}
                                        </p>

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-black overflow-hidden border border-slate-600">
                                                    {deal.owner.avatar_url ? (
                                                        <img src={deal.owner.avatar_url} alt={deal.owner.full_name} />
                                                    ) : (
                                                        deal.owner.full_name.charAt(0)
                                                    )}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-black text-slate-100">${deal.value.toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1 bg-slate-900/50 px-1.5 py-0.5 rounded">
                                                <Calendar size={10} className="text-slate-600" /> {deal.expected_close_date}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* Empty state hint */}
                                {stageDeals.length === 0 && !isOver && (
                                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-800/50 rounded-xl">
                                        <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Drop here</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
