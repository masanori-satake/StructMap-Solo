import { StructTree } from '../../model';
import { convertObjectToStructTree } from '../common/objectConverter';

/**
 * Parser that converts JSON content into a StructTree structure.
 */
export class JsonParser {
  /**
   * Parses JSON text content into a StructTree representation.
   *
   * @param content Raw JSON string.
   * @param fileName File name to be set as the root node name.
   * @returns Generated StructTree containing document structure.
   */
  public parse(content: string, fileName: string = 'root'): StructTree {
    const parsed: unknown = JSON.parse(content);
    return convertObjectToStructTree(parsed, fileName, 'json');
  }
}
