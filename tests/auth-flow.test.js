import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const rootHtml = await readFile('index.html', 'utf8');
const shellHtml = await readFile('pages/app-shell.html', 'utf8');
const pageHtml = (await Promise.all(['home', 'game-view', 'profile', 'settings', 'help'].map(name => readFile(`pages/${name}.html`, 'utf8')))).join('');
// Unit tests preload views; browser checks verify the actual lazy loading.
const html = rootHtml.replace('    </main>', shellHtml.replace('<div id="page-content"></div>', `<div id="page-content">${pageHtml}</div>`) + '    </main>');
const source = (await readFile('app.js', 'utf8')).replace(/import .*?;\n/g, '').replace('export const appReady = initialize();', 'initialize();');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function setup({ existing = false, palette = 'monochrome', failSave = false, systemDark = false, initialStorage = {}, saveHandler = null, getUserHandler = null, userId = 'user-1', otpReady = true, autoConfirm = false, signupError = null, signInHandler = null, url = 'https://example.com', accessToken = null } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url });
  const { window } = dom;
  let loggedIn = existing;
  let sessionUserId = userId;
  let metadata = { palette };
  for (const [key, value] of Object.entries(initialStorage)) window.localStorage.setItem(key, value);
  const user = () => ({ id: userId, user_metadata: { ...metadata } });
  let storedProfile = existing ? { username: 'Player', bio: '', palette: 'monochrome' } : null;
  let signUps = 0, resetRequests = 0, resends = 0, lastVerification = null, newPassword = null;
  const db = {
    auth: {
      getSession: async () => ({ data: { session: loggedIn ? { user: { ...user(), id: sessionUserId }, access_token: accessToken } : null } }),
      getUser: async () => getUserHandler ? getUserHandler() : ({ data: { user: loggedIn ? user() : null } }),
      signUp: async () => { signUps++; if (signupError) return { data: null, error: signupError }; loggedIn = autoConfirm; return { data: { session: autoConfirm ? { user: user() } : null } }; },
      resetPasswordForEmail: async () => { resetRequests++; return { error: null }; },
      resend: async () => { resends++; return { error: null }; },
      verifyOtp: async values => { lastVerification = values; if (values.token !== '123456') return { data: { session: null }, error: new Error('invalid') }; loggedIn = true; return { data: { session: { user: user() } }, error: null }; },
      signInWithPassword: async credentials => {
        if (signInHandler) { const result = await signInHandler(credentials); if (result.data?.session) loggedIn = true; return result; }
        if (!storedProfile) return { data: { session:null }, error: { code:'invalid_credentials', message:'Invalid login credentials' } };
        loggedIn = true; return { data: { session: { user: user() } } };
      },
      updateUser: async ({ data, password }) => { if (password) { newPassword = password; return { error: null }; } if (saveHandler) await saveHandler(data); if (failSave) return { error: new Error('save failed') }; metadata = { ...metadata, ...data }; return { data: { user: user() } }; },
      signOut: async () => { loggedIn = false; return {}; }
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storedProfile }) }) }),
      upsert: async value => { storedProfile = value; return {}; }
    })
  };
  let themeChange;
  const themePreference = { matches: systemDark, addEventListener: (_, handler) => { themeChange = handler; } };
  let interval = null, intervalDelay = null;
  window.setInterval = (callback, delay) => { interval = callback; intervalDelay = delay; return 1; };
  window.clearInterval = () => { interval = null; };
  const poll = async () => { interval?.(); await tick(); };
  window.matchMedia = query => query.includes('reduced-motion') ? { matches: true } : themePreference;
  const changeSystemTheme = dark => { themePreference.matches = dark; themeChange?.({ matches: dark }); };
  window.requestAnimationFrame = cb => cb();
  window.scrollTo = () => {};
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (cb, delay, ...args) => delay >= 3000 ? 1 : realSetTimeout(cb, delay, ...args);
  window.createClient = () => db;
  window.eval(source.replace("import.meta.env.VITE_EMAIL_OTP_READY === 'true'", String(otpReady)));
  await tick();
  const $ = id => window.document.getElementById(id);
  const click = async id => { $(id).click(); await tick(); };
  const submit = async id => { $(id).dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  const choose = async (container, value) => { const input = $(container).querySelector(`input[value="${value}"]`); input.checked = true; input.dispatchEvent(new window.Event('change', { bubbles: true })); await tick(); };
  return { $, click, submit, choose, getProfile: () => storedProfile, getMetadata: () => metadata, getSignUps: () => signUps, getResetRequests: () => resetRequests, getResends: () => resends, getLastVerification: () => lastVerification, getNewPassword: () => newPassword, changeSystemTheme, setFailSave: value => { failSave = value; }, setSessionUserId: value => { sessionUserId = value; }, setMetadata: value => { metadata = { ...metadata, ...value }; }, poll, getPollDelay: () => intervalDelay, hasPoll: () => !!interval, window, document: window.document };
}

