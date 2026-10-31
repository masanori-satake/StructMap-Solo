import { createParseError, ParseErrorCode, ParseResult } from '../errors';
import {
  isJsonSchema,
  JsonParser,
  JsonSchemaParser,
  MarkdownParser,
  TomlParser,
  XmlParser,
  YamlParser,
} from '../parsers';
import { resolveParserByCustomMappings } from '../utils/mappingResolver';

/**
 * Service providing a unified entry point to build a StructTree from various file formats.
 */
export class StructMapService {
  private markdownParser = new MarkdownParser();
  private jsonParser = new JsonParser();
  private jsonSchemaParser = new JsonSchemaParser();
  private yamlParser = new YamlParser();
  private xmlParser = new XmlParser();
  private tomlParser = new TomlParser();

  /**
   * Builds a ParseResult (ParseSuccess or ParseError) based on the file extension, custom mappings, and content.
   *
   * @param fileName Name or path of the file to parse.
   * @param content Raw text content of the file.
   * @param maxFileSizeMB Maximum allowed file size in megabytes (default 5).
   * @param maxArrayItems Maximum number of array items to display directly before chunking (default 50).
   * @param customMappings Custom glob pattern mappings to format names (e.g. { '*_config.json': 'json' }).
   * @returns ParseResult containing StructTree on success, or ParseError on failure.
   */
  public build(
    fileName: string,
    content: string,
    maxFileSizeMB: number = 5,
    maxArrayItems: number = 50,
    customMappings?: Record<string, string>
  ): ParseResult {
    const customFormat = resolveParserByCustomMappings(fileName, customMappings);
    const ext = this.getFileExtension(fileName);

    if (!customFormat && (!ext || !this.isSupportedExtension(ext))) {
      return createParseError(
        ParseErrorCode.UNSUPPORTED_FORMAT,
        `Unsupported file format: ${fileName}`
      );
    }

    const contentSizeBytes =
      typeof Buffer !== 'undefined'
        ? Buffer.byteLength(content, 'utf8')
        : new TextEncoder().encode(content).length;
    const contentSizeMB = contentSizeBytes / (1024 * 1024);

    if (maxFileSizeMB > 0 && contentSizeMB > maxFileSizeMB) {
      return createParseError(
        ParseErrorCode.FILE_TOO_LARGE,
        `Current: ${contentSizeMB} MB\nLimit: ${maxFileSizeMB} MB`
      );
    }

    if (!content || content.trim() === '') {
      return createParseError(
        ParseErrorCode.EMPTY_FILE,
        `File is empty: ${fileName}`
      );
    }

    const targetFormat = customFormat ? customFormat.toLowerCase() : undefined;

    if (targetFormat) {
      switch (targetFormat) {
        case 'markdown':
        case 'md':
          return this.markdownParser.parse(content, fileName, maxArrayItems);
        case 'jsonschema':
        case 'schema':
        case 'json-schema':
          return this.jsonSchemaParser.parse(content, fileName, maxArrayItems);
        case 'json':
          return this.parseJsonWithSchemaDetection(content, fileName, maxArrayItems);
        case 'yaml':
        case 'yml':
          return this.yamlParser.parse(content, fileName, maxArrayItems);
        case 'xml':
          return this.xmlParser.parse(content, fileName, maxArrayItems);
        case 'toml':
          return this.tomlParser.parse(content, fileName, maxArrayItems);
        default:
          return createParseError(
            ParseErrorCode.UNSUPPORTED_FORMAT,
            `Unsupported file format: ${fileName}`
          );
      }
    }

    switch (ext) {
      case '.md':
      case '.markdown':
        return this.markdownParser.parse(content, fileName, maxArrayItems);
      case '.json':
        return this.parseJsonWithSchemaDetection(content, fileName, maxArrayItems);
      case '.yml':
      case '.yaml':
        return this.yamlParser.parse(content, fileName, maxArrayItems);
      case '.xml':
        return this.xmlParser.parse(content, fileName, maxArrayItems);
      case '.toml':
        return this.tomlParser.parse(content, fileName, maxArrayItems);
      default:
        return createParseError(
          ParseErrorCode.UNSUPPORTED_FORMAT,
          `Unsupported file format: ${fileName}`
        );
    }
  }

  /**
   * Parses JSON content, automatically detecting JSON Schema keywords ($schema, properties, definitions, $defs).
   */
  private parseJsonWithSchemaDetection(
    content: string,
    fileName: string,
    maxArrayItems: number
  ): ParseResult {
    try {
      const parsed = JSON.parse(content);
      if (isJsonSchema(parsed)) {
        return this.jsonSchemaParser.parse(content, fileName, maxArrayItems);
      }
      return this.jsonParser.parse(content, fileName, maxArrayItems);
    } catch {
      // If JSON.parse fails, let JsonParser report syntax error with line/column
      return this.jsonParser.parse(content, fileName, maxArrayItems);
    }
  }

  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) {
      return '';
    }
    return fileName.slice(lastDot).toLowerCase();
  }

  private isSupportedExtension(ext: string): boolean {
    return (
      ext === '.md' ||
      ext === '.markdown' ||
      ext === '.json' ||
      ext === '.yml' ||
      ext === '.yaml' ||
      ext === '.xml' ||
      ext === '.toml'
    );
  }

  /**
   * Determines whether the specified file format supports type information display.
   *
   * @param fileName Name or path of the file.
   * @returns True if the file format supports types (e.g. JSON, YAML, XML), false otherwise (e.g. Markdown, unsupported).
   */
  public supportsTypes(fileName?: string, customMappings?: Record<string, string>): boolean {
    if (!fileName) {
      return false;
    }
    const customFormat = resolveParserByCustomMappings(fileName, customMappings);
    if (customFormat) {
      const fmt = customFormat.toLowerCase();
      return (
        fmt === 'json' ||
        fmt === 'yaml' ||
        fmt === 'yml' ||
        fmt === 'xml' ||
        fmt === 'toml' ||
        fmt === 'jsonschema' ||
        fmt === 'schema' ||
        fmt === 'json-schema'
      );
    }

    const ext = this.getFileExtension(fileName);
    return ext === '.json' || ext === '.yml' || ext === '.yaml' || ext === '.xml' || ext === '.toml';
  }
}
