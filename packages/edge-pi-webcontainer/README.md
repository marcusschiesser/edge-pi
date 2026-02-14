# edge-pi-webcontainer

WebContainer runtime adapter for `edge-pi`.

This package is built on `@webcontainer/api` and can be used to run the built-in coding tools inside a browser-backed WebContainer.

## Usage

```ts
import { WebContainer } from "@webcontainer/api";
import { CodingAgent } from "edge-pi";
import { createWebContainerRuntime } from "edge-pi-webcontainer";

const webcontainer = await WebContainer.boot();
const runtime = createWebContainerRuntime(webcontainer);

const agent = new CodingAgent({
  model,
  cwd: "/home/project",
  runtime,
});
```
