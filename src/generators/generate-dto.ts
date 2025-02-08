import { camelCase, kebabCase, snakeCase } from "lodash";
import * as path from "node:path";
import {
  EnumMemberStructure,
  OptionalKind,
  Project,
  VariableDeclarationKind,
} from "ts-morph";

import { DMMF } from "@prisma/generator-helper";

export class GenerateDto {
  constructor(
    private dmmfDocument: DMMF.Document,
    private project: Project,
    private outputDir: string
  ) {}

  generate() {
    this.generateEnums();
    this.generateDtos();
    this.generateGlobalIndexFile();
  }

  private generateEnums() {
    const dirPath = path.resolve(this.outputDir, "enums");
    const filePath = path.resolve(dirPath, `index.ts`);
    const indexSourceFile = this.project.createSourceFile(filePath, undefined, {
      overwrite: true,
    });

    this.dmmfDocument.datamodel.enums.forEach((enumDef) => {
      const filePath = path.resolve(dirPath, `./${kebabCase(enumDef.name)}.ts`);
      const sourceFile = this.project.createSourceFile(filePath, undefined, {
        overwrite: true,
      });

      let enumString = `export const ${enumDef.name} = {`;
      enumDef.values.forEach(({ name: value }) => {
        enumString += `  ${value}: "${value}",\n`;
      });
      enumString += `} as const;\n\n`;
      enumString += `export type ${enumDef.name} = (typeof ${enumDef.name})[keyof typeof ${enumDef.name}];\n`;

      sourceFile.addStatements([enumString]);

      indexSourceFile.addExportDeclarations([
        {
          moduleSpecifier: `./${kebabCase(enumDef.name)}`,
          namedExports: [`${enumDef.name}`],
        },
      ]);
    });
  }

  private generateDtos() {
    for (const model of this.dmmfDocument.datamodel.models) {
      const dtoFolderPath = path.resolve(
        this.outputDir,
        `${kebabCase(model.name)}/dto`
      );

      this.generateEntityDto(model, dtoFolderPath);

      const dtoTypes = [
        {
          prefix: "create",
          suffix: "request",
          filterTag: "@create",
          transform: (dto: string) => `${dto}.pick({%content%})`,
        },
        {
          prefix: "update",
          suffix: "request",
          filterTag: "@update",
          transform: (dto: string) => `${dto}.pick({%content%})`,
        },
        {
          prefix: "list",
          suffix: "response",
          transform: (dto: string) => `${dto}.array()`,
        },
      ];

      dtoTypes.forEach((type) => {
        this.generateSpecializedDto(model, dtoFolderPath, type);
      });

      this.generateIndexFile(model, dtoFolderPath);
    }
  }

