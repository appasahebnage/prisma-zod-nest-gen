import { Project } from "ts-morph";
import { DMMF } from "@prisma/generator-helper";
export declare class GenerateDto {
    private dmmfDocument;
    private project;
    private outputDir;
    constructor(dmmfDocument: DMMF.Document, project: Project, outputDir: string);
    generate(): void;
    private generateEnums;
    private generateDtos;
    private generateEntityDto;
    private generateSpecializedDto;
    private generateIndexFile;
    private generateGlobalIndexFile;
    private getPrismaToZodType;
}
