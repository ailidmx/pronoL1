import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './global.scss'
import './features.scss'
import App from './App.jsx'
import InstallApp from './InstallApp.jsx'

const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <InstallApp />
    <footer className="app-version-footer" title="Version de build UTC">v{buildVersion}</footer>
  </StrictMode>,
)
