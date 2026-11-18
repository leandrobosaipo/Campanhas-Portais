import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

// Execute the real small PHP functions, without WordPress or a production DB.
function extract(file, name) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  for (; end < source.length && depth; end++) {
    if (source[end] === '{') depth++;
    else if (source[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return source.slice(start, end);
}
const definitions = [
  ...['adrotate_adops_trim', 'adrotate_adops_period_timestamp', 'adrotate_adops_now']
    .map(name => extract('../../ops/wordpress/adrotate-adops.php', name)),
  extract('../../ops/wordpress/cod5-adops-retro-preview.php', 'cod5_adops_preview_timestamp'),
].join('\n');
const result = spawnSync(process.env.ADOPS_TEST_PHP || 'php', [], { encoding: 'utf8', input: `<?php
date_default_timezone_set('UTC');
$preview = null;
$zone = new DateTimeZone('America/Cuiaba');
function wp_timezone() { global $zone; return $zone; }
function cod5_adops_preview_datetime() { global $preview; return $preview; }
function current_time($type) { return 1787862000; }
${definitions}
$stop = adrotate_adops_period_timestamp('2026-08-27', true);
$checks = array('normal_unchanged' => adrotate_adops_now() === current_time('timestamp'));
$preview = new DateTimeImmutable('2026-08-27T20:20:00-04:00');
$checks['end_date_reference_allowed'] = adrotate_adops_now() === 1787862000 && adrotate_adops_now() <= $stop;
$checks['absolute_preview_unchanged'] = cod5_adops_preview_timestamp() === 1787876400;
$preview = new DateTimeImmutable('2026-08-28T00:20:00Z');
$checks['explicit_utc_uses_wordpress_zone'] = adrotate_adops_now() === 1787862000;
$preview = new DateTimeImmutable('2026-08-27T23:59:00-04:00');
$checks['contract_end_inclusive'] = adrotate_adops_now() === $stop;
$preview = new DateTimeImmutable('2026-08-28T00:00:00-04:00');
$checks['next_day_rejected'] = adrotate_adops_now() > $stop;
$zone = new DateTimeZone('America/New_York');
$preview = new DateTimeImmutable('2026-01-01T12:00:00Z');
$checks['historical_timezone_offset'] = adrotate_adops_now() === $preview->getTimestamp() - 18000;
echo json_encode($checks);
foreach ($checks as $ok) if (!$ok) exit(1);
` });
assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.status, 0, result.stderr || result.stdout);
const checks = JSON.parse(result.stdout);
assert.equal(Object.keys(checks).length, 7);
assert.ok(Object.values(checks).every(value => value === true));
console.log('AdRotate preview clock: 7 real-function cases passed');
