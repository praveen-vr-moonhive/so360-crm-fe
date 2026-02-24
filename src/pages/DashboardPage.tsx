import React, { useState, useEffect } from 'react';
import { crmService } from '../services/crmService';
import {
    DollarSign, TrendingUp, Users, CheckCircle2,
    BarChart3, ArrowUpRight, ArrowDownRight, Briefcase,
    Calendar, User as UserIcon, Loader2, ShoppingBag, Package
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBusinessSettings, useShell } from '@so360/shell-context';

const DashboardPage = () => {
    const [stats, setStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<'yearly' | 'quarterly' | 'monthly'>('yearly');
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState(() => {
        const month = new Date().getMonth() + 1;
        return Math.ceil(month / 3); // Current quarter
    });
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const { settings } = useBusinessSettings();
    const { isModuleEnabled } = useShell();
    const isDailyStoreEnabled = isModuleEnabled('dailystore');

    const [commerceKPIs, setCommerceKPIs] = useState<{
        revenue: number; orderCount: number; aov: number;
        repeatPurchaseRate: number; refundRate: number;
        orderChartData: { labels: string[]; values: number[] };
    } | null>(null);
    const [isCommerceLoading, setIsCommerceLoading] = useState(false);

    useEffect(() => {
        const fetchStats = async () => {
            setIsLoading(true);
            try {
                const data = await crmService.getDashboardStats({
                    period,
                    year,
                    quarter: period === 'quarterly' ? quarter : undefined,
                    month: period === 'monthly' ? month : undefined,
                });
                setStats(data);
            } catch (error) {
                console.error('Failed to fetch dashboard stats', error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchStats();
    }, [period, year, quarter, month]);

    useEffect(() => {
        if (!isDailyStoreEnabled) return;
        const fetchCommerce = async () => {
            setIsCommerceLoading(true);
            try {
                const data = await crmService.getCommerceKPIs({
                    period,
                    year,
                    quarter: period === 'quarterly' ? quarter : undefined,
                    month: period === 'monthly' ? month : undefined,
                });
                setCommerceKPIs(data);
            } catch (err) {
                console.error('Failed to fetch commerce KPIs', err);
            } finally {
                setIsCommerceLoading(false);
            }
        };
        fetchCommerce();
    }, [isDailyStoreEnabled, period, year, quarter, month]);

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center text-slate-500 gap-3">
                <Loader2 className="animate-spin" />
                <span>Loading insights...</span>
            </div>
        );
    }

    const { financials, counts, teamStats, monthlyRevenue, chartLabels, reminders } = stats;
    const revenueLabels = chartLabels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const formatCurrency = (amount: number) => {
        const locale = settings?.document_language || 'en-US';
        const currency = settings?.base_currency?.toUpperCase();

        if (currency) {
            try {
                return new Intl.NumberFormat(locale, {
                    style: 'currency',
                    currency,
                    maximumFractionDigits: 0,
                }).format(amount);
            } catch {
                return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)}`;
            }
        }

        return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
    };

    const maxRevenue = Math.max(...monthlyRevenue, 1);
    const maxOrders = Math.max(...(commerceKPIs?.orderChartData?.values ?? [0]), 1);
    const maxActivity = Math.max(...teamStats.map((s: any) => s.activityCount), 1);

    return (
        <div className="p-8 space-y-8 pb-16">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight mb-2">Executive Overview</h1>
                    <p className="text-slate-400 font-medium">
                        Sales performance and financial insights for {
                            period === 'yearly'
                                ? `${year}`
                                : period === 'quarterly'
                                    ? `Q${quarter} ${year}`
                                    : `${new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
                        }
                    </p>
                </div>
                <div className="flex gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                        onClick={() => setPeriod('yearly')}
                        className={`px-4 py-2 ${period === 'yearly'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                            } rounded-lg text-xs font-black uppercase tracking-widest transition-colors shadow-sm`}
                    >
                        Yearly
                    </button>
                    <button
                        onClick={() => setPeriod('quarterly')}
                        className={`px-4 py-2 ${period === 'quarterly'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                            } rounded-lg text-xs font-black uppercase tracking-widest transition-colors`}
                    >
                        Quarterly
                    </button>
                    <button
                        onClick={() => setPeriod('monthly')}
                        className={`px-4 py-2 ${period === 'monthly'
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-500 hover:text-slate-300'
                            } rounded-lg text-xs font-black uppercase tracking-widest transition-colors`}
                    >
                        Monthly
                    </button>
                </div>
            </header>

            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-blue-500/50 transition-all">
                    <div className="absolute right-0 top-0 p-32 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-blue-500/10 transition-all" />
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-4 text-blue-400">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <DollarSign size={20} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Deal Revenue</span>
                        </div>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(financials.totalRevenue)}</h3>
                            <span className="text-emerald-400 flex items-center text-xs font-bold mb-1.5">
                                <ArrowUpRight size={14} /> +12.5%
                            </span>
                        </div>
                        {financials.accountingRevenue != null ? (
                            <p className="text-xs mt-2 font-medium">
                                <span className="text-slate-500">Booked: </span>
                                <span className="text-emerald-400">{formatCurrency(financials.accountingRevenue)}</span>
                            </p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-2 font-medium">From won deals</p>
                        )}
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
                    <div className="absolute right-0 top-0 p-32 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/10 transition-all" />
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-4 text-purple-400">
                            <div className="p-2 bg-purple-500/10 rounded-lg">
                                <TrendingUp size={20} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pipeline Value</span>
                        </div>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(financials.pipelineValue)}</h3>
                            <span className="text-slate-500 text-xs font-bold mb-1.5 uppercase tracking-wider">
                                {counts.deals} Active Deals
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-medium">Projected revenue</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                    <div className="absolute right-0 top-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/10 transition-all" />
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-4 text-emerald-400">
                            <div className="p-2 bg-emerald-500/10 rounded-lg">
                                <BarChart3 size={20} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Win Rate</span>
                        </div>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-white tracking-tight">{financials.winRate.toFixed(1)}%</h3>
                            <span className="text-emerald-400 flex items-center text-xs font-bold mb-1.5">
                                <ArrowUpRight size={14} /> +2.4%
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-medium">AVG Deal Closure</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
                    <div className="absolute right-0 top-0 p-32 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-amber-500/10 transition-all" />
                    <div className="relative">
                        <div className="flex items-center gap-3 mb-4 text-amber-400">
                            <div className="p-2 bg-amber-500/10 rounded-lg">
                                <Briefcase size={20} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Avg Deal Size</span>
                        </div>
                        <div className="flex items-end gap-3">
                            <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(financials.avgDealSize)}</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-2 font-medium">Per closed-won deal</p>
                    </div>
                </div>
            </div>

            {/* Commerce Performance — DailyStore gated */}
            {isDailyStoreEnabled && (
                <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <ShoppingBag size={16} className="text-purple-400" />
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Commerce Performance
                        </h2>
                        <span className="text-[9px] font-black uppercase tracking-widest bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                            DailyStore
                        </span>
                        {isCommerceLoading && <Loader2 size={12} className="animate-spin text-slate-500 ml-auto" />}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {/* 1. Ecommerce Revenue */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-purple-500/50 transition-all">
                            <div className="absolute right-0 top-0 p-24 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/10 transition-all" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3 text-purple-400">
                                    <div className="p-1.5 bg-purple-500/10 rounded-lg"><DollarSign size={16} /></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Revenue</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight">
                                    {formatCurrency(commerceKPIs?.revenue ?? 0)}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Recognized (paid)</p>
                            </div>
                        </div>

                        {/* 2. Orders Count */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-cyan-500/50 transition-all">
                            <div className="absolute right-0 top-0 p-24 bg-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-cyan-500/10 transition-all" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3 text-cyan-400">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg"><Package size={16} /></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Orders</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight">
                                    {(commerceKPIs?.orderCount ?? 0).toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Total orders placed</p>
                            </div>
                        </div>

                        {/* 3. AOV */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-violet-500/50 transition-all">
                            <div className="absolute right-0 top-0 p-24 bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-violet-500/10 transition-all" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3 text-violet-400">
                                    <div className="p-1.5 bg-violet-500/10 rounded-lg"><BarChart3 size={16} /></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">AOV</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight">
                                    {formatCurrency(commerceKPIs?.aov ?? 0)}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Avg order value</p>
                            </div>
                        </div>

                        {/* 4. Repeat Purchase % */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
                            <div className="absolute right-0 top-0 p-24 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-emerald-500/10 transition-all" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3 text-emerald-400">
                                    <div className="p-1.5 bg-emerald-500/10 rounded-lg"><Users size={16} /></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Repeat</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight">
                                    {(commerceKPIs?.repeatPurchaseRate ?? 0).toFixed(1)}%
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Repeat purchase rate</p>
                            </div>
                        </div>

                        {/* 5. Refund % */}
                        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-rose-500/50 transition-all">
                            <div className="absolute right-0 top-0 p-24 bg-rose-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-rose-500/10 transition-all" />
                            <div className="relative">
                                <div className="flex items-center gap-2 mb-3 text-rose-400">
                                    <div className="p-1.5 bg-rose-500/10 rounded-lg"><TrendingUp size={16} className="rotate-180" /></div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Refund</span>
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight">
                                    {(commerceKPIs?.refundRate ?? 0).toFixed(1)}%
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Refund rate</p>
                            </div>
                        </div>
                    </div>

                    {/* Orders Distribution chart */}
                    {commerceKPIs?.orderChartData && commerceKPIs.orderChartData.values.length > 0 && (
                        <div className="mt-6 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-base font-black text-white tracking-tight">Orders Distribution</h3>
                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Order volume by period</p>
                                </div>
                                <div className="px-3 py-1 bg-slate-800 rounded-lg flex items-center gap-2 text-xs font-bold text-slate-400">
                                    <div className="w-2 h-2 rounded-full bg-cyan-500" /> DailyStore Orders
                                </div>
                            </div>

                            <div className="h-48 flex items-end justify-between gap-2 px-4 relative">
                                {/* Grid lines */}
                                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 z-0">
                                    <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                                    <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                                    <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                                    <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                                </div>

                                {commerceKPIs.orderChartData.values.map((val: number, idx: number) => {
                                    const heightPct = Math.max((val / maxOrders) * 100, 4);
                                    return (
                                        <div key={idx} className="flex-1 flex flex-col justify-end group relative z-10 h-full">
                                            <div
                                                className="w-full bg-cyan-500/20 border-t-2 border-cyan-500 rounded-t-sm hover:bg-cyan-500/40 transition-all relative group-hover:shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                                                style={{ height: `${heightPct}%` }}
                                            >
                                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none border border-slate-700">
                                                    {val} orders
                                                </div>
                                            </div>
                                            <span className="text-[10px] uppercase font-bold text-slate-500 text-center mt-3 group-hover:text-cyan-400 transition-colors">
                                                {commerceKPIs.orderChartData.labels[idx]}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </section>
            )}

            {/* Active Reminders Row */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-white tracking-tight">Active Reminders</h3>
                    <Link to="/tasks" className="text-[10px] font-black text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors">View All Tasks</Link>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {reminders.length > 0 ? reminders.map((task: any) => (
                        <Link
                            key={task.id}
                            to={`/tasks/${task.id}`}
                            className="flex-shrink-0 w-72 bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-blue-500/50 transition-all group"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Upcoming</span>
                                </div>
                                <span className="text-[9px] font-bold text-slate-500">{new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <h4 className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors truncate mb-1">{task.title}</h4>
                            <p className="text-[11px] text-slate-500 line-clamp-1 mb-3">{task.description || "No description provided"}</p>
                            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-slate-800/50">
                                <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[8px] font-black border border-slate-700">
                                    {task.assigned_to?.avatar_url ? (
                                        <img src={task.assigned_to.avatar_url} className="w-full h-full rounded-full" />
                                    ) : task.assigned_to?.full_name?.charAt(0)}
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 truncate">{task.assigned_to?.full_name}</span>
                            </div>
                        </Link>
                    )) : (
                        <div className="w-full py-8 text-center bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">No active reminders</p>
                        </div>
                    )}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-lg font-black text-white tracking-tight">Revenue Performance</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Monthly Revenue Distribution</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                            <div className="px-3 py-1 bg-slate-800 rounded-lg flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500" /> Current Year
                            </div>
                        </div>
                    </div>

                    <div className="h-64 flex items-end justify-between gap-2 px-4 relative">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 z-0">
                            <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                            <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                            <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                            <div className="w-full h-px bg-slate-700 border-t border-dashed" />
                        </div>

                        {monthlyRevenue.map((val: number, idx: number) => {
                            const heightPercentage = Math.max((val / maxRevenue) * 100, 4);

                            return (
                                <div key={idx} className="flex-1 flex flex-col justify-end group relative z-10 h-full">
                                    <div
                                        className="w-full bg-blue-500/20 border-t-2 border-blue-500 rounded-t-sm hover:bg-blue-500/40 transition-all relative group-hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                                        style={{ height: `${heightPercentage}%` }}
                                    >
                                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none border border-slate-700">
                                            {formatCurrency(val)}
                                        </div>
                                    </div>
                                    <span className="text-[10px] uppercase font-bold text-slate-500 text-center mt-3 group-hover:text-blue-400 transition-colors">{revenueLabels[idx]}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Team Leaderboard */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm overflow-hidden flex flex-col">
                    <h3 className="text-lg font-black text-white tracking-tight mb-1">Top Performers</h3>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-6">Revenue Leaders</p>

                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {teamStats.map((stat: any, index: number) => (
                            <div key={stat.user.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all group">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs ${index === 0 ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' :
                                    index === 1 ? 'bg-slate-700 text-slate-300' :
                                        index === 2 ? 'bg-slate-800 text-slate-400' :
                                            'bg-transparent text-slate-600'
                                    }`}>
                                    {index + 1}
                                </div>

                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-700">
                                    {stat.user.avatar_url ? (
                                        <img src={stat.user.avatar_url} alt={stat.user.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="text-xs font-bold text-slate-400">{stat.user.full_name?.charAt(0)}</span>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">{stat.user.full_name}</h4>
                                    <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">
                                        <span>{stat.dealCount} Deals</span>
                                        <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                        <span>{stat.activeLeads} Leads</span>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <span className="block text-sm font-black text-emerald-400 tracking-tight">{formatCurrency(stat.revenue)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Employee Performance Visualization */}
            <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-64 bg-blue-500/5 rounded-full blur-[120px] shadow-2xl pointer-events-none" />
                <div className="relative z-10">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight">Performance Analytics</h3>
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Activity vs. Conversion Efficiency</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {teamStats.slice(0, 4).map((stat: any) => (
                            <div key={stat.user.id} className="bg-slate-950/50 border border-slate-800/80 p-5 rounded-2xl hover:border-slate-700 transition-all">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                                        {stat.user.avatar_url ? <img src={stat.user.avatar_url} /> : stat.user.full_name.charAt(0)}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-white">{stat.user.full_name}</span>
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.user.role || 'Sales Rep'}</span>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <div className="flex justify-between text-[10px] uppercase font-black tracking-widest mb-1.5">
                                            <span className="text-slate-500">Activity Level</span>
                                            <span className="text-blue-400">{stat.activityCount} pts</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-1000"
                                                style={{ width: `${(stat.activityCount / maxActivity) * 100}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between text-[10px] uppercase font-black tracking-widest mb-1.5">
                                            <span className="text-slate-500">Conversion Rate</span>
                                            <span className="text-emerald-400">{stat.conversionRate.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] transition-all duration-1000"
                                                style={{ width: `${Math.min(stat.conversionRate * 2, 100)}%` }} // Scaling for visual impact
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-6">
                                    <div className="bg-slate-900/50 p-2 rounded-lg text-center">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Won</div>
                                        <div className="text-sm font-black text-white">{stat.dealCount}</div>
                                    </div>
                                    <div className="bg-slate-900/50 p-2 rounded-lg text-center">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Leads</div>
                                        <div className="text-sm font-black text-white">{stat.activeLeads}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
};

export default DashboardPage;
