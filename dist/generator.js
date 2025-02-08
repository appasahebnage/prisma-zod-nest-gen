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
const prettier = __importStar(require("prettier"));
const ts_morph_1 = require("ts-morph");
const generator_helper_1 = require("@prisma/generator-helper");
const internals_1 = require("@prisma/internals");
const constants_1 = require("./constants");
const generate_dto_1 = require("./generators/generate-dto");
const { version } = require("../package.json");
(0, generator_helper_1.generatorHandler)({
    onManifest() {
        return {
            version,
            defaultOutput: "../generated",
            prettyName: constants_1.GENERATOR_NAME,
        };
    },
    onGenerate: async (options) => {
        const outputDir = (0, internals_1.parseEnvValue)(options.generator.output);
        if (!outputDir)
            throw new Error("No output was specified for nestjs-prisma-graphql-crud-gen");
        const dataModels = options.datamodel;
        const dmmfDocument = await (0, internals_1.getDMMF)({
            datamodel: dataModels,
            previewFeatures: ["interactiveTransactions"],
        });
        const project = new ts_morph_1.Project({
            compilerOptions: {
                target: ts_morph_1.ScriptTarget.ES2019,
                module: ts_morph_1.ModuleKind.CommonJS,
                emitDecoratorMetadata: true,
                experimentalDecorators: true,
                esModuleInterop: true,
                declaration: true,
                importHelpers: true,
            },
        });
        const generateDto = new generate_dto_1.GenerateDto(dmmfDocument, project, outputDir);
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
                const fileContent = file.getFullText();
                const formattedContent = await prettier.format(fileContent, {
                    singleQuote: true,
                    trailingComma: "none",
                    printWidth: 100,
                    parser: "typescript",
                });
                file.replaceWithText(formattedContent);
            }
            await project.save();
        }
        catch (e) {
            console.error("Error: unable to write files for nestjs-prisma-graphql-crud-gen");
            throw e;
        }
    },
});
//# sourceMappingURL=generator.js.map