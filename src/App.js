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
import SheetGapReport from './components/pages/SheetGapReport';
import PaymentHistory from './components/pages/PaymentHistory';

/* ✅ KEYBOARD HORIZONTAL SCROLL */
// The body hides horizontal overflow, so the browser's Left/Right arrow keys
// have nothing to scroll. Send them to the wide table box under the mouse
// instead, or to the first one visible on screen.
const ARROW_SCROLL_STEP = 80;

const isHorizontalScroller = (el) => {
  if (!(el instanceof HTMLElement) || el.scrollWidth <= el.clientWidth + 1) return false;
  const { overflowX } = window.getComputedStyle(el);
  return overflowX === 'auto' || overflowX === 'scroll';
};

const isOnScreen = (el) => {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
};

const findHorizontalScroller = (startEl) => {
  for (let el = startEl; el && el !== document.body; el = el.parentElement) {
    if (isHorizontalScroller(el)) return el;
  }
  return Array.from(document.querySelectorAll('div, section, main'))
    .find(el => isHorizontalScroller(el) && isOnScreen(el)) || null;
};

function useArrowKeyHorizontalScroll() {
  useEffect(() => {
    let lastPointerEl = null;
    const rememberPointer = (e) => { lastPointerEl = e.target; };

    const handleKeyDown = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const active = document.activeElement;
      if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;

      const startEl = lastPointerEl && document.contains(lastPointerEl) ? lastPointerEl : null;
      const scroller = findHorizontalScroller(startEl);
      if (!scroller) return;

      e.preventDefault();
      scroller.scrollBy({ left: e.key === 'ArrowRight' ? ARROW_SCROLL_STEP : -ARROW_SCROLL_STEP });
    };

    document.addEventListener('mouseover', rememberPointer, { passive: true });
    document.addEventListener('pointerdown', rememberPointer, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mouseover', rememberPointer);
      document.removeEventListener('pointerdown', rememberPointer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}

/* ✅ PROTECTED LAYOUT CONTAINER */
function ProtectedLayout({ session }) {
  useArrowKeyHorizontalScroll();

  // If no live Supabase token session exists, redirect back to the login block
  if (!session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div id="viewApp" className="flex min-h-screen bg-[#111622] text-[#e2e8f0] font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />

        {/* Tailwind is not installed, so min-w-0 on the parent does nothing and
            Global.css makes the parent a row flexbox. Without minWidth 0 here,
            a wide table stretches #main past the screen and the body clips it. */}
        <main id="main" className="flex-1 p-6 overflow-y-auto" style={{ minWidth: 0 }}>
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
          <Route path="sheet-gap" element={<SheetGapReport />} />
          <Route path="pan-architect" element={<PanArchitect />} />
          <Route path="payout" element={<Payout />} />
          <Route path="commission" element={<CommissionLedger />} />
          <Route path="payment-history" element={<PaymentHistory />} />
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
