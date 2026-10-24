import { StructTree } from '../model';
import { ParseError } from './ParseError';

/**
 * Represents a successful parse operation.
 */
export interface ParseSuccess {
  /**
   * Discriminant type identifier for success result.
   */
  type: 'success';

  /**
   * The generated document structure tree.
   */
  tree: StructTree;
}

/**
 * Represents the result of a parse operation, which is either ParseSuccess or ParseError.
 */
export type ParseResult = ParseSuccess | ParseError;

/**
 * Factory function to construct a ParseSuccess object.
 *
 * @param tree The parsed StructTree
 * @returns ParseSuccess instance
 */
export function createParseSuccess(tree: StructTree): ParseSuccess {
  return {
    type: 'success',
    tree
  };
}

/**
 * Type guard to check if a ParseResult is a ParseSuccess.
 *
 * @param result ParseResult object to check
 * @returns True if result is ParseSuccess
 */
export function isParseSuccess(result: ParseResult): result is ParseSuccess {
  return result.type === 'success';
}

/**
 * Type guard to check if a ParseResult is a ParseError.
 *
 * @param result ParseResult object to check
 * @returns True if result is ParseError
 */
export function isParseError(result: ParseResult): result is ParseError {
  return result.type === 'error';
}
