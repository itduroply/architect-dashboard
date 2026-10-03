import { createClient } from '@supabase/supabase-js';

// App Launcher project. Used ONLY to send and check the login OTP, so the
// sign-in is recorded on the Launcher side. All data still comes from the
// Architect Program project (see supbase.js).
const launcherUrl = process.env.REACT_APP_LAUNCHER_SUPABASE_URL;
const launcherAnonKey = process.env.REACT_APP_LAUNCHER_SUPABASE_ANON_KEY;

// null when the .env values are missing, so the rest of the app still loads.
export const launcherSupabase = launcherUrl && launcherAnonKey
  ? createClient(launcherUrl, launcherAnonKey, {
      auth: {
        // Separate storage key so this session never mixes with the main one.
        storageKey: 'launcher-otp-auth',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;
