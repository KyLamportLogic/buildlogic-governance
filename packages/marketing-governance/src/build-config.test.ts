// MGT-2.2, MGT-2.3 (specs/marketing-governance-typescript-and-governance-tests):
// the package's real compiler and tsconfig must type-check with no errors, and the compiler options that
// fix the emitted shape (CommonJS module, declarations, outDir/rootDir) must stay as they are.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkgDir = join(__dirname, '..');
const tsc = join(pkgDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

describe('MGT-2.2 / MGT-2.3 build configuration', () => {
  it('MGT-2.2 type-checks with the package tsconfig and no TS errors (no TS5108)', () => {
    let output = '';
    let exitCode = 0;
    try {
      output = execFileSync(tsc, ['--noEmit', '-p', join(pkgDir, 'tsconfig.json')], { cwd: pkgDir, encoding: 'utf8' });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      exitCode = e.status ?? 1;
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }
    expect(output).not.toMatch(/error TS\d+/);
    expect(exitCode).toBe(0);
  }, 120_000);

  it('MGT-2.3 keeps the CommonJS, declaration and output-layout options that shape dist/', () => {
    const { compilerOptions } = JSON.parse(readFileSync(join(pkgDir, 'tsconfig.json'), 'utf8'));
    expect(compilerOptions.module).toBe('CommonJS');
    expect(compilerOptions.declaration).toBe(true);
    expect(compilerOptions.outDir).toBe('dist');
    expect(compilerOptions.rootDir).toBe('src');
    expect(compilerOptions.moduleResolution).toBeUndefined();
  });
});
