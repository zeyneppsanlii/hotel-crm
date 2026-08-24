export interface PageRequest {
  page: number;
  limit: number;
}

export function skipFor(page: PageRequest): number {
  return (page.page - 1) * page.limit;
}
