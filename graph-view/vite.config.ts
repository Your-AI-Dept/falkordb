import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Port 5174 so the graph view runs beside the Rally app on 5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
})
