/**
 * Represents detailed error information when parsing fails.
 */
export interface ParseError {
  /**
   * Discriminant type identifier for error result.
   */
  type: 'error';

  /**
   * Error code identifying the category or type of parse error.
   */
  code: string;

  /**
   * Human-readable description of the parse error.
   */
  message: string;

  /**
   * Line number (1-based) where the error occurred, if available.
   */
  line?: number;

  /**
   * Column number (1-based) where the error occurred, if available.
   */
  column?: number;
}

/**
 * Standard error codes used in ParseError objects.
 */
export const ParseErrorCode = {
  JSON_PARSE_ERROR: 'JSON_PARSE_ERROR',
  YAML_PARSE_ERROR: 'YAML_PARSE_ERROR',
  FRONTMATTER_PARSE_ERROR: 'FRONTMATTER_PARSE_ERROR',
  XML_PARSE_ERROR: 'XML_PARSE_ERROR',
  TOML_PARSE_ERROR: 'TOML_PARSE_ERROR',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  EMPTY_FILE: 'EMPTY_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  PARSE_ERROR: 'PARSE_ERROR'
} as const;

export type ParseErrorCodeType = (typeof ParseErrorCode)[keyof typeof ParseErrorCode];

/**
 * Factory function to construct a ParseError object.
 *
 * @param code Error code string (e.g. ParseErrorCode.JSON_PARSE_ERROR)
 * @param message Human-readable error message
 * @param line Optional 1-based line number
 * @param column Optional 1-based column number
 * @returns ParseError instance
 */
export function createParseError(
  code: string,
  message: string,
  line?: number,
  column?: number
): ParseError {
  const error: ParseError = {
    type: 'error',
    code,
    message
  };
  if (line !== undefined) {
    error.line = line;
  }
  if (column !== undefined) {
    error.column = column;
  }
  return error;
}
