import * as core from '@actions/core';
import { Inputs } from '@/types';

/*
 * Wait for a number of milliseconds.
 *
 * @param milliseconds The number of milliseconds to wait.
 * @returns {Promise<string>} Resolves with 'done!' after the wait is over.
 */
export async function wait(milliseconds: number): Promise<string> {
  return new Promise(resolve => {
    if (isNaN(milliseconds)) {
      throw new Error('milliseconds not a number');
    }

    setTimeout(() => resolve('done!'), milliseconds);
  });
}

/**
 * Unpack inputs from environment.
 */
export function unpackInputs(): Inputs {
  const repoFullName = core.getInput('repo').split('/');
  if (repoFullName.length !== 2) {
    core.setFailed('repo needs to be in the {owner}/{repository} format.');
    process.exit(1);
  }

  let prefix = core.getInput('prefix');
  if (prefix !== '') prefix += ' / ';

  return {
    owner: repoFullName[0],
    repo: repoFullName[1],
    ref: core.getInput('ref'),
    workflow_id: core.getInput('workflow_id'),
    inputs: JSON.parse(core.getInput('inputs')),
    jobs: JSON.parse(core.getInput('jobs')),
    head_sha: core.getInput('head_sha'),
    prefix,
    needs: JSON.parse(core.getInput('needs'))
  };
}
