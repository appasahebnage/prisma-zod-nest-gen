import { join } from "path";
import { getDMMF } from "@prisma/internals";
import { readFileSync } from "fs";

export const getTestDMMF = async () => {
  const datamodel = readFileSync(join(__dirname, "./schema.prisma"), "utf-8");
  return getDMMF({
    datamodel,
    previewFeatures: ["interactiveTransactions"],
  });
};

// Increase timeout for DMMF parsing
jest.setTimeout(30000);
