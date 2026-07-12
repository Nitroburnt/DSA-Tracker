import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { GuestData } from './guestDataService';

export interface Topic {
  id: string;
  name: string;
  created_at?: string;
}

export interface Problem {
  id: string;
  topic_id: string;
  topic: string; // resolved from join — keep for display convenience
  day_number: number;
  problem_name: string;
  link_1: string;
  link_2?: string | null;
  created_at?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  max_streak: number;
  current_streak: number;
  role: 'user' | 'admin';
  created_at?: string;
}

export interface UserCompletion {
  id: string;
  user_id: string;
  problem_id: string;
  completed_at: string;
}

// ----------------------------------------------------------------------------
// SEED DATA FOR NEW SESSIONS / EMPTY DATABASES
// ----------------------------------------------------------------------------
export const SEED_TOPICS = [
  'Arrays & Hashing',
  'Two Pointers',
  'Sliding Window',
  'Trees & Graphs',
  'Dynamic Programming',
];

export const SEED_PROBLEMS: Omit<Problem, 'id' | 'topic_id'>[] = [
  // Arrays & Hashing
  { topic: 'Arrays & Hashing', day_number: 1, problem_name: 'Two Sum', link_1: 'https://leetcode.com/problems/two-sum/', link_2: 'https://practice.geeksforgeeks.org/problems/key-pair5616/1' },
  { topic: 'Arrays & Hashing', day_number: 1, problem_name: 'Contains Duplicate', link_1: 'https://leetcode.com/problems/contains-duplicate/' },
  { topic: 'Arrays & Hashing', day_number: 2, problem_name: 'Valid Anagram', link_1: 'https://leetcode.com/problems/valid-anagram/' },
  { topic: 'Arrays & Hashing', day_number: 2, problem_name: 'Group Anagrams', link_1: 'https://leetcode.com/problems/group-anagrams/' },
  // Two Pointers
  { topic: 'Two Pointers', day_number: 3, problem_name: 'Valid Palindrome', link_1: 'https://leetcode.com/problems/valid-palindrome/' },
  { topic: 'Two Pointers', day_number: 3, problem_name: 'Two Sum II - Input Array Is Sorted', link_1: 'https://leetcode.com/problems/two-sum-ii-input-array-is-sorted/' },
  { topic: 'Two Pointers', day_number: 4, problem_name: '3Sum', link_1: 'https://leetcode.com/problems/3sum/' },
  { topic: 'Two Pointers', day_number: 4, problem_name: 'Container With Most Water', link_1: 'https://leetcode.com/problems/container-with-most-water/' },
  // Sliding Window
  { topic: 'Sliding Window', day_number: 5, problem_name: 'Best Time to Buy and Sell Stock', link_1: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/' },
  { topic: 'Sliding Window', day_number: 5, problem_name: 'Longest Substring Without Repeating Characters', link_1: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/' },
  { topic: 'Sliding Window', day_number: 6, problem_name: 'Longest Repeating Character Replacement', link_1: 'https://leetcode.com/problems/longest-repeating-character-replacement/' },
  { topic: 'Sliding Window', day_number: 6, problem_name: 'Minimum Window Substring', link_1: 'https://leetcode.com/problems/minimum-window-substring/' },
  // Trees & Graphs
  { topic: 'Trees & Graphs', day_number: 7, problem_name: 'Invert Binary Tree', link_1: 'https://leetcode.com/problems/invert-binary-tree/' },
  { topic: 'Trees & Graphs', day_number: 7, problem_name: 'Maximum Depth of Binary Tree', link_1: 'https://leetcode.com/problems/maximum-depth-of-binary-tree/' },
  { topic: 'Trees & Graphs', day_number: 8, problem_name: 'Number of Islands', link_1: 'https://leetcode.com/problems/number-of-islands/' },
  { topic: 'Trees & Graphs', day_number: 8, problem_name: 'Clone Graph', link_1: 'https://leetcode.com/problems/clone-graph/' },
  // Dynamic Programming
  { topic: 'Dynamic Programming', day_number: 9, problem_name: 'Climbing Stairs', link_1: 'https://leetcode.com/problems/climbing-stairs/' },
  { topic: 'Dynamic Programming', day_number: 9, problem_name: 'Coin Change', link_1: 'https://leetcode.com/problems/coin-change/' },
  { topic: 'Dynamic Programming', day_number: 10, problem_name: 'Longest Increasing Subsequence', link_1: 'https://leetcode.com/problems/longest-increasing-subsequence/' },
  { topic: 'Dynamic Programming', day_number: 10, problem_name: 'Edit Distance', link_1: 'https://leetcode.com/problems/edit-distance/' },
];

// Helper to calculate streaks
export function calculateStreaks(completions: UserCompletion[]): { current_streak: number; max_streak: number } {
  if (!completions || completions.length === 0) {
    return { current_streak: 0, max_streak: 0 };
  }

  // Get unique local dates of completion
  const dates = Array.from(
    new Set(
      completions.map(c => {
        const d = new Date(c.completed_at);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${date}`;
      })
    )
  ).sort((a, b) => b.localeCompare(a)); // Descending order (newest first)

  if (dates.length === 0) {
    return { current_streak: 0, max_streak: 0 };
  }

  const today = new Date();
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };

  const todayStr = formatDate(today);
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const hasActivityToday = dates.includes(todayStr);
  const hasActivityYesterday = dates.includes(yesterdayStr);

  if (!hasActivityToday && !hasActivityYesterday) {
    // Current streak is 0, let's find the max historical streak
    const maxStreak = findMaxConsecutiveDays(dates);
    return { current_streak: 0, max_streak: maxStreak };
  }

  // Calculate current streak
  let currentStreak = 0;
  let checkDate = hasActivityToday ? today : yesterday;
  
  while (true) {
    const checkDateStr = formatDate(checkDate);
    if (dates.includes(checkDateStr)) {
      currentStreak++;
      // Move to previous day
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  const maxStreak = Math.max(currentStreak, findMaxConsecutiveDays(dates));
  return { current_streak: currentStreak, max_streak: maxStreak };
}

function findMaxConsecutiveDays(dateStrings: string[]): number {
  if (dateStrings.length === 0) return 0;
  const sortedDates = [...dateStrings].sort((a, b) => a.localeCompare(b));
  
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    // Compare date strings directly to avoid DST millisecond issues
    const prev = new Date(sortedDates[i - 1] + 'T12:00:00');
    const curr = new Date(sortedDates[i] + 'T12:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      currentStreak++;
    } else if (diffDays > 1) {
      if (currentStreak > maxStreak) maxStreak = currentStreak;
      currentStreak = 1;
    }
  }

  return Math.max(currentStreak, maxStreak);
}

// ----------------------------------------------------------------------------
// LOCAL STORAGE MOCK IMPLEMENTATION
// ----------------------------------------------------------------------------
const getLocalStorageData = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setLocalStorageData = <T>(key: string, data: T): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
};

const mockGetSession = (): string | null => {
  return getLocalStorageData<string | null>('dsa_mock_session', null);
};

// Seed problems locally if none exist
const mockGetTopics = (): Topic[] => {
  let topics = getLocalStorageData<Topic[]>('dsa_mock_topics', []);
  if (topics.length === 0) {
    topics = SEED_TOPICS.map((name, idx) => ({
      id: `mock-topic-${idx + 1}`,
      name,
      created_at: new Date().toISOString(),
    }));
    setLocalStorageData('dsa_mock_topics', topics);
  }
  return topics;
};

const mockGetProblems = (): Problem[] => {
  let problems = getLocalStorageData<Problem[]>('dsa_mock_problems', []);
  if (problems.length === 0) {
    const topics = mockGetTopics();
    const topicMap = Object.fromEntries(topics.map(t => [t.name, t.id]));
    problems = SEED_PROBLEMS.map((p, idx) => ({
      ...p,
      id: `mock-problem-${idx + 1}`,
      topic_id: topicMap[p.topic] || `mock-topic-1`,
      created_at: new Date().toISOString(),
    }));
    setLocalStorageData('dsa_mock_problems', problems);
  }
  return problems;
};

// ----------------------------------------------------------------------------
// DATA SERVICE (EXPORTED INTERFACE)
// ----------------------------------------------------------------------------
export const dbService = {
  // --- AUTHENTICATION ---
  
  async signUp(email: string, display_name: string, password_plain: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signUp({
        email,
        password: password_plain,
        options: {
          data: {
            display_name,
          }
        }
      });
      
      if (error) return { success: false, error: error.message };
      
      // Note: Trigger in supabase.sql handles user_profile creation.
      // But to be robust in case trigger permissions delay, we check profile insertion.
      return { success: true };
    } else {
      // Local mock signup
      const users = getLocalStorageData<any[]>('dsa_mock_users', []);
      if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return { success: false, error: 'User already exists with this email.' };
      }
      
      const newUserId = `mock-user-${Date.now()}`;
      // Check if first user signed up; make them an 'admin' so they can test the admin view easily!
      // This is a premium sandbox experience.
      const isFirstUser = users.length === 0;
      const role = isFirstUser ? 'admin' : 'user';
      
      users.push({
        id: newUserId,
        email,
        display_name,
        password: password_plain,
        role,
      });
      setLocalStorageData('dsa_mock_users', users);
      
      // Store user profile
      const newProfile: UserProfile = {
        id: newUserId,
        email,
        display_name,
        max_streak: 0,
        current_streak: 0,
        role,
        created_at: new Date().toISOString(),
      };
      setLocalStorageData(`dsa_mock_profile_${newUserId}`, newProfile);
      
      return { success: true };
    }
  },

  async signIn(email: string, password_plain: string): Promise<{ success: boolean; user?: any; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: password_plain,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, user: data.user };
    } else {
      // Local mock login
      const users = getLocalStorageData<any[]>('dsa_mock_users', []);
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password_plain);
      if (!user) {
        return { success: false, error: 'Invalid credentials. Double check email/password.' };
      }
      setLocalStorageData('dsa_mock_session', user.id);
      return { success: true, user };
    }
  },

  async signOut(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    } else {
      setLocalStorageData('dsa_mock_session', null);
    }
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    if (isSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return null;
      
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error || !data) {
        // Profile row not ready yet (trigger race) — return null so waitForProfile retries
        return null;
      }
      return data as UserProfile;
    } else {
      const userId = mockGetSession();
      if (!userId) return null;
      return getLocalStorageData<UserProfile | null>(`dsa_mock_profile_${userId}`, null);
    }
  },

  // --- TOPICS ---

  async getTopics(): Promise<Topic[]> {
    if (isSupabaseConfigured && supabase) {
      // Works for both authenticated and anon (guest) users via RLS
      const { data, error } = await supabase
        .from('topics')
        .select('*')
        .order('name', { ascending: true });
      if (error) return [];
      return data as Topic[];
    } else {
      return mockGetTopics();
    }
  },

  async addTopic(name: string): Promise<{ success: boolean; topic?: Topic; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('topics')
        .insert({ name: name.trim() })
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, topic: data as Topic };
    } else {
      const topics = mockGetTopics();
      if (topics.find(t => t.name.toLowerCase() === name.toLowerCase())) {
        return { success: false, error: 'Topic already exists.' };
      }
      const newTopic: Topic = {
        id: `mock-topic-${Date.now()}`,
        name: name.trim(),
        created_at: new Date().toISOString(),
      };
      topics.push(newTopic);
      setLocalStorageData('dsa_mock_topics', topics);
      return { success: true, topic: newTopic };
    }
  },

  // --- PROBLEMS (ADMIN MANAGED) ---
  
  async getProblems(): Promise<Problem[]> {
    if (isSupabaseConfigured && supabase) {
      // Works for both authenticated and anon (guest) users via RLS
      const { data, error } = await supabase
        .from('problems')
        .select('*, topics(name)')
        .order('day_number', { ascending: true });
      if (error) return [];

      return (data as any[]).map(row => ({
        ...row,
        topic: row.topics?.name ?? '',
        topics: undefined,
      })) as Problem[];
    } else {
      return mockGetProblems();
    }
  },

  async addProblem(topicId: string, dayNumber: number, name: string, link1: string, link2?: string): Promise<{ success: boolean; error?: string }> {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('problems')
        .insert({
          topic_id: topicId,
          day_number: dayNumber,
          problem_name: name,
          link_1: link1,
          link_2: link2 || null,
        });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } else {
      const problems = mockGetProblems();
      const topics = mockGetTopics();
      const topic = topics.find(t => t.id === topicId);
      const newProblem: Problem = {
        id: `mock-problem-${Date.now()}`,
        topic_id: topicId,
        topic: topic?.name ?? '',
        day_number: dayNumber,
        problem_name: name,
        link_1: link1,
        link_2: link2 || null,
        created_at: new Date().toISOString(),
      };
      problems.push(newProblem);
      problems.sort((a, b) => a.day_number - b.day_number);
      setLocalStorageData('dsa_mock_problems', problems);
      return { success: true };
    }
  },

  // --- COMPLETIONS (USER SPECIFIC) ---

  async getCompletions(userId: string): Promise<UserCompletion[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('user_completions')
        .select('*')
        .eq('user_id', userId);
      if (error) return [];
      return data as UserCompletion[];
    } else {
      return getLocalStorageData<UserCompletion[]>(`dsa_mock_completions_${userId}`, []);
    }
  },

  async mergeGuestData(
    userId: string,
    guestData: GuestData
  ): Promise<{ success: boolean; error?: string }> {
    const entries = Object.entries(guestData.completions);
    if (entries.length === 0) return { success: true };

    if (isSupabaseConfigured && supabase) {
      // Fetch all valid problem IDs first so we don't attempt to insert
      // completions for problem IDs that don't exist (foreign key violation)
      const { data: validProblems } = await supabase
        .from('problems')
        .select('id');
      const validIds = new Set((validProblems ?? []).map((p: any) => p.id));

      const rows = entries
        .filter(([problemId]) => validIds.has(problemId))
        .map(([problemId, completedAt]) => ({
          user_id: userId,
          problem_id: problemId,
          completed_at: completedAt,
        }));

      if (rows.length === 0) return { success: true };

      const { error } = await supabase
        .from('user_completions')
        .upsert(rows, { onConflict: 'user_id,problem_id', ignoreDuplicates: true });

      if (error) {
        return { success: false, error: error.message };
      }

      // Recalculate and persist streaks
      const completions = await this.getCompletions(userId);
      const { current_streak, max_streak } = calculateStreaks(completions);
      await supabase
        .from('user_profiles')
        .update({ current_streak, max_streak })
        .eq('id', userId);

      return { success: true };
    } else {
      // MockMode path
      const completions = getLocalStorageData<UserCompletion[]>(
        `dsa_mock_completions_${userId}`,
        []
      );

      let changed = false;
      for (const [problemId, completedAt] of entries) {
        const exists = completions.some(c => c.problem_id === problemId);
        if (!exists) {
          completions.push({
            id: `mock-completion-${Date.now()}-${problemId}`,
            user_id: userId,
            problem_id: problemId,
            completed_at: completedAt,
          });
          changed = true;
        }
      }

      if (changed) {
        setLocalStorageData(`dsa_mock_completions_${userId}`, completions);
      }

      // Recalculate streaks and persist to mock profile
      const { current_streak, max_streak } = calculateStreaks(completions);
      const profile = getLocalStorageData<UserProfile | null>(
        `dsa_mock_profile_${userId}`,
        null
      );
      if (profile) {
        profile.current_streak = current_streak;
        profile.max_streak = max_streak;
        setLocalStorageData(`dsa_mock_profile_${userId}`, profile);
      }

      return { success: true };
    }
  },

  async toggleCompletion(userId: string, problemId: string, shouldComplete: boolean): Promise<{ success: boolean; current_streak: number; max_streak: number; error?: string }> {
    let completions: UserCompletion[] = [];
    
    if (isSupabaseConfigured && supabase) {
      if (shouldComplete) {
        // Insert completion
        const { error } = await supabase
          .from('user_completions')
          .insert({ user_id: userId, problem_id: problemId });
        if (error && error.code !== '23505') { // Ignore duplicate primary key constraint errors
          return { success: false, current_streak: 0, max_streak: 0, error: error.message };
        }
      } else {
        // Delete completion
        const { error } = await supabase
          .from('user_completions')
          .delete()
          .eq('user_id', userId)
          .eq('problem_id', problemId);
        if (error) return { success: false, current_streak: 0, max_streak: 0, error: error.message };
      }
      
      // Fetch all user completions to recalculate streaks
      completions = await this.getCompletions(userId);
      const { current_streak, max_streak } = calculateStreaks(completions);
      
      // Update profile with recalculated streaks
      await supabase
        .from('user_profiles')
        .update({ current_streak, max_streak })
        .eq('id', userId);
        
      return { success: true, current_streak, max_streak };
    } else {
      // Local storage mock completion logic
      completions = getLocalStorageData<UserCompletion[]>(`dsa_mock_completions_${userId}`, []);
      
      if (shouldComplete) {
        const exists = completions.some(c => c.problem_id === problemId);
        if (!exists) {
          completions.push({
            id: `mock-completion-${Date.now()}`,
            user_id: userId,
            problem_id: problemId,
            completed_at: new Date().toISOString(),
          });
        }
      } else {
        completions = completions.filter(c => c.problem_id !== problemId);
      }
      setLocalStorageData(`dsa_mock_completions_${userId}`, completions);
      
      // Recalculate streaks
      const { current_streak, max_streak } = calculateStreaks(completions);
      
      // Update user profile streaks
      const profile = getLocalStorageData<UserProfile | null>(`dsa_mock_profile_${userId}`, null);
      if (profile) {
        profile.current_streak = current_streak;
        profile.max_streak = max_streak;
        setLocalStorageData(`dsa_mock_profile_${userId}`, profile);
      }
      
      return { success: true, current_streak, max_streak };
    }
  }
};
