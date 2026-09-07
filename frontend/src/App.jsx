import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SettingsPage from './pages/SettingsPage';
import LibraryPage from './pages/LibraryPage';
import AdminPanelPage from './pages/AdminPanelPage';
import ArticleEditorPage from './pages/ArticleEditorPage';
import ArticlePage from './pages/ArticlePage';
import NotFoundPage from './pages/NotFoundPage';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Protected Dashboard/Studio/Admin Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/admin" element={<AdminPanelPage />} />
          <Route path="/editor" element={<ArticleEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Public/Authenticated Article Route */}
        <Route path="/wiki/:wikiSlug/:articleSlug" element={<ArticlePage />} />

        {/* Guest Authentication Routes */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<AuthPage initialView="login" />} />
          <Route path="/register" element={<AuthPage initialView="register" />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Route>

        {/* Global 404 Catch-All */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}