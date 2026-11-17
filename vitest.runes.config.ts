// Tests of Svelte runes ($state, $effect) need Svelte's browser runtime, so they run apart from the Node suite in vite.config.ts.
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  // `svelte` ships a client runtime (runs effects) and a server one (does not). Node tests get the server one unless asked, so ask for `browser`, and inline it so Vite resolves it.
  resolve: { conditions: ['browser'] },
  ssr: { resolve: { conditions: ['browser'], externalConditions: ['browser'] } },
  test: { include: ['tests-runes/**/*.test.ts'], environment: './tests-runes/web-environment.ts', testTimeout: 30000, server: { deps: { inline: [/svelte/] } } }
});
