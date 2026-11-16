// getUser verifies the token with Supabase; a locally cached session alone is
// never used to unlock the member screen. This is a UI gate, not database RLS.
export async function verifyMember(auth) {
  const { data: session, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.session) return null;
  const { data, error } = await auth.getUser();
  if (error) throw error;
  if (!data?.user?.id || data.user.id !== session.session.user?.id) throw new Error('Account changed');
  return data.user;
}
