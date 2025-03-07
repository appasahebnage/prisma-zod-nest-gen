import {
  IndentationText,
  ModuleKind,
  NewLineKind,
  Project,
  ScriptTarget,
} from "ts-morph";
import { getTestDMMF } from "./jest.setup";
import { GenerateDto } from "../src/generators/generate-dto";
import { join } from "path";
import { rmSync } from "fs";
import { getDMMF } from "@prisma/internals";
import prettier from "prettier";

const prettierConfig: prettier.Options = {
  singleQuote: true,
  trailingComma: "all",
  printWidth: 120,
  parser: "typescript",
};

describe("Generator", () => {
  const outputDir = join(__dirname, "../generated");

  beforeEach(() => {
    try {
      rmSync(outputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  it("should generate DTOs and Zod schemas for all models", async () => {
    const dmmf = await getTestDMMF();
    const dmmfDocument = dmmf.datamodel;
    // const dmmfDocument = await getDMMF({
    //   datamodel
    //   previewFeatures: ["interactiveTransactions"],
    // });
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

    const generateDto = new GenerateDto(
      {
        datamodel: dmmfDocument,
        schema: dmmf.schema,
        mappings: dmmf.mappings,
      },
      project,
      outputDir
    );
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
        // try {
        //   // Format with prettier
        //   const formattedContent = await prettier.format(
        //     fileContent,
        //     prettierConfig
        //   );
        //   file.replaceWithText(formattedContent);
        // } catch (formatError) {
        //   console.warn(
        //     `Warning: Prettier formatting failed for ${file.getFilePath()}, using unformatted content`,
        //     formatError
        //   );
        // }
      });

      // Wait for all formatting to complete
      await Promise.all(formatPromises);
      // Save the files
      await project.save();
    } catch (e) {
      console.error("Error: unable to write files for prisma-zod-nest-gen", e);
      throw e;
    }

    // Get all generated files
    const sourceFiles = project.getSourceFiles();

    // Basic assertions
    expect(sourceFiles.length).toBeGreaterThan(0);

    // Check if we have generated files for our models
    const fileNames = sourceFiles.map((file) => file.getBaseName());
    expect(fileNames).toContain("user.dto.ts");
    expect(fileNames).toContain("post.dto.ts");
    expect(fileNames).toContain("profile.dto.ts");
  });
});
