import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import chalk from 'chalk';

export class ECSFetcher {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.ecsFieldsUrl = 'https://raw.githubusercontent.com/elastic/ecs/master/generated/csv/fields.csv';
  }

  async fetchECSFields(fieldsPath = 'fields.csv') {
    try {
      // Check if local file exists first
      if (await fs.pathExists(fieldsPath)) {
        if (this.verbose) {
          console.log(chalk.blue(`📁 Using local ECS fields file: ${fieldsPath}`));
        }
        return await fs.readFile(fieldsPath, 'utf8');
      }

      // Download from GitHub if local file doesn't exist
      if (this.verbose) {
        console.log(chalk.blue(`🌐 Downloading ECS fields from: ${this.ecsFieldsUrl}`));
      }

      const response = await fetch(this.ecsFieldsUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ECS fields: ${response.status} ${response.statusText}`);
      }

      const csvContent = await response.text();
      
      // Save locally for future use
      await fs.writeFile(fieldsPath, csvContent, 'utf8');
      
      if (this.verbose) {
        console.log(chalk.green(`✅ ECS fields downloaded and saved to: ${fieldsPath}`));
      }

      return csvContent;
    } catch (error) {
      throw new Error(`Failed to fetch ECS fields: ${error.message}`);
    }
  }

  async downloadIfMissing(fieldsPath = 'fields.csv') {
    if (!(await fs.pathExists(fieldsPath))) {
      console.log(chalk.yellow(`⚠️  ECS fields file not found at ${fieldsPath}, downloading...`));
      await this.fetchECSFields(fieldsPath);
    }
  }
}
