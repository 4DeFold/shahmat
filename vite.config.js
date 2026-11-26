import { defineConfig } from 'vite';
import { resolve, basename, join } from 'node:path';
import { createReadStream, readdirSync, mkdirSync, copyFileSync } from 'node:fs';

// Match production's clean game URL when running Vite locally or in preview.
const gameRoute = {
  name: 'game-route',
  configureServer(server) { server.middlewares.use(rewriteGame); },
  configurePreviewServer(server) { server.middlewares.use(rewriteGame); },
};
function rewriteGame(req, _res, next) {
  const path = req.url?.split('?')[0];
  if (path === '/play') req.url = req.url.replace(path, '/pages/play.html');
  if (path === '/about') req.url = req.url.replace(path, '/pages/about.html');
  if (path === '/game') req.url = req.url.replace(path, '/index.html');
  next();
}
// Only the single-threaded Stockfish builds are shipped. The full network is
// fetched lazily for King; the much smaller lite engine serves levels 1–5.
const stockfishDir = resolve('node_modules/stockfish/src');
const stockfishFiles = () => readdirSync(stockfishDir).filter(name => /^stockfish-17\.1-(?:lite-single-03e3232\.(?:js|wasm)|single-a496a04(?:\.js|-part-[0-5]\.wasm))$/.test(name));
const stockfishAssets = {
  name: 'stockfish-assets',
  configureServer(server) { server.middlewares.use(serveStockfish); },
  configurePreviewServer(server) { server.middlewares.use(serveStockfish); },
  writeBundle({ dir }) { const target = join(dir, 'stockfish'); mkdirSync(target, { recursive:true }); for (const name of stockfishFiles()) copyFileSync(join(stockfishDir, name), join(target, name)); copyFileSync(resolve('node_modules/stockfish/Copying.txt'), join(target, 'COPYING.txt')); },
};
function serveStockfish(req, res, next) {
  const path = req.url?.split('?')[0];
  if (!path?.startsWith('/stockfish/')) return next();
  const file = basename(path);
  if (file === 'COPYING.txt') { res.setHeader('Content-Type','text/plain; charset=utf-8'); createReadStream(resolve('node_modules/stockfish/Copying.txt')).pipe(res); return; }
  if (!stockfishFiles().includes(file)) return next();
  res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
  createReadStream(join(stockfishDir, file)).pipe(res);
}
export default defineConfig({
  plugins: [gameRoute, stockfishAssets],
  build: { rollupOptions: { input: { main: resolve('index.html'), demo: resolve('pages/play.html'), game: resolve('pages/game.html'), bot: resolve('pages/bot-game.html'), watch: resolve('pages/watch.html'), archive: resolve('pages/archive.html'), puzzles: resolve('pages/puzzles.html'), about: resolve('pages/about.html') } } },
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app'] },
});
