// The OAuth library imports `cloudflare:workers`, which only exists inside
// workerd. Unit tests run in Node, so they get this stand-in.
export class WorkerEntrypoint {}
export class DurableObject {}
export class RpcTarget {}
