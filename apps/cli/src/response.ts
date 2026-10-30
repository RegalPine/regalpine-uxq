/** UXQ CLI 响应契约 — stdout 只输出 JSON response，stderr 只输出日志。 */

export const SCHEMA_VERSION = '1.0.0';

export interface CliErrorRecord {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface CliWarningRecord {
  readonly code: string;
  readonly message: string;
}

/** 统一响应包装：所有命令输出均为此结构。 */
export interface CliResponse<T> {
  readonly schemaVersion: string;
  readonly uxqVersion: string;
  readonly command: string;
  readonly status: 'COMPLETED' | 'PARTIAL' | 'UNKNOWN' | 'ERROR';
  readonly data?: T;
  readonly errors?: readonly CliErrorRecord[];
  readonly warnings?: readonly CliWarningRecord[];
}

export function buildResponse<T>(
  uxqVersion: string,
  command: string,
  pick: Pick<CliResponse<T>, 'status' | 'data' | 'errors' | 'warnings'>,
): CliResponse<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    uxqVersion,
    command,
    status: pick.status,
    ...(pick.data !== undefined ? { data: pick.data } : {}),
    ...(pick.errors !== undefined ? { errors: pick.errors } : {}),
    ...(pick.warnings !== undefined ? { warnings: pick.warnings } : {}),
  };
}
