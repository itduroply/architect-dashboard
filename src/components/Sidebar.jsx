import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supbase'; // Ensure this matches your supabase client instance path
export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  // State to hold the dynamic database profile records
  const [profileData, setProfileData] = useState({
    name: 'Loading...',
    role: 'Please wait...',
    username: '',
    mobile: '',
    branch: '',
    status: ''
  });

  // Fetch complete profile context details from Supabase on mount
  useEffect(() => {
    async function fetchSidebarProfile() {
      try {
        const publicUserId = localStorage.getItem('public_user_id');
        if (!publicUserId) return;

        const { data, error } = await supabase
          .from('users')
          .select('id, name, role, username, mobile, branch, status')
          .eq('id', publicUserId)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setProfileData(data);
        }
      } catch (err) {
        console.error('Error loading sidebar profile metadata:', err.message);
        setProfileData(prev => ({
          ...prev,
          name: 'System User',
          role: localStorage.getItem('user_role') || 'User'
        }));
      }
    }

    fetchSidebarProfile();
  }, []);

  // 🔐 Role Matrices Optimization Flags
  const userRole = (profileData.role || '').toLowerCase();
  const isAdmin = userRole === 'admin' || userRole === 'administrator';
  const isManager = userRole === 'manager';
  const isViewer = userRole === 'viewer'; 

  const activeTab = useMemo(() => {
    const p = location.pathname;
    if (p.includes('/dashboard')) return 'dashboard';
    if (p.includes('/users')) return 'users';
    if (p.includes('/master')) return 'master';
    if (p.includes('/history')) return 'history';
    if (p.includes('/accounts')) return 'accounts';
    if (p.includes('/remittance')) return 'remittance';
    if (p.includes('/claims')) return 'claims';
    if (p.includes('/pan-architect')) return 'pan-architect';
    if (p.includes('/commission')) return 'commission'; 
     if (p.includes('/payout')) return 'payout'; 
    if (p.includes('/profile')) return 'profile';
    if (p.includes('/full')) return 'full';
    if (p.includes('/query')) return 'query';
    return 'dashboard';
  }, [location.pathname]);

  const handleNavigation = (viewId) => {
    const map = {
      dashboard: '/app/dashboard',
      users: '/app/users',
      history: '/app/history',
      accounts: '/app/accounts',
      remittance: '/app/remittance',
      claims: '/app/claims',
      'pan-architect': '/app/pan-architect', 
      profile: '/app/profile',
      master: '/app/master',
      payout: '/app/payout',
      commission:'/app/commission',
      full: '/app/full',
      query: '/app/query'
    };

    const path = map[viewId] || '/app/dashboard';

    navigate(path, { 
      state: { 
        userProfile: profileData 
      } 
    });
  };

  const handleLogout = async () => {
    try {
      console.log('Terminating secure token session structure...');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      console.error('Logout Exception:', err.message);
    } finally {
      localStorage.removeItem('user_role');
      localStorage.removeItem('public_user_id');
      localStorage.removeItem('auth_uid');
      navigate('/', { replace: true });
    }
  };

  const getNavItemClass = (viewId) => {
    return `sb-item ${activeTab === viewId ? 'active' : ''}`;
  };

  const avatarLetter = profileData.name ? profileData.name.charAt(0).toUpperCase() : 'U';

  return (
    /* ✅ FIX 1: Explicitly convert the main nav container into a strict full-height flexible box flex grid layout */
    <nav id="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      
      {/* BRANDING LOGO (Stays Fixed at Top) */}
      <div className="sb-logo" style={{ flexShrink: 0 }}>
        <div className="sb-logo-icon">D+</div>
        <div>
          <div className="sb-logo-name">Design Partner+</div>
          <div className="sb-logo-sub">Loyalty Program</div>
        </div>
      </div>

      {/* ✅ FIX 2: Wrapped all navigation items in a flexible scroll container block layout */}
      <div className="sb-nav-scroller" style={{ flex: 1, overflowY: 'auto', paddingBottom: '16px' }}>
        {/* MAIN SECTION */}
        <div className="sb-section">Main</div>
        <div 
          className={getNavItemClass('dashboard')} 
          id="nav-dashboard" 
          onClick={() => handleNavigation('dashboard')}
          role="button" tabIndex={0}
        >
          <span className="sb-icon">📊</span> Dashboard
        </div>

        {/* ADMIN PANEL (Accessible by Admin and Manager) */}
        {(isAdmin || isManager) && (
          <>
            <div className="sb-section" id="sb-sec-admin">Admin Panel</div>
            
            {isAdmin && (
              <div 
                className={getNavItemClass('users')} 
                id="nav-users" 
                onClick={() => handleNavigation('users')}
              >
                <span className="sb-icon">👥</span> User Management
              </div>
            )}
             

            {isAdmin && (
              <div 
                className={getNavItemClass('master')} 
                id="nav-master" 
                onClick={() => handleNavigation('master')}
              >
                <span className="sb-icon">🗄️</span> Master Config
              </div>
            )}

            {isAdmin && (
              <div 
                className={getNavItemClass('history')} 
                id="nav-history" 
                onClick={() => handleNavigation('history')}
              >
                <span className="sb-icon">🗂️</span> Upload History
              </div>
            )}
            {isAdmin && (
              <div 
                className={getNavItemClass('full')} 
                id="nav-users" 
                onClick={() => handleNavigation('full')}
              >
                <span className="sb-icon">ℹ️</span> Complete Data Access
              </div>
            )}
             
          </>
        )}
 {/* ADMIN PANEL (Accessible by Admin and Manager) */}
        {(isAdmin || isManager) && (
          <>
            <div className="sb-section" id="sb-sec-admin">Query Section</div>
            {isAdmin && (
              <div 
                className={getNavItemClass('query')} 
                id="nav-users" 
                onClick={() => handleNavigation('query')}
              >
                <span className="sb-icon">❓</span> Get Query
              </div>
            )}
             
          </>
        )}
        {/* ACCOUNTS SECTION (Accessible by Admin and Manager) */}
        {(isAdmin || isManager) && (
          <>
            <div className="sb-section">Accounts</div>
            <div 
              className={getNavItemClass('accounts')} 
              id="nav-accounts" 
              onClick={() => handleNavigation('accounts')}
            >
              <span className="sb-icon">👛</span> Architect Accounts
            </div>
            
            <div 
              className={getNavItemClass('pan-architect')} 
              id="nav-pan-architect" 
              onClick={() => handleNavigation('pan-architect')}
            >
              <span className="sb-icon">🌐</span> Pan Architect
            </div>
 <div 
              className={getNavItemClass('payout')} 
              id="nav-pan-architect" 
              onClick={() => handleNavigation('payout')}
            >
              <span className="sb-icon">💰</span> Payout Request
            </div>
            <div 
              className={getNavItemClass('remittance')} 
              id="nav-remittance" 
              onClick={() => handleNavigation('remittance')}
            >
              <span className="sb-icon">💳</span> Remittance Entry
            </div>
            <div 
              className={getNavItemClass('claims')} 
              id="nav-claims" 
              onClick={() => handleNavigation('claims')}
            >
              <span className="sb-icon">🔗</span> Claim Processor
            </div>
             <div 
              className={getNavItemClass('commission')} 
              id="nav-pan-architect" 
              onClick={() => handleNavigation('commission')}
            >
              <span className="sb-icon">🪙</span>Qualified Architect Split
            </div>
          </>
        )}

        {/* VIEWER NOTICE SECTION */}
        {isViewer && (
          <div style={{ padding: '12px 16px', fontSize: '11px', color: '#8b846f', fontStyle: 'italic' }}>
            🔒 Limited Viewer Mode active.
          </div>
        )}

        {/* PROFILE SECTION */}
        <div className="sb-section">Account</div>
        <div 
          className={getNavItemClass('profile')} 
          id="nav-profile" 
          onClick={() => handleNavigation('profile')}
        >
          <span className="sb-icon">👤</span> My Profile
        </div>
      </div>

      {/* FOOTER USER MANAGEMENT (Stays permanently locked/visible at the bottom now) */}
      <div className="sb-footer" style={{ flexShrink: 0, marginTop: 'auto' }}>
        <div className="user-pill">
          <div className="user-av" id="sbAvatar">{avatarLetter}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-nm" id="sbName" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profileData.name}
            </div>
            <div className="user-rl" id="sbRole" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profileData.role}
            </div>
          </div>
          
          <button 
            className="btn-logout" 
            onClick={handleLogout}
            title="Sign out" 
            style={{
              background: 'rgba(224, 79, 79, 0.12)',
              border: '1px solid rgba(224, 79, 79, 0.25)',
              color: 'var(--red)',
              borderRadius: '6px',
              fontSize: '13px',
              padding: '5px 8px',
              cursor: 'pointer',
              transition: 'all .2s',
              flexShrink: 0
            }}
          >
            ⏻
          </button>
        </div>

        <button 
          onClick={handleLogout} 
          style={{
            width: '100%',
            marginTop: '8px',
            padding: '9px',
            background: 'rgba(224, 79, 79, 0.1)',
            border: '1px solid rgba(224, 79, 79, 0.22)',
            borderRadius: '8px',
            color: 'var(--red)',
            fontFamily: "'Outfit', sans-serif",
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all .2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '7px'
          }}
        >
          <span>⏻</span> Sign Out
        </button>
      </div>
    </nav>
  );
}