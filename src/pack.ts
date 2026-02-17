import * as coda from "@codahq/packs-sdk";

export const pack = coda.newPack();

pack.addNetworkDomain("vercel.app");

async function publishFramerProject(
  workerUrl: string,
  framerProjectUrl: string,
  docId: string,
  framerApiKey?: string,
): Promise<{ published: boolean; deploymentId: string; message: string }> {
  try {
    const payload = {
      docId,
      framerProjectUrl,
      action: "publish",
    };

    const response = await fetch(workerUrl, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        ...(framerApiKey && { "X-Framer-API-Key": framerApiKey }),
      },
    });

    if (!response.ok) {
      return {
        published: false,
        deploymentId: "",
        message: `Publish failed: ${response.statusText}`,
      };
    }

    const result = (await response.json()) as Record<string, unknown>;
    return {
      published: result.published === true,
      deploymentId: (result.deploymentId as string) || "",
      message: (result.message as string) || "Project published successfully",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      published: false,
      deploymentId: "",
      message: `Publish error: ${message}`,
    };
  }
}

const SyncResultSchema = coda.makeObjectSchema({
  properties: {
    collectionId: {
      type: coda.ValueType.String,
      description: "Framer collection ID",
    },
    collectionName: {
      type: coda.ValueType.String,
      description: "Framer collection name",
    },
    itemsAdded: {
      type: coda.ValueType.Number,
      description: "Number of items added",
    },
    fieldsSet: {
      type: coda.ValueType.Number,
      description: "Number of fields configured",
    },
    warnings: {
      type: coda.ValueType.Array,
      items: { type: coda.ValueType.String },
      description: "Any warnings from the sync",
    },
    published: {
      type: coda.ValueType.Boolean,
      description: "Whether the Framer project was published",
    },
    deploymentId: {
      type: coda.ValueType.String,
      description: "Framer deployment ID if published",
    },
    message: {
      type: coda.ValueType.String,
      description: "Status message",
    },
  },
  displayProperty: "collectionName",
  idProperty: "collectionId",
});

pack.addFormula({
  name: "SyncTableToFramer",
  description: "Sync a Coda table to a Framer collection",
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
      description: "Coda column ID to use as the slug field (e.g., cUeRj7vVKT)",
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
  ],
  resultType: coda.ValueType.Object,
  schema: SyncResultSchema,
  execute: async (
    [workerUrl, framerProjectUrl, tableIdOrName, collectionName, slugFieldId, rowLimit, publish],
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

      let publishResult = { published: false, deploymentId: "", message: "" };

      if (publish && result.success === true) {
        publishResult = await publishFramerProject(
          workerUrl,
          framerProjectUrl,
          docId,
        );
      }

      return {
        collectionId: result.collectionId as string,
        collectionName: result.collectionName as string,
        itemsAdded: result.itemsAdded as number,
        fieldsSet: result.fieldsSet as number,
        warnings: (result.warnings as string[]) || [],
        published: publishResult.published,
        deploymentId: publishResult.deploymentId,
        message: publishResult.message || (result.message as string),
      };
    } catch (error) {
      if (error instanceof coda.UserVisibleError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new coda.UserVisibleError(`Sync failed: ${message}`);
    }
  },
});
