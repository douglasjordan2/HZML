import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHarness, pageRequest, partialRequest, type Harness } from "./fixtures/handler-harness";
import { createSQLiteAdapter } from "./db";

let h: Harness;

beforeAll(async () => {
  const db = createSQLiteAdapter(":memory:");
  db.run("CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT)");
  db.run("INSERT INTO todos (title) VALUES (?), (?)", ["one", "two"]);

  h = await createHarness({
    db,
    routes: {
      "greet.hzml":
        '<server>hzml.get(() => ({ name: "douglas" }))</server>' +
        "<template><p>hi ${name}</p></template>",
      "$user.hzml":
        "<server>hzml.get((req) => ({ u: req.params.user }))</server>" +
        "<template><b>${u}</b></template>",
      "count.hzml":
        '<server>hzml.get(() => { const rows = hzml.db.query("SELECT count(*) AS c FROM todos"); return { c: rows[0].c } })</server>' +
        "<template><i>count:${c}</i></template>",
      "away.hzml":
        '<server>hzml.get(() => hzml.redirect("/target"))</server>' +
        "<template><p>never rendered</p></template>",
    },
  });
});

afterAll(async () => {
  await h.cleanup();
});

describe("script routes", () => {
  test("server data flows into the template", async () => {
    const body = await (await h.handler(pageRequest("/greet"))).text();
    expect(body).toContain("<p>hi douglas</p>");
  });

  test("dynamic route params reach the handler", async () => {
    const body = await (await h.handler(pageRequest("/alice"))).text();
    expect(body).toContain("<b>alice</b>");
  });

  test("hzml.db queries work through the AsyncLocalStorage adapter", async () => {
    const body = await (await h.handler(pageRequest("/count"))).text();
    expect(body).toContain("<i>count:2</i>");
  });
});

describe("redirects", () => {
  test("partial request gets a 302 with Location", async () => {
    const res = await h.handler(partialRequest("/away"));
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/target");
  });

  test("full-page request streams a meta refresh and location.replace", async () => {
    const res = await h.handler(pageRequest("/away"));
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('<meta http-equiv="refresh" content="0;url=/target">');
    expect(body).toContain('location.replace("/target")');
    expect(body).not.toContain("never rendered");
  });
});
