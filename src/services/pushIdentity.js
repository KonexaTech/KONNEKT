// Serialize identity changes, but never let the OS permission prompt delay logout.
export function createPushIdentity({ enabled, loadClient, resolveIdentity, onError = () => {} }) {
  if(enabled&&typeof resolveIdentity!=='function')throw Error('A secure notification identity resolver is required.');
  let desiredUser = null;
  let revision = 0;
  let client;
  let currentUser = null;
  let currentIdentity = null;
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
        currentIdentity = null;
        resetRequired = false;
      }
      if (requestedRevision !== revision) return;
      const target = desiredUser;
      if (!target || (currentUser && currentUser !== target)) {
        await client.logout();
        currentUser = null;
        currentIdentity = null;
      }
      if (requestedRevision !== revision || !target) return;
      const identity=await resolveIdentity(target);
      if(requestedRevision!==revision)return;
      if (currentUser !== target || currentIdentity !== identity) {
        await client.login(identity);
        currentUser = target;
        currentIdentity = identity;
      }
      // A delayed native bridge must not leave a now-stale identity registered.
      if (requestedRevision !== revision) {
        await client.logout();
        currentUser = null;
        currentIdentity = null;
        return;
      }
      if (!permissionRequested) {
        permissionRequested = true;
        Promise.resolve().then(() => client.Notifications.requestPermission(false)).catch(() => {
          permissionRequested = false;
          onError();
        });
      }
    }).catch(async () => {
      // A failed login can have partially changed native state. Clear it before
      // accepting another identity; errors never expose provider payloads.
      currentUser = null;
      currentIdentity = null;
      resetRequired = true;
      try { if (client) { await client.logout(); resetRequired = false; } } catch { /* Retry before any later login. */ }
      onError();
    });
    return queue;
  };
}
