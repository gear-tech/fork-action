/**
 * API wrapper for the fork action and related usages.
 */
import core from "@actions/core";
import github from "@actions/github";
import { GitHub } from '@actions/github/lib/utils';
import {
    CheckRun, Conclusion, Job, Status,
    WorkflowId, WorkflowInputs, WorkflowRun,
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
     *  Fork checks from workflow run.
     *
     * @param {string} ref - the git reference of the workflow.
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {WorkflowInputs} inputs - Inputs of the workflow.
     * @param {string[]} jobs - The jobs to be forked.
     * @param {string} head_sha - The commit hash to fork.
     * @returns {Promise<void>}
     */
    public async fork(
        ref: string,
        workflow_id: WorkflowId,
        inputs: WorkflowInputs,
        jobs: string[],
        head_sha: string,
    ): Promise<void> {
        // If the workflow has already been dispatched, create
        // checks from the exist one.
        let run = await this.latestRun(workflow_id, head_sha);
        if (!run) {
            run = await this.dispatch(ref, workflow_id, inputs, head_sha);
        }

        // Create checks from the specifed jobs.
        const checks: Record<string, CheckRun | undefined> = (
            await Promise.all(jobs.map((job) => this.createCheck(job, head_sha)))
        ).reduce((checks, check: CheckRun) => {
            checks[check.name] = check;
            return checks
        }, {} as Record<string, CheckRun>);

        // Fork status of jobs from the workflow.
        while (true) {
            const _jobs = await this.getJobs(run.id, jobs);
            const _checks = await Promise.all(_jobs.map((job) => {
                const check = checks[job.name];
                if (!check || (check.status === job.status && check.conclusion === job.conclusion)) {
                    return;
                } else {
                    return this.updateCheck(job);
                }
            }));

            // Check if all jobs have been completed.
            if (_checks.filter((check) => check?.status === "completed").length === jobs.length) {
                core.info("All jobs completed .");
                return;
            } else {
                await wait(10000);
            }
        }
    }

    /**
     * Create check with provided arguments.
     *
     * @param {string} name - the name of the check run.
     * @param {string} head_sha - creates check on this head sha.
     * @returns {CheckRun} - Github check run.
     */
    public async createCheck(
        name: string,
        head_sha: string,
    ): Promise<CheckRun> {
        const { data } = await this.octokit.rest.checks.create({
            owner: this.owner,
            repo: this.repo,
            name,
            head_sha,
        });

        core.debug(`Created check ${data} .`);
        core.info(`Created check ${data.name} at ${data.details_url} .`);
        return data;
    }

    /**
     * Dispatch workflow with provided arguments.
     *
     * @param {string} ref - The git reference for the workflow.
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {WorkflowInputs} inputs - The inputs of the workflow.
     * @returns {WorkflowRun} - schema workflow run.
     **/
    public async dispatch(
        ref: string,
        workflow_id: WorkflowId,
        inputs: WorkflowInputs,
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
        if (!run) {
            core.setFailed("No workflow is found after dispatching.");
            process.exit(1);
        }

        core.debug("Latest run: " + JSON.stringify(run, null, 2));
        core.info(`Dispatched workflow ${run.html_url} .`);
        return run
    }

    /**
     * Get a specifed job from a workflow run.
     *
     * @param {number} run_id - The workflow run id.
     * @param {string[]} filter - Job names to be filtered out.
     * @returns {Promise<Job[]>} - Jobs of a workflow run.
     */
    public async getJobs(run_id: number, filter: string[]): Promise<Job[]> {
        const { data: { jobs } } = await this.octokit.rest.actions.listJobsForWorkflowRun({
            owner: this.owner,
            repo: this.repo,
            run_id,
        });

        return jobs.filter((job) => filter.includes(job.name));
    }

    /**
     * List workflow runs for specifed workflow and branch.
     *
     * @param {WorkflowId} workflow_id - The ID of the workflow.
     * @param {string | undefined} head_sha - The commit hash to filter.
     * @param {boolean} retry - If keep requesting the result until getting some.
     * @returns {Promise<WorkflowRun | null>} - Sorted workflow runs.
     */
    public async latestRun(
        workflow_id: WorkflowId,
        head_sha: string,
        retry?: boolean,
    ): Promise<WorkflowRun | null> {
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

        if (total_count === 0) {
            core.debug(`No workflow runs found of ${workflow_id} at ${head_sha}`);
            if (retry) {
                return await this.latestRun(workflow_id, head_sha, retry);
            } else {
                return null;
            }
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
     * @returns {Promise<CheckRun>} - The updated check run.
     */
    public async updateCheck(job: Job): Promise<CheckRun> {
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

        core.info(
            `Updating check ${job.name}, status: ${job.status}, conclusion: ${job.conclusion}`
        );

        const { data } = await this.octokit.rest.checks.update({
            owner: this.owner,
            repo: this.repo,
            status,
            conclusion,
            output: {
                title: job.name,
                summary: `Forked from ${job.html_url}`
            },
        });

        return data;
    }
}
