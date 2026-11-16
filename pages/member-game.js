// Load the shared chess UI only after a verified user is known.
export async function startMemberGame(id) {
  document.body.dataset.gameUser = id;
  await import('./play.js');
}
