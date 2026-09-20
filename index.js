import { registerRootComponent } from 'expo';
import React from 'react';

import App from './App';

// React 19 StrictMode, on deliberately: it double-invokes reducers, effects and
// lazy initialisers in development, which is exactly the pressure v1 could not
// survive (docs/v1-review.md A1, AC-203). If a turn ever double-resolves, this
// is what makes it fail loudly here rather than quietly on a player's phone.
function Root() {
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

registerRootComponent(Root);
