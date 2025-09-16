import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FieldParser } from '../field-parser.js';

describe('ECS fields safety', () => {
  const parser = new FieldParser();

  test('validators should not exclude valid ECS fields from CSV', () => {
    const csvContent = `field,type,description
@timestamp,date,Event timestamp
message,text,Message
log.level,keyword,Log level
process.pid,long,Process id
event.category,keyword,Event category
user.name,keyword,User name
host.ip,ip,Host IP address`;

    const ecs = parser.parseECSFields(csvContent);

    // All parsed ECS fields should be considered valid ECS format
    for (const field of ecs) {
      assert.strictEqual(parser.isValidECSFieldName(field), true, `ECS format invalid: ${field}`);
      // And should NOT be filtered out by ES-specific validator heuristics
      assert.strictEqual(parser.isValidESFieldName(field), true, `ES validator excluded: ${field}`);
    }

    // Also ensure common sub-fields remain valid
    assert.strictEqual(parser.isValidESFieldName('process.parent.pid'), true);
    assert.strictEqual(parser.isValidESFieldName('log.logger'), true);
  });
});

