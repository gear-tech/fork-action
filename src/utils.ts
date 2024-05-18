import * as core from '@actions/core';
import * as github from '@actions/github';
import { Inputs, IProfile, IInputsAndJobs } from '@/types';

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
  const { inputs, jobs } = deriveInputs();

  let prefix = core.getInput('prefix');
  if (prefix !== '') prefix += ' / ';

  const repoFullName = core.getInput('repo').split('/');
  if (repoFullName.length !== 2) {
    core.setFailed('repo needs to be in the {owner}/{repository} format.');
    process.exit(1);
  }

  return {
    owner: repoFullName[0],
    repo: repoFullName[1],
    ref: core.getInput('ref'),
    workflow_id: core.getInput('workflow_id'),
    inputs,
    jobs,
    head_sha: core.getInput('head_sha'),
    prefix
  };
}

function deriveInputs(): IInputsAndJobs {
  let jobs: string[] = JSON.parse(core.getInput('jobs'));
  const inputs = JSON.parse(core.getInput('inputs'));
  const useProfiles = core.getInput('useProfiles') === 'true';
  const useMulti = core.getInput('useMulti') === 'true';

  console.info(JSON.stringify(github.context.payload.repository, null, 2));
  console.info(JSON.stringify(github.context.payload.pull_request, null, 2));
  if (!(useProfiles || useMulti)) return { inputs, jobs };

  // Detect labels
  const labels: string[] = JSON.parse(core.getInput('labels'));
  const release = labels.includes('E3-forcerelease');
  const production = labels.includes('E4-forceproduction');

  // Append profiles to inputs
  if (useProfiles) {
    const profiles: IProfile[] = [{ name: 'debug', flags: '' }];
    if (release) profiles.push({ name: 'release', flags: '--release' });
    inputs.profiles = profiles;
  }

  if (useMulti) {
    if (release) inputs.release = 'true';
    if (production) inputs.production = 'true';
  }

  // Derive Jobs
  if (release) {
    jobs = [
      ...jobs.map(j => `${j} (debug)`),
      ...jobs.map(j => `${j} (release)`)
    ];
  } else {
    jobs = [...jobs.map(j => `${j} (debug)`)];
  }

  return {
    inputs,
    jobs
  };
}
