/**
 * Common API/member patterns that are not Elasticsearch field names.
 * This merges patterns used across extractors; JS extractor precedence on conflicts.
 */
export function isCommonAPIPattern(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }

  const apiPatterns = [
    // Kibana/Express routing patterns
    /^router\./i,
    /^app\./i,
    /^request\./i,
    /^response\./i,
    /^res\./i,
    /^req\./i,

    // Console and logging (allow ECS log.* namespace)
    /^console\./i,
    /^logger\./i,

    // Node.js/JavaScript built-ins (allow ECS process.* namespace)
    /^module\./i,
    /^require\./i,
    /^global\./i,
    /^window\./i,
    /^document\./i,

    // Framework patterns
    /^React\./i,
    /^Vue\./i,
    /^Angular\./i,
    /^jQuery\./i,
    /^_\./i,

    // Common object methods
    /^Object\./i,
    /^Array\./i,
    /^String\./i,
    /^Number\./i,
    /^Date\./i,
    /^Math\./i,
    /^JSON\./i,

    // Test frameworks
    /^jest\./i,
    /^expect\./i,
    /^describe\./i,
    /^it\./i,
    /^test\./i,

    // Configuration and options
    /^config\./i,
    /^options\./i,
    /^settings\./i,
    /^params\./i,

    // HTTP and networking
    /^http\./i,
    /^https\./i,
    /^fetch\./i,
    /^axios\./i,
    
  ];

  return apiPatterns.some(pattern => pattern.test(fieldName));
}

/**
 * Basic validation for field-like names without special prefixes.
 */
export function isBasicFieldNameFormat(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }

  const isValid = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) && fieldName.length > 1;
  return isValid && (fieldName.includes('.') || fieldName.length > 2);
}

/**
 * Validation for extracted names that allows leading '.' and '@' prefixes.
 */
export function isValidFieldNameWithPrefixes(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }

  const isValid = /^[@.]?[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) && fieldName.length > 1;
  return isValid && (fieldName.includes('.') || fieldName.length > 2);
}

/**
 * ES-oriented validation used by the JS extractor; allows '@timestamp' and excludes many artifacts.
 */
export function isValidESFieldName(fieldName) {
  if (fieldName === '@timestamp') {
    return true;
  }

  if (!isValidFieldNameWithPrefixes(fieldName)) {
    return false;
  }

  // Exclude file-like patterns
  const filePatterns = [
    /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i,
    /\.(css|scss|less|sass)$/i,
    /\.(html|htm|xml|xhtml)$/i,
    /\.(js|ts|jsx|tsx|mjs|cjs)$/i,
    /\.(json|yaml|yml|toml|ini|cfg)$/i,
    /\.(txt|md|rst|log)$/i,
    /\.(woff|woff2|ttf|eot|otf)$/i,
    /\.(mp4|avi|mov|webm|mp3|wav|ogg)$/i,
    /\.(zip|tar|gz|rar|7z|dmg|iso)$/i,
    /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i
  ];
  if (filePatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude URLs/domains
  const urlPatterns = [
    /^https?:\/\//i,
    /^ftp:\/\//i,
    /^[a-zA-Z0-9-]+\.(com|org|net|edu|gov|mil|co|io|ly|me|ai|dev)$/i,
    /^www\./i,
    /github\.com/i,
    /elastic\.co/i,
    /mitre\.org/i,
    /mozilla\.org/i,
    /stackoverflow\.com/i,
    /malpedia\./i
  ];
  if (urlPatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude image/asset references
  const assetPatterns = [
    /^image\d*\.(png|jpg|jpeg|gif|svg)$/i,
    /^icon\d*\.(png|jpg|jpeg|gif|svg)$/i,
    /^logo\d*\.(png|jpg|jpeg|gif|svg)$/i,
    /^background\d*\.(png|jpg|jpeg|gif|svg)$/i,
    /^screenshot\d*\.(png|jpg|jpeg|gif|svg)$/i,
    /assets\./i,
    /static\./i
  ];
  if (assetPatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude abbreviations and common text artifacts
  const textPatterns = [
    /^e\.g$/i,
    /^i\.e$/i,
    /^etc$/i,
    /^vs$/i,
    /^cmd\.exe$/i,
    /^powershell\.exe$/i
  ];
  if (textPatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude Windows executables and DLLs (bare names only)
  const windowsExecutablePatterns = [
    /^[^.]*\.(exe|dll|bat|msi|scr)$/i,
    /^cmd$/i,
    /^(rundll32|regsvr32|svchost|explorer|winlogon|csrss|lsass|spoolsv|services|smss|wininit|dwm|taskhost|dllhost|msiexec|setup|install)\.exe$/i,
    /^(ntdll|kernel32|user32|gdi32|advapi32|ole32|shell32|comctl32|msvcrt|ws2_32)\.dll$/i
  ];
  if (windowsExecutablePatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude UI/Dashboard configuration patterns
  const uiConfigPatterns = [
    /^gridData\./i,
    /^embeddableConfig\./i,
    /^panelConfig\./i,
    /^dashboardConfig\./i,
    /^visualizationConfig\./i,
    /^layoutConfig\./i,
    /^uiState\./i,
    /^appState\./i,
    /^globalState\./i,
    /^columns\./i,
    /^dataProviders\./i,
    /^meta\.anything/i,
    /anything_you_want/i,
    /^ui_/i,
    /^example\./i,
    /^template\./i
  ];
  if (uiConfigPatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Exclude VSCode/IDE extension references and domain fragments
  const idePatterns = [
    /^[a-z]+\.(markdown|extension|plugin)$/i,
    /^vscode\./i,
    /^extensions\./i,
    /^settings\./i,
    /^ela\.st$/i,
    /^[a-z]{2,3}\.[a-z]{2,3}$/i
  ];
  if (idePatterns.some(pattern => pattern.test(fieldName))) {
    return false;
  }

  // Additional JS artifacts to exclude
  const jsArtifacts = [
    'jest.fn', 'jest.mock', 'jest.Mock', 'jest.clearAllMocks', 'jest.resetAllMocks',
    'React.memo', 'React.Component', 'React.useState', 'React.useEffect',
    'i18n.translate', 'console.log', 'console.error', 'console.warn',
    'window.location', 'document.getElementById', 'Object.keys', 'JSON.stringify',
    'Array.from', 'String.prototype', 'Number.prototype', 'Math.random',
    'process.env', 'module.exports', 'require.resolve', 'B.V'
  ];
  if (jsArtifacts.some(artifact => fieldName.includes(artifact))) {
    return false;
  }

  // Reject common API/member patterns
  if (isCommonAPIPattern(fieldName)) {
    return false;
  }

  // Require dot-notation except for a small allowlist
  const singleWordECSFields = ['@timestamp', 'message', 'tags', 'labels', 'error', 'level'];
  if (!fieldName.includes('.') && !singleWordECSFields.includes(fieldName)) {
    return false;
  }

  const isValidFormat = /^[a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) &&
         fieldName.length > 1 &&
         !fieldName.includes('..') &&
         !fieldName.startsWith('.') &&
         !fieldName.endsWith('.');

  return isValidFormat;
}

/**
 * Lightweight ECS format check (including '@' prefix) for keys.
 */
export function isECSFieldKeyFormat(fieldName) {
  if (!fieldName || typeof fieldName !== 'string') {
    return false;
  }
  return /^[a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) && fieldName.length > 1;
}

