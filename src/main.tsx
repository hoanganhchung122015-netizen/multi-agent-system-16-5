import 'katex/dist/katex.min.css';
import './index.css'; // Quan trọng nhất để hiện màu sắc và bố cục
import React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
