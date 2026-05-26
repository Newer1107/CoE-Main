import { cp, mkdir, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDir = path.join(root, '.next', 'types');
const targetDir = path.join(root, '.next', 'dev', 'types');

const ensureExists = async (dir) => {
  try {
    await access(dir);
  } catch {
    throw new Error(`Missing ${dir}. Run \"next typegen\" first.`);
  }
};

const run = async () => {
  await ensureExists(sourceDir);
  await mkdir(path.join(root, '.next', 'dev'), { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });

  const validatorPath = path.join(targetDir, 'validator.ts');
  try {
    const validator = await readFile(validatorPath, 'utf8');
    const updated = validator.replaceAll('../../src/', '../../../src/');
    if (updated !== validator) {
      await writeFile(validatorPath, updated, 'utf8');
    }
  } catch (err) {
    console.warn('Skipping dev validator path fix:', err instanceof Error ? err.message : err);
  }
};

run().catch((err) => {
  console.error('Failed to sync Next.js dev route types:', err);
  process.exit(1);
});
