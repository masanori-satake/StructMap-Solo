import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult
} from '../../errors';
import { convertObjectToStructTree } from '../common/objectConverter';

/**
 * Helper to calculate 1-based line and column numbers from character offset.
 */
function getLineAndColumnFromOffset(
  content: string,
  offset: number
): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const sub = content.slice(0, safeOffset);
  const lines = sub.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Extracts line and column number from JSON syntax error message if available.
 */
function extractJsonErrorLocation(
  err: Error,
  content: string
): { line?: number; column?: number } {
  const msg = err.message || '';
  const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1], 10),
      column: parseInt(lineColMatch[2], 10)
    };
  }
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const offset = parseInt(posMatch[1], 10);
    return getLineAndColumnFromOffset(content, offset);
  }
  if (msg.includes('Unexpected end of JSON input')) {
    return getLineAndColumnFromOffset(content, content.length);
  }
  return {};
}

/**
 * Parser that converts JSON content into a StructTree structure or ParseError.
 */
export class JsonParser {
  /**
   * Parses JSON text content into a ParseResult representation.
   *
   * @param content Raw JSON string.
   * @param fileName File name to be set as the root node name.
   * @param maxArrayItems Maximum number of array items to display directly before chunking.
   * @returns Generated ParseResult (ParseSuccess containing StructTree or ParseError).
   */
  public parse(content: string, fileName: string = 'root', maxArrayItems: number = 50): ParseResult {
    try {
      const parsed: unknown = JSON.parse(content);
      const tree = convertObjectToStructTree(parsed, fileName, 'json', maxArrayItems);
      return createParseSuccess(tree);
    } catch (err) {
      const location = extractJsonErrorLocation(err as Error, content);
      const rawMessage = (err as Error).message;
      const message = rawMessage ? `JSON Parse Error: ${rawMessage}` : 'JSON Parse Error';
      return createParseError(
        ParseErrorCode.JSON_PARSE_ERROR,
        message,
        location.line,
        location.column
      );
    }
  }
}