test('registration requires a profile, saves chosen palette and opens dashboard', async () => {
  const { $, click, submit, choose, getProfile, getMetadata, getSignUps, document } = await setup();
  await click('login'); assert.equal($('auth-screen').hidden, false);
  await click('tab-signup'); $('email').value = 'player@example.com'; $('password').value = 'secret123';
  await submit('auth-form'); assert.equal(getSignUps(), 1); assert.equal($('verify-screen').hidden, false);
  $('verify-code').value = '123456'; await submit('verify-form'); assert.equal($('profile-screen').hidden, false);
  assert.equal($('username').required, true);
  assert.equal($('profile-screen').querySelector('.signout'), null);
  $('username').value = 'Player_1'; $('bio').value = 'Chess'; await submit('profile-form');
  assert.equal(getProfile().username, 'Player_1'); assert.equal($('palette-screen').hidden, false);
  await choose('onboarding-palettes', 'atelier'); assert.equal(document.querySelector('.landing').dataset.palette, 'atelier');
  await submit('palette-form'); assert.equal(getMetadata().palette, 'atelier');
  assert.equal($('dashboard-screen').hidden, false); assert.match($('dashboard-title').textContent, /Player_1/);
  await click('edit-profile'); $('bio').value = 'Updated'; await submit('profile-form');
  assert.equal(getProfile().bio, 'Updated'); assert.equal(getMetadata().palette, 'atelier');
  assert.equal($('dashboard-screen').hidden, false);
  await choose('dashboard-palettes', 'wood'); assert.equal(getMetadata().palette, 'wood');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  assert.equal($('auth-screen').hidden, false); assert.equal(document.querySelector('.landing').classList.contains('palette-active'), false);
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal($('dashboard-screen').hidden, false); assert.equal(document.querySelector('.landing').dataset.palette, 'wood');
});

test('existing session opens dashboard with saved palette', async () => {
  const { $, document } = await setup({ existing: true, palette: 'forest' });
  assert.equal($('dashboard-screen').hidden, false); assert.match($('dashboard-title').textContent, /Player/);
  assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
});

test('failed background save keeps palette locally without reporting an error', async () => {
  const { $, choose, getMetadata, document, window } = await setup({ existing: true, palette: 'forest', failSave: true });
  await choose('dashboard-palettes', 'wood');
  assert.equal(document.querySelector('.landing').dataset.palette, 'wood');
  assert.equal(getMetadata().palette, 'forest');
  assert.equal($('dashboard-message').textContent, '');
  assert.equal($('dashboard-palettes').querySelector('input[value="wood"]').checked, true);
  const local = JSON.parse(window.localStorage.getItem('shahmat.appearance.user-1'));
  assert.equal(local.palette, 'wood'); assert.equal(local.dirty, true);
});

test('gray palette follows monochrome and persists after signing back in', async () => {
  const { $, click, choose, submit, getMetadata, document } = await setup({ existing: true });
  for (const id of ['onboarding-palettes', 'dashboard-palettes']) {
    assert.deepEqual(Array.from($(id).querySelectorAll('input'), input => input.value), ['monochrome', 'gray', 'forest', 'atelier', 'wood']);
  }
  await choose('dashboard-palettes', 'gray');
  assert.equal(getMetadata().palette, 'gray');
  assert.equal(document.querySelector('.landing').dataset.palette, 'gray');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  assert.equal(document.querySelector('.landing').classList.contains('palette-active'), false);
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal(document.querySelector('.landing').dataset.palette, 'gray');
  assert.equal($('dashboard-palettes').querySelector('input[value="gray"]').checked, true);
});


