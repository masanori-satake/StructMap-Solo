import * as yaml from 'js-yaml';
import { StructTree } from '../../model';
import { convertObjectToStructTree } from '../common/objectConverter';

/**
 * Parser that converts YAML content into a StructTree structure.
 */
export class YamlParser {
  /**
   * Parses YAML text content into a StructTree representation.
   *
   * @param content Raw YAML string.
   * @param fileName File name to be set as the root node name.
   * @returns Generated StructTree containing document structure.
   * @throws Error if YAML syntax is invalid.
   */
  public parse(content: string, fileName: string = 'root'): StructTree {
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new Error(`YAML parse error: ${(err as Error).message}`);
    }
    return convertObjectToStructTree(parsed, fileName, 'yaml');
  }
}
