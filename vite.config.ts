import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { outDir: 'build', sourcemap: false }, server: { host: '127.0.0.1', port: 15173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:18080', '/socket.io': { target: 'http://127.0.0.1:18080', ws: true } } } });
