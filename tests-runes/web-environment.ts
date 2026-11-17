// A test environment with no DOM that asks Vite for the browser build: Svelte then compiles `$state` and `$effect` for the client,
// where effects actually run. (The built-in `node` environment compiles for the server, where they do not.)
import type { Environment } from 'vitest/runtime';

export default <Environment>{
  name: 'svelte-web',
  viteEnvironment: 'client',
  setup() { return { teardown() {} }; }
};
