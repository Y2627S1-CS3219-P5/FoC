// Contributor: @ron (AI-assisted); implementation review pending.
// AI Assistance Disclosure: OpenAI Codex (GPT-6), 2026-10-18.
// Scope: Exact provider default-group retention, creation races and deletion guards.
// Author review: PENDING.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CommandRequest, CommandRunner } from "../lib/commands.js";
import {
  captureProviderLogTargets,
  ensureProviderLogRetention,
  removeProviderLogGroups,
} from "../lib/provider-logs.js";
import type { ValidatedStack } from "../lib/stack-outputs.js";
import { validConfig } from "./fixtures.js";
import { argumentAfter, failure, success } from "./release-tooling-fixtures.js";

const config = validConfig();
const foundation: ValidatedStack = {
  key: "foundation",
  name: "foc-demo-foundation",
  region: config.primaryRegion,
  status: "CREATE_COMPLETE",
  outputs: {},
};
const edge: ValidatedStack = {
  key: "edge",
  name: "foc-demo-edge",
  region: config.edgeRegion,
  status: "CREATE_COMPLETE",
  outputs: {},
};

function providerFixture(
  options: { existing?: boolean; race?: boolean; custom?: boolean } = {},
) {
  const calls: CommandRequest[] = [];
  const groups = new Map<string, number | undefined>();
  let functionsExist = true;
  if (options.existing) {
    groups.set(`/aws/lambda/${foundation.name}-handler`, undefined);
    groups.set(`/aws/lambda/${edge.name}-handler`, undefined);
  }
  const runner: CommandRunner = (request) => {
    calls.push(request);
    const [service, operation] = request.args;
    const region = argumentAfter(request, "--region");
    if (service === "cloudformation" && operation === "list-stack-resources") {
      return success(
        JSON.stringify({
          StackResourceSummaries: [
            {
              ResourceType: "AWS::Lambda::Function",
              PhysicalResourceId: `${argumentAfter(request, "--stack-name")}-handler`,
            },
          ],
        }),
      );
    }
    if (service === "lambda" && operation === "get-function-configuration") {
      const name = argumentAfter(request, "--function-name");
      return functionsExist
        ? success(
            JSON.stringify({
              FunctionName: name,
              FunctionArn: `arn:aws:lambda:${region}:${config.accountId}:function:${name}`,
              LoggingConfig: {
                LogGroup: options.custom
                  ? "/shared/custom"
                  : `/aws/lambda/${name}`,
              },
            }),
          )
        : failure("ResourceNotFoundException: Function not found");
    }
    const name =
      argumentAfter(request, "--log-group-name") ??
      argumentAfter(request, "--log-group-name-prefix") ??
      "";
    if (service === "logs" && operation === "describe-log-groups") {
      return success(
        JSON.stringify({
          logGroups: [
            ...(groups.has(name)
              ? [
                  {
                    logGroupName: name,
                    ...(groups.get(name) === undefined
                      ? {}
                      : { retentionInDays: groups.get(name) }),
                  },
                ]
              : []),
            { logGroupName: `${name}-shared-suffix`, retentionInDays: 30 },
          ],
        }),
      );
    }
    if (service === "logs" && operation === "create-log-group") {
      groups.set(name, undefined);
      return options.race
        ? failure("ResourceAlreadyExistsException")
        : success();
    }
    if (service === "logs" && operation === "put-retention-policy") {
      groups.set(name, Number(argumentAfter(request, "--retention-in-days")));
      return success();
    }
    if (service === "logs" && operation === "delete-log-group") {
      groups.delete(name);
      return success();
    }
    throw new Error(`Unexpected provider command ${service}:${operation}`);
  };
  return {
    calls,
    groups,
    runner,
    deleteFunctions: () => {
      functionsExist = false;
    },
  };
}

test("bounds an existing Foundation default group to 14 days without name collision", () => {
  const fixture = providerFixture({ existing: true });
  ensureProviderLogRetention(config, fixture.runner, foundation);
  assert.equal(
    fixture.groups.get(`/aws/lambda/${foundation.name}-handler`),
    14,
  );
  assert.equal(
    fixture.calls.some(({ args }) => args[1] === "create-log-group"),
    false,
  );
});

test("creates a missing default group and safely handles Lambda creating it concurrently", () => {
  for (const race of [false, true]) {
    const fixture = providerFixture({ race });
    ensureProviderLogRetention(config, fixture.runner, edge);
    assert.equal(fixture.groups.get(`/aws/lambda/${edge.name}-handler`), 14);
    assert.ok(
      fixture.calls
        .filter(({ args }) => args[0] === "logs")
        .every(
          (request) => argumentAfter(request, "--region") === config.edgeRegion,
        ),
    );
  }
});

test("refuses a custom/shared logging destination before any log mutation", () => {
  const fixture = providerFixture({ custom: true });
  assert.throws(
    () => ensureProviderLogRetention(config, fixture.runner, foundation),
    /custom\/shared log destination/,
  );
  assert.equal(
    fixture.calls.some(({ args }) => args[0] === "logs"),
    false,
  );
});

test("cleans only captured exact default groups in their owning regions after functions disappear", () => {
  const fixture = providerFixture({ existing: true });
  const targets = captureProviderLogTargets(config, fixture.runner, [
    foundation,
    edge,
  ]);
  fixture.deleteFunctions();
  assert.deepEqual(
    removeProviderLogGroups(config, fixture.runner, targets),
    [],
  );
  const deletes = fixture.calls.filter(
    ({ args }) => args[1] === "delete-log-group",
  );
  assert.deepEqual(
    deletes.map((request) => [
      argumentAfter(request, "--region"),
      argumentAfter(request, "--log-group-name"),
    ]),
    [
      [config.primaryRegion, `/aws/lambda/${foundation.name}-handler`],
      [config.edgeRegion, `/aws/lambda/${edge.name}-handler`],
    ],
  );
});

test("refuses all group deletion when any owning function is present or absence cannot be verified", () => {
  for (const denied of [false, true]) {
    const fixture = providerFixture({ existing: true });
    const targets = captureProviderLogTargets(config, fixture.runner, [
      foundation,
      edge,
    ]);
    const runner: CommandRunner = (request) =>
      denied && request.args[0] === "lambda"
        ? failure("AccessDeniedException")
        : fixture.runner(request);
    assert.equal(removeProviderLogGroups(config, runner, targets).length, 2);
    assert.equal(
      fixture.calls.some(({ args }) => args[1] === "delete-log-group"),
      false,
    );
  }
});

test("rejects a missing or out-of-stack function identity before changing logs", () => {
  for (const PhysicalResourceId of [
    undefined,
    "CDKToolkit-shared-handler",
    "foc-demo-foundation-*",
  ]) {
    const fixture = providerFixture();
    const runner: CommandRunner = (request) =>
      request.args[0] === "cloudformation"
        ? success(
            JSON.stringify({
              StackResourceSummaries: [
                { ResourceType: "AWS::Lambda::Function", PhysicalResourceId },
              ],
            }),
          )
        : fixture.runner(request);
    assert.throws(
      () => ensureProviderLogRetention(config, runner, foundation),
      /outside an exact FoC stack/,
    );
    assert.equal(fixture.calls.length, 0);
  }
});
