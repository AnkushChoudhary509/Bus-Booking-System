import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation, Link } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import { Spinner, Empty, Button } from './components/ui';
import { SearchX } from 'lucide-react';

const Landing = lazy(() => import('./pages/public/Landing'));
const Login = lazy(() => import('./pages/public/Login'));
const Register = lazy(() => import('./pages/public/Register'));
const SearchPage = lazy(() => import('./pages/public/SearchPage'));
const BusDetails = lazy(() => import('./pages/public/BusDetails'));
const VerifyTicket = lazy(() => import('./pages/public/VerifyTicket'));
const Tracking = lazy(() => import('./pages/passenger/Tracking'));
const Dashboard = lazy(() => import('./pages/passenger/Dashboard'));
const SeatSelection = lazy(() => import('./pages/passenger/SeatSelection'));
const BoardingSelection = lazy(() => import('./pages/passenger/BoardingSelection'));
const Confirmation = lazy(() => import('./pages/passenger/Confirmation'));
const Payment = lazy(() => import('./pages/passenger/Payment'));
const Ticket = lazy(() => import('./pages/passenger/Ticket'));
const Passport = lazy(() => import('./pages/passenger/Passport'));
const Profile = lazy(() => import('./pages/passenger/Profile'));
const History = lazy(() => import('./pages/passenger/History'));
const Rescue = lazy(() => import('./pages/passenger/Rescue'));
const Notifications = lazy(() => import('./pages/passenger/Notifications'));
const Support = lazy(() => import('./pages/passenger/Support'));
const OperatorDashboard = lazy(() => import('./pages/operator/OperatorDashboard'));
const BusManagement = lazy(() => import('./pages/operator/BusManagement'));
const JourneyManagement = lazy(() => import('./pages/operator/JourneyManagement'));
const DriverMode = lazy(() => import('./pages/operator/DriverMode'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => { if (!hash) window.scrollTo(0, 0); else document.getElementById(hash.slice(1))?.scrollIntoView(); }, [pathname, hash]);
  return null;
}

const P = ({ roles, children }) => <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;
const pax = ['passenger'];
const any = ['passenger', 'operator', 'admin'];

export default function App() {
  return (
    <AppLayout>
      <ScrollTop />
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/journey/:id" element={<BusDetails />} />
          <Route path="/journey/:id/tracking" element={<Tracking />} />
          <Route path="/verify/:token" element={<VerifyTicket />} />

          <Route path="/dashboard" element={<P roles={pax}><Dashboard /></P>} />
          <Route path="/journey/:id/seats" element={<P roles={pax}><SeatSelection /></P>} />
          <Route path="/journey/:id/boarding" element={<P roles={pax}><BoardingSelection /></P>} />
          <Route path="/journey/:id/confirm" element={<P roles={pax}><Confirmation /></P>} />
          <Route path="/booking/:id/pay" element={<P roles={pax}><Payment /></P>} />
          <Route path="/booking/:id" element={<P roles={any}><Ticket /></P>} />
          <Route path="/booking/:id/rescue" element={<P roles={pax}><Rescue /></P>} />
          <Route path="/bookings" element={<P roles={pax}><History /></P>} />
          <Route path="/passport" element={<P roles={pax}><Passport /></P>} />
          <Route path="/profile" element={<P roles={any}><Profile /></P>} />
          <Route path="/notifications" element={<P roles={any}><Notifications /></P>} />
          <Route path="/support" element={<P roles={any}><Support /></P>} />

          <Route path="/operator" element={<P roles={['operator']}><OperatorDashboard /></P>} />
          <Route path="/operator/buses" element={<P roles={['operator']}><BusManagement /></P>} />
          <Route path="/operator/journeys" element={<P roles={['operator']}><JourneyManagement /></P>} />
          <Route path="/operator/drive/:id" element={<P roles={['operator', 'admin']}><DriverMode /></P>} />
          <Route path="/admin" element={<P roles={['admin']}><AdminDashboard /></P>} />

          <Route path="*" element={<Empty icon={SearchX} title="Page not found" text="That page does not exist." action={<Button as={Link} to="/">Back to home</Button>} />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
