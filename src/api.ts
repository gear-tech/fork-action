/**
 * API wrapper for the fork action and related usages.
 */
import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import {
  Inputs,
  ForkOptions,
  CheckRun,
  Conclusion,
  Job,
  Status,
  WorkflowId,
  WorkflowInputs,
  WorkflowRun
} from '@/types';
import { wait } from '@/utils';

/**
 * API wrapper for the fork action and related usages.
 */
export default class Api {
  // Github organization.
  owner: string;
  // Github repo.
  repo: string;
  // Github octokit API.
  octokit: InstanceType<typeof GitHub>;

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
    this.octokit = github.getOctokit(core.getInput('token'));
  }

  /**
   * Fork checks from inputs.
   *
   * @param {Inputs} inputs - overall inputs for the fork process.
   * @returns {Promise<void>}
   */
  static async forkInputs(inputs: Inputs): Promise<void> {
    const api = new Api(inputs.owner, inputs.repo);
    await api.fork(inputs);
  }

  /**
   *  Fork checks from workflow run.
   *
   * @params {ForkOptions} - The fork options.
   * @returns {Promise<void>}
   */
  async fork({
    ref,
    workflow_id,
    inputs,
    workflow,
    jobs,
    head_sha,
    needs
  }: ForkOptions): Promise<void> {
    // If the workflow has already been dispatched, create
    // checks from the exist one.
    let run = await this.latestRun(workflow_id, head_sha);
    if (!run) run = await this.dispatch(ref, workflow_id, inputs, head_sha);

    // Create checks from the specifed jobs.
    //
    // TODO: Fetch the checks instead of creating if the workflow has
    // already been triggered.
    core.info(`Creating checks ${jobs} from ${run.html_url} ...`);
    const checks: Record<string, CheckRun | undefined> = (
      await Promise.all(
        jobs.map(async job =>
          this.createCheck(`${workflow}/${job}`, head_sha, run as WorkflowRun)
        )
      )
    ).reduce(
      (_checks, check: CheckRun) => {
        _checks[check.name] = check;
        return _checks;
      },
      {} as Record<string, CheckRun>
    );

    // Fork status of jobs from the workflow.
    core.info(`Forking status of ${jobs} from ${run.html_url} ...`);
    for (;;) {
      const _jobs = await Promise.all(
        (await this.getJobs(run.id, jobs, needs)).map(async job => {
          const check = checks[`${workflow}/${job.name}`];
          if (
            !check ||
            (check.status === job.status && check.conclusion === job.conclusion)
          ) {
            core.debug(`No need to update check ${job.name} .`);
            return;
          } else {
            core.info(`Updating check ${check.name} ...`);
            this.updateCheck(check.id, job);
            return job;
          }
        })
      );

      if (_jobs.length === 0) {
        core.warning(`No jobs of ${jobs} found from ${run.url}.`);
      }

      // Check if all jobs have been completed.
      if (
        _jobs.filter(job => job?.status === 'completed').length === jobs.length
      ) {
        core.info('All jobs completed .');
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
   * @param {WorkflowRun} run - The workflow run.
   * @returns {CheckRun} - Github check run.
   */
  async createCheck(
    name: string,
    head_sha: string,
    run: WorkflowRun
  ): Promise<CheckRun> {
    const { data } = await this.octokit.rest.checks.create({
      owner: this.owner,
      repo: this.repo,
      name,
      output: {
        title: name,
        summary: `Forked from ${run.html_url}`
      },
      head_sha
    });

    core.debug(`Created check ${data}.`);
    core.info(`Created check ${data.name} at ${data.html_url}.`);
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
  async dispatch(
    ref: string,
    workflow_id: WorkflowId,
    inputs: WorkflowInputs,
    head_sha: string
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
      core.setFailed('No workflow is found after dispatching.');
      process.exit(1);
    }

    core.debug(`Latest run: ${JSON.stringify(run, null, 2)}.`);
    core.info(`Dispatched workflow ${run.html_url}.`);
    return run;
  }

  /**
   * Get a specifed job from a workflow run.
   *
   * @param {number} run_id - The workflow run id.
   * @param {string[]} filter - Job names to be filtered out.
   * @returns {Promise<Job[]>} - Jobs of a workflow run.
   */
  async getJobs(
    run_id: number,
    filter: string[],
    needs: string[]
  ): Promise<Job[]> {
    const {
      data: { jobs }
    } = await this.octokit.rest.actions.listJobsForWorkflowRun({
      owner: this.owner,
      repo: this.repo,
      run_id
    });

    if (jobs.length === 0) {
      core.setFailed(`No workflow is found from ${run_id}`);
      process.exit(1);
    }

    // Check if required jobs are processed.
    const requiredJobs = jobs.filter(job => needs.includes(job.name));
    if (
      requiredJobs.length != needs.length ||
      requiredJobs.filter(job => job.status != 'completed').length > 0
    ) {
      await wait(5000);
      return await this.getJobs(run_id, filter, needs);
    }

    return jobs.filter(job => filter.includes(job.name));
  }

  /**
   * List workflow runs for specifed workflow and branch.
   *
   * @param {WorkflowId} workflow_id - The ID of the workflow.
   * @param {string | undefined} head_sha - The commit hash to filter.
   * @param {boolean} retry - If keep requesting the result until getting some.
   * @returns {Promise<WorkflowRun | null>} - Sorted workflow runs.
   */
  async latestRun(
    workflow_id: WorkflowId,
    head_sha: string,
    retry?: boolean
  ): Promise<WorkflowRun | undefined> {
    core.info(`Getting latest run of ${workflow_id} at ${head_sha} ...`);
    await wait(3000);

    let total_count = 0;
    let workflow_runs: WorkflowRun[] = [];
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRuns({
        owner: this.owner,
        repo: this.repo,
        workflow_id,
        head_sha
      });
      total_count = data.total_count;
      workflow_runs = data.workflow_runs;
    } catch (error) {
      core.warning(`No workflow runs found of ${workflow_id} at ${head_sha} .`);
      if (error instanceof Error) core.debug(error.message);
    }

    if (total_count === 0) {
      if (retry) {
        return await this.latestRun(workflow_id, head_sha, retry);
      } else {
        return;
      }
    }

    const runs = workflow_runs.sort((a, b) => {
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return runs[0];
  }

  /**
   * Update a check run from jobs.
   *
   * @param {number} check_run_id - The ID of the check run to update.
   * @param {Job} job - The most important job of a workflow run.
   * @returns {Promise<CheckRun>} - The updated check run.
   */
  async updateCheck(check_run_id: number, job: Job): Promise<CheckRun> {
    let status: Status = 'in_progress';
    if (job.status === 'waiting') {
      status = undefined;
    } else {
      status = job.status;
    }

    let conclusion: Conclusion = 'neutral';
    if (job.conclusion) {
      conclusion = job.conclusion;
    }

    core.info(
      `Updating check ${job.name} (${job.html_url}), status: ${job.status}, conclusion: ${job.conclusion}`
    );

    const { data } = await this.octokit.rest.checks.update({
      owner: this.owner,
      repo: this.repo,
      check_run_id,
      status,
      conclusion,
      output: {
        title: job.name,
        summary: `Forked from ${job.html_url}`
      }
    });

    return data;
  }
}
