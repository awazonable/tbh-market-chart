import React, { useState } from 'react';
import styles from './CookieModal.module.css';

export function CookieModal({ onClose }) {
  const [value, setValue] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | saving | ok | error
  const [error, setError] = useState('');

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setError('Cookieを貼り付けてください'); return; }
    setPhase('saving');
    setError('');
    try {
      const r = await fetch('/api/cookies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: trimmed }),
      });
      if (r.ok) {
        setPhase('ok');
        setTimeout(() => onClose(), 1200);
      } else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || '保存に失敗しました');
        setPhase('error');
      }
    } catch {
      setError('サーバーに接続できません');
      setPhase('error');
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className={styles.overlay} onKeyDown={handleKey} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span>Steam Cookie 更新</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <p className={styles.hint}>
          Steam Communityをブラウザで開き、開発者ツール → Application → Cookies →
          <code>steamcommunity.com</code> から全Cookieをコピーして貼り付けてください。<br />
          <small>必要なキー: <code>steamLoginSecure</code>, <code>sessionid</code></small>
        </p>

        <textarea
          className={styles.textarea}
          placeholder={'steamLoginSecure=76561198...|xxxxxxxx; sessionid=xxxxxxxx; ...'}
          value={value}
          onChange={e => { setValue(e.target.value); setPhase('idle'); setError(''); }}
          rows={5}
          spellCheck={false}
          autoFocus
        />

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.actions}>
          <button
            className={`${styles.saveBtn} ${phase === 'ok' ? styles.saveBtnOk : ''}`}
            onClick={handleSave}
            disabled={phase === 'saving' || phase === 'ok'}
          >
            {phase === 'saving' ? '保存中...' : phase === 'ok' ? '✓ 保存完了' : '保存'}
          </button>
          <button className={styles.cancelBtn} onClick={onClose}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}
