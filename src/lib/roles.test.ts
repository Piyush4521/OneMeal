import { describe, expect, it } from 'vitest';
import { getDashboardPath, isAppRole, isDashboardRole } from './roles';

describe('roles', () => {
  it('resolves dashboard routes for each supported role', () => {
    expect(getDashboardPath('donor')).toBe('/donor');
    expect(getDashboardPath('receiver')).toBe('/receiver');
    expect(getDashboardPath('admin')).toBe('/admin-dashboard');
    expect(getDashboardPath(null)).toBeNull();
  });

  it('validates app roles correctly', () => {
    expect(isAppRole('donor')).toBe(true);
    expect(isAppRole('receiver')).toBe(true);
    expect(isAppRole('admin')).toBe(true);
    expect(isAppRole('guest')).toBe(false);
    expect(isDashboardRole('admin')).toBe(false);
    expect(isDashboardRole('receiver')).toBe(true);
  });
});
