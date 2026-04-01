import { useState, useCallback, type FormEvent } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appPassword = useAuthStore((s) => s.appPassword);
  const login = useAuthStore((s) => s.login);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (login(password)) {
        setError('');
      } else {
        setError('Incorrect password');
        setPassword('');
      }
    },
    [password, login],
  );

  if (!appPassword || isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="login-gate">
      <div className="login-gate__card">
        <div className="login-gate__icon">◈</div>
        <h1 className="login-gate__title">ProcessMap</h1>
        <p className="login-gate__subtitle">This workspace is password protected</p>
        <form onSubmit={handleSubmit} className="login-gate__form">
          <input
            type="password"
            className="login-gate__input"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="login-gate__error">{error}</p>}
          <button type="submit" className="btn btn--primary btn--full">
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}
