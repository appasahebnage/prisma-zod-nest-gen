"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerateDto = void 0;
const lodash_1 = require("lodash");
const path = __importStar(require("node:path"));
const ts_morph_1 = require("ts-morph");
class GenerateDto {
    constructor(dmmfDocument, project, outputDir) {
        this.dmmfDocument = dmmfDocument;
        this.project = project;
        this.outputDir = outputDir;
    }
    generate() {
        this.generateEnums();
        this.generateDtos();
        this.generateGlobalIndexFile();
    }
    generateEnums() {
        const dirPath = path.resolve(this.outputDir, "enums");
        const filePath = path.resolve(dirPath, `index.ts`);
        const indexSourceFile = this.project.createSourceFile(filePath, undefined, {
            overwrite: true,
        });
        this.dmmfDocument.datamodel.enums.forEach((enumDef) => {
            const filePath = path.resolve(dirPath, `./${(0, lodash_1.kebabCase)(enumDef.name)}.ts`);
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
                    moduleSpecifier: `./${(0, lodash_1.kebabCase)(enumDef.name)}`,
                    namedExports: [`${enumDef.name}`],
                },
            ]);
        });
    }
    generateDtos() {
        for (const model of this.dmmfDocument.datamodel.models) {
            const dtoFolderPath = path.resolve(this.outputDir, `${(0, lodash_1.kebabCase)(model.name)}/dto`);
            this.generateEntityDto(model, dtoFolderPath);
            const dtoTypes = [
                {
                    prefix: "create",
                    suffix: "request",
                    filterTag: "@create",
                    transform: (dto) => `${dto}.pick({%content%})`,
                },
                {
                    prefix: "update",
                    suffix: "request",
                    filterTag: "@update",
                    transform: (dto) => `${dto}.pick({%content%})`,
                },
                {
                    prefix: "list",
                    suffix: "response",
                    transform: (dto) => `${dto}.array()`,
                },
            ];
            dtoTypes.forEach((type) => {
                this.generateSpecializedDto(model, dtoFolderPath, type);
            });
            this.generateIndexFile(model, dtoFolderPath);
        }
    }
    generateEntityDto(model, dirPath) {
        const filePath = path.resolve(dirPath, `${(0, lodash_1.kebabCase)(model.name)}.dto.ts`);
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
            declarationKind: ts_morph_1.VariableDeclarationKind.Const,
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
            declarationKind: ts_morph_1.VariableDeclarationKind.Const,
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
    generateSpecializedDto(model, dirPath, config) {
        const fileName = config.prefix
            ? `${config.prefix}-${(0, lodash_1.kebabCase)(model.name)}-${config.suffix}.dto.ts`
            : `${(0, lodash_1.kebabCase)(model.name)}.dto.ts`;
        const filePath = path.resolve(dirPath, fileName);
        const sourceFile = this.project.createSourceFile(filePath, undefined, {
            overwrite: false,
        });
        sourceFile.addImportDeclarations([
            {
                moduleSpecifier: "zod",
                namedImports: ["z"],
            },
            {
                moduleSpecifier: `./${(0, lodash_1.kebabCase)(model.name)}.dto`,
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
            declarationKind: ts_morph_1.VariableDeclarationKind.Const,
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
    generateIndexFile(model, dirPath) {
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
            moduleSpecifier: `./${(0, lodash_1.kebabCase)(exportName)}`.replace(/-dto/g, ".dto"),
        }));
        sourceFile.addExportDeclarations(exportDeclarations);
    }
    generateGlobalIndexFile() {
        const filePath = path.resolve(this.outputDir, `index.ts`);
        const sourceFile = this.project.createSourceFile(filePath, undefined, {
            overwrite: true,
        });
        const uniqueModelsName = new Set(this.dmmfDocument.datamodel.models.map((model) => model.name));
        sourceFile.addExportDeclarations([
            {
                moduleSpecifier: "./enums",
            },
            ...Array.from(uniqueModelsName).map((name) => ({
                moduleSpecifier: `./${(0, lodash_1.kebabCase)(name)}/dto`,
            })),
        ]);
    }
    getPrismaToZodType(field, isComplete = false) {
        const typeMap = {
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
exports.GenerateDto = GenerateDto;
//# sourceMappingURL=generate-dto.js.map