import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · bookalert' };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect('/');

  return (
    <div className="shell">
      <div className="center-page">
        <LoginForm />
      </div>
    </div>
  );
}
