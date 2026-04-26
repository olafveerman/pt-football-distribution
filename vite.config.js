import { defineConfig } from 'vite';

export default defineConfig({
  // On GitHub Pages the site lives at /repo-name/, so asset paths need that prefix.
  // VITE_BASE is injected by the deploy workflow; falls back to '/' for local dev.
  base: process.env.VITE_BASE ?? '/',
});
