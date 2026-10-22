import { buildMapData } from "./build-map-data.mjs";

console.log(JSON.stringify(await buildMapData(), null, 2));
