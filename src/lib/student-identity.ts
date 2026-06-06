export const getStudentIdentitySnapshot = (user: {
  name: string;
  email: string;
  uid?: string | null;
}) => ({
  name: user.name,
  email: user.email,
  uid: user.uid ?? null,
  department: null as string | null,
  year: null as string | null,
});
