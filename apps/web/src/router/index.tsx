import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OverviewPage } from '@/pages/OverviewPage';
import { AllProjectsPage } from '@/pages/AllProjectsPage';
import { WorkItemsPage } from '@/pages/WorkItemsPage';
import { ClientsPage } from '@/pages/ClientsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'all-projects', element: <AllProjectsPage /> },
      { path: 'work-items', element: <WorkItemsPage /> },
      { path: 'keytia', element: <ClientsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
