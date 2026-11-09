export interface GetNotesSummaryQuery {
  ownerId: string;
  /** Fuso IANA que define "hoje". */
  timezone: string;
}
