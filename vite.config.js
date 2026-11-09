import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Every build gets an id. The app compares it with the published version.json
// and reloads itself when a newer build is out (phones, especially Home Screen
// apps, otherwise keep running an old copy).
const BUILD_ID = String(Date.now());

const versionFile = () => ({
  name: 'version-file',
  apply: 'build',
  // Also lists every built file so the service worker can save the whole app
  // for instant, offline starts.
  generateBundle(_, bundle) {
    const assets = Object.keys(bundle).filter((f) => f.startsWith('assets/')).sort();
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, assets }) });
  },
});

export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), tailwindcss(), versionFile()],
});
