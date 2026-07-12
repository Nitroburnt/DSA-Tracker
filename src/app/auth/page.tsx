'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { Eye, EyeOff } from 'lucide-react';

// Inner component that reads search params and handles redirect logic.
// Must be isolated here so it can be wrapped in <Suspense> — this Next.js
// version fails the production build if useSearchParams is called outside
// a Suspense boundary ("Missing Suspense boundary with useSearchParams").
function AuthRedirectGuard() {
  const { user, isGuest } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const intentSignin = searchParams.get('intent') === 'signin';

  useEffect(() => {
    if (user !== null) {
      // Authenticated user — always redirect to home
      router.push('/');
    } else if (isGuest && !intentSignin) {
      // Guest who typed /auth directly — redirect back to home
      router.push('/');
    }
    // isGuest && intentSignin → do nothing, show the auth form
  }, [user, isGuest, intentSignin, router]);

  return null;
}

export default function AuthPage() {
  const { login, signup, loading, isMockMode } = useAuth();
  const router = useRouter();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [localLoading, setLocalLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Live password rule checks
  const passwordRules = {
    length:    password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);

  // Clean form fields and status when switching views
  const handleToggleMode = () => {
    setIsSignUp(!isSignUp);
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setStatus(null);
  };

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setStatus({ text: 'Google sign in is not available in sandbox mode.', type: 'error' });
      return;
    }
    setLocalLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus({ text: error.message, type: 'error' });
      setLocalLoading(false);
    }
    // On success, browser redirects to Google — no further action needed here
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!email.trim() || !password.trim()) {
      setStatus({ text: 'All credentials must be specified.', type: 'error' });
      return;
    }

    if (isSignUp) {
      if (!name.trim()) {
        setStatus({ text: 'Name is required.', type: 'error' });
        return;
      }
      if (!passwordValid) {
        setStatus({ text: 'Password does not meet the required criteria.', type: 'error' });
        return;
      }
      if (password !== confirmPassword) {
        setStatus({ text: 'Passwords do not match.', type: 'error' });
        return;
      }
    }

    setLocalLoading(true);

    try {
      if (isSignUp) {
        const res = await signup(email, name, password);
        if (res.success) {
          setName('');
          setEmail('');
          setPassword('');
          setConfirmPassword('');
          setIsSignUp(false);
          setStatus({
            text: 'Account created. Sign in to continue.',
            type: 'success',
          });
        } else {
          setStatus({ text: res.error || 'Sign up failed.', type: 'error' });
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setStatus({ text: res.error || 'Sign in failed.', type: 'error' });
        }
      }
    } catch (err: any) {
      setStatus({ text: err.message || 'Something went wrong.', type: 'error' });
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 bg-black relative select-none">
      {/*
        AuthRedirectGuard reads useSearchParams and must live inside a <Suspense>
        boundary. Without it this Next.js version fails the production build with
        "Missing Suspense boundary with useSearchParams".
      */}
      <Suspense fallback={null}>
        <AuthRedirectGuard />
      </Suspense>

      {/* Background Cyber Glow Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b0b0f_1px,transparent_1px),linear-gradient(to_bottom,#0b0b0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Auth Main Card */}
      <div className="w-full max-w-md bg-dark-surface border border-cyan/20 p-8 rounded-xl relative shadow-[0_0_40px_rgba(0,229,255,0.06)] z-10">

        {/* Card Header */}
        <div className="text-center mb-8">
          <h1 className="font-orbitron text-2xl md:text-3xl font-extrabold tracking-widest text-slate-100 uppercase">
            CODER ARMY
          </h1>
        </div>

        {/* Status Alert Box */}
        {status && (
          <div
            className={`mb-6 p-3 border text-xs font-chakra leading-relaxed tracking-wide rounded-lg ${
              status.type === 'success'
                ? 'border-neon/30 bg-neon/5 text-neon'
                : 'border-red-500/30 bg-red-950/20 text-red-400'
            }`}
          >
            {status.text}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="block text-xs uppercase tracking-widest text-slate-400 font-chakra">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={loading || localLoading}
                className="w-full bg-black/60 border border-cyber-border text-slate-100 px-3 py-2.5 text-sm font-chakra focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30 rounded-lg cyber-transition placeholder:text-slate-600"
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-widest text-slate-400 font-chakra">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sample@example.com"
              disabled={loading || localLoading}
              className="w-full bg-black/60 border border-cyber-border text-slate-100 px-3 py-2.5 text-sm font-chakra focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30 rounded-lg cyber-transition placeholder:text-slate-600"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs uppercase tracking-widest text-slate-400 font-chakra">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading || localLoading}
                className="w-full bg-black/60 border border-cyber-border text-slate-100 pl-3 pr-10 py-2.5 text-sm font-chakra focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30 rounded-lg cyber-transition placeholder:text-slate-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-cyan focus:outline-none"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Live password rules — only shown on sign-up */}
            {isSignUp && password.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
                {([
                  { key: 'length',    label: 'Min 8 characters' },
                  { key: 'uppercase', label: 'One uppercase letter' },
                  { key: 'number',    label: 'One number' },
                  { key: 'special',   label: 'One special character' },
                ] as { key: keyof typeof passwordRules; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${passwordRules[key] ? 'bg-cyan shadow-[0_0_4px_rgba(0,229,255,0.7)]' : 'bg-slate-700'}`} />
                    <span className={`font-chakra text-[10px] tracking-wide ${passwordRules[key] ? 'text-cyan' : 'text-slate-500'}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <label className="block text-xs uppercase tracking-widest text-slate-400 font-chakra">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading || localLoading}
                className="w-full bg-black/60 border border-cyber-border text-slate-100 px-3 py-2.5 text-sm font-chakra focus:outline-none focus:border-cyan/60 focus:ring-1 focus:ring-cyan/30 rounded-lg cyber-transition placeholder:text-slate-600"
                required
              />
            </div>
          )}

          {/* Sign In / Sign Up Button */}
          <button
            type="submit"
            disabled={loading || localLoading}
            className="w-full bg-cyan/10 border border-cyan/50 text-cyan hover:bg-cyan/20 focus:bg-cyan/20 text-sm font-bold uppercase tracking-widest py-2.5 rounded-lg cyber-transition cursor-pointer font-chakra mt-2"
          >
            {loading || localLoading ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-cyan rounded-full animate-bounce" />
              </span>
            ) : isSignUp ? (
              'Sign Up'
            ) : (
              'Sign In'
            )}
          </button>

          {/* Google Sign In Button */}
          {!isSignUp && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading || localLoading}
              className="w-full bg-black/40 border border-cyber-border text-slate-300 hover:border-cyan/40 hover:text-cyan text-sm font-chakra font-medium tracking-wider py-2.5 rounded-lg cyber-transition cursor-pointer flex items-center justify-center gap-2"
            >
              {/* Google Icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          )}
        </form>

        {/* Auth Mode Toggle */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleToggleMode}
            disabled={loading || localLoading}
            className="font-chakra text-xs text-slate-500 hover:text-cyan tracking-wider cursor-pointer focus:outline-none cyber-transition"
          >
            {isSignUp ? 'Already have an account? Sign in' : 'Sign up'}
          </button>
        </div>
      </div>
    </div>
  );
}
