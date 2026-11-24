import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PublicLayout from '@/public/Layout';
import { AboutPage, ActivitiesPage, CoachesPage, ContactPage, GalleryPage, HomePage, PlanningPage, PricingPage } from '@/public/Pages';
import { useAuth, AuthGate } from '@/admin/auth';

// The whole back office is lazy-loaded: public visitors never download it.
const AdminLayout = lazy(() => import('@/admin/Layout'));
const Dashboard = lazy(() => import('@/admin/pages/Dashboard'));
const Clients = lazy(() => import('@/admin/pages/Clients'));
const Subscriptions = lazy(() => import('@/admin/pages/Subscriptions'));
const Planning = lazy(() => import('@/admin/pages/Planning'));
const L = <T extends Record<string, any>>(f: () => Promise<T>, k: keyof T) => lazy<React.ComponentType<any>>(() => f().then((m) => ({ default: m[k] })));
const fin = () => import('@/admin/pages/Finance');
const hr = () => import('@/admin/pages/HR');
const ops = () => import('@/admin/pages/Ops');
const sys = () => import('@/admin/pages/System');
const Cash = L(fin, 'CashPage'), Payments = L(fin, 'PaymentsPage'), Expenses = L(fin, 'ExpensesPage'), Receipts = L(fin, 'ReceiptsPage'), Quotations = L(fin, 'QuotationsPage'), Invoices = L(fin, 'InvoicesPage');
const Staff = L(hr, 'StaffPage'), Coaches = L(hr, 'CoachesPage'), Attendance = L(hr, 'AttendancePage'), Leaves = L(hr, 'LeavesPage'), Payroll = L(hr, 'PayrollPage'), Me = L(hr, 'MePage');
const Plans = L(ops, 'PlansPage'), Activities = L(ops, 'ActivitiesAdminPage'), Suppliers = L(ops, 'SuppliersPage'), Equipment = L(ops, 'EquipmentPage'), Maintenance = L(ops, 'MaintenancePage'), Documents = L(ops, 'DocumentsPage'), Reports = L(ops, 'ReportsPage'), Notifications = L(ops, 'NotificationsPage');
const Website = L(sys, 'WebsitePage'), Users = L(sys, 'UsersPage'), Settings = L(sys, 'SettingsPage');

const Loading = () => <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>;

/** Server-side checks are authoritative; this only hides pages the user cannot use. */
function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(perm)) return <div className="grid min-h-[40vh] place-items-center text-center"><div><div className="font-display text-5xl">403</div><p className="text-zinc-500">Accès non autorisé pour votre rôle.</p></div></div>;
  return <>{children}</>;
}
function AdminHome() {
  const { can } = useAuth();
  return can('finance_stats:read') || can('clients:read') ? <Dashboard /> : <Navigate to="/admin/me" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="activities" element={<ActivitiesPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="coaches" element={<CoachesPage />} />
          <Route path="gallery" element={<GalleryPage />} />
          <Route path="contact" element={<ContactPage />} />
        </Route>
        <Route path="admin" element={<AuthGate><Suspense fallback={<Loading />}><AdminLayout /></Suspense></AuthGate>}>
          <Route index element={<AdminHome />} />
          <Route path="me" element={<Guard perm="self:read"><Me /></Guard>} />
          <Route path="clients" element={<Guard perm="clients:read"><Clients /></Guard>} />
          <Route path="subscriptions" element={<Guard perm="subscriptions:read"><Subscriptions /></Guard>} />
          <Route path="plans" element={<Guard perm="plans:read"><Plans /></Guard>} />
          <Route path="planning" element={<Guard perm="schedules:read"><Planning /></Guard>} />
          <Route path="activities" element={<Guard perm="activities:write"><Activities /></Guard>} />
          <Route path="coaches" element={<Guard perm="coaches:read"><Coaches /></Guard>} />
          <Route path="staff" element={<Guard perm="employees:read"><Staff /></Guard>} />
          <Route path="attendance" element={<Guard perm="attendance:read"><Attendance /></Guard>} />
          <Route path="leaves" element={<Guard perm="leaves:read"><Leaves /></Guard>} />
          <Route path="payroll" element={<Guard perm="payroll:read"><Payroll /></Guard>} />
          <Route path="payslips" element={<Guard perm="payroll:read"><Payroll initialTab="slips" /></Guard>} />
          <Route path="cash" element={<Guard perm="cash:read"><Cash /></Guard>} />
          <Route path="payments" element={<Guard perm="payments:read"><Payments /></Guard>} />
          <Route path="expenses" element={<Guard perm="expenses:read"><Expenses /></Guard>} />
          <Route path="quotations" element={<Guard perm="quotations:read"><Quotations /></Guard>} />
          <Route path="invoices" element={<Guard perm="invoices:read"><Invoices /></Guard>} />
          <Route path="receipts" element={<Guard perm="receipts:read"><Receipts /></Guard>} />
          <Route path="suppliers" element={<Guard perm="suppliers:read"><Suppliers /></Guard>} />
          <Route path="equipment" element={<Guard perm="equipment:read"><Equipment /></Guard>} />
          <Route path="maintenance" element={<Guard perm="maintenance:read"><Maintenance /></Guard>} />
          <Route path="documents" element={<Guard perm="website:read"><Documents /></Guard>} />
          <Route path="reports" element={<Guard perm="reports:read"><Reports /></Guard>} />
          <Route path="notifications" element={<Guard perm="notifications:read"><Notifications /></Guard>} />
          <Route path="website" element={<Guard perm="website:read"><Website /></Guard>} />
          <Route path="users" element={<Guard perm="users:read"><Users /></Guard>} />
          <Route path="settings" element={<Guard perm="settings:read"><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<div className="grid min-h-screen place-items-center bg-ink text-center text-white"><div><div className="font-display text-9xl text-brand">404</div><Link to="/" className="underline">Retour à l’accueil</Link></div></div>} />
      </Routes>
    </Suspense>
  );
}
