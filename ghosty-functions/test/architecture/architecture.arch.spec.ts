import { describeArchitecture } from './architecture.rules.js';

// Na Function App, a camada de entrada (API) é src/api, e cada função monta as próprias dependências.
describeArchitecture({ entryLayer: 'api', compositionRoots: ['src/api/**'] });
