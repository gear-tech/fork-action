/**
 * Typescript interfaces.
 */

import { components, operations } from "@octokit/openapi-types";

/// Check run schema.
export type CheckRun = components["schemas"]["check-run"];

/// Check run id.
export type CheckRunId = components["parameters"]["check-run-id"];

/// The status of the check.
export type Status = operations["checks/create"]["requestBody"]["content"]["application/json"]["status"];

/// The output of the check.
export type Output = operations["checks/create"]["requestBody"]["content"]["application/json"]["output"];

/// The final conclusion of the check.
export type Conclusion = operations["checks/create"]["requestBody"]["content"]["application/json"]["conclusion"];

/// Job schema.
export type Job = components["schemas"]["job"];

/// The ID of the workflow. You can also pass the workflow file name as a string.
export type WorkflowId = components["parameters"]["workflow-id"];

/// Workflow dispatch inputs.
export type WorkflowInputs = operations["actions/create-workflow-dispatch"]["requestBody"]["content"]["application/json"]["inputs"];

/// Workflow run schema.
export type WorkflowRun = components["schemas"]["workflow-run"];
