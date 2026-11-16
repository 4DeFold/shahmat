// The account page is optimistic UI for local, unrated bot play only. Server
// authorization and RLS are still required for all protected operations.
export function cachedUserId(storage) {
  try {
    const session = JSON.parse(storage.getItem('sb-eswyxbyddkajysogtglp-auth-token') || 'null');
    return typeof session?.access_token === 'string' && typeof session?.user?.id === 'string' && session.user.id ? session.user.id : null;
  } catch { return null; }
}

export function startSessionMonitor({ auth, cachedId, open, logout, accountChanged }) {
  let activeId = null, stopped = false;
  function openFor(id) {
    if (stopped || !id) return;
    if (activeId && activeId !== id) { stopped = true; accountChanged(); return; }
    if (!activeId) { activeId = id; void open(id); }
  }
  function leave() {
    if (stopped) return;
    stopped = true;
    logout();
  }
  // Render cached local play immediately; the remote check runs independently.
  openFor(cachedId);
  auth.onAuthStateChange((event, session) => {
    if (stopped) return;
    if (session?.user?.id) openFor(session.user.id);
    else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') leave();
  });
  const verification = (async () => {
    try {
      const { data, error } = await auth.getSession();
      if (stopped) return;
      if (error) {
        if (error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) leave();
        return;
      }
      if (!data?.session?.user?.id) { leave(); return; }
      openFor(data.session.user.id);
      if (stopped) return;
      const { data: userData, error: userError } = await auth.getUser();
      if (stopped) return;
      if (userError) {
        // A connection/server failure is not evidence of a logged-out user.
        if (userError.name === 'AuthSessionMissingError' || userError.status === 401 || userError.status === 403) leave();
        return;
      }
      if (!userData?.user?.id) { leave(); return; }
      openFor(userData.user.id);
    } catch { /* A network failure must not log the player out. */ }
  })();
  return { verification };
}
