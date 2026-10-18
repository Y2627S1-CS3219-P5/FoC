// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: issue #52 real-Nginx query/header redaction and health-log regression.
// Author review: PENDING.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    image: { type: 'string' },
    'bundled-cloud-only': { type: 'boolean', default: false },
  },
})
assert.ok(values.image, 'Pass --image with an existing local gateway image; this test never pulls images.')
const imageId = docker(['image', 'inspect', '--format', '{{.Id}}', values.image]).trim()
assert.match(imageId, /^sha256:[a-f0-9]{64}$/, 'Docker must resolve one exact existing local image')
const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const variants = values['bundled-cloud-only'] ? ['bundled cloud'] : ['cloud', 'local']

for (const variant of variants) await checkGateway(variant)

async function checkGateway(variant) {
  const container = `foc-nginx-log-check-${randomUUID()}`
  const marker = `dummy_query_${randomUUID()}`
  const headerMarker = `dummy_header_${randomUUID()}`
  const healthMarker = `dummy_health_${randomUUID()}`
  const args = [
    'run', '--detach', '--rm', '--pull', 'never', '--network', 'none',
    '--platform', 'linux/amd64', '--name', container,
  ]
  for (const upstream of ['user-service', 'supplier-service', 'order-service']) {
    args.push('--add-host', `${upstream}:127.0.0.1`)
  }
  if (variant !== 'bundled cloud') {
    const filename = variant === 'cloud' ? 'nginx.cloud.conf' : 'nginx.conf'
    args.push('--mount', `type=bind,source=${resolve(frontendDirectory, filename)},target=/etc/nginx/conf.d/default.conf,readonly`)
  }
  args.push(imageId)
  try {
    docker(args)
    let ready = false
    const readyDeadline = Date.now() + 15_000
    while (Date.now() < readyDeadline) {
      const health = invoke(['exec', container, 'wget', '-q', '-O', '/dev/null', `http://127.0.0.1/healthz?${healthMarker}`])
      if (health.status === 0) { ready = true; break }
      await new Promise(resolveWait => setTimeout(resolveWait, 100))
    }
    assert.ok(ready, `${variant} gateway did not become healthy`)
    docker([
      'exec', container, 'wget', '-q', '-O', '/dev/null',
      '--header', `Authorization: Bearer ${headerMarker}`,
      '--header', `Cookie: demo=${headerMarker}`,
      `http://127.0.0.1/?${marker}=dummy`,
    ])
    const logs = docker(['logs', container])
    const defaultMainFormat = /"GET \/\?[^\n]* HTTP\/1\.[01]" 200 /.test(logs)
    assert.ok(!logs.includes(marker), `${variant}: query marker leaked into stdout/stderr; default-main-format=${defaultMainFormat}`)
    assert.ok(!logs.includes(headerMarker), `${variant}: dummy Authorization/Cookie marker leaked into stdout/stderr`)
    assert.ok(!logs.includes(healthMarker), `${variant}: health request was logged`)
    const completions = logs.split('\n').filter(line => /^127\.0\.0\.1 - GET /.test(line))
    assert.equal(completions.length, 1, `${variant}: expected exactly one redacted request completion`)
    assert.match(completions[0], /^127\.0\.0\.1 - GET \/index\.html HTTP\/1\.[01] 200 \d+ \d+\.\d+$/)
    console.log(`PASS: ${variant} Nginx emits one redacted completion, no query/header markers, and no health access log`)
  } finally {
    // Only the exact unique container created by this invocation is removed.
    const cleanup = invoke(['rm', '--force', container])
    assert.equal(cleanup.status, 0, `Could not remove isolated test container ${container}`)
  }
}

function invoke(args) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout: 20_000 })
}

function docker(args) {
  const result = invoke(args)
  // Never print raw logs or command output: assertions expose only dummy-marker
  // presence and counts, not request payloads, headers, or environment contents.
  assert.equal(result.status, 0, `Docker ${args[0]} failed (exit ${result.status}); raw output suppressed`)
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}
