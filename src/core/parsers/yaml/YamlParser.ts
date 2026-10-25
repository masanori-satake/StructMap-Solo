import * as yaml from 'js-yaml';
import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult
} from '../../errors';
import { convertObjectToStructTree } from '../common/objectConverter';

/**
 * Extracts line and column number from YAML parse exception mark if available.
 */
function extractYamlErrorLocation(err: unknown): { line?: number; column?: number } {
  if (err && typeof err === 'object' && 'mark' in err && err.mark) {
    const mark = (err as { mark: { line?: unknown; column?: unknown } }).mark;
    const line = typeof mark.line === 'number' ? mark.line + 1 : undefined;
    const column = typeof mark.column === 'number' ? mark.column + 1 : undefined;
    return { line, column };
  }
  return {};
}

/**
 * Parser that converts YAML content into a StructTree structure or ParseError.
 */
export class YamlParser {
  /**
   * Parses YAML text content into a ParseResult representation.
   *
   * @param content Raw YAML string.
   * @param fileName File name to be set as the root node name.
   * @param maxArrayItems Maximum number of array items to display directly before chunking.
   * @returns Generated ParseResult (ParseSuccess containing StructTree or ParseError).
   */
  public parse(content: string, fileName: string = 'root', maxArrayItems: number = 50): ParseResult {
    try {
      const parsed: unknown = yaml.load(content);
      const tree = convertObjectToStructTree(parsed, fileName, 'yaml', maxArrayItems);
      return createParseSuccess(tree);
    } catch (err) {
      const location = extractYamlErrorLocation(err);
      const rawMessage = (err as Error).message;
      const message = rawMessage ? `YAML Parse Error: ${rawMessage}` : 'YAML Parse Error';
      return createParseError(
        ParseErrorCode.YAML_PARSE_ERROR,
        message,
        location.line,
        location.column
      );
    }
  }
}
