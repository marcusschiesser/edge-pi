# edge-pi-webcontainer

WebContainer runtime adapter for `edge-pi`.

```ts
import { CodingAgent } from "edge-pi";
import { createWebContainerRuntime } from "edge-pi-webcontainer";

const runtime = createWebContainerRuntime(webcontainer);
const agent = new CodingAgent({ model, cwd: "/", runtime });
```
