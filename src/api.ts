/**
 * API wrapper for the fork action and related usages.
 */
import core from "@actions/core";
import github from "@actions/github";
import { GitHub } from '@actions/github/lib/utils';
import {
    CheckRun, Conclusion, Job, Output, Status,
    WorkflowId, WorkflowInputs, WorkflowRun
} from "@/types";
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
     * Create check with provided arguments.
     *
     * @param {string} name - the name of the check run.
     * @param {string} head_sha - creates check on this head sha.
     * @param {Output} output - the output of the check run.
     * @returns {CheckRun} - Github check run.
     */
    public async createCheck(
        name: string,
        head_sha: string,
        output: Output,
    ): Promise<CheckRun> {
        const { data } = await this.octokit.rest.checks.create({
            owner: this.owner,
            repo: this.repo,
            name,
            head_sha,
            output,
        });

        core.debug(`Created check ${data} .`);
        return data;
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
     * Get a specifed job from a workflow run.
     *
     * @param {number} run_id - The workflow run id.
     * @param {string[]} names - Job names to be filtered out.
     * @returns {Promise<Job[]>} - Jobs of a workflow run.
     */
    public async getJobs(run_id: number, names: string[]): Promise<Job[]> {
        const { data: { jobs } } = await this.octokit.rest.actions.listJobsForWorkflowRun({
            owner: this.owner,
            repo: this.repo,
            run_id,
        });

        return jobs.filter((job) => names.includes(job.name));
    }

    /**
     * List workflow runs for specifed workflow and branch.
     *
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {string | undefined} head_sha - The commit hash to filter.
     * @param {boolean} retry - If keep requesting the result until getting some.
     * @returns {Promise<WorkflowRuns} - Sorted workflow runs.
     */
    public async latestRun(
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


    /**
     * Update a check run from jobs.
     *
     * @param {Job} job - The most important job of a workflow run.
     */
    public async updateCheck(job: Job) {
        let status: Status = "in_progress";
        if (job.status === "waiting") {
            status = undefined;
        } else {
            status = job.status;
        }

        let conclusion: Conclusion = "neutral";
        if (job.conclusion) {
            conclusion = job.conclusion;
        }

        await this.octokit.rest.checks.update({
            owner: this.owner,
            repo: this.repo,
            status,
            conclusion
        })
    }
}
