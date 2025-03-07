import * as prettier from "prettier";
import {
  ModuleKind,
  Project,
  ScriptTarget,
  IndentationText,
  NewLineKind,
} from "ts-morph";

import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { getDMMF, parseEnvValue } from "@prisma/internals";

import { GENERATOR_NAME } from "./constants";
import { GenerateDto } from "./generators/generate-dto";

const { version } = require("../package.json");

const prettierConfig: prettier.Options = {
  singleQuote: true,
  trailingComma: "none",
  printWidth: 120,
  parser: "typescript",
};

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
      throw new Error("No output was specified for prisma-zod-nest-gen");

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
      manipulationSettings: {
        indentationText: IndentationText.TwoSpaces,
        newLineKind: NewLineKind.LineFeed,
      },
    });

    const generateDto = new GenerateDto(dmmfDocument, project, outputDir);
    generateDto.generate();

    try {
      // Batch process all files
      const sourceFiles = project.getSourceFiles();
      const formatPromises = sourceFiles.map(async (file) => {
        // Basic ts-morph optimizations without heavy formatting
        file
          .fixMissingImports()
          .organizeImports({ ensureNewLineAtEndOfFile: false })
          .fixUnusedIdentifiers();

        const fileContent = file.getFullText();
        try {
          // Format with prettier
          const formattedContent = await prettier.format(
            fileContent,
            prettierConfig
          );
          file.replaceWithText(formattedContent);
        } catch (formatError) {
          console.warn(
            `Warning: Prettier formatting failed for ${file.getFilePath()}, using unformatted content`,
            formatError
          );
        }
      });

      // Wait for all formatting to complete
      await Promise.all(formatPromises);

      // Save all files at once
      await project.save();
    } catch (e) {
      console.error("Error: unable to write files for prisma-zod-nest-gen", e);
      throw e;
    }
  },
});
