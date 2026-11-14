import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // GitHub Pages 하위 경로(/저장소이름/)에서도 동작하도록 상대 경로
});
