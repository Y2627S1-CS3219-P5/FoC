/**
 * AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-09-27.
 * Scope: Added disposable Compose orchestration for the real-browser Supplier
 * UI verification in issue #31.
 * Author review: Reviewed and approved by @ron.
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(frontendDirectory, '..')
const projectName = `foc-supplier-ui-${process.pid}-${randomUUID().slice(0, 8)}`
const [frontendPort, userPort, supplierPort] = await reserveAvailablePorts(3)
const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`
const adminUsername = 'supplier_ui_admin'
const adminPassword = 'SupplierUiAdmin1'
const memberUsername = 'supplier_ui_member'
const memberPassword = 'SupplierUiMember1'

const environment = {
  ...process.env,
  JWT_SECRET: 'supplier-ui-smoke-only-jwt-secret-32-characters',
  SUPPLIER_DB_ADMIN_PASSWORD: 'supplier-ui-smoke-admin-password',
  SUPPLIER_DB_MIGRATION_PASSWORD: 'supplier-ui-smoke-migration-password',
  SUPPLIER_DB_PASSWORD: 'supplier-ui-smoke-runtime-password',
  ALLOWED_EMAIL_DOMAIN: 'u.nus.edu',
  BOOTSTRAP_ADMIN_USERNAME: adminUsername,
  BOOTSTRAP_ADMIN_EMAIL: 'supplier-ui-admin@u.nus.edu',
  BOOTSTRAP_ADMIN_PASSWORD: adminPassword,
  FRONTEND_PORT: String(frontendPort),
  USER_PORT: String(userPort),
  SUPPLIER_PORT: String(supplierPort),
  SUPPLIER_UI_BASE_URL: frontendBaseUrl,
  SUPPLIER_UI_ADMIN_USERNAME: adminUsername,
  SUPPLIER_UI_ADMIN_PASSWORD: adminPassword,
  SUPPLIER_UI_MEMBER_USERNAME: memberUsername,
  SUPPLIER_UI_MEMBER_EMAIL: 'supplier-ui-member@u.nus.edu',
  SUPPLIER_UI_MEMBER_PASSWORD: memberPassword,
}

let stackStarted = false

try {
  run('docker', ['info'], { capture: true })
  compose(['up', '--build', '--detach'])
  stackStarted = true

  await Promise.all([
    waitFor(`http://127.0.0.1:${userPort}/health`, 'User Service'),
    waitFor(`http://127.0.0.1:${supplierPort}/health`, 'Supplier Service'),
    waitFor(frontendBaseUrl, 'frontend gateway'),
  ])

  console.log(`\nRunning the real-browser Supplier UI journey at ${frontendBaseUrl}...`)
  run(localPlaywright(), ['test'], { cwd: frontendDirectory })
  console.log('\nPASS: live member/admin Supplier UI journeys and responsive overflow checks completed.')
} catch (error) {
  if (stackStarted) {
    console.error('\nDisposable stack status:')
    try { compose(['ps']) } catch { /* retain the original failure */ }
    console.error('\nRelevant service logs:')
    try { compose(['logs', '--no-color', '--tail', '120', 'frontend', 'user-service', 'supplier-service']) } catch { /* retain the original failure */ }
  }
  throw error
} finally {
  console.log(`\nRemoving disposable Compose project ${projectName} and its volumes...`)
  try { compose(['down', '--volumes', '--remove-orphans'], { capture: true }) } catch (cleanupError) {
    console.error('Warning: automatic cleanup failed. Run:')
    console.error(`docker compose --project-name ${projectName} down --volumes --remove-orphans`)
    console.error(cleanupError)
  }
}

function compose(args, options = {}) {
  return run('docker', ['compose', '--project-name', projectName, ...args], {
    ...options,
    cwd: repositoryRoot,
  })
}

function run(command, args, { capture = false, cwd = repositoryRoot } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr || result.stdout}` : ''
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}.${detail}`)
  }
  return result.stdout
}

async function waitFor(url, description) {
  let lastFailure
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastFailure = new Error(`${description} returned ${response.status}`)
    } catch (error) {
      lastFailure = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`${description} did not become ready at ${url}`, { cause: lastFailure })
}

async function reserveAvailablePorts(count) {
  const servers = await Promise.all(Array.from({ length: count }, () => listenOnAvailablePort()))
  const ports = servers.map(({ port }) => port)
  await Promise.all(servers.map(({ server }) => new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose())
  })))
  return ports
}

function listenOnAvailablePort() {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer()
    server.unref()
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        rejectListen(new Error('Could not reserve an available TCP port.'))
        return
      }
      resolveListen({ server, port: address.port })
    })
  })
}

function localPlaywright() {
  const executable = process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  return resolve(frontendDirectory, 'node_modules', '.bin', executable)
}
