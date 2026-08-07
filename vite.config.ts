import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// No host-specific adapters or presets. Deployment target is still undecided, so the build stays a
// plain static bundle that any host can serve.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss()],
  server: { port: 3100 },
  resolve: {
    // '@/' matches the Lovable-sourced redesign's own import convention, so files ported from it need
    // no path rewriting. Pre-existing code keeps using its usual relative imports — this is additive.
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
