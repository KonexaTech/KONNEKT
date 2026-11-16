// Serialize identity changes, but never let the OS permission prompt delay logout.
export function createPushIdentity({ enabled, loadClient, onError = () => {} }) {
  let desiredUser = null;
  let revision = 0;
  let client;
  let currentUser = null;
  let permissionRequested = false;
  let resetRequired = true;
  let queue = Promise.resolve();

  return userId => {
    desiredUser = userId || null;
    const requestedRevision = ++revision;
    queue = queue.then(async () => {
      if (!enabled || requestedRevision !== revision) return;
      if (!client) client = await loadClient();
      // Native SDK identity can survive a process restart independently of JS.
      if (resetRequired) {
        await client.logout();
        currentUser = null;
        resetRequired = false;
      }
      if (requestedRevision !== revision) return;
      const target = desiredUser;
      if (!target || (currentUser && currentUser !== target)) {
        await client.logout();
        currentUser = null;
      }
      if (requestedRevision !== revision || !target) return;
      if (currentUser !== target) {
        await client.login(target);
        currentUser = target;
      }
      // A delayed native bridge must not leave a now-stale identity registered.
      if (requestedRevision !== revision) {
        await client.logout();
        currentUser = null;
        return;
      }
      if (!permissionRequested) {
        permissionRequested = true;
        Promise.resolve().then(() => client.Notifications.requestPermission(false)).catch(onError);
      }
    }).catch(async () => {
      // A failed login can have partially changed native state. Clear it before
      // accepting another identity; errors never expose provider payloads.
      currentUser = null;
      resetRequired = true;
      try { if (client) { await client.logout(); resetRequired = false; } } catch { /* Retry before any later login. */ }
      onError();
    });
    return queue;
  };
}
