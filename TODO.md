# TODO - duroply architect frontend (testing connection)

- [ ] Step 1: Implement routing + persistent layout (Login route + ProtectedLayout with Sidebar+Topbar)
- [ ] Step 2: Update Login.jsx to set `localStorage.isAuthenticated=true` and navigate to `/app/dashboard` on success
- [ ] Step 3: Update Sidebar.jsx to use `useNavigate()` for menu clicks (no internal active state controlling navigation)
- [ ] Step 4: Wire Claim Processor menu to `/app/claims` and render existing `src/components/pages/UploadCalculate.jsx`
- [ ] Step 5: Ensure unauthenticated users can’t access `/app/*` routes (redirect to `/`)
- [ ] Step 6: Run npm start and test: login → dashboard → sidebar navigation with persistent sidebar+topbar

