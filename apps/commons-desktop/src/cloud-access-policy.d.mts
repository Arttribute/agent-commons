export type CloudAccess = { readFiles: boolean; writeFiles: boolean; runCommands: boolean };
export declare const DEFAULT_CLOUD_ACCESS: Readonly<CloudAccess>;
export declare function normalizeCloudAccess(value: Partial<CloudAccess> | null | undefined): CloudAccess;
export declare function cloudToolPermission(tool: string): keyof CloudAccess | null;
export declare function assertCloudToolAllowed(tool: string, access: CloudAccess): void;
