import React, { useState, useEffect } from 'react';

import { useLocation } from 'react-router-dom';

export default function Topbar() {
  const [currentTime, setCurrentTime] = useState('');
  const location = useLocation();

  useEffect(() => {

    // Function to update time string (formats to local time, adjust as needed)
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };

    // Run immediately on mount
    updateTime();

    // Set interval to update every 1 second
    const timer = setInterval(updateTime, 1000);

    // Clean up interval on component unmount
    return () => clearInterval(timer);
  }, []);

  const title = (() => {
    const p = location.pathname;
    if (p.includes('/dashboard')) return 'Dashboard';
    if (p.includes('/users')) return 'User Management';
    if (p.includes('/master')) return 'Master Config';
    if (p.includes('/history')) return 'Upload History';
    if (p.includes('/accounts')) return 'Architect Accounts';
    if (p.includes('/remittance')) return 'Remittance Entry';
    if (p.includes('/claims')) return 'Claim Processor';
    if (p.includes('/profile')) return 'My Profile';
    return 'Dashboard';
  })();

  return (
    <header id="topbar">
      <div id="topbarTitle">{title}</div>
      <div id="topbarPill" className="topbar-pill">Design Partner+</div>
      <div id="topbarTime" className="ml-auto">
        {currentTime}
      </div>
    </header>
  );
}