import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// Define a safe directory for file operations
const SAFE_DIR = path.join(process.cwd(), 'user-files');

// Create the safe directory if it doesn't exist
if (!fs.existsSync(SAFE_DIR)) {
  try {
    fs.mkdirSync(SAFE_DIR, { recursive: true });
    console.log(`Created safe directory for file operations: ${SAFE_DIR}`);
  } catch (error) {
    console.error(`Failed to create safe directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// File operation result interface
export interface FileOperationResult {
  success: boolean;
  message: string;
  path?: string;
  error?: string;
}

/**
 * Sanitize a filename to prevent path traversal and invalid characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal elements and folder separators
  const sanitized = filename
    .replace(/\.\./g, '')  // Remove path traversal
    .replace(/[\/\\]/g, '') // Remove slashes
    .replace(/[^a-zA-Z0-9._-]/g, '_'); // Replace other invalid chars with underscore
  
  // Make sure we don't have an empty filename
  return sanitized || 'unnamed_file';
}

/**
 * Validate file content for security
 */
export function validateFileContent(content: string): boolean {
  // Check for maximum file size (1MB)
  const MAX_SIZE = 1 * 1024 * 1024; // 1MB
  if (Buffer.from(content).length > MAX_SIZE) {
    return false;
  }
  
  // Additional validations can be added here
  
  return true;
}

/**
 * Checks if a file type is allowed
 */
export function isAllowedFileType(filename: string): boolean {
  const ALLOWED_EXTENSIONS = [
    // Documents
    '.txt', '.md', '.json', '.csv', '.yaml', '.yml',
    // Source code
    '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss',
    '.py', '.rb', '.php', '.java', '.c', '.cpp', '.cs',
    // Configuration
    '.env', '.config', '.ini', '.conf'
  ];
  
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Generate a unique filename using content hash
 */
export function generateUniqueFilename(filename: string, content: string): string {
  const ext = path.extname(filename);
  const nameWithoutExt = path.basename(filename, ext);
  
  // Create a hash of the content + timestamp for uniqueness
  const hash = createHash('md5')
    .update(content)
    .update(Date.now().toString())
    .digest('hex')
    .substring(0, 8);
  
  return `${nameWithoutExt}_${hash}${ext}`;
}

/**
 * Save a file to the safe directory
 */
export async function saveFile(filename: string, content: string): Promise<FileOperationResult> {
  try {
    // Validate filename and content
    if (!filename || typeof content !== 'string') {
      return {
        success: false,
        message: 'Invalid filename or content',
        error: 'INVALID_INPUT'
      };
    }
    
    // Sanitize the filename
    const sanitizedName = sanitizeFilename(filename);
    
    // Check if file type is allowed
    if (!isAllowedFileType(sanitizedName)) {
      return {
        success: false,
        message: `File type not allowed. Permitted types include text files, code, and documents.`,
        error: 'INVALID_FILE_TYPE'
      };
    }
    
    // Validate content
    if (!validateFileContent(content)) {
      return {
        success: false,
        message: 'File content exceeds maximum size or contains invalid data',
        error: 'INVALID_CONTENT'
      };
    }
    
    // Generate a unique filename to prevent overwrites
    const uniqueFilename = generateUniqueFilename(sanitizedName, content);
    const fullPath = path.join(SAFE_DIR, uniqueFilename);
    
    // Write the file
    await fs.promises.writeFile(fullPath, content, 'utf8');
    
    return {
      success: true,
      message: `File ${uniqueFilename} created successfully`,
      path: fullPath
    };
  } catch (error) {
    console.error('Error saving file:', error);
    return {
      success: false,
      message: 'Failed to save file',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Read a file from the safe directory
 */
export async function readFile(filename: string): Promise<FileOperationResult & { content?: string }> {
  try {
    // Sanitize the filename
    const sanitizedName = sanitizeFilename(filename);
    const fullPath = path.join(SAFE_DIR, sanitizedName);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        message: `File ${sanitizedName} not found`,
        error: 'FILE_NOT_FOUND'
      };
    }
    
    // Read the file
    const content = await fs.promises.readFile(fullPath, 'utf8');
    
    return {
      success: true,
      message: `File ${sanitizedName} read successfully`,
      path: fullPath,
      content
    };
  } catch (error) {
    console.error('Error reading file:', error);
    return {
      success: false,
      message: 'Failed to read file',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * List all files in the safe directory
 */
export async function listFiles(): Promise<FileOperationResult & { files?: string[] }> {
  try {
    // Read directory
    const files = await fs.promises.readdir(SAFE_DIR);
    
    return {
      success: true,
      message: `Found ${files.length} files`,
      files
    };
  } catch (error) {
    console.error('Error listing files:', error);
    return {
      success: false,
      message: 'Failed to list files',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Delete a file from the safe directory
 */
export async function deleteFile(filename: string): Promise<FileOperationResult> {
  try {
    // Sanitize the filename
    const sanitizedName = sanitizeFilename(filename);
    const fullPath = path.join(SAFE_DIR, sanitizedName);
    
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        message: `File ${sanitizedName} not found`,
        error: 'FILE_NOT_FOUND'
      };
    }
    
    // Delete the file
    await fs.promises.unlink(fullPath);
    
    return {
      success: true,
      message: `File ${sanitizedName} deleted successfully`,
      path: fullPath
    };
  } catch (error) {
    console.error('Error deleting file:', error);
    return {
      success: false,
      message: 'Failed to delete file',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
} 