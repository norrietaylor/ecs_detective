# Quick Start Guide

## Installation and Setup

1. **Clone and Install**:
```bash
git clone <repository-url>
cd kibana-ecs-analyzer
npm install
```

2. **Basic Usage**:
```bash
# Analyze the entire Kibana repository (assuming ./kibana exists)
npm start

# Analyze specific directories
npm start -- --directories "src/plugins,x-pack/plugins"

# Use a custom repository path
npm start -- --repo /path/to/kibana

# Save results to a file
npm start -- --output analysis-results.json

# Enable verbose logging
npm start -- --verbose
```

## Example Output

When you run the tool on a sample directory, you'll see output like this:

```
🔍 Starting Kibana ECS Field Analysis...

📥 Step 1: Loading ECS field definitions...
✅ Parsed 1818 core ECS fields

🔍 Step 2: Scanning repository files...
✅ Found 1,234 files to analyze

📊 Step 3: Analyzing 1,234 files...

📊 Analysis Results:
==================================================

📁 File Statistics:
Total files parsed: 1,234
Files with ONLY core ECS fields: 567
Files with custom/vendor fields: 432

🎯 Core ECS Field Usage:
Total core fields referenced: 89

Top 10 core fields by usage:
  1. @timestamp - 345 occurrences
  2. message - 234 occurrences
  3. user.name - 187 occurrences
  4. host.ip - 156 occurrences
  5. event.category - 134 occurrences
  ...

🔧 Custom/Vendor Field Usage:
Total custom/vendor fields referenced: 67

Top 10 custom/vendor fields by usage:
  1. kibana.space.id - 89 occurrences
  2. kibana.version - 67 occurrences
  3. custom.dashboard.id - 45 occurrences
  ...
```

## Command Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--directories` | Comma-separated directories to scan | `--directories "src,x-pack"` |
| `--fields-csv` | Custom ECS fields CSV file | `--fields-csv ./my-fields.csv` |
| `--repo` | Kibana repository path | `--repo /usr/local/kibana` |
| `--output` | Save results to JSON file | `--output results.json` |
| `--verbose` | Enable detailed logging | `--verbose` |

## Understanding the Results

### File Statistics
- **Total files parsed**: All files that were successfully analyzed
- **Files with ONLY core ECS fields**: Files containing exclusively ECS-defined fields
- **Files with custom/vendor fields**: Files containing non-ECS fields

### Field Analysis
- **Core fields**: Fields defined in the official ECS specification
- **Custom/vendor fields**: Fields not found in the ECS specification
- **Usage rankings**: Fields sorted by frequency of occurrence

## Tips for Analysis

1. **Start with specific directories** if analyzing the entire repository is too slow
2. **Use verbose mode** to see detailed processing information
3. **Save results to JSON** for further analysis or reporting
4. **Focus on high-usage custom fields** as candidates for ECS standardization

## Common Use Cases

### Finding ECS Adoption Rate
```bash
npm start -- --repo ./kibana --output adoption-report.json
```

### Analyzing Specific Plugins
```bash
npm start -- --directories "x-pack/plugins/security" --verbose
```

### Custom Field Discovery
```bash
npm start -- --output custom-fields.json
# Then analyze the topCustomFields in the JSON output
```
