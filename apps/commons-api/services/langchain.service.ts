import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

export const postgresCheckpointer = PostgresSaver.fromConnString(
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DATABASE}`
);
