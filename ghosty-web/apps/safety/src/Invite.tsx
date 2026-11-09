import type { InviteAppProps } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { InvitePage } from './features/invite';

/**
 * O remote `safety/Invite`: a página pública do convite. Tem o próprio cache (quem abre o link não tem
 * sessão no shell).
 */
export default function InviteApp(props: InviteAppProps) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <InvitePage {...props} />
    </QueryClientProvider>
  );
}
