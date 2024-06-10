import * as core from '@actions/core';
import Api from '@/api';
import { unpackInputs } from '@/utils';

const DEPBOT = 'dependabot';

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const inputs = unpackInputs();
    if (inputs.ref.startsWith(DEPBOT)) return;

    const inputsJSON = JSON.stringify(inputs, null, 2);
    core.info(`Workflow inputs: ${inputsJSON}`);

    return await Api.forkInputs(inputs);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
  }
}

(async () => {
  await run();
})();
