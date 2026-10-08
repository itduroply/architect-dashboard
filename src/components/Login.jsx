import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supbase'; // Ensure this points to your actual supabase client path
import { launcherSupabase } from '../lib/launcherSupabase';

export default function Login() {
  // State for form fields
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modern Snackbar Toast States
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });

  // Refs for managing focus transitions
  const otpInputRef = useRef(null);
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

  // Countdown before "Resend OTP" is allowed again
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((sec) => sec - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // Looks up the profile by email and blocks missing / inactive accounts
  const findActiveProfile = async (cleanEmail) => {
    const { data: publicUser, error: publicFetchError } = await supabase
      .from('users_profile')
      .select('id, username, email, auth_user_id, status, role')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (publicFetchError) throw publicFetchError;

    if (!publicUser) {
      showNotification('No account is registered with this email.', 'error');
      return null;
    }

    if (publicUser.status === 'inactive') {
      showNotification('Your profile has been deactivated. Contact administration support.', 'error');
      return null;
    }

    return publicUser;
  };

  // STEP 1: Send a one-time code to the registered email.
  // The App Launcher project sends it, using its own email setup.
  const sendOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      showNotification('Email field cannot be left blank.', 'error');
      return;
    }
    if (!launcherSupabase) {
      showNotification('Launcher login is not configured. Contact administration support.', 'error');
      return;
    }

    setLoading(true);
    try {
      const publicUser = await findActiveProfile(cleanEmail);
      if (!publicUser) return;

      const { error: otpError } = await launcherSupabase.auth.signInWithOtp({
        email: publicUser.email,
        options: { shouldCreateUser: false },
      });

      if (otpError) {
        showNotification(otpError.message, 'error');
        return;
      }

      setOtpSent(true);
      setOtp('');
      setResendIn(60);
      showNotification(`OTP sent to ${publicUser.email}`, 'success');
      setTimeout(() => otpInputRef.current?.focus(), 50);
    } catch (err) {
      console.error(err);
      showNotification(`System fault detected: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify the code with the Launcher, then open the session here
  const verifyOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const code = otp.trim();
    if (!/^\d{6,10}$/.test(code)) {
      showNotification('Enter the OTP sent to your email.', 'error');
      return;
    }

    setLoading(true);
    try {
      const publicUser = await findActiveProfile(cleanEmail);
      if (!publicUser) return;

      // 2a. Check the code with the App Launcher (login is recorded there)
      const { data: launcherData, error: verifyError } = await launcherSupabase.auth.verifyOtp({
        email: publicUser.email,
        token: code,
        type: 'email',
      });

      if (verifyError || !launcherData?.session) {
        showNotification('Invalid or expired OTP. Please try again.', 'error');
        return;
      }

      // 2b. Swap the Launcher sign-in for a session in this project
      const { data: exchange, error: exchangeError } = await supabase.functions.invoke('launcher-login', {
        body: { launcherAccessToken: launcherData.session.access_token },
      });

      // Local scope only: never revoke the user's Launcher session elsewhere
      await launcherSupabase.auth.signOut({ scope: 'local' }).catch(() => {});

      if (exchangeError || exchange?.error || !exchange?.token_hash) {
        let message = exchange?.error;
        if (!message && exchangeError?.context?.json) {
          const body = await exchangeError.context.json().catch(() => null);
          message = body?.error;
        }
        showNotification(message || 'Could not open your session. Please try again.', 'error');
        return;
      }

      const { error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: exchange.token_hash,
        type: 'magiclink',
      });

      if (sessionError) {
        showNotification('Could not open your session. Please try again.', 'error');
        return;
      }

      showNotification('Authentication successful! Initializing workspace...', 'success');

      localStorage.setItem('user_role', publicUser.role);
      localStorage.setItem('public_user_id', publicUser.id);
      localStorage.setItem('auth_uid', publicUser.auth_user_id);

      setTimeout(() => {
        navigate('/app/dashboard');
      }, 800);
    } catch (err) {
      console.error(err);
      showNotification(`System fault detected: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const changeEmail = () => {
    setOtpSent(false);
    setOtp('');
    setResendIn(0);
  };

  // Keyboard navigation handlers
  const handleEmailKeyDown = (e) => {
    if (e.key === 'Enter' && !otpSent) {
      sendOtp();
    }
  };

  const handleOtpKeyDown = (e) => {
    if (e.key === 'Enter') {
      verifyOtp();
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

          {/* Email Input */}
          <div className="fg">
            <label className="lbl" htmlFor="lEmail">Email</label>
            <input
              className="inp"
              id="lEmail"
              type="email"
              placeholder="Enter your registered email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              disabled={loading || otpSent}
            />
          </div>

          {/* OTP Input */}
          {otpSent && (
            <div className="fg">
              <label className="lbl" htmlFor="lOtp">OTP</label>
              <input
                className="inp"
                id="lOtp"
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="Enter OTP"
                autoComplete="one-time-code"
                style={{ letterSpacing: '.3em' }}
                ref={otpInputRef}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                onKeyDown={handleOtpKeyDown}
                disabled={loading}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px' }}>
                <button
                  type="button"
                  onClick={changeEmail}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#b0a888' }}
                >
                  &larr; Change email
                </button>
                <button
                  type="button"
                  onClick={sendOtp}
                  disabled={loading || resendIn > 0}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: resendIn > 0 ? 'default' : 'pointer', color: '#b0a888' }}
                >
                  {resendIn > 0 ? `Resend OTP in ${resendIn}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button className="btn-login" id="loginBtn" onClick={otpSent ? verifyOtp : sendOtp} disabled={loading}>
            {loading
              ? (otpSent ? 'Verifying OTP...' : 'Sending OTP...')
              : (otpSent ? 'Verify & Sign In \u00a0\u2192' : 'Send OTP \u00a0\u2192')}
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
 









