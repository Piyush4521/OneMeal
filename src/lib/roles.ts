export type AppRole = 'donor' | 'receiver' | 'admin';
export type DashboardRole = Exclude<AppRole, 'admin'>;

const APP_ROLES: AppRole[] = ['donor', 'receiver', 'admin'];

export const isAppRole = (value: unknown): value is AppRole =>
  typeof value === 'string' && APP_ROLES.includes(value as AppRole);

export const isDashboardRole = (value: unknown): value is DashboardRole =>
  value === 'donor' || value === 'receiver';

export const getDashboardPath = (role: AppRole | null | undefined) => {
  if (role === 'admin') return '/admin-dashboard';
  if (role === 'receiver') return '/receiver';
  if (role === 'donor') return '/donor';
  return null;
};

export const getRoleLabel = (role: AppRole | null | undefined) => {
  if (role === 'receiver') return 'NGO';
  if (role === 'donor') return 'Donor';
  if (role === 'admin') return 'Admin';
  return 'Unknown';
};
