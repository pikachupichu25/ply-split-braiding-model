import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ExpectedLayoutEditor from './ExpectedLayoutEditor';
import ColourwayDesigner from './ColourwayDesigner';
import ModelsExplainer from './ModelsExplainer';
import './styles.css';

function AppRouter() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const updateRoute = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', updateRoute);
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  if (route === '#/expected-layout') return <ExpectedLayoutEditor />;
  if (route === '#/colour') return <ColourwayDesigner />;
  if (route === '#/models' || route.startsWith('#/models#')) return <ModelsExplainer />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
