import { describeArchitecture } from './architecture.rules.js';

// Na Function App, a camada de entrada é src/functions, e cada função monta as próprias dependências.
describeArchitecture({ entryLayer: 'functions', compositionRoots: ['src/functions/**'] });
