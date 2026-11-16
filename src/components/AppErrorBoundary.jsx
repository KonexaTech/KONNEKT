import React from 'react';

export default class AppErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.warn('KONNEKT screen could not load.'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" style={{ minHeight: '100vh', padding: 28, background: '#10091B', color: '#FAF8FF', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <h1>KONNEKT could not open this screen</h1>
      <p>Check your connection and reload. Your encryption keys have been kept; unsent drafts may need to be entered again.</p>
      <button type="button" onClick={() => window.location.reload()} style={{ padding: 16, border: 0, borderRadius: 10, background: '#6A0DAD', color: '#FFF', cursor: 'pointer' }}>Reload KONNEKT</button>
    </main>;
  }
}
