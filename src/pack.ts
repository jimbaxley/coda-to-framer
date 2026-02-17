import * as coda from "@codahq/packs-sdk";

export const pack = coda.newPack();

pack.addNetworkDomain("vercel.app");

pack.addFormula({
  name: "SyncTableToFramer",
  description: "Sync a Coda table to a Framer collection and return status message",
  isAction: true,
  parameters: [
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "workerUrl",
      description:
        "Sync endpoint URL (e.g., https://coda-to-framer-node.vercel.app/api/sync)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "framerProjectUrl",
      description: "Framer project URL (e.g., https://framer.com/projects/abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "tableIdOrName",
      description:
        "Coda table ID or name (e.g., grid-abc123 or table name in quotes)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "collectionName",
      description: "Name for the Framer collection (will be created if it doesn't exist)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "slugFieldId",
      description: "Column name or ID to use as the slug field (e.g., Short Name or c-abc123)",
    }),
    coda.makeParameter({
      type: coda.ParameterType.Number,
      name: "rowLimit",
      description: "Maximum number of rows to sync (default: 100, max: 500)",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.Boolean,
      name: "publish",
      description: "Publish and deploy the Framer project after successful sync",
      optional: true,
    }),
    coda.makeParameter({
      type: coda.ParameterType.String,
      name: "responseColumn",
      description: "Column reference where the sync response will be written (e.g., thisRow.Response)",
      optional: true,
    }),
  ],
  resultType: coda.ValueType.String,
  execute: async (
    [workerUrl, framerProjectUrl, tableIdOrName, collectionName, slugFieldId, rowLimit, publish, responseColumn],
    context,
  ) => {
    const docId = context.invocationLocation?.docId;

    if (!docId) {
      throw new coda.UserVisibleError("Could not determine document ID");
    }

    const payload = {
      docId,
      tableIdOrName,
      framerProjectUrl,
      collectionName,
      slugFieldId,
      rowLimit: rowLimit || 100,
      publish,
    };

    try {
      const response = await context.fetcher.fetch({
        method: "POST",
        url: workerUrl,
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = response.body as Record<string, unknown>;
      return result.message as string;
    } catch (error) {
      if (error instanceof coda.UserVisibleError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new coda.UserVisibleError(`Sync failed: ${message}`);
    }
  },
});
