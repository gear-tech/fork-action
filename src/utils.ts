import * as core from '@actions/core';
import { Inputs, IProfile } from '@/types';
import github from '@actions/github';

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
  const owner = github.context.payload.repository?.owner.name;
  const repo = github.context.payload.repository?.name;

  let prefix = core.getInput('prefix');
  if (prefix !== '') prefix += ' / ';

  const inputs = JSON.parse(core.getInput('inputs'));
  const release = core.getInput('release') == 'true';
  const production = core.getInput('production') == 'true';
  const profiles = core.getInput('profiles') == 'true';
  const multi = core.getInput('multi') == 'true';

  // Insert profiles field
  if (profiles) {
    const profilesField: IProfile[] = [{ name: 'debug', flags: '' }];
    if (release) profilesField.push({ name: 'release', flags: '--release' });
    inputs.profiles = profilesField;
  }

  // Insert multi buld field
  if (multi) {
    if (release) inputs.release = 'true';
    if (production) inputs.production = 'true';
  }

  // Generate matrix jobs
  let jobs: string[] = JSON.parse(core.getInput('jobs'));
  if (profiles || multi) {
    if (release) {
      jobs = [
        ...jobs.map(j => j + ' (debug)'),
        ...jobs.map(j => j + ' (release)')
      ];
    } else {
      jobs = [...jobs.map(j => j + ' (debug)')];
    }
  }

  return {
    owner: owner ? owner : 'gear-tech',
    repo: repo ? repo : 'gear',
    ref: github.context.payload.head.ref,
    workflow_id: core.getInput('workflow_id'),
    inputs,
    jobs,
    head_sha: github.context.payload.head.sha,
    prefix
  };
}
