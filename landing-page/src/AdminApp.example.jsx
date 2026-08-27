// Example wrapper — mirrors landing/src/App.jsx's existing pattern.
// Drop AdminLandingPage.jsx next to LandingPage.jsx (or in a new
// /admin-landing route, depending on how you decide to host it), then
// wire it up like this:

import AdminLandingPage from "./AdminLandingPage.jsx";

const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || "http://localhost:5173";

function AdminApp() {
  const goToDashboard = () => {
    window.location.href = ADMIN_URL;
  };

  return <AdminLandingPage onEnterDashboard={goToDashboard} />;
}

export default AdminApp;

// Routing note: since this needs to live somewhere distinct from the
// patient landing page, pick one:
//   1. A separate Vercel project/subdomain (e.g. staff.kaclinic.ph)
//   2. A new route in the existing landing app (e.g. /staff or /admin)
//      if it's using a router — check vercel.json / your router config
//      for how routes are currently split before choosing.
