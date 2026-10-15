import React from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme, type MantineColorSchemeManager } from '@mantine/core';
import '@mantine/core/styles.css';
import './styles.css';
import App from './App';
// Theme follows this tab's route; a room in another tab must not recolor the lobby.
const routeColorSchemeManager: MantineColorSchemeManager = {
  get: (defaultValue) => defaultValue ?? 'light',
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};
const theme = createTheme({
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  primaryColor: 'gray',
  defaultRadius: 'md',
});
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider
      theme={theme}
      colorSchemeManager={routeColorSchemeManager}
      defaultColorScheme={location.pathname.startsWith('/room/') ? 'dark' : 'light'}
    >
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
