import { describeArchitecture } from './architecture.rules.js';

describeArchitecture({
  entryLayer: 'api',
  compositionRoots: [
    'src/api/app.module.ts',
    'src/api/**/*.module.ts',
    'src/api/main.ts',
    'src/api/openapi-export.ts',
  ],
});
