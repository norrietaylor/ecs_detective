import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import chalk from 'chalk';

export class FileScanner {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.includeTests = options.includeTests || false;
    this.includeJson = options.includeJson || false;
    this.includeYaml = options.includeYaml || false;
    this.includeMarkdown = options.includeMarkdown || false;
    
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
    
    // Build include patterns based on enabled file types
    this.includePatterns = this.buildIncludePatterns();
  }

  buildIncludePatterns() {
    // JavaScript and TypeScript files are always included (default behavior)
    const patterns = [
      '**/*.js',
      '**/*.ts',
      '**/*.tsx',
      '**/*.jsx'
    ];

    // Add other file types only if explicitly enabled
    if (this.includeJson) {
      patterns.push('**/*.json');
    }

    if (this.includeYaml) {
      patterns.push('**/*.yml', '**/*.yaml');
    }

    if (this.includeMarkdown) {
      patterns.push('**/*.md');
    }

    return patterns;
  }

  logEnabledFileTypes() {
    const enabledTypes = ['JavaScript/TypeScript (default)'];
    
    if (this.includeJson) {
      enabledTypes.push('JSON');
    }
    if (this.includeYaml) {
      enabledTypes.push('YAML');
    }
    if (this.includeMarkdown) {
      enabledTypes.push('Markdown');
    }
    
    console.log(chalk.gray(`📄 File types enabled: ${enabledTypes.join(', ')}`));
  }

  async scanDirectory(repoPath, targetDirectories = []) {
    try {
      if (this.verbose) {
        console.log(chalk.blue(`🔍 Scanning repository: ${repoPath}`));
        this.logEnabledFileTypes();
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
    
    // Skip certain file types and known minified/bundled artifacts
    const skipExtensions = ['.map', '.d.ts'];
    if (skipExtensions.includes(fileExt)) {
      return true;
    }
    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.min.js') || lowerFileName.endsWith('.bundle.js')) {
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