test('repeat click switches theme and persists it without changing palette', async () => {
  const { $, getMetadata, document, submit } = await setup({ existing: true, palette: 'gray' });
  const landing = document.querySelector('.landing');
  assert.equal(landing.dataset.paletteTheme, 'light');
  $('dashboard-palettes').querySelector('input[value="gray"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'dark');
  assert.equal(getMetadata().palette_theme, 'dark');
  assert.equal(getMetadata().palette, 'gray');
  $('dashboard-screen').querySelector('.signout').click(); await tick();
  $('email').value = 'player@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  assert.equal(landing.dataset.paletteTheme, 'dark');
  $('dashboard-palettes').querySelector('input[value="gray"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'light');
  assert.equal(getMetadata().palette_theme, 'light');
});

test('failed background save keeps the selected theme without a message', async () => {
  const { $, document, window } = await setup({ existing: true, palette: 'forest', failSave: true });
  $('dashboard-palettes').querySelector('input[value="forest"]').click(); await tick();
  assert.equal(document.querySelector('.landing').dataset.paletteTheme, 'dark');
  assert.equal($('dashboard-message').textContent, '');
  assert.equal(JSON.parse(window.localStorage.getItem('shahmat.appearance.user-1')).theme, 'dark');
});

test('startup waits for session and profile before revealing dashboard', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  let resolveSession, resolveProfile;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.setInterval = () => 1; window.clearInterval = () => {};
  window.requestAnimationFrame = cb => cb();
  window.scrollTo = () => {};
  window.createClient = () => ({
    auth: { getSession: () => new Promise(resolve => { resolveSession = resolve; }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => new Promise(resolve => { resolveProfile = resolve; }) }) }) })
  });
  window.eval(source.replace("import.meta.env.VITE_EMAIL_OTP_READY === 'true'", 'true'));
  const doc = window.document;
  assert.equal(doc.body.classList.contains('startup-ready'), false);
  assert.equal(doc.getElementById('landing-screen').hidden, true);
  resolveSession({ data: { session: { user: { id: 'user', user_metadata: { palette: 'gray', palette_theme: 'dark' } } } } });
  await tick();
  assert.equal(doc.body.classList.contains('startup-ready'), false);
  resolveProfile({ data: { username: 'Player', bio: '' } }); await tick();
  assert.equal(doc.body.classList.contains('startup-ready'), true);
  assert.equal(doc.getElementById('dashboard-screen').hidden, false);
  assert.equal(doc.getElementById('landing-screen').hidden, true);
  assert.equal(doc.querySelector('.landing').dataset.paletteTheme, 'dark');
});

test('no session reveals landing after session check', async () => {
  const { $, document } = await setup();
  assert.equal(document.body.classList.contains('startup-ready'), true);
  assert.equal($('landing-screen').hidden, false);
  assert.equal($('dashboard-screen').hidden, true);
});


test('onboarding repeat click changes theme and saves it on confirmation', async () => {
  const { $, click, submit, getMetadata, document } = await setup();
  await click('login'); await click('tab-signup');
  $('email').value = 'new@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  $('verify-code').value = '123456'; await submit('verify-form');
  $('username').value = 'Player_1'; await submit('profile-form');
  $('onboarding-palettes').querySelector('input[value="monochrome"]').click();
  assert.equal(document.querySelector('.landing').dataset.paletteTheme, 'dark');
  await submit('palette-form');
  assert.equal(getMetadata().palette_theme, 'dark');
  assert.equal($('dashboard-screen').hidden, false);
});

test('system theme is followed until user explicitly selects a theme', async () => {
  const { $, document, changeSystemTheme } = await setup({ existing: true, palette: 'wood' });
  const landing = document.querySelector('.landing');
  changeSystemTheme(true); assert.equal(landing.dataset.paletteTheme, 'dark');
  $('dashboard-palettes').querySelector('input[value="wood"]').click(); await tick();
  assert.equal(landing.dataset.paletteTheme, 'light');
  changeSystemTheme(false); changeSystemTheme(true);
  assert.equal(landing.dataset.paletteTheme, 'light');
});

test('session errors show a retry path instead of leaving an indefinite black screen', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, addEventListener() {} });
  window.setInterval = () => 1; window.clearInterval = () => {};
  window.requestAnimationFrame = cb => cb();
  window.scrollTo = () => {};
  window.createClient = () => ({ auth: { getSession: async () => ({ error: new Error('offline') }) } });
  window.eval(source.replace("import.meta.env.VITE_EMAIL_OTP_READY === 'true'", 'true')); await tick();
  assert.equal(window.document.body.classList.contains('startup-ready'), true);
  assert.equal(window.document.getElementById('auth-screen').hidden, false);
  assert.match(window.document.getElementById('auth-message').textContent, /Не удалось проверить сессию/);
});


