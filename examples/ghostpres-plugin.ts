import postgres from "postgres";
import { collection, aggregate } from "ghostpres";
import type { HzmlPlugin } from "../hzml/plugin";

interface GhostpresPluginOptions {
  url: string;
  max?: number;
}

export function ghostpres(options: GhostpresPluginOptions): HzmlPlugin {
  return {
    name: "ghostpres",
    setup(ctx) {
      const sql = postgres(options.url, { max: options.max ?? 10 });

      ctx.extend("sql", sql);
      ctx.extend("ghost", collection);
      ctx.extend("aggregate", aggregate);
      ctx.extend("pg", {
        unsafe: (text: string, values: unknown[]) =>
          sql.unsafe(text, values as any[]) as unknown as Promise<unknown[]>,
      });

      ctx.setDb({
        async query(text, params) {
          return (await sql.unsafe(text, (params ?? []) as any[])) as Record<string, any>[];
        },
        async run(text, params) {
          await sql.unsafe(text, (params ?? []) as any[]);
          return { changes: 0 };
        },
        close() {
          sql.end();
        },
      });
    },
  };
}
