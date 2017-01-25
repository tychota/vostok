// @flow
import koa from "koa";
import koaRouter from "koa-router";
import koaBody from "koa-bodyparser";
import { graphqlKoa } from "graphql-server-koa";

function server() {
  const app = new koa();
  const router = new koaRouter();

  app.use(koaBody());

  router.post("/graphql", graphqlKoa({ schema: "" }));
  app.use(router.routes());
  app.use(router.allowedMethods());

  return app;
}

export default { server };
