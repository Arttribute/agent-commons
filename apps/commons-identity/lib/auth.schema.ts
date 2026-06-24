import { betterAuth } from "better-auth";
import { DataType, newDb } from "pg-mem";
import { commonsAuthOptions } from "@/lib/auth-config";

const memoryDatabase = newDb();
memoryDatabase.public.registerOperator({
  operator: "!~" as never,
  left: DataType.text,
  right: DataType.text,
  returns: DataType.bool,
  implementation: (value: string, pattern: string) =>
    !new RegExp(pattern).test(value),
});
memoryDatabase.public.registerFunction({
  name: "quote_ident",
  args: [DataType.text],
  returns: DataType.text,
  implementation: (value: string) => `"${value.replaceAll('"', '""')}"`,
});
memoryDatabase.public.registerFunction({
  name: "has_schema_privilege",
  args: [DataType.text, DataType.text],
  returns: DataType.bool,
  implementation: () => true,
});
memoryDatabase.public.registerFunction({
  name: "col_description",
  args: [DataType.integer, DataType.integer],
  returns: DataType.text,
  implementation: () => null,
  allowNullArguments: true,
});
memoryDatabase.public.registerFunction({
  name: "pg_get_serial_sequence",
  args: [DataType.text, DataType.text],
  returns: DataType.text,
  implementation: () => null,
  allowNullArguments: true,
});
const adapter = memoryDatabase.adapters.createPg();
const pool = new adapter.Pool();

export const auth = betterAuth(commonsAuthOptions(pool));
