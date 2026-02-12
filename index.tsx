import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './AuthContext';
import AuthPage from './AuthPage';
import App from './App';

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">Loading…</p>
        </div>
      </div>
    );
  }

  return user ? <App /> : <AuthPage />;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>
);
