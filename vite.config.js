import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Match production's clean game URL when running Vite locally or in preview.
const gameRoute = {
  name: 'game-route',
  configureServer(server) { server.middlewares.use(rewriteGame); },
  configurePreviewServer(server) { server.middlewares.use(rewriteGame); },
};
function rewriteGame(req, _res, next) {
  if (req.url?.split('?')[0] === '/play') req.url = req.url.replace('/play', '/pages/play.html');
  next();
}
export default defineConfig({
  plugins: [gameRoute],
  build: { rollupOptions: { input: { main: resolve('index.html'), game: resolve('pages/play.html') } } },
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
});
