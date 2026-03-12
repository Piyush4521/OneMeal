// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockSession = {
  loading: boolean;
  isAuthenticated: boolean;
  isBanned: boolean;
  isAdmin: boolean;
  role: 'donor' | 'receiver' | 'admin' | null;
};

let currentSession: MockSession = {
  loading: false,
  isAuthenticated: false,
  isBanned: false,
  isAdmin: false,
  role: null,
};

vi.mock('./context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuthSession: () => currentSession,
}));

const { AdminRoute, DashboardRoute, LoginGuard } = await import('./App');

const renderAppRoutes = (initialEntry: string, routeTree: ReactNode) =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>{routeTree}</Routes>
    </MemoryRouter>
  );

describe('route guards', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    currentSession = {
      loading: false,
      isAuthenticated: false,
      isBanned: false,
      isAdmin: false,
      role: null,
    };
  });

  it('redirects donors away from receiver-only routes', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: false,
      isAdmin: false,
      role: 'donor',
    };

    renderAppRoutes(
      '/receiver',
      <>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/donor" element={<div>Donor Dashboard</div>} />
        <Route
          path="/receiver"
          element={(
            <DashboardRoute requiredRole="receiver">
              <div>Protected Receiver View</div>
            </DashboardRoute>
          )}
        />
      </>
    );

    expect(await screen.findByText('Donor Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Protected Receiver View')).not.toBeInTheDocument();
  });

  it('redirects receivers away from donor-only routes', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: false,
      isAdmin: false,
      role: 'receiver',
    };

    renderAppRoutes(
      '/donor',
      <>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route path="/receiver" element={<div>Receiver Dashboard</div>} />
        <Route
          path="/donor"
          element={(
            <DashboardRoute requiredRole="donor">
              <div>Protected Donor View</div>
            </DashboardRoute>
          )}
        />
      </>
    );

    expect(await screen.findByText('Receiver Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Protected Donor View')).not.toBeInTheDocument();
  });

  it('shows the banned-user screen before protected content', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: true,
      isAdmin: false,
      role: 'donor',
    };

    renderAppRoutes(
      '/donor',
      <>
        <Route path="/login" element={<div>Login Screen</div>} />
        <Route
          path="/donor"
          element={(
            <DashboardRoute requiredRole="donor">
              <div>Protected Donor View</div>
            </DashboardRoute>
          )}
        />
      </>
    );

    expect(await screen.findByText('Account blocked')).toBeInTheDocument();
    expect(screen.queryByText('Protected Donor View')).not.toBeInTheDocument();
  });

  it('fails closed for admin-dashboard access without an admin claim', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: false,
      isAdmin: false,
      role: 'admin',
    };

    renderAppRoutes(
      '/admin-dashboard',
      <>
        <Route path="/admin" element={<div>Admin Login</div>} />
        <Route
          path="/admin-dashboard"
          element={(
            <AdminRoute>
              <div>Protected Admin View</div>
            </AdminRoute>
          )}
        />
      </>
    );

    expect(await screen.findByText('Admin Login')).toBeInTheDocument();
    expect(screen.queryByText('Protected Admin View')).not.toBeInTheDocument();
  });

  it('allows custom-claim admins into the admin dashboard', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: false,
      isAdmin: true,
      role: 'admin',
    };

    renderAppRoutes(
      '/admin-dashboard',
      <>
        <Route path="/admin" element={<div>Admin Login</div>} />
        <Route
          path="/admin-dashboard"
          element={(
            <AdminRoute>
              <div>Protected Admin View</div>
            </AdminRoute>
          )}
        />
      </>
    );

    expect(await screen.findByText('Protected Admin View')).toBeInTheDocument();
  });

  it('keeps unclaimed admin-profile users on the admin login screen', async () => {
    currentSession = {
      loading: false,
      isAuthenticated: true,
      isBanned: false,
      isAdmin: false,
      role: 'admin',
    };

    renderAppRoutes(
      '/login',
      <>
        <Route
          path="/login"
          element={(
            <LoginGuard>
              <div>Protected Login View</div>
            </LoginGuard>
          )}
        />
      </>
    );

    expect(await screen.findByText('Protected Login View')).toBeInTheDocument();
  });
});
