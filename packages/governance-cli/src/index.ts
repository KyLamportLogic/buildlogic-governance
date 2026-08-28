#!/usr/bin/env node
import { hashValue, isValidGovernanceContract } from '@kypython/buildlogic-governance';

export function main(args: string[]): number {
  const [command, raw] = args;
  if (command === 'hash' && raw) {
    process.stdout.write(`${hashValue(JSON.parse(raw))}\n`);
    return 0;
  }
  if (command === 'validate-contract' && raw) {
    const valid = isValidGovernanceContract(JSON.parse(raw));
    process.stdout.write(`${valid ? 'valid' : 'invalid'}\n`);
    return valid ? 0 : 1;
  }
  process.stderr.write('Usage: buildlogic-governance <hash|validate-contract> <json>\n');
  return 2;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
