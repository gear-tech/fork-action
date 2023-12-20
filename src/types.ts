/**
 * Typescript interfaces.
 */

import { components, operations } from "@octokit/openapi-types";

// The ID of the workflow. You can also pass the workflow file name as a string.
export type WorkflowId = components["parameters"]["workflow-id"];

// Workflow dispatch inputs.
export type WorkflowInputs = operations["actions/create-workflow-dispatch"]["requestBody"]["content"]["application/json"]["inputs"];

/// Workflow run schema.
export type WorkflowRun = components["schemas"]["workflow-run"];
