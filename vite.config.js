import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path';

export default defineConfig({
  plugins: [topLevelAwait()],
  base: './',
  resolve: {
    alias: {
      "three/addons/**": path.resolve(__dirname, './node_modules/three/examples/jsm/**')
    }
  }
})