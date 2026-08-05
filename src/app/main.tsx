import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../features/shell/App.js';
import { AuthProvider } from '../features/auth/AuthProvider.tsx';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
