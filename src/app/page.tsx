'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { dbService, Problem } from '@/lib/db';
import { GuestDataService } from '@/lib/guestDataService';
import { useRouter } from 'next/navigation';
import { 
  User, 
  LogOut, 
  ExternalLink, 
  Plus, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Terminal,
  BookOpen, 
  Zap
} from 'lucide-react';

export default function HomePage() {
  const { user, loading, isAdmin, logout, isMockMode, isGuest } = useAuth();
  const router = useRouter();

  const [problems, setProblems] = useState<Problem[]>([]);
  const [completions, setCompletions] = useState<Record<string, boolean>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string | null>(null); // For active styling
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({});
  const [guestStreaks, setGuestStreaks] = useState({ current: 0, max: 0 });
  const [liveStreaks, setLiveStreaks] = useState({ current: 0, max: 0 });

  // Sync liveStreaks whenever the user object changes (login, page load)
  useEffect(() => {
    if (user) {
      setLiveStreaks({ current: user.current_streak, max: user.max_streak });
    }
  }, [user]);

  // Admin Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminTopicId, setAdminTopicId] = useState('');
  const [adminNewTopic, setAdminNewTopic] = useState('');
  const [adminDay, setAdminDay] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminLink1, setAdminLink1] = useState('');
  const [adminLink2, setAdminLink2] = useState('');
  const [adminError, setAdminError] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [topics, setTopics] = useState<import('@/lib/db').Topic[]>([]);


  // Check authentication — guests are allowed; no redirect needed

  // Load Curriculum and Completions
  const loadData = async (userId: string) => {
    try {
      setDataLoading(true);
      const [fetchedProblems, fetchedCompletions, fetchedTopics] = await Promise.all([
        dbService.getProblems(),
        dbService.getCompletions(userId),
        dbService.getTopics(),
      ]);

      setProblems(fetchedProblems);
      setTopics(fetchedTopics);
      
      const completionsMap: Record<string, boolean> = {};
      fetchedCompletions.forEach((c) => {
        completionsMap[c.problem_id] = true;
      });
      setCompletions(completionsMap);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  const loadGuestData = async () => {
    try {
      setDataLoading(true);
      const [fetchedProblems, fetchedTopics] = await Promise.all([
        dbService.getProblems(),
        dbService.getTopics(),
      ]);
      setProblems(fetchedProblems);
      setTopics(fetchedTopics);

      const guestData = GuestDataService.read();
      const rawCompletions = guestData?.completions ?? {};
      const completionsMap: Record<string, boolean> = {};
      Object.keys(rawCompletions).forEach((problemId) => {
        completionsMap[problemId] = true;
      });
      setCompletions(completionsMap);

      if (guestData) {
        setGuestStreaks({ current: guestData.current_streak, max: guestData.max_streak });
      }
    } catch (err) {
      console.error('Error fetching guest data:', err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadData(user.id);
    } else if (!loading && isGuest) {
      loadGuestData();
    }
  }, [user, isGuest, loading]);

  // Toggle Collapse on Header Click
  const toggleTopicCollapse = (topic: string) => {
    setCollapsedTopics((prev) => ({
      ...prev,
      [topic]: !prev[topic],
    }));
  };

  // Snappy Checkbox Action (with Optimistic UI update)
  const handleCheckboxToggle = async (problemId: string, _problemName: string) => {
    if (isGuest) {
      setCompletions(prev => ({ ...prev, [problemId]: true }));
      GuestDataService.addCompletion(problemId);
      const updated = GuestDataService.read();
      if (updated) setGuestStreaks({ current: updated.current_streak, max: updated.max_streak });
      return;
    }

    if (!user) return;

    const isCurrentlyCompleted = !!completions[problemId];

    // Once marked complete, it cannot be undone
    if (isCurrentlyCompleted) return;

    const newCompletedState = true;

    // 1. Optimistic Update (Immediate UI reaction)
    setCompletions(prev => ({
      ...prev,
      [problemId]: newCompletedState
    }));

    try {
      // 2. Perform background write to Database / Mock
      const res = await dbService.toggleCompletion(user.id, problemId, newCompletedState);
      if (!res.success) {
        throw new Error(res.error || 'Server rejected transaction.');
      }
      // Update streaks immediately without requiring a page reload
      setLiveStreaks({ current: res.current_streak, max: res.max_streak });
    } catch (err: any) {
      // 3. Revert Optimistic state if DB write fails
      setCompletions(prev => ({
        ...prev,
        [problemId]: isCurrentlyCompleted
      }));
    }
  };

  // Add Problem form handler (Admin only)
  const handleAddProblemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    // Resolve topic: if "__new__" selected, create the new topic first
    let resolvedTopicId = adminTopicId;

    if (adminTopicId === '__new__') {
      if (!adminNewTopic.trim()) {
        setAdminError('Please enter a name for the new topic.');
        return;
      }
      const topicRes = await dbService.addTopic(adminNewTopic.trim());
      if (!topicRes.success || !topicRes.topic) {
        setAdminError(topicRes.error || 'Failed to create new topic.');
        return;
      }
      resolvedTopicId = topicRes.topic.id;
      setTopics(prev => [...prev, topicRes.topic!].sort((a, b) => a.name.localeCompare(b.name)));
    }

    if (!resolvedTopicId || !adminDay.trim() || !adminName.trim() || !adminLink1.trim()) {
      setAdminError('Topic, Day, Problem Name, and Link 1 are required.');
      return;
    }

    const dayNumber = parseInt(adminDay, 10);
    if (isNaN(dayNumber) || dayNumber <= 0) {
      setAdminError('Day number must be a positive integer.');
      return;
    }

    setAdminSubmitting(true);
    try {
      const res = await dbService.addProblem(
        resolvedTopicId,
        dayNumber,
        adminName.trim(),
        adminLink1.trim(),
        adminLink2.trim() || undefined
      );

      if (res.success) {
        setAdminTopicId('');
        setAdminNewTopic('');
        setAdminDay('');
        setAdminName('');
        setAdminLink1('');
        setAdminLink2('');
        setShowAdminModal(false);
        if (user?.id) await loadData(user.id);
      } else {
        setAdminError(res.error || 'Failed to add problem.');
      }
    } catch (err: any) {
      setAdminError(err.message || 'Something went wrong.');
    } finally {
      setAdminSubmitting(false);
    }
  };

  // Group problems by topic
  const groupedProblems = problems.reduce((acc, problem) => {
    if (!acc[problem.topic]) {
      acc[problem.topic] = [];
    }
    acc[problem.topic].push(problem);
    return acc;
  }, {} as Record<string, Problem[]>);

  // Loading state fallback
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

  // Guests are allowed on this page; only block unexpected unauthenticated non-guest state
  if (!isGuest && !user) return null;

  // Derived display values for the sidebar bio card
  const rawDisplayName = isGuest ? 'Guest' : user!.display_name;
  const displayName = (rawDisplayName === 'User' || rawDisplayName === 'Cyber Warrior' || rawDisplayName === '')
    ? (user?.email?.split('@')[0] ?? 'Guest')
    : rawDisplayName;
  const displayEmail  = isGuest ? ''      : user!.email;
  const currentStreak = isGuest ? guestStreaks.current : liveStreaks.current;
  const maxStreak     = isGuest ? guestStreaks.max     : liveStreaks.max;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-black text-slate-300 relative pb-16">
      {/* Background Cyber Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#09090c_1px,transparent_1px),linear-gradient(to_bottom,#09090c_1px,transparent_1px)] bg-[size:5rem_5rem] pointer-events-none" />

      {/* TOP HEADER */}
      <header className="border-b border-cyber-border bg-black/80 backdrop-blur sticky top-0 z-40 px-4 md:px-8 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          {/* Dashboard Title */}
          <div className="flex items-center gap-3">
            <Zap className="text-neon animate-pulse" size={20} />
            <h1 className="font-orbitron text-xl md:text-2xl font-black tracking-widest text-slate-100 uppercase select-none">
              DSA TRACKER
            </h1>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3 md:gap-4 font-chakra text-xs">
            {isMockMode && (
              <span className="hidden sm:inline-flex px-2 py-0.5 border border-cyan/40 bg-cyan/5 text-cyan uppercase tracking-widest rounded-sm text-[10px]">
                Sandbox
              </span>
            )}

            {isGuest ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-1.5 border border-cyber-border text-slate-300 hover:border-cyan hover:text-cyan px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider"
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>
                <button
                  onClick={() => router.push('/auth?intent=signin')}
                  className="flex items-center gap-1.5 border border-cyan text-cyan hover:bg-cyan/15 px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider font-bold"
                >
                  <span>Sign In / Sign Up</span>
                </button>
              </div>
            ) : (
              <>
                {isAdmin && (
                  <button
                    onClick={() => setShowAdminModal(true)}
                    className="flex items-center gap-1 bg-black border border-cyan text-cyan hover:bg-cyan/15 px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider font-bold"
                  >
                    <Plus size={14} />
                    <span>Add Problem</span>
                  </button>
                )}

                <button
                  onClick={() => router.push('/profile')}
                  className="flex items-center gap-1.5 border border-cyber-border text-slate-300 hover:border-cyan hover:text-cyan px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider"
                >
                  <User size={14} />
                  <span>Profile</span>
                </button>

                <button
                  onClick={logout}
                  className="flex items-center gap-1.5 border border-cyber-border text-slate-400 hover:border-red-500 hover:text-red-400 px-3 py-1.5 rounded-sm cursor-pointer cyber-transition uppercase tracking-wider"
                >
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>

        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-6xl w-full mx-auto px-4 md:px-8 mt-8 flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
        
        {/* LEFT COLUMN: User Bio */}
        <section className="lg:col-span-1 space-y-6">
          
          {/* User Bio Card */}
          <div className="bg-dark-surface border border-cyber-border p-4 rounded relative">
            <div className="absolute top-0 right-0 w-2 h-2 bg-neon border border-neon" />
            <h2 className="font-orbitron text-xs text-slate-500 tracking-widest uppercase mb-3">User Details</h2>
            <p className="font-chakra text-base font-bold text-slate-100">{displayName}</p>
            {displayEmail && (
              <p className="font-chakra text-xs text-slate-500 truncate mt-0.5">{displayEmail}</p>
            )}
            
            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-cyber-border/60">
              <div>
                <p className="font-chakra text-[10px] text-slate-500 uppercase tracking-widest">Active Streak</p>
                <p className="font-orbitron text-lg font-bold text-neon cyber-glow-green">
                  {currentStreak} <span className="font-chakra text-[10px] text-slate-400 font-normal lowercase tracking-normal">days</span>
                </p>
              </div>
              <div>
                <p className="font-chakra text-[10px] text-slate-500 uppercase tracking-widest">Max Streak</p>
                <p className="font-orbitron text-lg font-bold text-cyan cyber-glow-cyan">
                  {maxStreak} <span className="font-chakra text-[10px] text-slate-400 font-normal lowercase tracking-normal">days</span>
                </p>
              </div>
            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: Collapsible Curriculum Grid */}
        <section className="lg:col-span-3 space-y-6">
          {problems.length === 0 ? (
            <div className="bg-dark-surface border border-cyber-border p-8 text-center rounded">
              <BookOpen size={36} className="text-slate-600 mx-auto mb-3" />
              <p className="font-chakra text-sm text-slate-500">No Problems Loaded.</p>
              {isAdmin && (
                <button
                  onClick={() => setShowAdminModal(true)}
                  className="mt-4 border border-cyan text-cyan hover:bg-cyan/10 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-sm cursor-pointer cyber-transition"
                >
                  Seed Custom Problems
                </button>
              )}
            </div>
          ) : (
            Object.keys(groupedProblems).map((topic) => {
              const isCollapsed = !!collapsedTopics[topic];
              const topicProblems = groupedProblems[topic];
              const completedCount = topicProblems.filter(p => completions[p.id]).length;
              const totalCount = topicProblems.length;

              return (
                <div 
                  key={topic} 
                  className={`bg-dark-surface border rounded overflow-hidden cyber-transition ${
                    activeTopic === topic ? 'border-cyan shadow-[0_0_8px_rgba(0,229,255,0.15)]' : 'border-cyber-border'
                  }`}
                  onMouseEnter={() => setActiveTopic(topic)}
                  onMouseLeave={() => setActiveTopic(null)}
                >
                  
                  {/* Topic Collapsible Header */}
                  <div 
                    onClick={() => toggleTopicCollapse(topic)}
                    className="p-4 bg-black/60 hover:bg-black/90 cursor-pointer flex items-center justify-between border-b border-cyber-border/40 select-none"
                  >
                    <div className="flex items-center gap-3">
                      <h3 className="font-orbitron text-sm md:text-base font-black tracking-widest text-slate-100 uppercase">
                        {topic}
                      </h3>
                      <span className="font-chakra text-[10px] text-slate-500 px-2 py-0.5 border border-cyber-border rounded">
                        {completedCount}/{totalCount} DONE
                      </span>
                    </div>
                    <div className="text-slate-400 hover:text-cyan cyber-transition">
                      {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </div>
                  </div>

                  {/* Topic Problem Table */}
                  <div 
                    className={`cyber-transition duration-150 ease-out origin-top ${
                      isCollapsed ? 'h-0 scale-y-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-2'
                    }`}
                  >
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left font-chakra border-collapse text-xs select-none">
                        <thead>
                          <tr className="border-b border-cyber-border text-slate-500 uppercase tracking-wider text-xs">
                            <th className="py-2.5 px-3 w-16">Day</th>
                            <th className="py-2.5 px-3">Problem Name</th>
                            <th className="py-2.5 px-3 w-28 text-center">Strike Link</th>
                            <th className="py-2.5 px-3 w-28 text-center">Alt Link</th>
                            <th className="py-2.5 px-3 w-24 text-center">Solved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topicProblems.map((prob, idx) => {
                            const isCompleted = !!completions[prob.id];
                            const isLastOfClassDay = idx === topicProblems.length - 1 || topicProblems[idx + 1].day_number !== prob.day_number;
                            return (
                              <React.Fragment key={prob.id}>
                                <tr 
                                  className={`border-b border-cyber-border/40 hover:bg-black/40 cyber-transition ${
                                    isCompleted ? 'text-neon/80' : 'text-slate-300'
                                  }`}
                                >
                                  {/* Day Number */}
                                  <td className="py-3 px-3 font-semibold text-slate-400 text-left text-sm">
                                    {prob.day_number}
                                  </td>
                                  
                                  {/* Problem Name */}
                                  <td className="py-3 px-3 font-medium tracking-wide text-sm">
                                    {prob.problem_name}
                                  </td>
                                  
                                  {/* Strike Link */}
                                  <td className="py-3 px-3 text-center">
                                    {prob.link_1 ? (
                                      <a
                                        href={prob.link_1}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cyan hover:text-cyan/80 flex items-center justify-center gap-0.5 underline decoration-dotted underline-offset-4 cyber-transition whitespace-nowrap text-sm"
                                      >
                                        <span>Link 1</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>

                                  {/* Alt Link */}
                                  <td className="py-3 px-3 text-center">
                                    {prob.link_2 ? (
                                      <a
                                        href={prob.link_2}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-slate-400 hover:text-cyan flex items-center justify-center gap-0.5 underline decoration-dotted underline-offset-4 cyber-transition whitespace-nowrap text-sm"
                                      >
                                        <span>Link 2</span>
                                        <ExternalLink size={10} />
                                      </a>
                                    ) : (
                                      <span className="text-slate-600">—</span>
                                    )}
                                  </td>
                                  
                                  {/* Checkbox Action */}
                                  <td className="py-3 px-3 text-center">
                                    <input
                                      type="checkbox"
                                      checked={isCompleted}
                                      onChange={() => handleCheckboxToggle(prob.id, prob.problem_name)}
                                      disabled={isCompleted}
                                      className={`cyber-checkbox vertical-middle ${isCompleted ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                                    />
                                  </td>
                                </tr>
                                {isLastOfClassDay && idx !== topicProblems.length - 1 && (
                                  <tr className="h-3 bg-transparent pointer-events-none">
                                    <td colSpan={5}></td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </section>

      </main>

      {/* ADMIN: ADD PROBLEM MODAL */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
          <div className="w-full max-w-lg bg-dark-surface border border-cyan/50 p-6 md:p-8 rounded relative shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            
            {/* Corners */}
            <div className="absolute -top-[1px] -left-[1px] w-4 h-4 border-t-2 border-l-2 border-neon" />
            <div className="absolute -bottom-[1px] -right-[1px] w-4 h-4 border-b-2 border-r-2 border-neon" />

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-cyber-border pb-4 mb-6">
              <h3 className="font-orbitron text-base font-bold tracking-widest text-slate-100 uppercase flex items-center gap-2">
                <Terminal className="text-cyan" size={16} />
                Insert Problem
              </h3>
              <button 
                onClick={() => setShowAdminModal(false)}
                className="text-slate-500 hover:text-cyan cursor-pointer focus:outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Error */}
            {adminError && (
              <div className="mb-4 p-3 border border-red-500/40 bg-red-950/20 text-red-400 font-chakra text-xs rounded tracking-wider">
                <strong>[ERROR]:</strong> {adminError}
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleAddProblemSubmit} className="space-y-4 font-chakra text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-slate-400 uppercase tracking-widest">Topic</label>
                  <div className="relative">
                    <select
                      value={adminTopicId}
                      onChange={(e) => setAdminTopicId(e.target.value)}
                      className="w-full bg-black border border-cyber-border text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition appearance-none pr-8"
                      required
                    >
                      <option value="" disabled>Select topic...</option>
                      {topics.map(t => (
                        <option key={t.id} value={t.id} className="bg-black">{t.name}</option>
                      ))}
                      <option value="__new__" className="bg-black text-cyan">+ Add new topic</option>
                    </select>
                    <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                  {adminTopicId === '__new__' && (
                    <input
                      type="text"
                      value={adminNewTopic}
                      onChange={(e) => setAdminNewTopic(e.target.value)}
                      placeholder="New topic name..."
                      className="w-full mt-1.5 bg-black border border-cyan/50 text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition"
                      autoFocus
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="block text-slate-400 uppercase tracking-widest">Day Number</label>
                  <input
                    type="number"
                    value={adminDay}
                    onChange={(e) => setAdminDay(e.target.value)}
                    placeholder="e.g. 1"
                    min="1"
                    className="w-full bg-black border border-cyber-border text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 uppercase tracking-widest">Problem Name</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Longest Common Subsequence"
                  className="w-full bg-black border border-cyber-border text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 uppercase tracking-widest">Link 1 URL</label>
                <input
                  type="url"
                  value={adminLink1}
                  onChange={(e) => setAdminLink1(e.target.value)}
                  placeholder="https://leetcode.com/..."
                  className="w-full bg-black border border-cyber-border text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-slate-400 uppercase tracking-widest">Link 2 URL (Optional)</label>
                <input
                  type="url"
                  value={adminLink2}
                  onChange={(e) => setAdminLink2(e.target.value)}
                  placeholder="https://practice.geeksforgeeks.org/..."
                  className="w-full bg-black border border-cyber-border text-slate-100 px-3 py-2 text-xs focus:outline-none focus:border-cyan focus:ring-1 focus:ring-cyan rounded cyber-transition"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="border border-cyber-border text-slate-400 hover:border-slate-300 hover:text-slate-300 px-4 py-2 rounded-sm cursor-pointer cyber-transition uppercase tracking-widest font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminSubmitting}
                  className="border border-cyan bg-cyan/10 text-cyan hover:bg-cyan/20 px-5 py-2 rounded-sm cursor-pointer cyber-transition uppercase tracking-widest font-bold"
                >
                  {adminSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
