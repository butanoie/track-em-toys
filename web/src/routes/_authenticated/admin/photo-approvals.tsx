import { createFileRoute } from '@tanstack/react-router';
import { PhotoApprovalPage } from '@/admin/photos/PhotoApprovalPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export const Route = createFileRoute('/_authenticated/admin/photo-approvals')({
  pendingComponent: () => <LoadingSpinner className="py-16" />,
  component: PhotoApprovalPage,
});
