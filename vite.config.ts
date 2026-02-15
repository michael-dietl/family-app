/// <reference types="vitest" />

import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Fix common vendor CSS typos/hacks that cause minifier warnings
    // - replaces 'backbround-color' -> 'background-color'
    // - strips invalid property hacks like '*display: inline' from bundled CSS
    {
      name: 'fix-vendor-css',
      // Run during transform to catch CSS before minification
      transform(code, id) {
        if (typeof code !== 'string') return null
        // Only transform CSS sources: .css files, CSS query strings, or Vue <style> blocks
        if (!/(\.css($|\?)|\?vue&type=style)/.test(id)) return null

        let changed = false
        let s = code
        // fix common typo
        if (/backbround-color/i.test(s)) {
          s = s.replace(/backbround-color/gi, 'background-color')
          changed = true
        }
        // strip IE star-hacks like '*display: inline;'
        if (/\*[a-zA-Z_\-]+\s*:\s*[^;]+;?/.test(s)) {
          s = s.replace(/\*[a-zA-Z_\-]+\s*:\s*[^;]+;?/g, '')
          changed = true
        }

        return changed ? { code: s, map: null } : null
      },

      // also sanitize final bundle assets as a fallback
      generateBundle(_, bundle) {
        for (const fileName of Object.keys(bundle)) {
          const chunk: any = bundle[fileName]
          if (!chunk || !chunk.type) continue
          if (chunk.type === 'asset' || (chunk.type === 'chunk' && /\.css($|\?)/.test(fileName))) {
            let source = chunk.source || chunk.code
            if (typeof source === 'string') {
              source = source.replace(/backbround-color/gi, 'background-color')
              source = source.replace(/\*[a-zA-Z_\-]+\s*:\s*[^;]+;?/g, '')
              if (chunk.source) chunk.source = source
              else chunk.code = source
            }
          }
        }
      },
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id) return;
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('node_modules')) return;
          if (normalizedId.includes('@capacitor/')) {
            return 'vendor-capacitor';
          }
          if (normalizedId.includes('@whiteguru/capacitor-plugin-video-editor') || normalizedId.includes('@capawesome/capacitor-file-picker')) {
            return 'vendor-editor';
          }
          if (normalizedId.includes('node_modules/ort')) {
            return 'vendor-ort';
          }
          if (normalizedId.includes('@capgo/')) {
            return 'vendor-capgo';
          }
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom'
  }
})
