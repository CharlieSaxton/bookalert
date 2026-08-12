'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Mode = 'signin' | 'signup';

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignUp = mode === 'signup';

  function switchMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });

        if (signUpError) {
          setError(describeAuthError(signUpError.message));
          return;
        }

        if (data.session) {
          setPassword('');
          router.replace('/');
          router.refresh();
          return;
        }

        setPassword('');
        setNotice(
          `Account created. Check ${email} for a confirmation link, then come back and sign in.`,
        );
        setMode('signin');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(describeAuthError(signInError.message));
        return;
      }

      setPassword('');
      router.replace('/');
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(
        message.toLowerCase().includes('not configured')
          ? 'This deployment is missing its Supabase environment variables.'
          : 'Could not reach the sign-in service. Check your connection and try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={handleSubmit}>
      <div className="auth-head">
        <h1 className="page-title">
          book<span style={{ color: 'var(--accent)' }}>alert</span>
        </h1>
        <p className="page-lede" style={{ fontSize: '0.875rem' }}>
          {isSignUp
            ? 'Create an account to start watching Booking.com searches.'
            : 'Sign in to manage your Booking.com searches.'}
        </p>
      </div>

      <div className="stack" style={{ gap: 'var(--s4)' }}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            minLength={isSignUp ? 8 : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={isSignUp ? 'password-hint' : undefined}
          />
          {isSignUp ? (
            <p className="field-hint" id="password-hint">
              At least 8 characters.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="notice notice-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}

      {notice ? (
        <p className="notice notice-ok" role="status">
          <span>{notice}</span>
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={pending}>
        {pending ? 'Working…' : isSignUp ? 'Create account' : 'Sign in'}
      </button>

      <p className="auth-swap">
        {isSignUp ? 'Already have an account?' : 'No account yet?'}{' '}
        <button type="button" className="linklike" onClick={switchMode} disabled={pending}>
          {isSignUp ? 'Sign in' : 'Create one'}
        </button>
      </p>
    </form>
  );
}

/** Supabase auth errors, restated for a person. Passwords are never echoed. */
function describeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'That email and password combination did not match an account.';
  }
  if (lower.includes('email not confirmed')) {
    return 'This email is not confirmed yet. Use the confirmation link we sent you first.';
  }
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (lower.includes('password should be')) {
    return 'Choose a longer password — at least 8 characters.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (lower.includes('supabase is not configured')) {
    return 'This deployment is missing its Supabase environment variables.';
  }
  return 'Sign-in failed. Please try again.';
}
