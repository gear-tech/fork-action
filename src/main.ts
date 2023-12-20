import * as core from '@actions/core';
import Api from '@/api';
import { unpackInputs } from '@/utils';

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const inputs = unpackInputs();
    const inputsJSON = JSON.stringify(inputs, null, 2);
    core.info(`Workflow inputs: ${inputsJSON}`);

    return await Api.forkInputs(inputs);
  } catch (error) {
    core.setFailed(JSON.stringify(error, null, 2));
  }
}

(async () => {
  await run();
})();
