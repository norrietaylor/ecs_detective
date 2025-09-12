import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

export class FileScanner {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.includeTests = options.includeTests || false;
    // Base exclude patterns for common build artifacts
    this.baseExcludePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.git/**',
      '**/target/**',
      '**/*.min.js',
      '**/*.bundle.js',
      '**/*.map',
      '**/docs/**'
    ];

    // Test-related exclude patterns
    this.testExcludePatterns = [
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      '**/*.test.*',
      '**/*.spec.*'
    ];

    // Combine patterns based on includeTests setting
    this.excludePatterns = this.includeTests 
      ? this.baseExcludePatterns 
      : [...this.baseExcludePatterns, ...this.testExcludePatterns];
    
    this.includePatterns = [
      '**/*.js',
      '**/*.ts',
      '**/*.tsx',
      '**/*.jsx',
      '**/*.json',
      '**/*.yml',
      '**/*.yaml',
      '**/*.md'
    ];
  }

  async scanDirectory(repoPath, targetDirectories = []) {
    try {
      if (this.verbose) {
        console.log(chalk.blue(`🔍 Scanning repository: ${repoPath}`));
      }

      // Validate repository path
      if (!(await fs.pathExists(repoPath))) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
      }

      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        throw new Error(`Repository path is not a directory: ${repoPath}`);
      }

      // Build search patterns
      const searchPatterns = this.buildSearchPatterns(repoPath, targetDirectories);
      
      if (this.verbose) {
        console.log(chalk.gray(`Search patterns: ${searchPatterns.join(', ')}`));
      }

      // Find all matching files
      const allFiles = [];
      for (const pattern of searchPatterns) {
        const files = await glob(pattern, {
          ignore: this.excludePatterns,
          absolute: true,
          nodir: true
        });
        
        // Additional filter for test directories (glob ignore might not catch all cases)
        const filteredFiles = this.includeTests 
          ? files 
          : files.filter(file => !this.isTestFile(file));
          
        allFiles.push(...filteredFiles);
      }

      // Remove duplicates and sort
      const uniqueFiles = [...new Set(allFiles)].sort();

      if (this.verbose) {
        console.log(chalk.green(`✅ Found ${uniqueFiles.length} files to analyze`));
      }

      return uniqueFiles;
    } catch (error) {
      throw new Error(`Failed to scan directory: ${error.message}`);
    }
  }

  buildSearchPatterns(repoPath, targetDirectories) {
    const patterns = [];

    if (targetDirectories.length === 0) {
      // Scan entire repository
      for (const include of this.includePatterns) {
        patterns.push(path.join(repoPath, include));
      }
    } else {
      // Scan specific directories
      for (const dir of targetDirectories) {
        const fullDirPath = path.resolve(repoPath, dir);
        for (const include of this.includePatterns) {
          patterns.push(path.join(fullDirPath, include));
        }
      }
    }

    return patterns;
  }

  async readFileContent(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content;
    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Could not read file ${filePath}: ${error.message}`));
      }
      return null;
    }
  }

  isTestFile(filePath) {
    const normalizedPath = filePath.toLowerCase();
    
    // Check for test directory patterns
    const testPatterns = [
      '/test/',
      '/tests/', 
      '/__tests__/',
      '.test.',
      '.spec.'
    ];
    
    return testPatterns.some(pattern => normalizedPath.includes(pattern));
  }

  shouldSkipFile(filePath) {
    // Skip test files if not including tests
    if (!this.includeTests && this.isTestFile(filePath)) {
      return true;
    }

    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath).toLowerCase();
    
    // Skip certain file types
    const skipExtensions = ['.map', '.min.js', '.bundle.js', '.d.ts'];
    if (skipExtensions.includes(fileExt)) {
      return true;
    }

    // Skip certain file names
    const skipFiles = ['package-lock.json', 'yarn.lock', '.gitignore'];
    if (skipFiles.includes(fileName)) {
      return true;
    }

    // Skip very large files (> 1MB)
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 1024 * 1024) {
        if (this.verbose) {
          console.log(chalk.yellow(`⚠️  Skipping large file: ${filePath} (${Math.round(stats.size / 1024)}KB)`));
        }
        return true;
      }
    } catch (error) {
      return true;
    }

    return false;
  }

  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    // Map extensions to file types
    const typeMap = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.json': 'json',
      '.yml': 'yaml',
      '.yaml': 'yaml',
      '.md': 'markdown',
      '.txt': 'text'
    };

    return typeMap[ext] || 'unknown';
  }
}
