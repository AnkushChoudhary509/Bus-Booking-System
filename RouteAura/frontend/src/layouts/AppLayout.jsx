import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, X, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth, homeFor } from '../context/AuthContext';
import { Logo, Button, cx } from '../components/ui';
import { get } from '../services/api';
import useSocketEvent from '../hooks/useSocketEvent';
import { useToast } from '../context/ToastContext';

const NAV = {
  passenger: [['/dashboard', 'Dashboard'], ['/search', 'Search'], ['/bookings', 'My trips'], ['/passport', 'Passport'], ['/support', 'Support']],
  operator: [['/operator', 'Overview'], ['/operator/buses', 'Buses'], ['/operator/journeys', 'Journeys'], ['/support', 'Support']],
  admin: [['/admin', 'Admin'], ['/search', 'Search']],
  guest: [['/search', 'Search buses'], ['/#features', 'Features'], ['/#how', 'How it works']],
};

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const links = NAV[user?.role || 'guest'];

  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => { if (user) get('/notifications', { limit: 1 }).then((d) => setUnread(d.unread || 0)).catch(() => {}); else setUnread(0); }, [user, loc.pathname]);
  useSocketEvent('notification:new', (n) => { setUnread((u) => u + 1); toast.info(n?.title || 'New notification'); });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-200 no-print">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-6">
          <Logo />
          <nav className="hidden md:flex items-center gap-1 flex-1" aria-label="Main">
            {links.map(([to, label]) => (
              to.includes('#') ? <a key={to} href={to} className="px-3 py-2 text-sm font-medium text-slate-aura hover:text-midnight">{label}</a> :
              <NavLink key={to} to={to} end={to === '/operator' || to === '/admin' || to === '/dashboard'} className={({ isActive }) => cx('px-3 py-2 rounded-lg text-sm font-medium', isActive ? 'bg-midnight text-white' : 'text-slate-aura hover:text-midnight hover:bg-slate-100')}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto md:ml-0 flex items-center gap-2">
            {user ? (
              <>
                <Link to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative p-2 rounded-lg hover:bg-slate-100">
                  <Bell className="h-5 w-5" />
                  {unread > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-coral-aura text-white text-[10px] font-bold grid place-items-center">{unread > 9 ? '9+' : unread}</span>}
                </Link>
                <Link to="/profile" className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-slate-100 text-sm font-medium"><UserIcon className="h-4 w-4" />{user.name.split(' ')[0]}</Link>
                <button onClick={() => { logout(); nav('/'); }} aria-label="Log out" className="p-2 rounded-lg hover:bg-slate-100"><LogOut className="h-5 w-5" /></button>
              </>
            ) : (
              <>
                <Button as={Link} to="/login" variant="ghost" size="sm">Log in</Button>
                <Button as={Link} to="/register" size="sm" className="hidden sm:inline-flex">Sign up</Button>
              </>
            )}
            <button className="md:hidden p-2 rounded-lg hover:bg-slate-100" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          </div>
        </div>
        {open && (
          <nav className="md:hidden border-t border-slate-100 bg-white px-4 py-3 flex flex-col gap-1">
            {links.map(([to, label]) => <a key={to} href={to} onClick={(e) => { if (!to.includes('#')) { e.preventDefault(); nav(to); } }} className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-100">{label}</a>)}
            {user && <Link to="/profile" className="px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-100">Profile</Link>}
            {!user && <Link to="/register" className="px-3 py-2.5 rounded-lg text-sm font-semibold text-teal-dark">Sign up</Link>}
          </nav>
        )}
      </header>
      <main className="flex-1">{children || <Outlet />}</main>
      <Footer />
    </div>
  );
}

export function Footer() {
  const { user } = useAuth();
  return (
    <footer className="bg-midnight text-slate-300 no-print">
      <div className="max-w-7xl mx-auto px-4 py-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div><Logo dark /><p className="mt-3 text-slate-400">Travel with confidence, not guesswork. An academic demonstration project.</p></div>
        <div><h4 className="font-semibold text-white mb-3">Travel</h4><ul className="space-y-2"><li><Link to="/search" className="hover:text-white">Search buses</Link></li><li><Link to="/register" className="hover:text-white">Create account</Link></li>{user && <li><Link to={homeFor(user.role)} className="hover:text-white">My dashboard</Link></li>}</ul></div>
        <div><h4 className="font-semibold text-white mb-3">Operators</h4><ul className="space-y-2"><li><Link to="/register?role=operator" className="hover:text-white">Register your fleet</Link></li><li><Link to="/support" className="hover:text-white">Help centre</Link></li></ul></div>
        <div><h4 className="font-semibold text-white mb-3">Contact</h4><ul className="space-y-2 text-slate-400"><li>support@routeaura.test</li><li>+91 98765 00000 (demo)</li><li>Demonstration project. No real bookings or payments.</li></ul></div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} RouteAura. Demo content is fictional.</div>
    </footer>
  );
}
