import { createParseError, ParseErrorCode, ParseResult } from '../errors';
import { JsonParser, MarkdownParser, YamlParser } from '../parsers';

/**
 * Service providing a unified entry point to build a StructTree from various file formats.
 */
export class StructMapService {
  private markdownParser = new MarkdownParser();
  private jsonParser = new JsonParser();
  private yamlParser = new YamlParser();

  /**
   * Builds a ParseResult (ParseSuccess or ParseError) based on the file extension and content.
   *
   * @param fileName Name or path of the file to parse.
   * @param content Raw text content of the file.
   * @param maxFileSizeMB Maximum allowed file size in megabytes (default 5).
   * @returns ParseResult containing StructTree on success, or ParseError on failure.
   */
  public build(fileName: string, content: string, maxFileSizeMB: number = 5): ParseResult {
    const ext = this.getFileExtension(fileName);

    if (!ext || !this.isSupportedExtension(ext)) {
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

    switch (ext) {
      case '.md':
      case '.markdown':
        return this.markdownParser.parse(content, fileName);
      case '.json':
        return this.jsonParser.parse(content, fileName);
      case '.yml':
      case '.yaml':
        return this.yamlParser.parse(content, fileName);
      default:
        return createParseError(
          ParseErrorCode.UNSUPPORTED_FORMAT,
          `Unsupported file format: ${fileName}`
        );
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
      ext === '.yaml'
    );
  }

  /**
   * Determines whether the specified file format supports type information display.
   *
   * @param fileName Name or path of the file.
   * @returns True if the file format supports types (e.g. JSON, YAML), false otherwise (e.g. Markdown, unsupported).
   */
  public supportsTypes(fileName?: string): boolean {
    if (!fileName) {
      return false;
    }
    const ext = this.getFileExtension(fileName);
    return ext === '.json' || ext === '.yml' || ext === '.yaml';
  }
}
