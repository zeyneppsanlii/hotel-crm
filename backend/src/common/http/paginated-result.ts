/**
 * Return this from a controller/service for a paged list. The response envelope
 * interceptor unwraps it: `items` becomes `data`, and page/limit/total/hasMore go
 * into `meta`. Feature code never assembles the envelope by hand.
 */
export class PaginatedResult<T> {
  constructor(
    public readonly items: T[],
    public readonly page: number,
    public readonly limit: number,
    public readonly total: number,
  ) {}

  get hasMore(): boolean {
    return this.page * this.limit < this.total;
  }
}
