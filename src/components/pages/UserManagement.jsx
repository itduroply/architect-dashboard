import React, { useState, useEffect, useCallback } from 'react'; 
import { supabase } from '../../lib/supbase'; 
import { useLocation } from 'react-router-dom';

export default function UserManagement() {
  const location = useLocation();
  
  const [users, setUsers] = useState([]); 
  const [userSearch, setUserSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedAuthUserId, setSelectedAuthUserId] = useState(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [targetUser, setTargetUser] = useState(null);

  const [loading, setLoading] = useState(false); 
  const [fetchLoading, setFetchLoading] = useState(true); 
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    mobile: '',
    email: '', 
    password: '', 
    role: '',
    department: '',
    designation: '',
    branch: '',
    status: 'active'
  });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // Dynamic Telemetry Core Logging Engine
  const logTelemetry = async (actionType, description) => {
    try {
      const activeId = localStorage.getItem('auth_uid');
      const activeRole = localStorage.getItem('user_role') || 'User';
      
      const currentActorName = location.state?.userProfile?.name 
        || localStorage.getItem("user_name") 
        || localStorage.getItem("user_role") 
        || "Admin";

      const fullDescription = `[Actor: ${currentActorName}] - ${description}`;

      await supabase.from('user_activity_logs').insert({
        user_id: activeId, 
        user_role: activeRole,
        action_type: actionType,
        description: fullDescription
      });
    } catch (err) {
      console.error("Telemetry error omitted:", err.message);
    }
  };

  const fetchUsers = useCallback(async () => {
    setFetchLoading(true);
    try {
      const { data, error } = await supabase
        .from('users_profile')
        .select('id, auth_user_id, name, username, mobile, role, branch, status, department, designation, email');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      showToast(`Error fetching users: ${error.message}`, 'error');
    } finally {
      setFetchLoading(false);
    }
  }, []); 

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateForm = (checkingUpdate = false) => {
    if (
      !formData.name || !formData.username || !formData.mobile || !formData.email ||
      !formData.role || !formData.department || !formData.designation || !formData.branch || !formData.status
    ) {
      showToast('All fields are strictly required. Please fill in the missing blocks.', 'warning');
      return false;
    }

    if (!checkingUpdate && !formData.password) {
      showToast('Account Password is required for registering new credentials.', 'warning');
      return false;
    }

    const mobileRegex = /^\d{10}$/;
    if (!mobileRegex.test(formData.mobile)) {
      showToast('Mobile contact must be a valid, numeric string of exactly 10 digits.', 'warning');
      return false;
    }

    const emailLower = formData.email.toLowerCase();
    if (!emailLower.endsWith('@gmail.com') && !emailLower.endsWith('@duroply.com')) {
      showToast('Access restricted. Email must belong exclusively to @gmail.com or @duroply.com domains.', 'warning');
      return false;
    }

    return true;
  };

  const handleEditClick = (user) => {
    setSelectedUserId(user.id);
    setSelectedAuthUserId(user.auth_user_id);
    setIsEditMode(true);
    setFormData({
      name: user.name || '',
      username: user.username || '',
      mobile: user.mobile || '',
      email: user.email || '',
      password: '', 
      role: user.role || '',
      department: user.department || '',
      designation: user.designation || '',
      branch: user.branch || '',
      status: user.status || 'active'
    });
    setShowModal(true);
  };

  const handleSaveSubmit = () => {
    if (isEditMode) {
      if (!validateForm(true)) return;
      setShowUpdateModal(true); 
    } else {
      if (!validateForm(false)) return;
      executeInsert(); 
    }
  };

  const executeInsert = async () => {
    setLoading(true);
    try {
      const { data: existingUser, error: checkError } = await supabase
        .from('users_profile')
        .select('id')
        .eq('email', formData.email.toLowerCase())
        .maybeSingle(); 

      if (checkError) throw checkError;

      if (existingUser) {
        showToast('This email address is already registered to an active profile.', 'warning');
        setLoading(false);
        return; 
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { emailRedirectTo: window.location.origin }
      });

      if (authError) throw authError;
      const userId = authData.user.id;

      const { error: profileError } = await supabase
        .from('users_profile')
        .insert([
          {
            auth_user_id: userId, 
            name: formData.name,
            username: formData.username,
            mobile: formData.mobile,
            email: formData.email, 
            role: formData.role,
            department: formData.department,
            designation: formData.designation,
            branch: formData.branch,
            status: formData.status
          }
        ]);

      if (profileError) throw profileError;

      await logTelemetry('CREATE_USER', `Created new user profile: ${formData.name} (${formData.email}) with role ${formData.role}`);

      showToast('User account compiled and integrated successfully!', 'success');
      fetchUsers();
      closeFormModal();
    } catch (error) {
      showToast(`Creation Fault: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeUpdate = async () => {
    setLoading(true);
    setShowUpdateModal(false);
    try {
      if (selectedAuthUserId) {
        // 1. Invoke hyper-api Edge Function to update email in auth.users
        const { data: emailData, error: emailError } = await supabase.functions.invoke(
          'hyper-api',
          {
            body: {
              action: 'UPDATE_EMAIL',
              authUserId: selectedAuthUserId,
              email: formData.email,
            },
          }
        );

        if (emailError) throw emailError;
        if (emailData?.error) throw new Error(emailData.error);

        // 2. Invoke hyper-api Edge Function to update password in auth.users (if provided)
        if (formData.password && formData.password.trim() !== '') {
          const { data: passData, error: passError } = await supabase.functions.invoke(
            'hyper-api',
            {
              body: {
                action: 'UPDATE_PASSWORD',
                authUserId: selectedAuthUserId,
                password: formData.password,
              },
            }
          );

          if (passError) throw passError;
          if (passData?.error) throw new Error(passData.error);
        }
      }

      // 3. Update user profile details in public.users_profile table
      const { error } = await supabase
        .from('users_profile')
        .update({
          name: formData.name,
          username: formData.username,
          mobile: formData.mobile,
          email: formData.email,
          role: formData.role,
          department: formData.department,
          designation: formData.designation,
          branch: formData.branch,
          status: formData.status
        })
        .eq('id', selectedUserId);

      if (error) throw error;

      await logTelemetry(
        'UPDATE_USER', 
        `Updated profile/credentials for ${formData.name} (ID: ${selectedUserId}): Changed status to ${formData.status}`
      );

      showToast('Profile and credentials updated successfully.', 'success');
      fetchUsers();
      closeFormModal();
    } catch (error) {
      showToast(`Update Fault: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeDelete = async () => {
    if (!targetUser) return;
    setLoading(true);
    setShowDeleteModal(false);

    try {
      const currentLoggedInId = localStorage.getItem('public_user_id');
      const isDeletingSelf = String(targetUser.id) === String(currentLoggedInId);

      const totalAdmins = users.filter(u => {
        const r = (u.role || '').toLowerCase();
        return r === 'admin' || r === 'administrator';
      }).length;

      const isTargetAdmin = (targetUser.role || '').toLowerCase() === 'admin' || (targetUser.role || '').toLowerCase() === 'administrator';
      if (isTargetAdmin && totalAdmins <= 1) {
        showToast('Operation Blocked: You cannot remove the last remaining Administrator profile from the system.', 'warning');
        setLoading(false);
        setTargetUser(null);
        return;
      }

      await logTelemetry(
        'DELETE_USER', 
        `Deleted account record completely: ${targetUser.name} (ID: ${targetUser.id})`
      );

      const { error } = await supabase.functions.invoke('hyper-api', {
        body: {
          action: 'DELETE_USER',
          authUserId: targetUser.auth_user_id
        }
      });

      if (error) throw error;

      showToast('User credentials and data vectors stripped completely.', 'success');

      if (isDeletingSelf) {
        await supabase.auth.signOut().catch(() => {});
        
        localStorage.removeItem('user_role');
        localStorage.removeItem('public_user_id');
        localStorage.removeItem('auth_uid');
        
        window.location.href = '/'; 
        return; 
      }

      fetchUsers();
    } catch (error) {
      showToast(`Stripping Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
      setTargetUser(null);
    }
  };

  const closeFormModal = () => {
    setFormData({
      name: '',
      username: '',
      mobile: '',
      email: '',
      password: '',
      role: '',
      department: '',
      designation: '',
      branch: '',
      status: 'active'
    });
    setIsEditMode(false);
    setSelectedUserId(null);
    setSelectedAuthUserId(null);
    setShowModal(false);
  };

  const filteredUsers = users.filter((u) => {
    const searchTarget = `${u.name || ''} ${u.username || ''}`.toLowerCase();
    return searchTarget.includes(userSearch.toLowerCase());
  });

  return (
    <>
      <div className="page" id="page-users">
        <div className="card">
          <div className="card-hd">
            <div className="card-icon">👥</div>
            <div>
              <div className="card-title">User Management</div>
              <div className="card-sub">
                Create accounts and manage access to the Design Partner+ program
              </div>
            </div>

            <div className="card-hd-right">
              <input
                className="inp"
                id="userSearch"
                placeholder="Search name"
                style={{ width: '200px', padding: '8px 12px', fontSize: '12px' }}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />

              <button
                className="btn btn-gold"
                onClick={() => { setIsEditMode(false); setShowModal(true); }}
              >
                + Add User
              </button>
            </div>
          </div>

          <div style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            gap: '14px',
            flexWrap: 'wrap'
          }}>
            <div style={{ fontSize: '11px', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge b-admin" style={{ padding: '4px 10px', borderRadius: '20px', background: '#fee2e2', color: '#dc2626', fontWeight: 600 }}>Administrator</span> Full access · manage users · all reports
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge b-manager" style={{ padding: '4px 10px', borderRadius: '20px', background: '#dbeafe', color: '#2563eb', fontWeight: 600 }}>Manager</span> Upload data · commission tool · dashboard
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="badge b-viewer" style={{ padding: '4px 10px', borderRadius: '20px', background: '#f3f4f6', color: '#4b5563', fontWeight: 600 }}>Viewer</span> Dashboard & leaderboard view only
            </div>
          </div>

          <div style={{ padding: '18px 22px' }}>
            <div className="tbl-wrap" id="usersTbl">
              {fetchLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontSize: '12px' }}>
                  Loading records…
                </div>
              ) : filteredUsers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--dim)', fontSize: '12px' }}>
                  No users found match criteria.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e9e1d2', color: '#6f6457', fontWeight: 600 }}>
                      <th style={{ padding: '10px' }}>ID</th>
                      <th style={{ padding: '10px' }}>Name</th>
                      <th style={{ padding: '10px' }}>Username</th>
                      <th style={{ padding: '10px' }}>Mobile</th>
                      <th style={{ padding: '10px' }}>Role</th>
                      <th style={{ padding: '10px' }}>Branch</th>
                      <th style={{ padding: '10px' }}>Status</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      let roleStyle = { background: '#f3f4f6', color: '#4b5563' }; 
                      const cleanRole = (user.role || '').toLowerCase();
                      if (cleanRole === 'administrator' || cleanRole === 'admin') {
                        roleStyle = { background: '#fee2e2', color: '#dc2626' }; 
                      } else if (cleanRole === 'manager') {
                        roleStyle = { background: '#dbeafe', color: '#2563eb' }; 
                      } else if (cleanRole === 'viewer') {
                        roleStyle = { background: '#e5e7eb', color: '#4b5563' }; 
                      }

                      const isActive = (user.status || '').toLowerCase() === 'active';
                      const statusStyle = isActive 
                        ? { background: '#dcfce7', color: '#16a34a' } 
                        : { background: '#fef3c7', color: '#d97706' }; 

                      return (
                        <tr key={user.id} style={{ borderBottom: '1px solid #e9e1d2' }}>
                          <td style={{ padding: '12px 10px', color: '#6f6457' }}>{user.id}</td>
                          <td style={{ padding: '12px 10px', fontWeight: 500 }}>{user.name || '—'}</td>
                          <td style={{ padding: '12px 10px' }}>@{user.username || '—'}</td>
                          <td style={{ padding: '12px 10px' }}>{user.mobile || '—'}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ 
                              padding: '3px 10px', 
                              borderRadius: '12px', 
                              fontSize: '11px', 
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              display: 'inline-block',
                              ...roleStyle 
                            }}>
                              {user.role || 'Viewer'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>{user.branch || '—'}</td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ 
                              padding: '3px 10px', 
                              borderRadius: '12px', 
                              fontSize: '11px', 
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              display: 'inline-block',
                              ...statusStyle 
                            }}>
                              {user.status || 'Active'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                              <button 
                                onClick={() => handleEditClick(user)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px' }}
                                title="Edit User"
                              >
                                ✏️
                              </button>
                              <button 
                                onClick={() => { setTargetUser(user); setShowDeleteModal(true); }}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px' }}
                                title="Delete User"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(26,21,16,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ width: '520px', background: '#fffdf9', border: '1.5px solid #e0d8c5', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e9e1d2', fontWeight: 600, color: '#1a1510' }}>
              {isEditMode ? 'Edit User Profile' : 'Add New User'}
              <button onClick={closeFormModal} disabled={loading} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6f6457' }}>✕</button>
            </div>

            <div style={{ padding: '16px' }}>
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input className="inp" name="name" placeholder="Name" value={formData.name} onChange={handleChange} disabled={loading} />
                <input className="inp" name="username" placeholder="Username" value={formData.username} onChange={handleChange} disabled={loading} />
                <input className="inp" name="mobile" placeholder="Mobile (10 digits)" value={formData.mobile} onChange={handleChange} disabled={loading} />
                <input className="inp" name="email" type="email" placeholder="Email (@gmail or @duroply)" value={formData.email} onChange={handleChange} disabled={loading} />
                
                <input 
                  className="inp" 
                  name="password" 
                  type="password" 
                  placeholder={isEditMode ? "New Password (leave blank to keep)" : "Account Password"} 
                  value={formData.password} 
                  onChange={handleChange} 
                  disabled={loading} 
                  style={{ gridColumn: 'span 2' }} 
                />

                <select className="inp" name="role" value={formData.role} onChange={handleChange} disabled={loading}>
                  <option value="">Role</option>
                  <option value="administrator">Administrator</option>
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>

                <select className="inp" name="department" value={formData.department} onChange={handleChange} disabled={loading}>
                  <option value="">Department</option>
                  <option value="sales">Sales</option>
                  <option value="marketing">Marketing</option>
                  <option value="hr">HR</option>
                  <option value="finance">Finance</option>
                  <option value="operations">Operations</option>
                </select>

                <select className="inp" name="designation" value={formData.designation} onChange={handleChange} disabled={loading}>
                  <option value="">Designation</option>
                  <option value="executive">Executive</option>
                  <option value="senior">Senior Executive</option>
                  <option value="team_lead">Team Lead</option>
                  <option value="manager">Manager</option>
                  <option value="head">Head</option>
                </select>

                <select className="inp" name="branch" value={formData.branch} onChange={handleChange} disabled={loading}>
                  <option value="">Branch</option>
                  <option value="delhi">Delhi</option>
                  <option value="mumbai">Mumbai</option>
                  <option value="noida">Noida</option>
                  <option value="bangalore">Bangalore</option>
                  <option value="gurgaon">Gurgaon</option>
                </select>

                <select className="inp" name="status" value={formData.status} onChange={handleChange} disabled={loading} style={{ gridColumn: 'span 2' }}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 16px', borderTop: '1px solid #e9e1d2' }}>
              <button className="btn" onClick={closeFormModal} disabled={loading}>Cancel</button>
              <button className="btn btn-gold" onClick={handleSaveSubmit} disabled={loading}>
                {loading ? 'Processing...' : isEditMode ? 'Update Details' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(26,21,16,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ width: '400px', background: '#fffdf9', border: '1.5px solid #e0d8c5', borderRadius: '12px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#1a1510' }}>Confirm Profile Updates</h3>
            <p style={{ fontSize: '13px', color: '#6f6457', margin: '0 0 20px 0', lineHeight: '1.5' }}>Are you absolutely sure you want to commit these profile changes to the system repository?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" onClick={() => setShowUpdateModal(false)}>No, Go Back</button>
              <button className="btn btn-gold" onClick={executeUpdate}>Yes, Update</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(26,21,16,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div style={{ width: '400px', maxWidth: '400px', background: '#fffdf9', border: '1.5px solid #dc2626', borderRadius: '12px', padding: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#dc2626' }}>Permanently Remove Account?</h3>
            <p style={{ fontSize: '13px', color: '#6f6457', margin: '0 0 20px 0', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong>{targetUser?.name}</strong>? This structural drop targets both mapping frames and <strong>cannot be undone</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" onClick={() => { setShowDeleteModal(false); setTargetUser(null); }}>Cancel</button>
              <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={executeDelete}>Yes, Purge Record</button>
            </div>
          </div>
        </div>
      )}

      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          padding: '12px 20px',
          borderRadius: '8px',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 10001,
          background: toast.type === 'success' ? '#16a34a' : toast.type === 'warning' ? '#d97706' : '#dc2626',
          transition: 'all 0.3s ease'
        }}>
          {toast.type === 'success' ? '✅ ' : toast.type === 'warning' ? '⚠️ ' : '❌ '}
          {toast.message}
        </div>
      )}
    </>
  );
}