/**
 * API wrapper for the fork action and related usages.
 */
import core from "@actions/core";
import github from "@actions/github";
import { GitHub } from '@actions/github/lib/utils';
import { WorkflowId, WorkflowInputs, WorkflowRun } from "@/types";
import { wait } from "@/utils";

/**
 * API wrapper for the fork action and related usages.
 */
export class Api {
    // Github organization.
    owner: string;
    // Github repo.
    repo: string;
    // Github octokit API.
    octokit: InstanceType<typeof GitHub>

    constructor(owner: string, repo: string) {
        this.owner = owner;
        this.repo = repo;
        this.octokit = github.getOctokit(core.getInput("token"));
    }

    /**
     * Dispatch workflow with provided arguments.
     *
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {WorkflowInputs} inputs - The inputs of the workflow.
     * @param {string} ref - The git reference for the workflow.
     **/
    public async dispatch(
        workflow_id: WorkflowId,
        inputs: WorkflowInputs,
        ref: string,
        head_sha: string,
    ): Promise<WorkflowRun> {
        core.info(`Dispatching workflow ${workflow_id} on ${ref}@${head_sha} ...`);
        await this.octokit.rest.actions.createWorkflowDispatch({
            owner: this.owner,
            repo: this.repo,
            ref,
            workflow_id,
            inputs
        });

        const run = await this.latestRun(workflow_id, head_sha, true);
        core.debug("Latest run: " + JSON.stringify(run, null, 2));
        core.info(`Dispatched workflow ${run.html_url} .`);

        return run
    }

    /**
     * List workflow runs for specifed workflow and branch.
     *
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {string | undefined} head_sha - The commit hash to filter.
     * @param {boolean} retry - If keep requesting the result until getting some.
     * @returns {Promise<WorkflowRuns} - Sorted workflow runs.
     */
    private async latestRun(
        workflow_id: WorkflowId,
        head_sha?: string,
        retry?: boolean,
    ): Promise<WorkflowRun> {
        await wait(5000);

        const {
            data: {
                total_count,
                workflow_runs
            }
        } = await this.octokit.rest.actions.listWorkflowRuns({
            owner: this.owner,
            repo: this.repo,
            workflow_id,
            head_sha,
        })

        if (retry && total_count === 0) {
            core.debug(`No workflow runs found of ${workflow_id} at ${head_sha}`);
            return await this.latestRun(workflow_id, head_sha, retry);
        }

        const runs = workflow_runs.sort((a, b) => {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return runs[0];
    }
}
