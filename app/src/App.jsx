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

export default function App() {
  const { state } = useStore()
  const { pathname } = useLocation()
  const ready = !!state.profile.aiName && !!state.profile.userName

  if (!ready && pathname !== '/start') return <Navigate to="/start" replace />

  return (
    <div className="app">
      <Routes>
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
        <Route path="/education" element={<Education />} />
        <Route path="/leader" element={<Leader />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {ready && pathname !== '/start' && <BottomNav />}
      <Toaster />
    </div>
  )
}
