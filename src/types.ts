/**
 * Typescript interfaces.
 */

import { components, operations } from '@octokit/openapi-types';

/// Check run schema.
export type CheckRun = components['schemas']['check-run'];

/// Check run id.
export type CheckRunId = components['parameters']['check-run-id'];

/// The status of the check.
export type Status =
  operations['checks/update']['requestBody']['content']['application/json']['status'];

/// The final conclusion of the check.
export type Conclusion =
  operations['checks/update']['requestBody']['content']['application/json']['conclusion'];

/// Job schema.
export type Job = components['schemas']['job'];

/// The ID of the workflow. You can also pass the workflow file name as a string.
export type WorkflowId = components['parameters']['workflow-id'];

/// Workflow dispatch inputs.
export type WorkflowInputs =
  operations['actions/create-workflow-dispatch']['requestBody']['content']['application/json']['inputs'];

/// Workflow run schema.
export type WorkflowRun = components['schemas']['workflow-run'];

export interface ForkOptions {
  // the git reference of the workflow.
  ref: string;
  // The ID of the workflow.
  workflow_id: WorkflowId;
  // Inputs of the workflow.
  inputs: WorkflowInputs;
  // The prefix of the forked checks.
  prefix: string;
  // The jobs to be forked.
  jobs: string[];
  // The commit hash to fork.
  head_sha: string;
}

/// Profile configs
export interface IProfile {
  name: string;
  flags: string;
}

/// Unpacked action inputs.
export interface Inputs extends ForkOptions {
  owner: string;
  repo: string;
}
