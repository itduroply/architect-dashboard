import React, { useState } from 'react';

export default function AddUser() {
  const [form, setForm] = useState({
    username: '',
    mobile: '',
    branch: '',
    status: 'Active',
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      lastLogin: new Date().toISOString(),
    };

    console.log('User Payload:', payload);
  };

  return (
    <div className="page" id="page-add-user">
      <div style={{ maxWidth: '700px' }}>

        <div className="card">
          <div className="card-hd">
            <div className="card-icon">👤</div>
            <div>
              <div className="card-title">Add New User</div>
            </div>
          </div>

          <div className="card2-body">

            <div className="fg">
              <label className="lbl">Username</label>
              <input
                className="inp"
                type="text"
                placeholder="Enter username"
                value={form.username}
                onChange={(e) =>
                  handleChange('username', e.target.value)
                }
              />
            </div>

            <div className="fg">
              <label className="lbl">Mobile Number</label>
              <input
                className="inp"
                type="text"
                placeholder="Enter mobile number"
                value={form.mobile}
                onChange={(e) =>
                  handleChange('mobile', e.target.value)
                }
              />
            </div>

            <div className="fg">
              <label className="lbl">Branch</label>
              <input
                className="inp"
                type="text"
                placeholder="Enter branch"
                value={form.branch}
                onChange={(e) =>
                  handleChange('branch', e.target.value)
                }
              />
            </div>

            <div className="fg">
              <label className="lbl">Status</label>
              <select
                className="inp"
                value={form.status}
                onChange={(e) =>
                  handleChange('status', e.target.value)
                }
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="fg">
              <label className="lbl">Last Login</label>
              <input
                className="inp"
                type="text"
                value="Auto generated after first login"
                disabled
              />
            </div>

            <div
              className="flex"
              style={{
                gap: '10px',
                marginTop: '16px',
              }}
            >
              <button
                className="btn btn-gold"
                onClick={handleSubmit}
              >
                Save User
              </button>

              <button
                type="button"
                className="btn"
                onClick={() =>
                  setForm({
                    username: '',
                    mobile: '',
                    branch: '',
                    status: 'Active',
                  })
                }
              >
                Reset
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}