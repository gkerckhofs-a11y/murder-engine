import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import CharacterQrLanding from './CharacterQrLanding';
import './styles.css';

const characterScanMatch =
  window.location.pathname.match(
    /^\/scan\/character\/([^/]+)\/?$/
  );

let characterExternalId = '';

if (characterScanMatch) {
  try {
    characterExternalId = decodeURIComponent(
      characterScanMatch[1]
    );
  } catch {
    characterExternalId = characterScanMatch[1];
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {characterScanMatch
      ? <CharacterQrLanding
          characterExternalId={characterExternalId}
        />
      : <App />
    }
  </React.StrictMode>
);
