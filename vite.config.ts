import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

export default defineConfig({
    base: process.env.VITE_BASE_URL || 'http://localhost:3004/',
    resolve: {
        alias: {
            '@so360/shell-context': path.resolve(__dirname, '../../so360-shell-fe/packages/shell-context/dist/index.js'),
            '@so360/design-system': path.resolve(__dirname, '../../so360-shell-fe/packages/design-system/dist/index.js'),
            '@so360/event-bus': path.resolve(__dirname, '../../so360-shell-fe/packages/event-bus/dist/index.js'),
            '@so360/formatters': path.resolve(__dirname, '../../so360-shell-fe/packages/formatters/dist/index.js'),
        },
    },
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
                '@so360/formatters': { singleton: true },
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
        strictPort: true,
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
        strictPort: true,
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
