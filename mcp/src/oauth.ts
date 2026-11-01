import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider'
import {
  FORAGE_RESOURCE,
  FORAGE_WRITE_RESOURCE,
  HIVE_RESOURCE,
  HIVE_WRITE_RESOURCE,
  PUBLIC_URL,
  THRIVE_RESOURCE,
  THRIVE_WRITE_RESOURCE,
} from './config'
import type { Env } from './env'

/**
 * The Worker is its own OAuth authorization server, and each MCP endpoint is a
 * separate protected resource. Separate audiences are the point: a token issued
 * for /hive/mcp is refused at any other endpoint. Its own module, not the entry
 * module's, so a test can mint a real token (index.tokens.test.ts).
 */
export const authorizationServer = new OAuthAuthorizationServer<Env>({
  issuer: PUBLIC_URL,
  resources: [
    HIVE_RESOURCE,
    THRIVE_RESOURCE,
    HIVE_WRITE_RESOURCE,
    THRIVE_WRITE_RESOURCE,
    FORAGE_RESOURCE,
    FORAGE_WRITE_RESOURCE,
  ],
  clientRegistrationEndpoint: '/oauth/register',
  clientIdMetadataDocumentEnabled: true,
})