test('a slow save never blocks changes and eventually syncs only the latest selection', async () => {
  let finishFirst;
  const calls = [];
  const { $, choose, document, getMetadata, window } = await setup({ existing: true, palette: 'monochrome', saveHandler: data => {
    calls.push({ ...data });
    if (calls.length === 1) return new Promise(resolve => { finishFirst = resolve; });
  } });
  await choose('dashboard-palettes', 'forest');
  await choose('dashboard-palettes', 'wood');
  $('dashboard-palettes').querySelector('input[value="wood"]').click(); await tick();
  assert.equal(document.querySelector('.landing').dataset.palette, 'wood');
  assert.equal(document.querySelector('.landing').dataset.paletteTheme, 'dark');
  assert.equal($('dashboard-palettes').querySelector('input[value="wood"]').disabled, false);
  assert.equal($('dashboard-message').textContent, '');
  assert.equal(calls.length, 1);
  finishFirst(); await tick();
  assert.equal(calls.length, 2);
  assert.equal(getMetadata().palette, 'wood'); assert.equal(getMetadata().palette_theme, 'dark');
  assert.equal(JSON.parse(window.localStorage.getItem('shahmat.appearance.user-1')).dirty, false);
});

test('offline changes survive reload and sync after network recovery', async () => {
  const first = await setup({ existing: true, palette: 'forest', failSave: true });
  await first.choose('dashboard-palettes', 'gray');
  first.$('dashboard-palettes').querySelector('input[value="gray"]').click(); await tick();
  const saved = first.window.localStorage.getItem('shahmat.appearance.user-1');
  const second = await setup({ existing: true, palette: 'forest', failSave: true, initialStorage: { 'shahmat.appearance.user-1': saved } });
  assert.equal(second.document.querySelector('.landing').dataset.palette, 'gray');
  assert.equal(second.document.querySelector('.landing').dataset.paletteTheme, 'dark');
  second.setFailSave(false); second.window.dispatchEvent(new second.window.Event('online')); await tick();
  assert.equal(second.getMetadata().palette, 'gray'); assert.equal(second.getMetadata().palette_theme, 'dark');
  assert.equal(JSON.parse(second.window.localStorage.getItem('shahmat.appearance.user-1')).dirty, false);
  assert.equal(second.$('dashboard-message').textContent, '');
});

test('pending settings are isolated by account', async () => {
  const saved = JSON.stringify({ palette: 'wood', theme: 'dark', dirty: true, version: 2 });
  const other = await setup({ existing: true, palette: 'forest', userId: 'user-2', initialStorage: { 'shahmat.appearance.user-1': saved } });
  assert.equal(other.document.querySelector('.landing').dataset.palette, 'forest');
  assert.equal(other.getMetadata().palette, 'forest');
  assert.equal(other.window.localStorage.getItem('shahmat.appearance.user-1'), saved);
});

test('onboarding continues while background sync is unresolved', async () => {
  const { $, click, submit, choose } = await setup({ saveHandler: () => new Promise(() => {}) });
  await click('login'); await click('tab-signup');
  $('email').value = 'new@example.com'; $('password').value = 'secret123'; await submit('auth-form');
  $('verify-code').value = '123456'; await submit('verify-form');
  $('username').value = 'Player_1'; await submit('profile-form');
  await choose('onboarding-palettes', 'gray'); await submit('palette-form');
  assert.equal($('dashboard-screen').hidden, false);
  assert.equal($('dashboard-message').textContent, '');
});


test('background sync refuses to save with a different account session', async () => {
  const { choose, getMetadata, window, setSessionUserId } = await setup({ existing: true, palette: 'forest' });
  setSessionUserId('user-2');
  await choose('dashboard-palettes', 'wood');
  assert.equal(getMetadata().palette, 'forest');
  assert.equal(JSON.parse(window.localStorage.getItem('shahmat.appearance.user-1')).dirty, true);
});


test('profile editing can be cancelled without saving changes', async () => {
  const { $, click, getProfile } = await setup({ existing: true });
  await click('edit-profile');
  assert.equal($('profile-cancel').hidden, false);
  $('bio').value = 'Unsaved changes';
  await click('profile-cancel');
  assert.equal($('dashboard-screen').hidden, false);
  assert.equal(getProfile().bio, '');
});

