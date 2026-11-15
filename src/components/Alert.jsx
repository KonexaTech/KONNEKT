import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// React Native Web's Alert.alert is a no-op. Keep the existing callback API.
let queue = [];
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());
export const Alert = {
  dismissAll() { queue = []; emit(); },
  alert(title, message = '', buttons) {
    queue = [...queue, { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] }];
    emit();
  }
};
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => queue[0] || null;

export function AlertHost() {
  const alert = useSyncExternalStore(subscribe, snapshot, () => null);
  const dialog = useRef(null);

  const choose = button => {
    queue = queue.slice(1);
    emit();
    Promise.resolve().then(() => button.onPress?.()).catch(error => {
      console.error('KONNEKT action failed:', error);
      Alert.alert('Action failed', 'The action could not be completed. Please try again.');
    });
  };

  useEffect(() => {
    if (!alert) return;
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape') {
        const cancel = alert.buttons.find(button => button.style === 'cancel');
        if (cancel) { event.preventDefault(); choose(cancel); }
      }
      if (event.key === 'Tab') {
        const buttons = [...dialog.current.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [alert]);

  if (!alert) return null;
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: '#0009', zIndex: 10000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="konnekt-alert-title" aria-describedby="konnekt-alert-message"
        style={{ width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', boxSizing: 'border-box', padding: 24, borderRadius: 16, border: '1px solid #503567', background: '#241630', color: '#fff', fontFamily: 'sans-serif' }}>
        <h2 id="konnekt-alert-title" style={{ marginTop: 0, fontSize: 21 }}>{alert.title}</h2>
        <p id="konnekt-alert-message" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{alert.message}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          {alert.buttons.map((button, index) => <button key={index} onClick={() => choose(button)}
            style={{ cursor: 'pointer', minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid #705287', background: button.style === 'destructive' ? '#A92E49' : button.style === 'cancel' ? '#39244B' : '#6A0DAD', color: '#fff', fontSize: 14 }}>
            {button.text || 'OK'}
          </button>)}
        </div>
      </div>
    </div>, document.body
  );
}
