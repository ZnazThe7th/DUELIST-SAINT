import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { TrendingUp, Mail, Lock, ArrowRight, UserPlus, LogIn, KeyRound, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type AuthMode = 'signin' | 'signup' | 'reset';

export default function AuthPage() {
  const { signIn, signUp, resetPassword, error, clearError } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const switchMode = (m: AuthMode) => {
    setMode(m);
    clearError();
    setResetSent(false);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (mode === 'signup' && password !== confirmPassword) {
      return; // form validation handles mismatch
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch {
      // error handled in context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="bg-amber-500 p-3 rounded-2xl shadow-lg shadow-amber-500/20">
              <TrendingUp className="text-gray-950 w-8 h-8" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            DUELIST <span className="text-amber-500">SAINT</span>
          </h1>
          <p className="text-xs text-gray-500 uppercase tracking-[0.3em] font-bold mt-2">
            Stochastic Intelligence Engine
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-[2rem] shadow-2xl overflow-hidden">
          {/* Tab Header */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => switchMode('signin')}
              className={`flex-1 py-4 text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                mode === 'signin'
                  ? 'text-amber-500 border-b-2 border-amber-500 bg-gray-950/50'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <LogIn size={14} /> Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`flex-1 py-4 text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                mode === 'signup'
                  ? 'text-amber-500 border-b-2 border-amber-500 bg-gray-950/50'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              <UserPlus size={14} /> Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {mode === 'reset' && (
              <div className="text-center mb-2">
                <KeyRound className="text-amber-500 mx-auto mb-3" size={32} />
                <h3 className="text-sm font-black uppercase tracking-tight">Reset Password</h3>
                <p className="text-[11px] text-gray-500 mt-1">We'll send a reset link to your email.</p>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
                <AlertCircle size={16} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-400 font-bold">{error}</p>
              </div>
            )}

            {/* Reset Success */}
            {resetSent && (
              <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-2xl p-4">
                <CheckCircle2 size={16} className="text-green-400 shrink-0" />
                <p className="text-xs text-green-400 font-bold">Reset link sent! Check your inbox.</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-gray-950 border border-gray-800 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            {mode !== 'reset' && (
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Confirm Password */}
            {mode === 'signup' && (
              <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Confirm Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    pattern={password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}
                    title="Passwords must match"
                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl pl-11 pr-4 py-4 text-sm font-bold text-white placeholder-gray-700 outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[10px] text-red-400 font-bold mt-2">Passwords do not match.</p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || (mode === 'signup' && password !== confirmPassword)}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 py-4 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : mode === 'signin' ? (
                <><LogIn size={16} /> Sign In</>
              ) : mode === 'signup' ? (
                <><UserPlus size={16} /> Create Account</>
              ) : (
                <><ArrowRight size={16} /> Send Reset Link</>
              )}
            </button>

            {/* Bottom Links */}
            <div className="text-center space-y-3 pt-2">
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-[11px] text-gray-500 hover:text-amber-500 font-bold transition-colors"
                >
                  Forgot password?
                </button>
              )}
              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="text-[11px] text-gray-500 hover:text-amber-500 font-bold transition-colors flex items-center gap-1 mx-auto"
                >
                  <ArrowRight size={12} className="rotate-180" /> Back to Sign In
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-gray-700 uppercase tracking-widest font-bold mt-8">
          © {new Date().getFullYear()} Duelist Saint Labs · Stochastic Core v2.5
        </p>
      </div>
    </div>
  );
}
