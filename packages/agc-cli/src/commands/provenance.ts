import { Command } from "commander";
import { makeClient } from "../config.js";
import { c, detail, jsonOut, printError, section, spin } from "../ui.js";

function printTrajectory(trajectory: any) {
  const sources = trajectory.events.flatMap(
    (event: any) => event.metadata?.lineage?.sources ?? [],
  );
  const delegates = trajectory.events.flatMap((event: any) =>
    event.metadata?.lineage?.delegation
      ? [event.metadata.lineage.delegation]
      : [],
  );
  const matches = trajectory.events.flatMap(
    (event: any) => event.metadata?.lineage?.library?.results ?? [],
  );
  section("Provenance report");
  detail([
    ["Runs", String(trajectory.summary?.runs ?? trajectory.runs?.length ?? 0)],
    [
      "Events",
      String(trajectory.summary?.events ?? trajectory.events?.length ?? 0),
    ],
    [
      "Model / tool calls",
      `${trajectory.summary?.modelCalls ?? 0} / ${trajectory.summary?.toolCalls ?? 0}`,
    ],
    ["Sources", String(sources.length)],
    ["Agent delegations", String(delegates.length)],
    ["Library matches", String(matches.length)],
    ["Dropped events", String(trajectory.summary?.droppedEvents ?? 0)],
  ]);
  if (sources.length) {
    section("Web sources");
    for (const source of sources)
      console.log(
        `  ${c.primary(source.domain)}  ${source.title ?? ""}\n  ${c.dim(source.url)}`,
      );
  }
  if (delegates.length) {
    section("Agent contributions");
    for (const item of delegates)
      console.log(
        `  ${item.fromAgentId ?? "workflow"} → ${c.primary(item.toAgentId)}  ${c.dim(item.role ?? "")}`,
      );
  }
  if (matches.length) {
    section("Library matches");
    for (const item of matches)
      console.log(
        `  ${c.primary(`${item.percentageMatch}%`)}  ${item.name ?? item.itemId}  ${c.dim(`#${item.rank}`)}`,
      );
  }
}

export function provenanceCommand(): Command {
  const cmd = new Command("provenance").description(
    "Inspect and export provenance and attribution trails",
  );
  cmd
    .command("session <sessionId>")
    .description("Show a plain-language sources and contributors report")
    .option("--json", "Output the complete machine-readable trajectory")
    .action(async (sessionId: string, opts) => {
      const spinner = spin("Building provenance report…");
      try {
        const { data } = await makeClient().provenance.session(sessionId);
        spinner.stop();
        if (opts.json) return jsonOut(data);
        printTrajectory(data);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });
  cmd
    .command("workflow <executionId>")
    .description("Show provenance for a workflow execution")
    .option("--json", "Output the complete machine-readable trajectory")
    .action(async (executionId: string, opts) => {
      const spinner = spin("Building workflow provenance report…");
      try {
        const { data } = await makeClient().provenance.scope(
          "workflow",
          executionId,
        );
        spinner.stop();
        if (opts.json) return jsonOut(data);
        printTrajectory(data);
      } catch (error) {
        spinner.stop();
        printError(error);
        process.exitCode = 1;
      }
    });
  cmd
    .command("bundle <traceId>")
    .description("Export the standards-based EAA provenance bundle as JSON")
    .action(async (traceId: string) =>
      jsonOut((await makeClient().provenance.bundle(traceId)).data),
    );
  return cmd;
}
