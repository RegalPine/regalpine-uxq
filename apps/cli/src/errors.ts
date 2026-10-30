/** 退出码常量 + 映射函数。 */

export const EXIT_CODES = {
  SUCCESS: 0,
  POLICY_FAIL: 1,
  INPUT_ERROR: 2,
  ENVIRONMENT_ERROR: 3,
  EXECUTION_ERROR: 4,
  CONTRACT_ERROR: 5,
  ARTIFACT_ERROR: 6,
  CANCELLED: 130,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** 将 UxqError 的 category 映射为退出码。 */
export function categoryToExitCode(category: string): ExitCode {
  switch (category) {
    case 'INPUT': return EXIT_CODES.INPUT_ERROR;
    case 'ENVIRONMENT': return EXIT_CODES.ENVIRONMENT_ERROR;
    case 'EXECUTION': return EXIT_CODES.EXECUTION_ERROR;
    case 'CONTRACT': return EXIT_CODES.CONTRACT_ERROR;
    case 'ARTIFACT': return EXIT_CODES.ARTIFACT_ERROR;
    case 'CANCELLED': return EXIT_CODES.CANCELLED;
    default: return 1;
  }
}
