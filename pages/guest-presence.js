import {createClient} from '@supabase/supabase-js';
import {guestPresenceId, startOnlinePresence} from './online-presence.js';

// A separate client is only used on standalone public pages, never in an iframe.
export function startGuestPresence(win) {
  const client = createClient('https://eswyxbyddkajysogtglp.supabase.co', 'sb_publishable_w9pinHWr8XK5F9CflsSJmQ_4KFMKzHS');
  return startOnlinePresence(client, guestPresenceId(win), () => {});
}
