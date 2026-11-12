import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 単一の HTML（dist/index.html）と、実在都市の地図データ（dist/maps/*.json。public/maps から複製）を作る。
// 地図はゲーム開始時に選ぶ（src/maps/registry.ts）。
export default defineConfig({
  plugins: [viteSingleFile()],
  assetsInclude: ['**/*.glb'],
  build: { target: 'es2022', chunkSizeWarningLimit: 6000, outDir: 'dist' },
  test: { include: ['tests/*.test.ts'], testTimeout: 30000 },
} as any);
