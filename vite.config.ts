import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => {
  if (command === 'build') process.env.NODE_ENV = 'production';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(root, './src') },
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/]react(?:-dom)?[\\/]|node_modules[\\/]scheduler[\\/]/, priority: 50, entriesAware: true },
              { name: 'motion', test: /node_modules[\\/]motion[\\/]/, priority: 45, entriesAware: true },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/, priority: 44, entriesAware: true },
              { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 40, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'engine-core', test: /[\\/]src[\\/]engine[\\/]core[\\/]/, priority: 35, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'actors', test: /[\\/]src[\\/]engine[\\/]actors[\\/]/, priority: 34, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'vegetation', test: /[\\/]src[\\/]engine[\\/]world[\\/](?:Trees|Rocks)\\.ts$/, priority: 33, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'fx', test: /[\\/]src[\\/]engine[\\/]fx[\\/]/, priority: 32, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'world-content', test: /[\\/]src[\\/]engine[\\/]world[\\/]/, priority: 30, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'locomotion', test: /[\\/]src[\\/]engine[\\/]locomotion[\\/]/, priority: 29, entriesAware: true, maxSize: 300 * 1024 },
            ],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
