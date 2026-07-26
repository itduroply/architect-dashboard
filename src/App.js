import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { supabase } from './lib/supbase'; // Ensure this points to your actual supabase client path
import Ventura from './components/pages/VenturaInformation';
import Login from './components/Login';
import './components/Global.css';
import ProductEligibility from './components/pages/ProductEligible'; // Import the ProductEligibilityPage component
import Dashboard from './components/pages/Dashboard';
import Topbar from './components/Topbar';
import Query from './components/pages/Query';
import Sidebar from './components/Sidebar';
import PanArchitect from './components/pages/PanArchitect';
import Full from './components/pages/Full'; // Import the Full component
import Payout from './components/pages/Payout'; // Import the PayoutRequestsTable component
import CommissionLedger from './components/pages/CommissionLedger'; // Import the CommissionLedger component
import MasterConfig from './components/pages/MasterConfig';
import UserManagement from './components/pages/UserManagement';
import UploadHistory from './components/pages/UploadHistory';
import ArchitectAccounts from './components/pages/ArchitectAccounts';
import RemittanceEntry from './components/pages/RemittanceEntry';
import MyProfile from './components/pages/MyProfile';
import UploadCalculate from './components/pages/UploadCalculate';

/* ✅ PROTECTED LAYOUT CONTAINER */
function ProtectedLayout({ session }) {
  // If no live Supabase token session exists, redirect back to the login block
  if (!session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div id="viewApp" className="flex min-h-screen bg-[#111622] text-[#e2e8f0] font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />

        <main id="main" className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ✅ MAIN APP APPLICATION INTERFACE */
export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // 1. Recover active token signatures from localStorage on application mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitializing(false);
    });

    // 2. Continuous real-time channel tracking for login, sign out, and token expirations
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      if (!currentSession) {
        // Automatically purge leftover tracking metrics on disconnect configurations
        localStorage.removeItem('user_role');
        localStorage.removeItem('public_user_id');
        localStorage.removeItem('auth_uid');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // System shield: Prevents layout flashing while analyzing browser tokens
  if (initializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#111622', color: '#e2e8f0', fontSize: '14px' }}>
        Initializing secure environment...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* LOGIN GATEWAY: If signed in, automatically redirect straight to dashboard on entry */}
        <Route 
          path="/" 
          element={session ? <Navigate to="/app/dashboard" replace /> : <Login />} 
        />

        {/* PROTECTED ROUTING DOMAINS */}
        <Route path="/app" element={<ProtectedLayout session={session} />}>
          
          {/* CHILD ROUTES */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users" element={<UserManagement />} />
          <Route path="master" element={<MasterConfig />} />
          <Route path="history" element={<UploadHistory />} />
          <Route path="accounts" element={<ArchitectAccounts />} />
          <Route path="remittance" element={<RemittanceEntry />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="claims" element={<UploadCalculate />} />
          <Route path="pan-architect" element={<PanArchitect />} />
          <Route path="payout" element={<Payout />} />
          <Route path="commission" element={<CommissionLedger />} />
          <Route path="full" element={<Full />} />
          <Route path="query" element={<Query />} />
          <Route path="peligible" element={<ProductEligibility />} /> {/* Add the ProductEligibilityPage route */}
          <Route path="ventura" element={<Ventura/>}/>
          {/* Fallback internal index redirection */}
          <Route index element={<Navigate to="dashboard" replace />} />
        </Route>

        {/* Global Fallback Route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}