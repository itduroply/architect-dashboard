import { supabase } from '../lib/supbase'; // Points perfectly to your client path

/**
 * Global helper to log any user action into the user_activity_logs table.
 * @param {string} actionType - E.g., 'FILE_UPLOAD', 'USER_CREATE', 'CLAIM_APPROVE'
 * @param {string} description - A detailed sentence describing what happened
 */
export const trackAction = async (actionType, description) => {
  try {
    const publicUserId = localStorage.getItem('public_user_id');
    const cachedRole = localStorage.getItem('user_role') || 'User';

    // If no user is logged in yet (like during login failures), skip or log as Guest
    if (!publicUserId) return; 

    await supabase.from('user_activity_logs').insert({
      user_id: publicUserId,
      user_role: cachedRole,
      action_type: actionType,
      description: description
    });
    
    console.log(`[Telemetry Logged Successfully]: ${actionType}`);
  } catch (err) {
    console.error("Telemetry failed to save to database:", err.message);
  }
};