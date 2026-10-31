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
      manifest: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/]react(?:-dom)?[\\/]|node_modules[\\/]scheduler[\\/]/, priority: 50, entriesAware: true },
              { name: 'motion', test: /node_modules[\\/]motion[\\/]/, priority: 45, entriesAware: true },
              { name: 'gate', test: /[\\/]src[\\/]screens[\\/]GateOverlay\\.tsx$/, priority: 60, entriesAware: true },
              { name: 'awakening', test: /[\\/]src[\\/]screens[\\/]AwakeningScreen\\.tsx$/, priority: 59, entriesAware: true },
              { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]|[\\/]src[\\/]net[\\/]supabase\\.ts$/, priority: 55, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'hud-and-sheets', test: /[\\/]src[\\/]hud[\\/]|[\\/]src[\\/]ui[\\/]/, priority: 50, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'ui-core', test: /[\\/]src[\\/]config[\\/]|[\\/]src[\\/]lib[\\/]/, priority: 45, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'react', test: /node_modules[\\/]react(?:-dom)?[\\/]|node_modules[\\/]scheduler[\\/]/, priority: 50, entriesAware: true },
              { name: 'motion', test: /node_modules[\\/]motion[\\/]/, priority: 45, entriesAware: true },
              { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 40, entriesAware: true, maxSize: 260 * 1024 },
              { name: 'engine-core', test: /[\\/]src[\\/]engine[\\/]core[\\/]|[\\/]src[\\/]engine[\\/]world[\\/](?:SkyDome|CloudSea|FarMountainRanges|sky|terrain|collision|layout)\\.ts$/, priority: 35, entriesAware: true, maxSize: 260 * 1024 },
              { name: 'actors', test: /[\\/]src[\\/]engine[\\/]actors[\\/]|[\\/]src[\\/]engine[\\/]locomotion[\\/]/, priority: 34, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'vegetation', test: /[\\/]src[\\/]engine[\\/]world[\\/](?:Trees|Rocks|Water|Flowers|GrassSystem)\\.ts$/, priority: 33, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'fx', test: /[\\/]src[\\/]engine[\\/]fx[\\/]/, priority: 32, entriesAware: true, maxSize: 300 * 1024 },
              { name: 'world-content', test: /[\\/]src[\\/]engine[\\/]world[\\/]/, priority: 30, entriesAware: true, maxSize: 300 * 1024 },
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
