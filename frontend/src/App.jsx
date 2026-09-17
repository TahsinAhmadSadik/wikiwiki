import React from 'react';
import { Routes, Route } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SettingsPage from './pages/SettingsPage';
import HomePage from './pages/HomePage';
import LibraryPage from './pages/LibraryPage';
import AdminPanelPage from './pages/AdminPanelPage';
import ArticleEditorPage from './pages/ArticleEditorPage';
import ArticlePage from './pages/ArticlePage';
import NotFoundPage from './pages/NotFoundPage';
import SearchPage from './pages/SearchPage';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/search" element={<SearchPage />} />
        {/* Public Discovery Landing Page */}
        <Route path="/" element={<HomePage />} />

        {/* Public Article Viewer */}
        <Route path="/wiki/:wikiSlug/:articleSlug" element={<ArticlePage />} />

        {/* Authenticated-Only Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/studio" element={<LibraryPage />} />
          <Route path="/admin" element={<AdminPanelPage />} />
          <Route path="/editor" element={<ArticleEditorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Guest-Only Authentication Routes */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<AuthPage initialView="login" />} />
          <Route path="/register" element={<AuthPage initialView="register" />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Route>

        {/* Global Fallback Route */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}