// TEMP preview entry — renders the disconnected LandingPage on its own.
// Not referenced by App.jsx; delete this file and preview-landing.html when done.
import React from 'react'
import ReactDOM from 'react-dom/client'
import LandingPage from './pages/LandingPage.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingPage onAdminClick={() => { window.location.href = '/' }} />
  </React.StrictMode>,
)
