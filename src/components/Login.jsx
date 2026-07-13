import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supbase'; // Ensure this points to your actual supabase client path

export default function Login() {
  // State for form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Modern Snackbar Toast States
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });

  // Refs for managing focus transitions
  const passwordInputRef = useRef(null);
  const navigate = useNavigate();

  // Helper trigger to show the snackbar alerts
  const showNotification = (message, type = 'error') => {
    setToast({ show: true, message, type });
  };

  // Auto-dismiss notification toast after 4 seconds
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast((prev) => ({ ...prev, show: false }));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  // Toggle password visibility
  const togglePwVis = () => {
    setShowPassword((prev) => !prev);
  };

  // Live Supabase Login Logic
  const doLogin = async () => {
    // 1. Validation Fail State: Empty Inputs
    if (!username.trim() && !password) {
      showNotification('Please enter your credentials to access the system.', 'error');
      return;
    }
    if (!username.trim()) {
      showNotification('Username field cannot be left blank.', 'error');
      return;
    }
    if (!password) {
      showNotification('Password field cannot be left blank.', 'error');
      return;
    }

    setLoading(true);

    try {
      console.log('--- LOGIN DEBUG START ---');

     const { data: publicUser, error: publicFetchError } = await supabase
  .from('users_profile')
  .select('id, username, email, auth_user_id, status, role')

  .ilike('username', username.trim())
  .maybeSingle();

if (publicFetchError) throw publicFetchError;

      // 2. Validation Fail State: Username completely missing from DB
      if (!publicUser) {
        showNotification('Invalid username or password configuration.', 'error');
        setLoading(false);
        return;
      }

      // 3. Validation Fail State: Account explicitly locked by Administrator
      if (publicUser.status === 'inactive') {
        showNotification('Your profile has been deactivated. Contact administration support.', 'error');
        setLoading(false);
        return;
      }

      // STEP 2: Authenticate securely against the Supabase Auth engine
      const { error: authSignInError } = await supabase.auth.signInWithPassword({
        email: publicUser.email,
        password: password
      });

      // 4. Validation Fail State: Wrong password or structural auth mismatch
      if (authSignInError) {
        if (authSignInError.message.includes('Invalid login credentials')) {
          showNotification('Invalid username or password configuration.', 'error');
        } else {
          showNotification(authSignInError.message, 'error');
        }
        setLoading(false);
        return;
      }

      // SUCCESS: Notify user and track metadata configuration matrices
      showNotification('Authentication successful! Initializing workspace...', 'success');
      
      localStorage.setItem('user_role', publicUser.role);
      localStorage.setItem('public_user_id', publicUser.id);
      localStorage.setItem('auth_uid', publicUser.auth_user_id);

      // Delay briefly so the user can actually appreciate the crisp success animation
      setTimeout(() => {
        navigate('/app/dashboard');
      }, 800);

    } catch (err) {
      console.error(err);
      showNotification(`System fault detected: ${err.message}`, 'error');
    } finally {
      console.log('--- LOGIN DEBUG END ---');
      setLoading(false);
    }
  };

  // Keyboard navigation handlers
  const handleUsernameKeyDown = (e) => {
    if (e.key === 'Enter') {
      passwordInputRef.current?.focus();
    }
  };

  const handlePasswordKeyDown = (e) => {
    if (e.key === 'Enter') {
      doLogin();
    }
  };

  return (
    <div id="viewLogin" style={{ position: 'relative' }}>
      
      {/* 🚀 PREMIUM ANIMATED SNACKBAR NOTIFICATION TOAST */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 9999,
        transform: toast.show ? 'translateY(0)' : 'translateY(-100px)',
        opacity: toast.show ? 1 : 0,
        pointerEvents: toast.show ? 'auto' : 'none',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 20px',
        borderRadius: '10px',
        background: toast.type === 'success' ? '#065f46' : '#1e1b1b',
        border: toast.type === 'success' ? '1px solid #10b981' : '1px solid #dc2626',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
        maxWidth: '380px'
      }}>
        <span style={{ fontSize: '18px' }}>{toast.type === 'success' ? '✅' : '⚠️'}</span>
        <div style={{
          color: '#f8fafc',
          fontSize: '13px',
          fontWeight: 500,
          fontFamily: 'sans-serif',
          lineHeight: 1.4
        }}>
          {toast.message}
        </div>
        <button 
          onClick={() => setToast((prev) => ({ ...prev, show: false }))}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '14px',
            marginLeft: 'auto',
            padding: '0 0 0 8px'
          }}
        >
          ✕
        </button>
      </div>

      <div className="login-wrap">
        
        {/* Left Panel: Branding and Features */}
        <div className="login-left">
          <div>
            <div className="login-brand-icon">D+</div>
            <div className="login-brand-name">
              Design<br />Partner+
            </div>
            <div className="login-brand-sub" style={{ marginTop: '6px' }}>
              Architect Loyalty Program
            </div>
            <div className="login-tagline">
              Powered by Duroply Industries<br />Commission Intelligence Platform
            </div>
            
            <div className="login-features" style={{ marginTop: '28px' }}>
              <div className="login-feat"><div className="login-feat-dot"></div>Auto commission calculation engine</div>
              <div className="login-feat"><div className="login-feat-dot"></div>Lead × DMI × Architect claim processor</div>
              <div className="login-feat"><div className="login-feat-dot"></div>Live analytics &amp; architect dashboard</div>
              <div className="login-feat"><div className="login-feat-dot"></div>Tier-based loyalty tracking</div>
              <div className="login-feat"><div className="login-feat-dot"></div>Role-based access control</div>
              <div className="login-feat"><div className="login-feat-dot"></div>Excel upload &amp; full report export</div>
            </div>
          </div>
          
          <div style={{ fontSize: '10px', color: '#706858', letterSpacing: '.1em', position: 'relative', zIndex: 1 }}>
            © {new Date().getFullYear()} DUROPLY INDUSTRIES LTD. · v3.1
          </div>
        </div>

        {/* Right Panel: Form Input */}
        <div className="login-right">
          <div className="login-right-top">
            <div className="login-right-icon">D+</div>
            <div className="login-right-top-text">DESIGN PARTNER+</div>
          </div>
          <h2>Welcome back</h2>
          <p>Sign in to access your loyalty program</p>

          {/* Username Input */}
          <div className="fg">
            <label className="lbl" htmlFor="lUser">Username</label>
            <input
              className="inp"
              id="lUser"
              type="text"
              placeholder="Enter your username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleUsernameKeyDown}
              disabled={loading}
            />
          </div>

          {/* Password Input */}
          <div className="fg">
            <label className="lbl" htmlFor="lPass">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="inp"
                id="lPass"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                autoComplete="current-password"
                style={{ paddingRight: '44px' }}
                ref={passwordInputRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handlePasswordKeyDown}
                disabled={loading}
              />
              <button
                type="button"
                onClick={togglePwVis}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#b0a888',
                  fontSize: '15px',
                  lineHeight: 1
                }}
                id="pwVisBtn"
                title="Show/hide password"
                disabled={loading}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button className="btn-login" id="loginBtn" onClick={doLogin} disabled={loading}>
            {loading ? 'Authenticating System...' : 'Sign In \u00a0\u2192'}
          </button>

          <div className="login-divider"></div>

          {/* Secure notice */}
          <div className="login-secure" style={{ marginTop: '14px' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            &nbsp;Secure connection active · Live Session Token Management
          </div>
        </div>

      </div>
    </div>
  );
}










