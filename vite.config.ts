import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
    base: 'http://localhost:3004/',
    plugins: [
        react({
            jsxRuntime: 'automatic',
        }),
        federation({
            name: 'crm_app',
            filename: 'remoteEntry.js',
            // Access from Shell: import('crm_app/App')
            exposes: {
                './App': './src/App.tsx',
            },
            shared: {
                react: { singleton: true, requiredVersion: '^19.2.0' },
                'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
                'react-router-dom': { singleton: true, requiredVersion: '^7.12.0' },
                'framer-motion': { singleton: true },
                'lucide-react': { singleton: true },
                '@so360/shell-context': { singleton: true },
                '@so360/design-system': { singleton: true },
                '@so360/event-bus': { singleton: true },
            },
        }),
    ],
    build: {
        target: 'esnext',
        minify: false,
        cssCodeSplit: false,
    },
    server: {
        port: 3004,
        cors: true, // Allow Shell to load remoteEntry.js
        proxy: {
            '/crm-api': {
                target: 'http://localhost:3003',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/crm-api/, ''),
            },
            '/core-api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/core-api/, ''),
            },
            '/v1': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
    preview: {
        port: 3004,
        cors: true,
        proxy: {
            '/crm-api': {
                target: 'http://localhost:3003',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/crm-api/, ''),
            },
            '/core-api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/core-api/, ''),
            },
            '/v1': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
        },
    },
});
