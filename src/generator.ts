import * as prettier from "prettier";
import { ModuleKind, Project, ScriptTarget } from "ts-morph";

import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { getDMMF, parseEnvValue } from "@prisma/internals";

import { GENERATOR_NAME } from "./constants";
import { GenerateDto } from "./generators/generate-dto";

const { version } = require("../package.json");

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
      prettyName: GENERATOR_NAME,
    };
  },
  onGenerate: async (options: GeneratorOptions) => {
    const outputDir = parseEnvValue(options.generator.output!);
    if (!outputDir)
      throw new Error(
        "No output was specified for nestjs-prisma-graphql-crud-gen"
      );

    const dataModels = options.datamodel;
    const dmmfDocument = await getDMMF({
      datamodel: dataModels,
      previewFeatures: ["interactiveTransactions"],
    });
    const project = new Project({
      compilerOptions: {
        target: ScriptTarget.ES2019,
        module: ModuleKind.CommonJS,
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        esModuleInterop: true,
        declaration: true,
        importHelpers: true,
      },
    });
    const generateDto = new GenerateDto(dmmfDocument, project, outputDir);
    generateDto.generate();

    for (const sourceFile of project.getSourceFiles()) {
      sourceFile
        .fixMissingImports()
        .organizeImports()
        .fixUnusedIdentifiers()
        .formatText();
    }

    try {
      for (const file of project.getSourceFiles()) {
        // file.formatText({ indentSize: 2, trimTrailingWhitespace: true });
        const fileContent = file.getFullText();

        // Format the file content
        const formattedContent = await prettier.format(fileContent, {
          singleQuote: true,
          trailingComma: "none",
          printWidth: 100,
          parser: "typescript",
        });

        // Update the source file with the formatted content
        file.replaceWithText(formattedContent);
      }
      await project.save();
    } catch (e) {
      console.error(
        "Error: unable to write files for nestjs-prisma-graphql-crud-gen"
      );
      throw e;
    }
  },
});
