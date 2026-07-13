import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supbase'; // Matches your current client path

export default function UserProfile() {
  const location = useLocation();
  const navigate = useNavigate();

  // ── DYNAMIC PROFILE DATA STATE ──
  const [profile, setProfile] = useState({
    avatarLetter: 'U',
    name: 'Loading...',
    role: 'User',
    username: '—',
    mobile: '—',
    branch: '—',
    lastLogin: 'Live Session',
    status: 'Active'
  });

  // ── CHANGE PASSWORD STATE ──
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [passwordLoading, setPasswordLoading] = useState(false);

  // ── PASSWORD VISIBILITY TOGGLE STATES ──
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── SNACKBAR STATE CONTROL ──
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: '',
    type: 'success' // Can be 'success' or 'error'
  });

  // Trigger snackbar alerts programmatically 
  const showToast = (message, type = 'success') => {
    setSnackbar({ visible: true, message, type });
  };

  // Automatically dismiss snackbar alert after 4 seconds
  useEffect(() => {
    if (snackbar.visible) {
      const timer = setTimeout(() => {
        setSnackbar(prev => ({ ...prev, visible: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [snackbar.visible]);

  // ── DETECT MULTI-DEVICE LOGOUT AND FORCE REDIRECT ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth Event Detected:", event);
      
      if (event === 'SIGNED_OUT' || !session) {
        localStorage.removeItem('public_user_id');
        navigate('/', { replace: true });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  // ── SYNC PROFILE AND VALIDATE SESSION VIA LIVE NETWORK ──
  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          localStorage.removeItem('public_user_id');
          navigate('/', { replace: true });
          return;
        }

        if (location.state?.userProfile) {
          const u = location.state.userProfile;
          setProfile({
            avatarLetter: u.name ? u.name.charAt(0).toUpperCase() : 'U',
            name: u.name || 'System User',
            role: u.role || 'User',
            username: u.username || '—',
            mobile: u.mobile || '—',
            branch: u.branch || '—',
            lastLogin: 'Live Session',
            status: u.status || 'Active'
          });
        } else {
          const publicUserId = localStorage.getItem('public_user_id');
          if (!publicUserId) return;

          const { data, error } = await supabase
            .from('users_profile')
            .select('name, role, username, mobile, branch, status')
            .eq('id', publicUserId)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            setProfile({
              avatarLetter: data.name ? data.name.charAt(0).toUpperCase() : 'U',
              name: data.name || 'System User',
              role: data.role || 'User',
              username: data.username || '—',
              mobile: data.mobile || '—',
              branch: data.branch || '—',
              lastLogin: 'Direct Reload',
              status: data.status || 'Active'
            });
          }
        }
      } catch (err) {
        console.error('Session clearance exception:', err.message);
        localStorage.removeItem('public_user_id');
        navigate('/', { replace: true });
      }
    }
    loadProfile();
  }, [location.state, navigate]);

  const handlePasswordChange = (field, value) => {
    setPasswordData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // ── SECURE PASSWORD UPDATE HANDLER ──
  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('Please fill out all missing password fields.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New password confirmation mapping does not match.', 'error');
      return;
    }

    try {
      setPasswordLoading(true);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Could not verify active authentication session.");

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Current password verification failed. Please check your credentials.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      const { error: logoutOthersError } = await supabase.auth.signOut({ scope: 'others' });
      if (logoutOthersError) {
        console.warn("Other devices token cache cleanup failed:", logoutOthersError.message);
      }

      showToast('Password updated successfully! Other active device locations signed out.', 'success');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });

    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="page" id="page-profile" style={{ position: 'relative' }}>
      
      {/* ── INJECTED MEDIA QUERIES ── */}
      <style>{`
        .profile-grid {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 20px;
          maxWidth: 820px;
        }

        @media (max-width: 768px) {
          .profile-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
            padding: 0 10px;
          }
          
          #page-profile {
            padding: 10px;
          }

          /* Improves snackbar location visibility on mobile devices */
          .custom-snackbar {
            left: 16px !important;
            right: 16px !important;
            bottom: 16px !important;
            justify-content: center;
          }
        }
      `}</style>
      
      {/* ── CUSTOM SNACKBAR NOTIFICATION POPUP ── */}
      {snackbar.visible && (
        <div className="custom-snackbar" style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: snackbar.type === 'error' ? 'rgba(224, 79, 79, 0.95)' : 'rgba(34, 197, 94, 0.95)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.3s ease',
          animation: 'fadeInUp 0.3s ease-out',
          border: snackbar.type === 'error' ? '1px solid #ef4444' : '1px solid #4ade80'
        }}>
          <span>{snackbar.type === 'error' ? '⚠️' : '✅'}</span>
          {snackbar.message}
        </div>
      )}

      {/* ── REFACTORING WRAPPER WITH RESPONSIVE GRID CLASS ── */}
      <div className="profile-grid">

        {/* ── PROFILE INFO CARD ── */}
        <div className="card">
          <div className="card-hd">
            <div className="card-icon">👤</div>
            <div>
              <div className="card-title">My Profile</div>
            </div>
          </div>
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div
              id="profAv"
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold, #b0a888), var(--copper, #c5a880))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '26px',
                fontWeight: '700',
                color: '#fff',
                margin: '0 auto 12px',
              }}
            >
              {profile.avatarLetter}
            </div>
            
            <div style={{ fontSize: '17px', fontWeight: '600', color: 'var(--white, #fff)' }} id="profName">
              {profile.name}
            </div>
            
            <div className="badge b-admin mt8" id="profRoleBadge" style={{ margin: '8px auto 0', display: 'inline-block' }}>
              {profile.role}
            </div>
            
            <div className="hr" style={{ margin: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}></div>
            
            <div style={{ fontSize: '12px', textAlign: 'left' }}>
              <div className="flex" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--dim, #94a3b8)' }}>Username</span>
                <span style={{ color: 'var(--white, #fff)' }} id="profUser">{profile.username}</span>
              </div>
              <div className="flex" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--dim, #94a3b8)' }}>Mobile</span>
                <span style={{ color: 'var(--white, #fff)' }} id="profMobile">{profile.mobile}</span>
              </div>
              <div className="flex" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--dim, #94a3b8)' }}>Branch</span>
                <span style={{ color: 'var(--white, #fff)' }} id="profBranch">{profile.branch}</span>
              </div>
              <div className="flex" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--dim, #94a3b8)' }}>Session Sync</span>
                <span style={{ color: 'var(--white, #fff)' }} id="profLogin">{profile.lastLogin}</span>
              </div>
              <div className="flex" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--dim, #94a3b8)' }}>Status</span>
                <span className="badge b-green" style={{ textTransform: 'capitalize' }}>{profile.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── CHANGE PASSWORD CARD WITH VISIBILITY INPUTS ── */}
        <div className="card">
          <div className="card-hd">
            <div className="card-icon">🔑</div>
            <div>
              <div className="card-title">Change Password</div>
            </div>
          </div>
          <div className="card-body">
            <form onSubmit={handleUpdatePassword}>
              
              {/* CURRENT PASSWORD FIELD */}
              <div className="fg" style={{ marginBottom: '14px' }}>
                <label className="lbl">Current Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="inp"
                    type={showCurrent ? 'text' : 'password'}
                    id="pwCur"
                    placeholder="Enter current password"
                    value={passwordData.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    disabled={passwordLoading}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--dim, #94a3b8)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {showCurrent ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {/* NEW PASSWORD FIELD */}
              <div className="fg" style={{ marginBottom: '14px' }}>
                <label className="lbl">New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="inp"
                    type={showNew ? 'text' : 'password'}
                    id="pwNew"
                    placeholder="Minimum 6 characters"
                    value={passwordData.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    disabled={passwordLoading}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--dim, #94a3b8)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {showNew ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {/* CONFIRM NEW PASSWORD FIELD */}
              <div className="fg" style={{ marginBottom: '20px' }}>
                <label className="lbl">Confirm New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    className="inp"
                    type={showConfirm ? 'text' : 'password'}
                    id="pwCfm"
                    placeholder="Repeat new password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    disabled={passwordLoading}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--dim, #94a3b8)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {showConfirm ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-gold w100" 
                disabled={passwordLoading}
                style={{ width: '100%', cursor: passwordLoading ? 'not-allowed' : 'pointer' }}
              >
                {passwordLoading ? 'Updating System Protocol...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}