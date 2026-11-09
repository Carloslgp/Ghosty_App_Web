import { app } from '@azure/functions';
import { PreviewMessageHandler } from '../application/features/preview-message/preview-message.handler.js';
import { jsonHandler } from './shared/http.js';
import { systemClock } from './shared/runtime.js';
import { messagePreviewRequestSchema } from './shared/schemas.js';

const handler = new PreviewMessageHandler(systemClock);

/** `POST /api/message-preview`: o texto exato que sairia e a contagem contra os 4.096 caracteres. */
export const messagePreview = jsonHandler(messagePreviewRequestSchema, (input) => handler.execute(input));

app.http('message-preview', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'message-preview',
  handler: messagePreview,
});
