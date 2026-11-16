import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Match production's clean game URL when running Vite locally or in preview.
const gameRoute = {
  name: 'game-route',
  configureServer(server) { server.middlewares.use(rewriteGame); },
  configurePreviewServer(server) { server.middlewares.use(rewriteGame); },
};
function rewriteGame(req, _res, next) {
  const path = req.url?.split('?')[0];
  if (path === '/play') req.url = req.url.replace(path, '/pages/play.html');
  if (path === '/game') req.url = req.url.replace(path, '/index.html');
  next();
}
export default defineConfig({
  plugins: [gameRoute],
  build: { rollupOptions: { input: { main: resolve('index.html'), demo: resolve('pages/play.html'), game: resolve('pages/game.html') } } },
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
});
