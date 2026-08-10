declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}
