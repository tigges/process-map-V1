import { useState, useCallback } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export default function PasswordSettings() {
  const appPassword = useAuthStore((s) => s.appPassword);
  const setAppPassword = useAuthStore((s) => s.setAppPassword);
  const removeAppPassword = useAuthStore((s) => s.removeAppPassword);
  const logout = useAuthStore((s) => s.logout);

  const [showForm, setShowForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSave = useCallback(() => {
    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setAppPassword(newPassword);
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowForm(false);
  }, [newPassword, confirmPassword, setAppPassword]);

  const handleRemove = useCallback(() => {
    if (confirm('Remove password protection? Anyone with the URL will be able to access your projects.')) {
      removeAppPassword();
    }
  }, [removeAppPassword]);

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  return (
    <div className="password-settings">
      <h3 className="sidebar__section-title">Access Protection</h3>
      {appPassword ? (
        <div className="password-settings__status">
          <span className="password-settings__badge password-settings__badge--on">Protected</span>
          <div className="password-settings__actions">
            <button className="btn btn--ghost btn--sm" onClick={() => setShowForm(true)}>
              Change
            </button>
            <button className="btn btn--ghost btn--sm" onClick={handleRemove}>
              Remove
            </button>
            <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Lock
            </button>
          </div>
        </div>
      ) : (
        <div className="password-settings__status">
          <span className="password-settings__badge password-settings__badge--off">No password</span>
          <button className="btn btn--secondary btn--sm" onClick={() => setShowForm(true)}>
            Set Password
          </button>
        </div>
      )}
      {showForm && (
        <div className="password-settings__form">
          <input
            type="password"
            className="sidebar__input"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="sidebar__input"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {error && <p className="password-settings__error">{error}</p>}
          <div className="sidebar__form-actions">
            <button className="btn btn--primary btn--sm" onClick={handleSave}>Save</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
