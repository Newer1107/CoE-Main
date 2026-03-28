import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();
const migrationsDir = path.join(rootDir, 'prisma', 'migrations');
const schemaPath = path.join('prisma', 'schema.prisma');

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      shell: process.platform === 'win32',
      ...options,
    });

    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdout += text;
        process.stdout.write(text);
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(text);
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });

const runCapture = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      shell: process.platform === 'win32',
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}\n${stderr}`));
    });
  });

const timestamp = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${MM}${dd}${hh}${mm}${ss}`;
};

const sanitizeName = (input) =>
  input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'migration';

const createMigration = async (nameArg) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in environment to diff current DB schema safely.');
  }

  const migrationName = sanitizeName(nameArg || 'migration');
  const folder = `${timestamp()}_${migrationName}`;
  const targetDir = path.join(migrationsDir, folder);

  const diff = await runCapture('npx', [
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    process.env.DATABASE_URL,
    '--to-schema-datamodel',
    schemaPath,
    '--script',
  ]);

  const sql = (diff.stdout || '').trim();
  if (!sql || sql.includes('-- This is an empty migration.')) {
    console.log('No schema diff detected. No migration file created.');
    return;
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, 'migration.sql'), `${sql}\n`, { encoding: 'utf8' });
  console.log(`Created migration: prisma/migrations/${folder}/migration.sql`);
};

const main = async () => {
  const command = process.argv[2] || 'status';

  if (command === 'status') {
    await run('npx', ['prisma', 'migrate', 'status']);
    return;
  }

  if (command === 'apply') {
    await run('npx', ['prisma', 'migrate', 'deploy']);
    await run('npx', ['prisma', 'generate']);
    return;
  }

  if (command === 'create') {
    const nameIndex = process.argv.indexOf('--name');
    const name = nameIndex >= 0 ? process.argv[nameIndex + 1] : process.argv[3];
    await createMigration(name);
    return;
  }

  throw new Error(`Unknown command: ${command}. Use status | create --name <name> | apply`);
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
