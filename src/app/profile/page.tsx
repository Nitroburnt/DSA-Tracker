'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { dbService, Problem, UserCompletion } from '@/lib/db';
import { GuestDataService } from '@/lib/guestDataService';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Award, Flame, Calendar, BookOpen, Clock, ExternalLink, ChevronDown, LogIn } from 'lucide-react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';

export default function ProfilePage() {
  const { user, loading, isGuest } = useAuth();
  const router = useRouter();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [completions, setCompletions] = useState<UserCompletion[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Redirect only if not authenticated AND not a guest
  useEffect(() => {
    if (!loading && !user && !isGuest) {
      router.push('/auth');
    }
  }, [user, loading, isGuest, router]);

  // Load data — authenticated users get DB data, guests get localStorage data
  useEffect(() => {
    const fetchAuthData = async (userId: string) => {
      try {
        setDataLoading(true);
        const [fetchedProblems, fetchedCompletions] = await Promise.all([
          dbService.getProblems(),
          dbService.getCompletions(userId),
        ]);
        setProblems(fetchedProblems);
        const sortedCompletions = [...fetchedCompletions].sort(
          (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
        );
        setCompletions(sortedCompletions);
      } catch (err) {
        console.error('Error fetching profile data:', err);
      } finally {
        setDataLoading(false);
      }
    };

    const fetchGuestData = async () => {
      try {
        setDataLoading(true);
        const fetchedProblems = await dbService.getProblems();
        setProblems(fetchedProblems);

        const guestData = GuestDataService.read();
        if (guestData) {
          // Convert guest completions map → UserCompletion array
          const guestCompletions: UserCompletion[] = Object.entries(guestData.completions)
            .map(([problemId, completedAt]) => ({
              id: `guest-${problemId}`,
              user_id: 'guest',
              problem_id: problemId,
              completed_at: completedAt,
            }))
            .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
          setCompletions(guestCompletions);
        }
      } catch (err) {
        console.error('Error fetching guest profile data:', err);
      } finally {
        setDataLoading(false);
      }
    };

    if (user?.id) {
      fetchAuthData(user.id);
    } else if (!loading && isGuest) {
      fetchGuestData();
    }
  }, [user, loading, isGuest]);

  // Map problem ID to problem details
  const problemsMap = React.useMemo(() => {
    const map: Record<string, Problem> = {};
    problems.forEach((p) => { map[p.id] = p; });
    return map;
  }, [problems]);

  // Group completions by date for heatmap
  const completionsByDate = React.useMemo(() => {
    const counts: Record<string, number> = {};
    completions.forEach((c) => {
      const d = new Date(c.completed_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      counts[dateStr] = (counts[dateStr] || 0) + 1;
    });
    return counts;
  }, [completions]);

  // Tooltip state
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; text: string } | null>(null);

  // Year selector
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 3 + i);

  type DayCell = {
    blank: boolean; day: number; date: Date | null;
    dateStr: string; count: number; isFuture: boolean;
  };

  const monthsData = React.useMemo(() => {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return MONTH_NAMES.map((name, m) => {
      const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();
      const firstDow = new Date(selectedYear, m, 1).getDay();
      const cells: DayCell[] = [];
      for (let i = 0; i < firstDow; i++) {
        cells.push({ blank: true, day: 0, date: null, dateStr: '', count: 0, isFuture: false });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(selectedYear, m, d);
        const dateStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ blank: false, day: d, date, dateStr, count: completionsByDate[dateStr] || 0, isFuture: date > today });
      }
      const numCols = Math.ceil(cells.length / 7);
      return { name, cells, numCols, daysInMonth };
    });
  }, [selectedYear, completionsByDate]);

  const getCellClass = (count: number, isFuture: boolean): string => {
    if (isFuture) return 'bg-[#2a2a2a] border border-[#3a3a3a] cursor-default';
    if (count === 0) return 'bg-[#2a2a2a] border border-[#3a3a3a] cursor-default';
    if (count === 1) return 'bg-[#0E4429] border border-[#0E4429] hover:bg-[#006d32] cursor-pointer';
    if (count === 2) return 'bg-[#006d32] border border-[#006d32] hover:bg-[#26a641] cursor-pointer';
    if (count <= 4) return 'bg-[#26a641] border border-[#26a641] hover:bg-neon shadow-[0_0_4px_rgba(0,255,102,0.3)] cursor-pointer';
    return 'bg-neon border border-neon shadow-[0_0_8px_rgba(0,255,102,0.6)] hover:shadow-[0_0_14px_rgba(0,255,102,0.9)] cursor-pointer';
  };

  const formatTooltipDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const yearCompletionCount = React.useMemo(() =>
    completions.filter(c => new Date(c.completed_at).getFullYear() === selectedYear).length,
    [completions, selectedYear]
  );

  // Derived display values
  const rawName = isGuest ? 'Guest' : user?.display_name ?? '';
  const displayName = (rawName === 'User' || rawName === 'Cyber Warrior' || rawName === '')
    ? (user?.email?.split('@')[0] ?? 'Guest')
    : rawName;
  const displayEmail  = isGuest ? null : user?.email;
  const guestSnapshot = isGuest ? GuestDataService.read() : null;
  const currentStreak = isGuest ? (guestSnapshot?.current_streak ?? 0) : (user?.current_streak ?? 0);
  const maxStreak     = isGuest ? (guestSnapshot?.max_streak ?? 0)     : (user?.max_streak ?? 0);

  // Only count completions that have a matching problem in the map
  const resolvedCompletionCount = completions.filter(c => !!problemsMap[c.problem_id]).length;

  if (loading || dataLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-black p-4">
        <div className="space-y-4 text-center">
          <div className="relative w-12 h-12 mx-auto">
            <div className="absolute inset-0 border-2 border-cyan/20 rounded-full" />
            <div className="absolute inset-0 border-2 border-t-cyan border-r-cyan rounded-full animate-spin" />
          </div>
          <p className="font-orbitron text-xs text-cyan tracking-widest uppercase animate-pulse">
            Loading DSA Tracker...
          </p>
        </div>
      </div>
    );
  }

  if (!user && !isGuest) return null;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-black text-slate-300 relative pb-16">
      {/* Background Cyber Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#09090c_1px,transparent_1px),linear-gradient(to_bottom,#09090c_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none" />

      {/* TOP HEADER */}
      <header className="border-b border-cyber-border bg-black/80 backdrop-blur sticky top-0 z-40 px-4 md:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 border border-cyber-border text-slate-400 hover:border-cyan hover:text-cyan px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider font-chakra text-xs"
          >
            <ArrowLeft size={14} />
            <span>Home</span>
          </button>
          <h1 className="font-orbitron text-base font-extrabold tracking-widest text-slate-400 uppercase select-none hidden sm:block">
            PROFILE ANALYSIS
          </h1>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-4xl w-full mx-auto px-4 md:px-8 mt-8 flex-1 space-y-8 relative z-10">

        {/* GUEST BANNER */}
        {isGuest && (
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 border border-cyan/30 bg-cyan/5 rounded-lg font-chakra text-xs">
            <p className="text-slate-300">
              You're in guest mode. Sign in to save your progress to the cloud and access it anywhere.
            </p>
            <button
              onClick={() => router.push('/auth?intent=signin')}
              className="flex items-center gap-1.5 border border-cyan text-cyan hover:bg-cyan/15 px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider font-bold whitespace-nowrap flex-shrink-0"
            >
              <LogIn size={13} />
              Sign In
            </button>
          </div>
        )}

        {/* IDENTITY BLOCK */}
        <section className="bg-dark-surface border border-cyber-border p-6 rounded relative">
          <div className="absolute -top-[1px] -left-[1px] w-3 h-3 border-t-2 border-l-2 border-cyan" />
          <div className="absolute -bottom-[1px] -right-[1px] w-3 h-3 border-b-2 border-r-2 border-neon" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h2 className="font-orbitron text-xl md:text-2xl font-black text-slate-100 uppercase tracking-widest">
                {displayName}
              </h2>
              {displayEmail && (
                <p className="font-chakra text-xs text-slate-500 tracking-wider">
                  Mail // <span className="text-slate-400">{displayEmail}</span>
                </p>
              )}
              {(isGuest || user?.role === 'admin') && (
                <div className="inline-block mt-2">
                  <span className="px-2 py-0.5 border border-cyber-border bg-black text-slate-400 rounded text-[10px] uppercase font-bold tracking-widest">
                    {isGuest ? 'ROLE: GUEST' : `ROLE: ${user?.role}`}
                  </span>
                </div>
              )}
            </div>

            {/* Core Metrics Row */}
            <div className="grid grid-cols-3 gap-4 md:gap-8 font-chakra">
              <div className="text-center p-3 border border-cyber-border bg-black/40 rounded min-w-[90px] md:min-w-[110px]">
                <BookOpen size={16} className="text-slate-500 mx-auto mb-1" />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Completed</p>
                <p className="font-orbitron text-xl font-bold text-slate-200 mt-1">{completions.length}</p>
              </div>
              <div className="text-center p-3 border border-cyber-border bg-black/40 rounded min-w-[90px] md:min-w-[110px]">
                <Flame size={16} className="text-neon mx-auto mb-1 animate-pulse" />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Active Streak</p>
                <p className="font-orbitron text-xl font-bold text-neon cyber-glow-green mt-1">
                  {currentStreak} <span className="font-chakra text-xs text-slate-400 font-normal lowercase">days</span>
                </p>
              </div>
              <div className="text-center p-3 border border-cyber-border bg-black/40 rounded min-w-[90px] md:min-w-[110px]">
                <Award size={16} className="text-cyan mx-auto mb-1" />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Max Streak</p>
                <p className="font-orbitron text-xl font-bold text-cyan cyber-glow-cyan mt-1">
                  {maxStreak} <span className="font-chakra text-xs text-slate-400 font-normal lowercase">days</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ACTIVITY HEATMAP */}
        <section className="bg-dark-surface border border-cyber-border rounded">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyber-border/40 px-6 pt-6 pb-4">
            <div>
              <h3 className="font-orbitron text-xs font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
                <Calendar size={14} className="text-cyan" />
                Activity Grid // {selectedYear}
              </h3>
              <p className="font-chakra text-[10px] text-slate-500 mt-1">
                {yearCompletionCount} problem{yearCompletionCount !== 1 ? 's' : ''} solved in {selectedYear}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="bg-black border border-cyber-border text-slate-300 font-chakra text-xs px-3 py-1.5 pr-8 rounded-sm appearance-none focus:outline-none focus:border-cyan cursor-pointer cyber-transition hover:border-cyan/60"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y} className="bg-black">{y}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
              <div className="flex items-center gap-1.5 font-chakra text-[10px] text-slate-500">
                <span className="uppercase mr-0.5">Less</span>
                <div className="w-[11px] h-[11px] bg-[#0E4429] rounded-[2px]" />
                <div className="w-[11px] h-[11px] bg-[#006d32] rounded-[2px]" />
                <div className="w-[11px] h-[11px] bg-[#26a641] rounded-[2px]" />
                <div className="w-[11px] h-[11px] bg-neon rounded-[2px] shadow-[0_0_5px_rgba(0,255,102,0.7)]" />
                <span className="uppercase ml-0.5">More</span>
              </div>
            </div>
          </div>

          <SimpleBar
            autoHide={false}
            style={{ maxWidth: '100%', paddingLeft: '1.5rem', paddingRight: '1.5rem', paddingTop: '2rem', paddingBottom: '2rem' }}
          >
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {monthsData.map((month) => (
                <div key={month.name} className="flex-shrink-0">
                  <div className="font-chakra text-[10px] text-slate-400 mb-2 tracking-wider select-none h-4 leading-none">
                    {month.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 11px)', gridTemplateColumns: `repeat(${month.numCols}, 11px)`, gap: '3px', gridAutoFlow: 'column' }}>
                    {month.cells.map((cell, ci) => (
                      cell.blank
                        ? <div key={ci} style={{ width: 11, height: 11 }} />
                        : <div
                            key={ci}
                            style={{ width: 11, height: 11, borderRadius: 2 }}
                            className={`cyber-transition ${getCellClass(cell.count, cell.isFuture)}`}
                            onMouseEnter={(e) => {
                              if (cell.isFuture || !cell.date) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltip({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 6,
                                text: cell.count === 0
                                  ? `No problems on ${formatTooltipDate(cell.date)}`
                                  : `${cell.count} problem${cell.count > 1 ? 's' : ''} completed on ${formatTooltipDate(cell.date)}`,
                              });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                          />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SimpleBar>
        </section>

        {/* Fixed Tooltip */}
        {tooltip && (
          <div
            className="fixed z-[9999] pointer-events-none font-chakra text-[10px] text-slate-100 bg-[#0B0B0F] border border-cyber-border px-2.5 py-1.5 rounded shadow-2xl whitespace-nowrap"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
          >
            {tooltip.text}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-l-transparent border-r-transparent border-t-[#1F1F2E]" />
          </div>
        )}

        {/* HISTORY */}
        <section className="bg-dark-surface border border-cyber-border p-6 rounded space-y-4">
          <div className="flex items-center justify-between border-b border-cyber-border/40 pb-3">
            <h3 className="font-orbitron text-xs font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
              <Clock size={14} className="text-neon" />
              History
            </h3>
            <span className="font-chakra text-[10px] text-slate-500 px-2 py-0.5 border border-cyber-border rounded">
              {resolvedCompletionCount} Problem{resolvedCompletionCount !== 1 ? 's' : ''} Solved
            </span>
          </div>

          {completions.length === 0 ? (
            <div className="text-center py-10 font-chakra text-sm text-slate-600">
              <Clock size={28} className="mx-auto mb-2 text-slate-800" />
              No problems solved yet.
            </div>
          ) : (
            <SimpleBar autoHide={false} style={{ maxHeight: '320px' }} className="pr-2 select-text">
              <div className="space-y-2">
                {completions.map((comp) => {
                  const problem = problemsMap[comp.problem_id];
                  if (!problem) return null;
                  return (
                    <div
                      key={comp.id}
                      className="p-3 border border-cyber-border hover:border-cyan/40 bg-black/40 hover:bg-black/60 rounded flex items-center justify-between gap-4 font-chakra text-xs cyber-transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-sm">{problem.problem_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-black border border-cyber-border/60 text-slate-400 rounded-sm">
                            {problem.topic}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                          {(() => {
                            const d = new Date(comp.completed_at);
                            return isNaN(d.getTime()) ? 'Completed: Unknown' : `Completed: ${d.toLocaleString()}`;
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {problem.link_1 && problem.link_1.startsWith('http') && (
                          <a href={problem.link_1} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 border border-cyber-border hover:border-cyan text-slate-400 hover:text-cyan rounded-sm cursor-pointer cyber-transition"
                            title="Strike Link">
                            <ExternalLink size={12} />
                          </a>
                        )}
                        {problem.link_2 && problem.link_2.startsWith('http') && (
                          <a href={problem.link_2} target="_blank" rel="noopener noreferrer"
                            className="p-1.5 border border-cyber-border hover:border-slate-400 text-slate-600 hover:text-slate-300 rounded-sm cursor-pointer cyber-transition"
                            title="Alt Link">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </SimpleBar>
          )}
        </section>

      </main>
    </div>
  );
}
