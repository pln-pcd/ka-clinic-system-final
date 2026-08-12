import LandingPage from './LandingPage.jsx'

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5173'

function App() {
  const goToAdmin = () => {
    window.open(ADMIN_URL, '_blank', 'noopener')
  }

  return <LandingPage onAdminClick={goToAdmin} />
}

export default App
