import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function buildVersion(date = new Date()) {
  const iso = date.toISOString()
  return `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}.${iso.slice(11, 13)}${iso.slice(14, 16)}`
}

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(process.env.VITE_BUILD_VERSION || buildVersion()) },
})
