export interface UpdateResult<TRow> {
  readonly changed: number;
  readonly row: TRow | null;
}

export interface PaginatedResult<TRow> {
  readonly rows: readonly TRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

interface UpdateResponseLike<TRowDto> {
  readonly changed: number;
  readonly row: TRowDto | null;
}

interface PaginatedResponseLike<TRowDto> {
  readonly rows: readonly TRowDto[];
  readonly total: number;
  readonly page: number;
  readonly page_size: number;
}

export function mapNullableRow<TRowDto, TRow>(
  row: TRowDto | null,
  mapRow: (row: TRowDto) => TRow,
): TRow | null {
  return row === null ? null : mapRow(row);
}

export function mapUpdateResult<TRowDto, TRow>(
  result: UpdateResponseLike<TRowDto>,
  mapRow: (row: TRowDto) => TRow,
): UpdateResult<TRow> {
  return {
    changed: result.changed,
    row: mapNullableRow(result.row, mapRow),
  };
}

export function mapPaginatedResult<TRowDto, TRow>(
  response: PaginatedResponseLike<TRowDto>,
  mapRow: (row: TRowDto) => TRow,
): PaginatedResult<TRow> {
  const pageSize = response.page_size;

  return {
    rows: response.rows.map((row) => mapRow(row)),
    total: response.total,
    page: response.page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(response.total / pageSize)),
  };
}
