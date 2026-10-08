import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import offlineCachePlugin from './scripts/offlineCachePlugin.js';

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineCachePlugin()],
  base: '/my-cupping-appV2/'
});
