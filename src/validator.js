import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export class Validator {
  static async validateInputs(options) {
    const errors = [];
    const warnings = [];

    // Validate repository path
    try {
      const repoPath = path.resolve(options.repo);
      if (!(await fs.pathExists(repoPath))) {
        errors.push(`Repository path does not exist: ${repoPath}`);
      } else {
        const stats = await fs.stat(repoPath);
        if (!stats.isDirectory()) {
          errors.push(`Repository path is not a directory: ${repoPath}`);
        }
      }
    } catch (error) {
      errors.push(`Error validating repository path: ${error.message}`);
    }

    // Validate directories if specified
    if (options.directories && options.directories.length > 0) {
      for (const dir of options.directories) {
        if (!dir || dir.trim() === '') {
          warnings.push('Empty directory specified, skipping');
          continue;
        }

        try {
          const fullPath = path.resolve(options.repo, dir.trim());
          if (!(await fs.pathExists(fullPath))) {
            warnings.push(`Target directory does not exist: ${dir}`);
          } else {
            const stats = await fs.stat(fullPath);
            if (!stats.isDirectory()) {
              warnings.push(`Target path is not a directory: ${dir}`);
            }
          }
        } catch (error) {
          warnings.push(`Error validating directory ${dir}: ${error.message}`);
        }
      }
    }

    // Validate fields CSV if it exists locally
    if (options.fieldsCsv && options.fieldsCsv !== 'fields.csv') {
      try {
        const csvPath = path.resolve(options.fieldsCsv);
        if (await fs.pathExists(csvPath)) {
          const stats = await fs.stat(csvPath);
          if (!stats.isFile()) {
            errors.push(`Fields CSV path is not a file: ${csvPath}`);
          } else if (stats.size === 0) {
            warnings.push('Fields CSV file is empty');
          }
        }
      } catch (error) {
        warnings.push(`Error validating fields CSV: ${error.message}`);
      }
    }

    // Validate output path if specified
    if (options.output) {
      try {
        const outputPath = path.resolve(options.output);
        const outputDir = path.dirname(outputPath);
        
        if (!(await fs.pathExists(outputDir))) {
          try {
            await fs.ensureDir(outputDir);
          } catch (error) {
            errors.push(`Cannot create output directory: ${outputDir}`);
          }
        }

        // Check if output file exists and is writable
        if (await fs.pathExists(outputPath)) {
          try {
            await fs.access(outputPath, fs.constants.W_OK);
          } catch (error) {
            errors.push(`Output file is not writable: ${outputPath}`);
          }
        }
      } catch (error) {
        errors.push(`Error validating output path: ${error.message}`);
      }
    }

    return { errors, warnings };
  }

  static displayValidationResults(errors, warnings, verbose = false) {
    if (errors.length > 0) {
      console.error(chalk.red('\n❌ Validation Errors:'));
      errors.forEach(error => {
        console.error(chalk.red(`  • ${error}`));
      });
      return false;
    }

    if (warnings.length > 0 && verbose) {
      console.log(chalk.yellow('\n⚠️  Validation Warnings:'));
      warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    return true;
  }

  static validateFieldName(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') {
      return false;
    }

    // ECS field names should be dot-notation with alphanumeric characters and underscores
    return /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName);
  }

  static validateCSVContent(csvContent) {
    if (!csvContent || typeof csvContent !== 'string') {
      throw new Error('CSV content is empty or invalid');
    }

    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('CSV file must contain at least a header and one data row');
    }

    // Check for common CSV issues
    const header = lines[0];
    if (!header.includes('field')) {
      console.warn(chalk.yellow('⚠️  CSV header does not contain "field" column, field detection may not work properly'));
    }

    return true;
  }

  static sanitizePath(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      return '';
    }

    // Remove any potentially dangerous characters
    return inputPath.replace(/[<>:"|?*]/g, '').trim();
  }

  static validateMemoryUsage() {
    const usage = process.memoryUsage();
    const maxMemory = 1024 * 1024 * 1024; // 1GB limit

    if (usage.heapUsed > maxMemory) {
      console.warn(chalk.yellow(`⚠️  High memory usage detected: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`));
      console.warn(chalk.yellow('    Consider analyzing smaller directory sets to reduce memory usage'));
    }

    return usage.heapUsed < maxMemory;
  }
}
