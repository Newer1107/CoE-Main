import type { HostingRequestStatus } from '@prisma/client';

const STATUS_STYLES: Record<HostingRequestStatus, string> = {
  PENDING: 'bg-[#fff2cc] text-[#8c4f00] border-[#f4c95d]',
  UNDER_REVIEW: 'bg-[#dbeafe] text-[#1d4ed8] border-[#93c5fd]',
  APPROVED: 'bg-[#dcfce7] text-[#166534] border-[#86efac]',
  REJECTED: 'bg-[#fee2e2] text-[#991b1b] border-[#fca5a5]',
  CHANGES_REQUESTED: 'bg-[#fde68a] text-[#92400e] border-[#fbbf24]',
};

export const getHostingStatusLabel = (status: HostingRequestStatus) => status.replaceAll('_', ' ');

export default function HostingRequestStatusBadge({ status }: { status: HostingRequestStatus }) {
  return (
    <span className={`inline-flex items-center border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${STATUS_STYLES[status]}`}>
      {getHostingStatusLabel(status)}
    </span>
  );
}
