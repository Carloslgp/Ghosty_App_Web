export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

/** Formato das listas paginadas da API: `{ items, page, pageSize, total }`. */
export interface PageView<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function pageRequest(page?: number, pageSize?: number): PageRequest {
  return {
    page: Math.max(1, Math.trunc(page ?? 1)),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(pageSize ?? DEFAULT_PAGE_SIZE))),
  };
}

export function toPageView<T, V>(page: Page<T>, request: PageRequest, map: (item: T) => V): PageView<V> {
  return { items: page.items.map(map), page: request.page, pageSize: request.pageSize, total: page.total };
}
