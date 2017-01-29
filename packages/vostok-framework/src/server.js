// @flow
import koa from "koa";
import koaRouter from "koa-router";
import koaBody from "koa-bodyparser";
import helmet from "koa-helmet";

import { graphqlKoa } from "graphql-server-koa";
import { graphiqlKoa } from "graphql-server-koa";

export function buildDefaultServer() {
  const app = new koa();
  const router = new koaRouter();

  app.use(helmet());
  app.use(koaBody());

  router.post("/graphql", graphqlKoa({ schema: "" }));
  router.get("/graphiql", graphiqlKoa({ endpointURL: "/graphql" }));

  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

