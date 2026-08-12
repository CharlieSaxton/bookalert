import Link from 'next/link';
import { signOut } from '@/app/actions';

export function Topbar({ email }: { email: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark">
          book<span>alert</span>
        </Link>
        <div className="identity">
          <span className="identity-email" title={email}>
            {email}
          </span>
          <form action={signOut}>
            <button type="submit" className="btn">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