  private generateEntityDto(model: DMMF.Model, dirPath: string) {
    const filePath = path.resolve(dirPath, `${kebabCase(model.name)}.dto.ts`);
    const sourceFile = this.project.createSourceFile(filePath, undefined, {
      overwrite: true,
    });

    sourceFile.addImportDeclaration({
      moduleSpecifier: "zod",
      namedImports: ["z"],
    });

    const schemaContent = model.fields
      .map((field) => {
        if (!field.relationName) {
          const zodType = this.getPrismaToZodType(field, true);
          const fieldDoc = field.documentation
            ? `  /** ${field.documentation} */\n`
            : "";
          return `${fieldDoc}  ${field.name}: ${zodType},`;
        }
      })
      .join("\n");

    const relationContent = model.fields
      .map((field) => {
        if (field.relationName) {
          const zodType = this.getPrismaToZodType(field, true);
          const fieldDoc = field.documentation
            ? `  /** ${field.documentation} */\n`
            : "";
          return `${fieldDoc}  ${field.name}: ${zodType},`;
        }
      })
      .join("\n");

    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `${model.name}Dto`,
          initializer: `z.object({${schemaContent}})`,
        },
      ],
      isExported: true,
      leadingTrivia: (writer) => {
        if (model.documentation) {
          writer.writeLine("/**");
          writer.writeLine(` * ${model.documentation}`);
          writer.writeLine(" */");
        }
      },
    });
    sourceFile.addTypeAlias({
      name: `${model.name}Dto`,
      type: `z.infer<typeof ${model.name}Dto>`,
      isExported: true,
    });

    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: `${model.name}CompleteDto`,
          initializer: `${model.name}Dto.extend({${relationContent}})`,
        },
      ],
      isExported: true,
    });

    sourceFile.addTypeAlias({
      name: `${model.name}CompleteDto`,
      type: `z.infer<typeof ${model.name}CompleteDto>`,
      isExported: true,
    });
  }

  private generateSpecializedDto(
    model: DMMF.Model,
    dirPath: string,
    config: any
  ) {
    const fileName = config.prefix
      ? `${config.prefix}-${kebabCase(model.name)}-${config.suffix}.dto.ts`
      : `${kebabCase(model.name)}.dto.ts`;

    const filePath = path.resolve(dirPath, fileName);
    const sourceFile = this.project.createSourceFile(filePath, undefined, {
      overwrite: true,
    });

    sourceFile.addImportDeclarations([
      {
        moduleSpecifier: "zod",
        namedImports: ["z"],
      },
      {
        moduleSpecifier: `./${kebabCase(model.name)}.dto`,
        namedImports: [`${model.name}Dto`],
      },
    ]);

    let schemaContent = "";
    if (config.filterTag) {
      for (const field of model.fields) {
        if (field.documentation?.includes(config.filterTag)) {
          schemaContent += `${field.name}: true,\n`;
        }
      }
    }

    const dtoName = [
      config.prefix
        ? config.prefix[0].toUpperCase() + config.prefix.slice(1)
        : "",
      model.name,
      config.suffix
        ? config.suffix[0].toUpperCase() + config.suffix.slice(1)
        : "",
      "Dto",
    ].join("");

    const initializer = config
      .transform(`${model.name}Dto`)
      .replace("%content%", schemaContent);

    sourceFile.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: dtoName,
          initializer,
        },
      ],
      isExported: true,
    });

    sourceFile.addTypeAlias({
      name: dtoName,
      type: `z.infer<typeof ${dtoName}>`,
      isExported: true,
    });
  }

  private generateIndexFile(model: DMMF.Model, dirPath: string) {
    const writeLocation = path.join(dirPath, `index.ts`);
    const sourceFile = this.project.createSourceFile(writeLocation, undefined, {
      overwrite: true,
    });

    const exports = [
      `${model.name}Dto`,
      `Create${model.name}RequestDto`,
      `Update${model.name}RequestDto`,
      `List${model.name}ResponseDto`,
    ];

    const exportDeclarations = exports.map((exportName) => ({
      moduleSpecifier: `./${kebabCase(exportName)}`.replace(/-dto/g, ".dto"),
    }));

    sourceFile.addExportDeclarations(exportDeclarations);
  }

  private generateGlobalIndexFile() {
    const filePath = path.resolve(this.outputDir, `index.ts`);
    const sourceFile = this.project.createSourceFile(filePath, undefined, {
      overwrite: true,
    });
    // get all unique model names
    const uniqueModelsName = new Set(
      this.dmmfDocument.datamodel.models.map((model) => model.name)
    );

    // unique model names
    sourceFile.addExportDeclarations([
      {
        moduleSpecifier: "./enums",
        // namespaceExport: 'enums'
      },
      ...Array.from(uniqueModelsName).map((name) => ({
        moduleSpecifier: `./${kebabCase(name)}/dto`,
      })),
    ]);
  }

  private getPrismaToZodType(field: any, isComplete: boolean = false): string {
    const typeMap: { [key: string]: string } = {
      String: "z.string()",
      Boolean: "z.boolean()",
      Int: "z.number().int()",
      BigInt: "z.bigint()",
      Float: "z.number()",
      Decimal: "z.number()",
      DateTime: "z.date()",
      Json: "z.any()",
      Bytes: "z.instanceof(Buffer)",
    };
    let zodType = typeMap[field.type] || "z.any()";

    if (field.kind === "enum") {
      zodType = `z.nativeEnum(${field.type})`;
    }

    if (!field.isRequired && field.isList) {
      zodType = `z.array(${zodType}.nullable())`;
    }

    if (isComplete && field.relationName && field.isList) {
      zodType = `z.array(${field.type}Dto).optional()`;
    }

    if (isComplete && field.relationName && !field.isList) {
      zodType = `${field.type}Dto`;
    }

    if (!field.isRequired && !field.isList) {
      zodType = `${zodType}.nullable()`;
    }

    return zodType;
  }
}
