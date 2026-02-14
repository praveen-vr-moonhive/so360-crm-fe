import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KanbanBoard } from '../components/kanban/KanbanBoard';
import { crmService } from '../services/crmService';
import { Deal, DealStage } from '../types/crm';
import { Loader2 } from 'lucide-react';
import { StageTransitionModal } from '../components/kanban/StageTransitionModal';
import { ToastContainer, useToast } from '../components/common/Toast';

import { DealFilters } from '../pages/components/DealFilters';
import { DealFilters as Filters } from '../types/crm';
import { useNotify, useActivity } from '@so360/shell-context';

const PipelinePage = () => {
    const navigate = useNavigate();
    const { toasts, showError, dismissToast } = useToast();
    const { emitNotification } = useNotify();
    const { recordActivity } = useActivity();
    const [deals, setDeals] = useState<Deal[]>([]);
    const [stages, setStages] = useState<{ id: string; name: DealStage }[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isFiltering, setIsFiltering] = useState(false);
    const [filters, setFilters] = useState<Filters>({});

    const [transitionModal, setTransitionModal] = useState<{
        isOpen: boolean;
        deal: Deal | null;
        newStage: DealStage;
        newStageId: string | null;
    }>({
        isOpen: false,
        deal: null,
        newStage: 'Lead',
        newStageId: null
    });

    // Debounce filter changes for text inputs
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [filters]);

    const fetchData = async () => {
        try {
            if (!isInitialLoading) {
                setIsFiltering(true);
            }

            const pipelineData = await crmService.getPipeline(filters);
            const fetchedStages = pipelineData.stages || [];

            if (fetchedStages.length === 0) {
                console.warn('No stages found for pipeline');
            }

            setStages(fetchedStages.map(s => ({
                id: s.id,
                name: s.name as DealStage
            })));

            setDeals(fetchedStages.flatMap(s => s.deals || []));
        } catch (error: any) {
            console.error('Failed to fetch pipeline data', error);
            showError(error.message || 'Failed to load pipeline. Please check your connection or Organization settings.');
        } finally {
            setIsInitialLoading(false);
            setIsFiltering(false);
        }
    };

    const handleStageChange = (deal: Deal, newStageId: string) => {
        const stage = stages.find(s => s.id === newStageId);
        if (!stage) return;

        setTransitionModal({
            isOpen: true,
            deal,
            newStage: stage.name,
            newStageId: newStageId
        });
    };

    const confirmStageChange = async (reason: string) => {
        const { deal, newStage, newStageId } = transitionModal;
        if (!deal || !newStageId) return;

        try {
            await crmService.updateDealStage(deal.id, newStageId, reason);
            const isWon = newStage?.toLowerCase().includes('won');
            const isLost = newStage?.toLowerCase().includes('lost');
            const event = isWon ? 'CRM_DEAL_WON' : isLost ? 'CRM_DEAL_LOST' : 'CRM_DEAL_STAGE_CHANGED';
            recordActivity({ eventType: isWon ? 'deal.won' : isLost ? 'deal.lost' : 'deal.stage_changed', eventCategory: 'crm', description: `Deal "${deal.name}" moved to ${newStage}`, resourceType: 'deal', resourceId: deal.id }).catch(() => {});
            if (isWon || isLost) {
                emitNotification({ event, userIds: deal.owner_id ? [deal.owner_id] : [], variables: { dealName: deal.name, stageName: newStage }, relatedResource: { type: 'deal', id: deal.id } }).catch(() => {});
            }
            setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: newStage, stage_id: newStageId } : d));
        } catch (error) {
            showError('Failed to update stage');
        }
    };

    if (isInitialLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Loading pipeline...</span>
            </div>
        );
    }

    return (
        <div className="p-8 h-full flex flex-col">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <header className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Deals Pipeline</h1>
                    <p className="text-slate-400 mt-1">Visualize deal movement and sales progress</p>
                </div>
                {isFiltering && (
                    <div className="flex items-center gap-2 text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20 animate-pulse">
                        <Loader2 className="animate-spin" size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Refining results...</span>
                    </div>
                )}
            </header>

            <DealFilters filters={filters} onChange={setFilters} />

            <div className={`flex-1 overflow-hidden transition-opacity duration-300 ${isFiltering ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <KanbanBoard
                    deals={deals}
                    stages={stages}
                    onDealClick={(deal) => navigate(`../deal/${deal.id}`)}
                    onStageChange={handleStageChange}
                />
            </div>

            <StageTransitionModal
                isOpen={transitionModal.isOpen}
                onClose={() => setTransitionModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmStageChange}
                deal={transitionModal.deal}
                newStage={transitionModal.newStage}
            />
        </div>
    );
};

export default PipelinePage;
