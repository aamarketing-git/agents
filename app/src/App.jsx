import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useStore } from './store'
import { BottomNav, Toaster } from './components/ui'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import Today from './pages/Today'
import Meeting from './pages/Meeting'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import CustomerEdit from './pages/CustomerEdit'
import Content from './pages/Content'
import Coach from './pages/Coach'
import Education from './pages/Education'
import Leader from './pages/Leader'
import Settings from './pages/Settings'
import Schedule from './pages/Schedule'
import Assistant from './pages/Assistant'
import Login from './pages/Login'
import Library from './pages/Library'

export default function App() {
  const { state, auth } = useStore()
  const { pathname } = useLocation()
  const ready = !!state.profile.aiName && !!state.profile.userName

  if (auth.cloud === null) return <div className="app"><div className="page center" style={{ justifyContent: 'center' }}><p className="muted">불러오는 중…</p></div></div>
  const needLogin = auth.cloud && !auth.user && !auth.localOnly
  if (needLogin && pathname !== '/login') return <Navigate to="/login" replace />
  if (!needLogin && pathname === '/login' && auth.user) return <Navigate to={ready ? '/' : '/start'} replace />
  if (!ready && !needLogin && pathname !== '/start' && pathname !== '/login') return <Navigate to="/start" replace />

  return (
    <div className="app">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/start" element={<Onboarding />} />
        <Route path="/" element={<Home />} />
        <Route path="/today" element={<Today />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/meeting/:customerId" element={<Meeting />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<CustomerEdit />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/customers/:id/edit" element={<CustomerEdit />} />
        <Route path="/content" element={<Content />} />
        <Route path="/coach" element={<Coach />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/library" element={<Library />} />
        <Route path="/education" element={<Education />} />
        <Route path="/leader" element={<Leader />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {ready && pathname !== '/start' && pathname !== '/login' && <BottomNav />}
      <Toaster />
    </div>
  )
}
