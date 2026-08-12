import { z } from 'zod/v4';
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema';

/**
 * Structured-output schemas for the Messages API.
 *
 * The SDK ships `zodOutputFormat`, but it imports `zod` from the project root
 * and calls `z.toJSONSchema`, which only exists in Zod 4. This app is on Zod
 * 3.25, where Zod 4 lives at the `zod/v4` subpath — so the helper resolves to
 * the v3 build and fails at bundle time.
 *
 * Rather than migrate every form and server action in the product to Zod 4 for
 * the sake of two AI schemas, the same twelve-line helper is reimplemented here
 * against `zod/v4` explicitly. The object it returns is exactly what
 * `client.messages.parse()` expects: a `json_schema` format plus a `parse`
 * function, which the SDK's parser calls on the response text.
 *
 * The consequence to keep in mind: schemas in `src/lib/ai/*` are Zod 4
 * instances and must not be nested inside the Zod 3 schemas used everywhere
 * else. Validate a draft with its own schema instead.
 */

export { z };

export interface ParseableFormat<T> {
  type: 'json_schema';
  schema: Record<string, unknown>;
  parse(content: string): T;
}

export function outputFormat<S extends z.ZodType>(schema: S): ParseableFormat<z.infer<S>> {
  const jsonSchema = transformJSONSchema(
    z.toJSONSchema(schema, { reused: 'ref' }) as Record<string, unknown>,
  );

  return {
    type: 'json_schema',
    schema: jsonSchema as Record<string, unknown>,
    parse(content: string) {
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch (error) {
        throw new Error(
          `The model's output was not valid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const result = schema.safeParse(raw);
      if (!result.success) {
        // Only the first few issues; a schema mismatch usually cascades and a
        // hundred-line message helps nobody read the actual problem.
        const issues = result.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`The model's output did not match the expected shape — ${issues}`);
      }

      return result.data as z.infer<S>;
    },
  };
}
