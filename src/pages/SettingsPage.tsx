import React, { useState, useEffect } from 'react';
import { crmService } from '../services/crmService';
import { CRMSettings } from '../types/crm';
import { Save, AlertCircle, Edit2, Archive, Plus, Trash2, Loader2, Zap, Trophy, ShieldCheck } from 'lucide-react';
import { ToastContainer, useToast } from '../components/common/Toast';

type SettingsTab = 'pipeline' | 'lead-stages' | 'custom-fields' | 'sources' | 'scoring';

const SettingsPage = () => {
    const { toasts, showSuccess, showError, dismissToast } = useToast();
    const [settings, setSettings] = useState<CRMSettings | null>(null);
    const [activeTab, setActiveTab] = useState<SettingsTab>('pipeline');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const data = await crmService.getSettings();
                setSettings(data);
            } catch (error) {
                console.error('Failed to fetch settings', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleSave = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await crmService.updateSettings(settings);
            showSuccess('Configuration saved!');
        } catch (error) {
            console.error('Failed to save settings', error);
            showError('Error saving settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const addStage = () => {
        if (!settings) return;
        const newStage = {
            id: `st-${Date.now()}`,
            name: 'New Stage',
            type: 'OPEN' as const
        };
        setSettings({
            ...settings,
            deal_stages: [...settings.deal_stages, newStage]
        });
    };

    const removeStage = (id: string) => {
        if (!settings) return;
        if (settings.deal_stages.length <= 1) {
            showError('Pipeline must have at least one stage.');
            return;
        }
        setSettings({
            ...settings,
            deal_stages: settings.deal_stages.filter(s => s.id !== id)
        });
    };

    const updateStageName = (idx: number, name: string) => {
        if (!settings) return;
        const newStages = [...settings.deal_stages];
        newStages[idx].name = name;
        setSettings({ ...settings, deal_stages: newStages });
    };

    const addLeadStage = () => {
        if (!settings) return;
        const newStage = {
            id: `st-${Date.now()}`,
            name: 'New Lead Stage'
        };
        setSettings({
            ...settings,
            lead_stages: [...settings.lead_stages, newStage]
        });
    };

    const removeLeadStage = (id: string) => {
        if (!settings) return;
        if (settings.lead_stages.length <= 1) {
            showError('Lead stages must have at least one stage.');
            return;
        }
        setSettings({
            ...settings,
            lead_stages: settings.lead_stages.filter(s => s.id !== id)
        });
    };

    const updateLeadStageName = (idx: number, name: string) => {
        if (!settings) return;
        const newStages = [...settings.lead_stages];
        newStages[idx].name = name;
        setSettings({ ...settings, lead_stages: newStages });
    };

    const addSource = () => {
        if (!settings) return;
        const newSource = {
            id: `src-${Date.now()}`,
            name: 'New Source',
            archived: false
        };
        setSettings({
            ...settings,
            lead_sources: [...settings.lead_sources, newSource]
        });
    };

    const toggleArchiveSource = (id: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            lead_sources: settings.lead_sources.map(s =>
                s.id === id ? { ...s, archived: !s.archived } : s
            )
        });
    };

    const updateSourceName = (idx: number, name: string) => {
        if (!settings) return;
        const newSources = [...settings.lead_sources];
        newSources[idx].name = name;
        setSettings({ ...settings, lead_sources: newSources });
    };

    if (isLoading || !settings) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Loading settings...</span>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            <header className="mb-10 flex justify-between items-center">
                <div>
                    <h1 className="text-4xl font-black text-white tracking-tight">CRM Settings</h1>
                    <p className="text-slate-400 mt-1 font-medium">Configure your workspace and custom data points</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-black transition-all shadow-xl shadow-blue-900/30 disabled:opacity-50 active:scale-95"
                >
                    <Save size={20} />
                    {isSaving ? 'Saving...' : 'Save Configuration'}
                </button>
            </header>

            <div className="flex gap-1 mb-8 bg-slate-900/50 p-1 rounded-xl border border-slate-800 w-fit">
                <button
                    onClick={() => setActiveTab('pipeline')}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'pipeline' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Pipeline
                </button>
                <button
                    onClick={() => setActiveTab('lead-stages')}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'lead-stages' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Lead Stages
                </button>
                <button
                    onClick={() => setActiveTab('custom-fields')}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'custom-fields' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Custom Fields
                </button>
                <button
                    onClick={() => setActiveTab('sources')}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'sources' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Lead Sources
                </button>
                <button
                    onClick={() => setActiveTab('scoring')}
                    className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'scoring' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    Lead Scoring
                </button>
            </div>

            <div className="space-y-10">
                {activeTab === 'pipeline' && (
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-white uppercase tracking-widest text-xs">Deal Pipeline Stages</h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-1">THE ORDER DEFINES YOUR SALES FUNNEL</p>
                            </div>
                            <button
                                onClick={addStage}
                                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
                            >
                                <Plus size={12} /> ADD STAGE
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="space-y-3">
                                {settings.deal_stages.map((stage, idx) => (
                                    <div key={stage.id} className="flex items-center gap-4 bg-slate-950/50 border border-slate-800 p-3 rounded-xl group hover:border-slate-700 transition-all">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-slate-500">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={stage.name}
                                                onChange={(e) => updateStageName(idx, e.target.value)}
                                                placeholder="Stage Name"
                                                className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0 placeholder:text-slate-700"
                                            />
                                        </div>
                                        <select
                                            value={stage.type || 'OPEN'}
                                            onChange={(e) => {
                                                const newStages = [...settings.deal_stages];
                                                newStages[idx].type = e.target.value as 'OPEN' | 'WON' | 'LOST';
                                                setSettings({ ...settings, deal_stages: newStages });
                                            }}
                                            className={`bg-slate-900 border border-slate-700 text-[10px] font-black uppercase rounded-lg px-2 py-1 outline-none ${stage.type === 'WON' ? 'text-emerald-400 border-emerald-500/30' :
                                                stage.type === 'LOST' ? 'text-rose-400 border-rose-500/30' :
                                                    'text-slate-300'
                                                }`}
                                        >
                                            <option value="OPEN">OPEN</option>
                                            <option value="WON">WON</option>
                                            <option value="LOST">LOST</option>
                                        </select>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => removeStage(stage.id)}
                                                className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-600 hover:text-rose-400 transition-all"
                                                title="Remove Stage"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'lead-stages' && (
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-white uppercase tracking-widest text-xs">Lead Lifecycle Stages</h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-1">THE ORDER DEFINES YOUR LEAD JOURNEY</p>
                            </div>
                            <button
                                onClick={addLeadStage}
                                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
                            >
                                <Plus size={12} /> ADD STAGE
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="space-y-3">
                                {settings.lead_stages.map((stage, idx) => (
                                    <div key={stage.id} className="flex items-center gap-4 bg-slate-950/50 border border-slate-800 p-3 rounded-xl group hover:border-slate-700 transition-all">
                                        <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-[10px] font-black text-slate-500">
                                            {idx + 1}
                                        </div>
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={stage.name}
                                                onChange={(e) => updateLeadStageName(idx, e.target.value)}
                                                placeholder="Stage Name"
                                                className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0 placeholder:text-slate-700"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => removeLeadStage(stage.id)}
                                                className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-600 hover:text-rose-400 transition-all"
                                                title="Remove Stage"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'custom-fields' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Lead Custom Fields */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-fit">
                            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-white uppercase tracking-widest text-xs">Lead Fields</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        const newField = { id: `lcf-${Date.now()}`, label: 'New Field', type: 'text' as const, required: false };
                                        setSettings({ ...settings, lead_custom_fields: [...settings.lead_custom_fields, newField] });
                                    }}
                                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all active:scale-95"
                                >
                                    <Plus size={12} /> ADD
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="space-y-3">
                                    {settings.lead_custom_fields.map((field, idx) => (
                                        <div key={field.id} className="flex items-center gap-3 bg-slate-950/50 border border-slate-800 p-3 rounded-xl group hover:border-slate-700 transition-all">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) => {
                                                        const newFields = [...settings.lead_custom_fields];
                                                        newFields[idx].label = e.target.value;
                                                        setSettings({ ...settings, lead_custom_fields: newFields });
                                                    }}
                                                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0"
                                                />
                                            </div>
                                            <select
                                                value={field.type}
                                                onChange={(e) => {
                                                    const newFields = [...settings.lead_custom_fields];
                                                    newFields[idx].type = e.target.value as any;
                                                    setSettings({ ...settings, lead_custom_fields: newFields });
                                                }}
                                                className="bg-slate-900 border border-slate-700 text-[10px] font-black uppercase text-slate-300 rounded-lg px-2 py-1 outline-none"
                                            >
                                                <option value="text">TEXT</option>
                                                <option value="number">NUM</option>
                                                <option value="date">DATE</option>
                                                <option value="boolean">BOOL</option>
                                            </select>
                                            <button
                                                onClick={() => {
                                                    setSettings({
                                                        ...settings,
                                                        lead_custom_fields: settings.lead_custom_fields.filter(f => f.id !== field.id)
                                                    });
                                                }}
                                                className="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-600 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* Deal Custom Fields */}
                        <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl h-fit">
                            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                                <div>
                                    <h3 className="font-black text-white uppercase tracking-widest text-xs">Deal Fields</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        const newField = { id: `dcf-${Date.now()}`, label: 'New Field', type: 'text' as const, required: false };
                                        setSettings({ ...settings, deal_custom_fields: [...settings.deal_custom_fields, newField] });
                                    }}
                                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all active:scale-95"
                                >
                                    <Plus size={12} /> ADD
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="space-y-3">
                                    {settings.deal_custom_fields.map((field, idx) => (
                                        <div key={field.id} className="flex items-center gap-3 bg-slate-950/50 border border-slate-800 p-3 rounded-xl group hover:border-slate-700 transition-all">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={field.label}
                                                    onChange={(e) => {
                                                        const newFields = [...settings.deal_custom_fields];
                                                        newFields[idx].label = e.target.value;
                                                        setSettings({ ...settings, deal_custom_fields: newFields });
                                                    }}
                                                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0"
                                                />
                                            </div>
                                            <select
                                                value={field.type}
                                                onChange={(e) => {
                                                    const newFields = [...settings.deal_custom_fields];
                                                    newFields[idx].type = e.target.value as any;
                                                    setSettings({ ...settings, deal_custom_fields: newFields });
                                                }}
                                                className="bg-slate-900 border border-slate-700 text-[10px] font-black uppercase text-slate-300 rounded-lg px-2 py-1 outline-none"
                                            >
                                                <option value="text">TEXT</option>
                                                <option value="number">NUM</option>
                                                <option value="date">DATE</option>
                                                <option value="boolean">BOOL</option>
                                            </select>
                                            <button
                                                onClick={() => {
                                                    setSettings({
                                                        ...settings,
                                                        deal_custom_fields: settings.deal_custom_fields.filter(f => f.id !== field.id)
                                                    });
                                                }}
                                                className="p-1.5 hover:bg-rose-500/10 rounded-lg text-slate-600 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'sources' && (
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-white uppercase tracking-widest text-xs">Lead Sources</h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-1">WHERE DO YOUR LEADS COME FROM?</p>
                            </div>
                            <button
                                onClick={addSource}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all shadow-lg active:scale-95"
                            >
                                <Plus size={12} /> ADD SOURCE
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="space-y-3">
                                {settings.lead_sources.map((source, idx) => (
                                    <div key={source.id} className={`flex items-center gap-4 border p-3 rounded-xl group transition-all ${source.archived
                                        ? 'bg-slate-950/20 border-slate-900 opacity-60'
                                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                                        }`}>
                                        <div className="flex-1">
                                            <input
                                                type="text"
                                                value={source.name}
                                                onChange={(e) => updateSourceName(idx, e.target.value)}
                                                placeholder="Source Name"
                                                className={`w-full bg-transparent border-none p-0 text-sm font-bold focus:ring-0 placeholder:text-slate-700 ${source.archived ? 'text-slate-500 italic line-through' : 'text-white'
                                                    }`}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => toggleArchiveSource(source.id)}
                                                className={`p-2 rounded-lg transition-all ${source.archived
                                                    ? 'hover:bg-emerald-500/10 text-emerald-500'
                                                    : 'hover:bg-slate-700 text-slate-500 hover:text-white'
                                                    }`}
                                                title={source.archived ? 'Unarchive' : 'Archive'}
                                            >
                                                <Archive size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}
                {activeTab === 'scoring' && (
                    <section className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
                            <div>
                                <h3 className="font-black text-white uppercase tracking-widest text-xs flex items-center gap-2">
                                    <Trophy size={14} className="text-amber-400" />
                                    Lead Scoring Rules
                                </h3>
                                <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-tight">DEFINE HOW LEAD QUALITY IS CALCULATED</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (!settings) return;
                                    const newRule = { id: `ls-${Date.now()}`, criteria: 'New Rule', points: 10, type: 'field' as const };
                                    setSettings({ ...settings, lead_scoring: [...settings.lead_scoring, newRule] });
                                }}
                                className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg font-black flex items-center gap-1.5 transition-all active:scale-95"
                            >
                                <Plus size={12} /> ADD RULE
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="space-y-3">
                                {settings.lead_scoring.map((rule, idx) => (
                                    <div key={rule.id} className="flex items-center gap-4 bg-slate-950/50 border border-slate-800 p-4 rounded-xl group hover:border-slate-700 transition-all">
                                        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-amber-500 shadow-inner">
                                            <Zap size={18} />
                                        </div>
                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-2">
                                                <span className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Criteria Description</span>
                                                <input
                                                    type="text"
                                                    value={rule.criteria}
                                                    onChange={(e) => {
                                                        const newScoring = [...settings.lead_scoring];
                                                        newScoring[idx].criteria = e.target.value;
                                                        setSettings({ ...settings, lead_scoring: newScoring });
                                                    }}
                                                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-white focus:ring-0"
                                                />
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Rule Type</span>
                                                <select
                                                    value={rule.type}
                                                    onChange={(e) => {
                                                        const newScoring = [...settings.lead_scoring];
                                                        newScoring[idx].type = e.target.value as any;
                                                        setSettings({ ...settings, lead_scoring: newScoring });
                                                    }}
                                                    className="bg-slate-900 border border-slate-700 text-[10px] font-black uppercase text-slate-300 rounded-lg px-2 py-1 outline-none w-full"
                                                >
                                                    <option value="source">SOURCE</option>
                                                    <option value="activity">ACTIVITY</option>
                                                    <option value="field">DATA FIELD</option>
                                                </select>
                                            </div>
                                            <div>
                                                <span className="text-[8px] font-black text-slate-600 uppercase mb-1 block">Score Points</span>
                                                <input
                                                    type="number"
                                                    value={rule.points}
                                                    onChange={(e) => {
                                                        const newScoring = [...settings.lead_scoring];
                                                        newScoring[idx].points = parseInt(e.target.value) || 0;
                                                        setSettings({ ...settings, lead_scoring: newScoring });
                                                    }}
                                                    className="w-full bg-transparent border-none p-0 text-sm font-bold text-amber-400 focus:ring-0"
                                                />
                                            </div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => {
                                                    setSettings({
                                                        ...settings,
                                                        lead_scoring: settings.lead_scoring.filter(r => r.id !== rule.id)
                                                    });
                                                }}
                                                className="p-2 hover:bg-rose-500/10 rounded-lg text-slate-600 hover:text-rose-400 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};


export default SettingsPage;