test('sidebar navigates between pages, moves the dashboard to profile and returns to empty home', async () => {
  const { $, click, document, window } = await setup({ existing: true, palette: 'forest' });
  const pageButton = name => document.querySelector(`#dashboard-screen [data-page="${name}"]`);
  assert.equal($('dashboard-home').hidden, false);
  assert.equal($('dashboard-home').textContent.trim(), 'Главная');
  assert.equal($('page-profile').hidden, true);
  assert.ok($('page-settings').contains($('dashboard-palettes')));
  assert.equal($('page-profile').contains($('dashboard-palettes')), false);
  assert.equal($('nav-play').getAttribute('href'), '/game');
  assert.equal($('nav-play').dataset.page, 'game');
  $('nav-play').click(); await tick();
  assert.equal($('page-game').hidden, false);
  assert.equal($('dashboard-screen').hidden, false);
  assert.equal($('nav-play').getAttribute('aria-current'), 'page');
  assert.equal(window.location.pathname, '/game');
  assert.equal($('member-game-frame').getAttribute('src'), '/pages/game.html');
  await click('account-toggle');
  assert.equal($('account-toggle').getAttribute('aria-expanded'), 'true');
  for (const name of ['profile', 'settings', 'help']) {
    if ($('account-menu').hidden) await click('account-toggle');
    pageButton(name).click(); await tick();
    assert.equal($(`page-${name}`).hidden, false);
    if (name === 'profile') {
      assert.equal(document.activeElement, $('dashboard-title'));
      assert.equal($('dashboard-title').textContent, 'Привет, Player.');
    }
    assert.equal($('account-menu').hidden, true);
    assert.equal(window.location.pathname, `/${name}`);
    assert.equal(document.querySelector('.landing').dataset.palette, 'forest');
  }
  document.querySelector('.sidebar-brand').click(); await tick();
  assert.equal($('dashboard-home').hidden, false);
  assert.equal(window.location.pathname, '/home');
  assert.equal(document.activeElement, $('page-home-title'));
  assert.equal($('page-profile').hidden, true);
  await click('account-toggle');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($('account-menu').hidden, true);
  assert.equal(document.activeElement, $('account-toggle'));
});

test('sidebar sign out from a blank page clears the route and opens login', async () => {
  const { $, click, document, window } = await setup({ existing: true });
  await click('account-toggle');
  document.querySelector('#account-menu [data-page=settings]').click(); await tick();
  await click('account-toggle');
  document.querySelector('#account-menu .signout').click(); await tick();
  assert.equal($('auth-screen').hidden, false);
  assert.equal($('dashboard-screen').hidden, true);
  assert.equal(window.location.hash, '');
  assert.equal(document.querySelector('.landing').classList.contains('palette-active'), false);
});

test('remote appearance is checked every second and applied without a local write', async () => {
  let saves = 0;
  const app = await setup({ existing: true, palette: 'forest', saveHandler: () => { saves++; } });
  assert.equal(app.getPollDelay(), 1000);
  app.setMetadata({ palette: 'wood', palette_theme: 'dark' });
  await app.poll();
  assert.equal(app.document.querySelector('.landing').dataset.palette, 'wood');
  assert.equal(app.document.querySelector('.landing').dataset.paletteTheme, 'dark');
  assert.equal(app.$('dashboard-palettes').querySelector('input[value="wood"]').checked, true);
  assert.equal(saves, 0);
  assert.equal(JSON.parse(app.window.localStorage.getItem('shahmat.appearance.user-1')).dirty, false);
  app.document.querySelector('#account-menu .signout').click(); await tick();
  assert.equal(app.hasPoll(), false);
});

test('a delayed remote response cannot override a more recent local change', async () => {
  let resolveUser;
  const app = await setup({ existing: true, palette: 'forest', getUserHandler: () => new Promise(resolve => { resolveUser = resolve; }) });
  const polling = app.poll();
  await tick();
  await app.choose('dashboard-palettes', 'gray');
  resolveUser({ data: { user: { id: 'user-1', user_metadata: { palette: 'wood', palette_theme: 'dark' } } } });
  await polling;
  assert.equal(app.document.querySelector('.landing').dataset.palette, 'gray');
  assert.equal(app.getMetadata().palette, 'gray');
});

