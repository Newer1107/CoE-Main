import prisma from '@/lib/prisma';

export const getActiveCommitteeEvent = async () => {
  return prisma.committeeEvent.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
  });
};

export const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const parsePositiveInt = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
};
