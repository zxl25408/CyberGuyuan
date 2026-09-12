import {defineConfig} from 'vite';
export default defineConfig({
  server: {
    host:'127.0.0.1',hmr:false,
    // Dev assets regenerate (city.json / GLBs); never let the browser cache them.
    headers:{'Cache-Control':'no-store'},
    fs:{deny:['**/.env','**/.env.*','**/*.{crt,pem}','**/.git/**','**/local-only/**','**/data/raw/local-mmd/**']},
    watch:{usePolling:false,ignored:['**/local-only/**','**/artifacts/**','**/data/**','**/output/**','**/.venv/**','**/*.blend','**/*.blend1']},
  },
});
