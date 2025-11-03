import { DocumentStore } from "ravendb";

export const ravendb = new DocumentStore("http://localhost:38880", "marci-demo");
ravendb.conventions.useHttpDecompression = false

ravendb.initialize()