test('polling ignores another account and does not overwrite offline changes', async () => {
  let reads = 0;
  const app = await setup({ existing: true, palette: 'forest', failSave: true, getUserHandler: async () => {
    reads++;
    return { data: { user: { id: 'user-2', user_metadata: { palette: 'wood', palette_theme: 'dark' } } } };
  } });
  await app.poll();
  assert.equal(app.document.querySelector('.landing').dataset.palette, 'forest');
  await app.choose('dashboard-palettes', 'gray');
  await app.poll();
  assert.equal(reads, 1);
  assert.equal(app.document.querySelector('.landing').dataset.palette, 'gray');
});

test('a remote response after logout cannot restore the prior account appearance', async () => {
  let resolveUser;
  const app = await setup({ existing: true, palette: 'forest', getUserHandler: () => new Promise(resolve => { resolveUser = resolve; }) });
  const polling = app.poll(); await tick();
  app.document.querySelector('#account-menu .signout').click(); await tick();
  resolveUser({ data: { user: { id: 'user-1', user_metadata: { palette: 'wood', palette_theme: 'dark' } } } });
  await polling;
  assert.equal(app.$('auth-screen').hidden, false);
  assert.equal(app.document.querySelector('.landing').dataset.palette, 'monochrome');
});


test('registration requires the correct code, supports resend and fails closed on misconfiguration', async () => {
  const app = await setup();
  await app.click('login'); await app.click('tab-signup');
  app.$('email').value = 'new@example.com'; app.$('password').value = 'secret123';
  await app.submit('auth-form');
  assert.equal(app.$('verify-screen').hidden, false);
  assert.equal(app.$('profile-screen').hidden, true);
  assert.equal(app.$('password').value, '');
  await app.click('resend-code'); assert.equal(app.getResends(), 1);
  app.$('verify-code').value = '000000'; await app.submit('verify-form');
  assert.match(app.$('verify-message').textContent, /Неверный/);
  assert.equal(app.$('profile-screen').hidden, true);
  app.$('verify-code').value = '123456'; await app.submit('verify-form');
  assert.deepEqual({ ...app.getLastVerification() }, { email: 'new@example.com', token: '123456', type: 'email' });
  assert.equal(app.$('profile-screen').hidden, false);
  const broken = await setup({ autoConfirm: true });
  await broken.click('login'); await broken.click('tab-signup');
  broken.$('email').value = 'new@example.com'; broken.$('password').value = 'secret123'; await broken.submit('auth-form');
  assert.equal(broken.$('auth-screen').hidden, false);
  assert.match(broken.$('auth-message').textContent, /временно недоступно/);
  assert.equal(broken.$('dashboard-screen').hidden, true);
});

test('unconfigured OTP deployment does not send registration or recovery requests', async () => {
  const app = await setup({ otpReady: false });
  await app.click('login'); await app.click('tab-signup');
  app.$('email').value = 'new@example.com'; app.$('password').value = 'secret123'; await app.submit('auth-form');
  assert.equal(app.getSignUps(), 0); assert.match(app.$('auth-message').textContent, /временно недоступно/);
  await app.click('tab-login'); await app.click('forgot-password');
  app.$('recovery-email').value = 'new@example.com'; await app.submit('recovery-form');
  assert.equal(app.getResetRequests(), 0); assert.match(app.$('recovery-message').textContent, /временно недоступно/);
});

test('recovery verifies a code before allowing a matching new password', async () => {
  const app = await setup();
  await app.click('login'); await app.click('forgot-password');
  app.$('recovery-email').value = 'player@example.com'; await app.submit('recovery-form');
  assert.equal(app.getResetRequests(), 1); assert.equal(app.$('verify-screen').hidden, false);
  assert.match(app.$('verify-description').textContent, /Если аккаунт существует/);
  await app.click('resend-code'); assert.equal(app.getResetRequests(), 2);
  app.$('verify-code').value = '000000'; await app.submit('verify-form');
  assert.equal(app.$('reset-password-screen').hidden, true);
  app.$('verify-code').value = '123456'; await app.submit('verify-form');
  assert.equal(app.getLastVerification().type, 'recovery');
  assert.equal(app.$('reset-password-screen').hidden, false);
  assert.equal(app.window.sessionStorage.getItem('shahmat.recovery-pending'), '1');
  app.$('new-password').value = 'newpassword'; app.$('confirm-password').value = 'wrongpassword';
  await app.submit('reset-password-form'); assert.equal(app.getNewPassword(), null);
  app.$('confirm-password').value = 'newpassword'; await app.submit('reset-password-form');
  assert.equal(app.getNewPassword(), 'newpassword');
  assert.equal(app.$('auth-screen').hidden, false);
  assert.equal(app.window.sessionStorage.getItem('shahmat.recovery-pending'), null);
  assert.match(app.$('auth-message').textContent, /Пароль изменён/);
});


