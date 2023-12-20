/**
 * The entrypoint for the action.
 */
import core from '@actions/core'
import { unpackInputs } from "@/utils";
import Api from "@/api";

(async () => {
    try {
        const inputs = unpackInputs();
        core.info("Workflow inputs: " + JSON.stringify(inputs, null, 2));
        await Api.forkInputs(inputs);
    } catch (error) {
        core.setFailed(JSON.stringify(error, null, 2));
        throw error;
    }
})();
