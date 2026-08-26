import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OverviewPage } from '@/pages/OverviewPage';
import { WorkItemsPage } from '@/pages/WorkItemsPage';
import { VelocityPage } from '@/pages/VelocityPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'work-items', element: <WorkItemsPage /> },
      { path: 'velocity', element: <VelocityPage /> },
      { path: 'keytia', element: <ClientsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
