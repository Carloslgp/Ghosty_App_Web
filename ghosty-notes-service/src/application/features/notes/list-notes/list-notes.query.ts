export interface ListNotesQuery {
  ownerId: string;
  archived: boolean;
  label?: string;
  q?: string;
  page: number;
  pageSize: number;
}