test('a recovery link opens password reset only for its matching session', async () => {
  const app = await setup({ existing: true, url: 'https://example.com/#access_token=valid-token&type=recovery', accessToken: 'valid-token' });
  assert.equal(app.$('reset-password-screen').hidden, false);
  assert.equal(app.$('dashboard-screen').hidden, true);
  assert.equal(app.window.sessionStorage.getItem('shahmat.recovery-pending'), '1');
  const stale = await setup({ existing: true, url: 'https://example.com/#access_token=invalid-token&type=recovery', accessToken: 'existing-session-token' });
  assert.equal(stale.$('reset-password-screen').hidden, true);
  assert.equal(stale.$('dashboard-screen').hidden, false);
});

test('signup errors give actionable messages without exposing server details', async () => {
  for (const [error, expected] of [
    [{ code: 'email_send_failed', message: 'private SMTP detail' }, /Не удалось отправить письмо/],
    [{ code: 'unexpected_failure', message: 'Error sending confirmation email' }, /Не удалось отправить письмо/],
    [{ code: 'over_email_send_rate_limit', status: 429 }, /Слишком много попыток/],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, /связаться с сервером/],
    [{ code: 'email_address_invalid' }, /Проверь адрес/],
    [{ code: 'unknown', message: 'private server detail' }, /Не получилось выполнить действие/],
  ]) {
    const app = await setup({ signupError: error });
    await app.click('login'); await app.click('tab-signup');
    app.$('email').value = 'player@example.com'; app.$('password').value = 'password123';
    await app.submit('auth-form');
    assert.match(app.$('auth-message').textContent, expected);
    assert.doesNotMatch(app.$('auth-message').textContent, /private/);
    assert.equal(app.$('verify-screen').hidden, true);
  }
});


test('registration deep link opens the signup tab for guests', async () => {
  const app = await setup({ url: 'https://example.com/login?mode=signup' });
  assert.equal(app.$('auth-screen').hidden, false);
  assert.equal(app.$('tab-signup').getAttribute('aria-pressed'), 'true');
  assert.match(app.$('auth-submit').textContent, /Создать аккаунт/);
});

test('game route keeps the sidebar and ignores frame height messages', async () => {
  const { $, window } = await setup({ existing: true, url: 'https://example.com/game' });
  assert.equal($('dashboard-screen').hidden, false);
  assert.equal($('page-game').hidden, false);
  assert.equal($('app-sidebar').hidden, false);
  assert.equal($('nav-play').getAttribute('aria-current'), 'page');
  const frame = $('member-game-frame');
  window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://evil.example', source: frame.contentWindow, data: { type: 'shahmat-game-height', height: 920 } }));
  assert.equal(frame.style.height, '');
  window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://example.com', source: frame.contentWindow, data: { type: 'shahmat-game-height', height: 920 } }));
  assert.equal(frame.style.height, '');
  window.dispatchEvent(new window.MessageEvent('message', { origin: 'https://example.com', source: frame.contentWindow, data: { type: 'shahmat-game-height', height: 1000000 } }));
  assert.equal(frame.style.height, '');
  window.close();
});

test('a guest visiting the game route returns to the landing page', async () => {
  const { $, window } = await setup({ url: 'https://example.com/game' });
  assert.equal(window.location.pathname, '/');
  assert.equal($('landing-screen').hidden, false);
  assert.equal($('dashboard-screen').hidden, true);
  window.close();
});

test('the game frame receives board colours from the active palette', async () => {
  const { $, window, document } = await setup({ existing: true, url: 'https://example.com/game' });
  const frame = $('member-game-frame');
  const sent = [];
  frame.contentWindow.postMessage = (message, origin) => sent.push({ message, origin });
  const landing = document.querySelector('.landing');
  landing.style.setProperty('--board-light', '#eeeed2');
  landing.style.setProperty('--board-dark', '#769656');
  landing.style.setProperty('--accent', '#3d5a40');
  frame.dispatchEvent(new window.Event('load'));
  assert.equal(sent.at(-1).origin, 'https://example.com');
  assert.equal(sent.at(-1).message.colors['--board-light'], '#eeeed2');
  assert.equal(sent.at(-1).message.colors['--board-dark'], '#769656');
  assert.equal(sent.at(-1).message.colors['--accent'], '#3d5a40');
  window.close();
});


