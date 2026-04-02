import { useState, useCallback } from 'react';
import { getApiKey, setApiKey, hasApiKey } from '../utils/claudeApi';

export default function ApiKeySettings() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);
  const configured = hasApiKey();

  const handleSave = useCallback(() => {
    setApiKey(key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [key]);

  const handleClear = useCallback(() => {
    setApiKey('');
    setKey('');
  }, []);

  return (
    <div className="api-settings">
      <h3 className="sidebar__section-title">AI Import (Claude API)</h3>
      {configured ? (
        <div className="api-settings__status">
          <span className="password-settings__badge password-settings__badge--on">Configured</span>
          <button className="btn btn--ghost btn--sm" onClick={handleClear}>Remove Key</button>
        </div>
      ) : (
        <div className="api-settings__form">
          <input
            type="password"
            className="sidebar__input"
            placeholder="sk-ant-api03-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={!key.trim()}>
            {saved ? 'Saved!' : 'Save Key'}
          </button>
          <p className="api-settings__hint">
            Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
          </p>
        </div>
      )}
    </div>
  );
}
