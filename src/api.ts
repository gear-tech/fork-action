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

const PR_WORKFLOW_ID = '.github/workflows/PR.yml';

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
    prefix,
    jobs,
    head_sha
  }: ForkOptions): Promise<void> {
    // Ensure jobs have not been triggerd by the PR workflow
    await this.ensureJobs(
      head_sha,
      jobs.map(job => `${prefix}${job}`)
    );

    // If the workflow has already been dispatched, create
    // checks from the exist one.
    let run = await this.latestRun(workflow_id, head_sha);
    if (run) {
      // NOTE:
      //
      // The sorting of workflow runs may have problem,
      // revert this logic atm. (issue #40)
      //
      // if (run.status !== 'completed') {
      //   core.info(`The check is running in progress: ${run.html_url}`);
      //   process.exit(0);
      // }
      //
      // // Unset the run if it has got failed.
      // if (run.conclusion === 'failure') run = undefined;

      // If there is a run, quit execution.
      process.exit(0);
    }

    if (!run) run = await this.dispatch(ref, workflow_id, inputs, head_sha);

    // Create checks from the specifed jobs.
    //
    // TODO: Fetch the checks instead of creating if the workflow has
    // already been triggered.
    core.info(`Creating checks ${jobs} from ${run.html_url} ...`);
    const checks: Record<string, CheckRun | undefined> = (
      await Promise.all(
        jobs.map(async job =>
          this.createCheck(`${prefix}${job}`, head_sha, run as WorkflowRun)
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
        (await this.getJobs(run.id, jobs))
          // NOTE: avoid forking self.
          .filter(job => job.html_url?.includes('/job/'))
          .map(async job => {
            const check = checks[`${prefix}${job.name}`];
            if (
              !check ||
              (check.status === job.status &&
                check.conclusion === job.conclusion)
            ) {
              core.debug(`No need to update check ${job.name} .`);
              return job;
            } else {
              this.updateCheck(check.id, job);
              check.status =
                job.status === 'waiting' ? 'in_progress' : job.status;
              check.conclusion = job.conclusion;
              return job;
            }
          })
      );

      if (_jobs.length === 0) {
        core.warning(`No jobs of ${jobs} found from ${run.url} .`);
      }

      // Check if all jobs have been completed.
      if (
        _jobs.filter(job => job?.status === 'completed').length === jobs.length
      ) {
        core.info('All jobs completed .');

        const failed = _jobs.filter(job => job.conclusion === 'failure');
        if (failed.length > 0) {
          core.warning(`Job ${failed[0].name} Failed`);
          // TODO: exit with errors (issue #40)
          process.exit(0);
        }

        return;
      } else {
        await wait(10000);
      }
    }
  }

  /**
   * Ensure jobs have not been triggered yet
   *
   * NOTE: this function only works for `gear-tech/gear`
   */
  async ensureJobs(head_sha: string, filter: string[]): Promise<void> {
    const run = await this.latestRun(PR_WORKFLOW_ID, head_sha);
    if (!run) return;

    const jobs = await this.getJobs(run.id, filter, false);
    if (jobs.length > 0) {
      const processed = jobs.map(j => j.name).join(',');
      core.info(`[${processed}] have been processed in the PR workflow`);
      process.exit(0);
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
      status: 'in_progress',
      output: {
        title: name,
        summary: `Forked from ${run.html_url}`
        // TODO:
        //
        // summary: `Forked from ${run.html_url}\nRe-run the \`${github.context.job}\` job in ${sourceHtml()} to re-trigger this check.`
      },
      head_sha
    });

    core.debug(`Created check ${data}.`);
    core.info(`Created check ${data.name} at ${data.html_url}`);
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
    core.info(`Dispatched workflow ${run.html_url} .`);
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
    strict = true
  ): Promise<Job[]> {
    const {
      data: { jobs }
    } = await this.octokit.rest.actions.listJobsForWorkflowRun({
      owner: this.owner,
      repo: this.repo,
      run_id
    });

    const forkedJobs = jobs.filter(job => filter.includes(job.name));
    if (!strict) return forkedJobs;
    if (forkedJobs.length < filter.length) {
      core.info(`Waiting for ${filter} ...`);
      await wait(5000);
      return await this.getJobs(run_id, filter);
    }

    return forkedJobs;
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

    let conclusion: Conclusion | undefined = undefined;
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
      conclusion
    });

    return data;
  }
}
