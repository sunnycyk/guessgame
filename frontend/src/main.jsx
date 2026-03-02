import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ReactGA from "react-ga4";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
if (measurementId) {
  ReactGA.initialize(measurementId);
  ReactGA.send({ hitType: "pageview", page: window.location.pathname });
}

// Inject AdSense script if configured
const adClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID;
if (adClientId) {
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClientId}`;
  document.head.appendChild(script);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