test('settings contains palette options and keeps selection when navigating', async () => {
  const { $, choose, document, window } = await setup({ existing: true, palette: 'forest' });
  assert.equal($('page-profile').querySelector('#dashboard-palettes'), null);
  assert.equal($('settings-palette-heading').textContent, 'Палитры.');
  assert.equal($('dashboard-palettes').querySelectorAll('label.palette-option').length, 5);
  document.querySelector('#account-menu [data-page=settings]').click(); await tick();
  assert.equal(window.location.pathname, '/settings');
  assert.equal($('dashboard-palettes').querySelector('input:checked').value, 'forest');
  await choose('dashboard-palettes', 'wood');
  document.querySelector('#account-menu [data-page=profile]').click(); await tick();
  document.querySelector('#account-menu [data-page=settings]').click(); await tick();
  assert.equal($('dashboard-palettes').querySelector('input:checked').value, 'wood');
  assert.equal(document.querySelector('.landing').dataset.palette, 'wood');
});


test('palette mouse wheel scrolls the strip and leaves page scrolling available at edges', async () => {
  const { $, window } = await setup({ existing: true });
  const strip = $('palette-scroll');
  Object.defineProperties(strip, { scrollWidth: { value: 900 }, clientWidth: { value: 300 } });
  let scroll = null;
  strip.scrollBy = options => { scroll = options; };
  const wheel = values => {
    const event = new window.WheelEvent('wheel', { bubbles: true, cancelable: true, ...values });
    strip.dispatchEvent(event); return event;
  };
  assert.equal(wheel({ deltaY: -30 }).defaultPrevented, false);
  assert.equal(wheel({ deltaY: 60 }).defaultPrevented, true);
  assert.equal(scroll.left, 60);
  assert.equal(scroll.behavior, 'instant'); // test setup prefers reduced motion
  scroll = null;
  assert.equal(wheel({ deltaX: 60, deltaY: 10 }).defaultPrevented, false);
  assert.equal(wheel({ deltaY: 50, ctrlKey: true }).defaultPrevented, false);
  assert.equal(scroll, null);
  strip.scrollLeft = 600;
  assert.equal(wheel({ deltaY: 20 }).defaultPrevented, false);
});


test('signup signs in an existing account when credentials are correct', async () => {
  const app = await setup({ signInHandler: async () => ({ data: { session:{ user:{ id:'user-1', user_metadata:{} } } }, error:null }) });
  await app.click('login'); await app.click('tab-signup');
  app.$('email').value = 'known@example.com'; app.$('password').value = 'secret';
  await app.submit('auth-form');
  assert.equal(app.getSignUps(), 0); assert.equal(app.$('profile-screen').hidden, false);
});

test('invalid login does not redirect and explicitly preserves credentials for signup', async () => {
  const app = await setup(); await app.click('login');
  app.$('email').value = 'unknown@example.com'; app.$('password').value = 'secret123'; await app.submit('auth-form');
  assert.equal(app.$('tab-login').getAttribute('aria-pressed'), 'true');
  assert.equal(app.$('auth-register-suggestion').hidden, false);
  assert.match(app.$('auth-message').textContent, /Неверная почта или пароль/);
  await app.click('auth-register-suggestion');
  assert.equal(app.$('tab-signup').getAttribute('aria-pressed'), 'true');
  assert.equal(app.$('email').value, 'unknown@example.com'); assert.equal(app.$('password').value, 'secret123');
  assert.equal(app.getSignUps(), 0);
});

test('signup does not create an account when sign-in failed due to network', async () => {
  const app = await setup({ signInHandler: async () => ({ data:null, error:{ name:'AuthRetryableFetchError', message:'failed to fetch' } }) });
  await app.click('login'); await app.click('tab-signup');
  app.$('email').value = 'new@example.com'; app.$('password').value = 'secret123'; await app.submit('auth-form');
  assert.equal(app.getSignUps(), 0); assert.match(app.$('auth-message').textContent, /сервер/);
});
