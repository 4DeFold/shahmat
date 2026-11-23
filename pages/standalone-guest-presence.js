import {startGuestPresence} from './guest-presence.js';
if (window.parent === window) startGuestPresence(window);
