// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
    root: 'frontend/public',
    server: {
        port: 3000,
        open: true,
        host: true
    },
    build: {
        outDir: '../../dist',
        emptyOutDir: true
    },
})