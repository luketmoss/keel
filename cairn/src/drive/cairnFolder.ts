/* The Drive REST API calls this app needs, all reachable under the
   `drive.file` scope alone: `about.get` for the signed-in account's identity,
   and a files list/create pair scoped to a folder named `Cairn` at Drive's
   root. Plain `fetch` against the REST API rather than the `gapi` client
   library — one dependency fewer, and every call is a plain request a test
   can mock the same way `useTrackImport`'s network test does. */

import { reportDriveAuthError } from './authEvents'

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_ABOUT_URL = 'https://www.googleapis.com/drive/v3/about'
const FOLDER_NAME = 'Cairn'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'

/** The access token has expired or been revoked. The caller's job is to
    surface a re-authenticate prompt, not retry the same request. */
export class DriveAuthError extends Error {
  constructor() {
    super('Drive access token has expired')
    this.name = 'DriveAuthError'
  }
}

/** Any other failure — network error, API not enabled, quota, etc. Distinct
    from `DriveAuthError` because the recovery is "retry the call", not
    "reconnect the account". */
export class DriveRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveRequestError'
  }
}

export interface DriveAccount {
  email: string
}

interface DriveFile {
  id: string
  createdTime: string
}

async function driveFetch(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    })
  } catch (error) {
    throw new DriveRequestError(error instanceof Error ? error.message : 'Network error')
  }

  if (response.status === 401) {
    reportDriveAuthError(accessToken)
    throw new DriveAuthError()
  }
  if (!response.ok) {
    throw new DriveRequestError(`Drive request failed with status ${response.status}`)
  }
  return response.json()
}

/** The `about.get` endpoint is available under `drive.file`, unlike most of
    the API — which is what lets sign-in show an email without requesting a
    broader scope just to learn who the user is. */
export async function getDriveAccount(accessToken: string): Promise<DriveAccount> {
  const body = (await driveFetch(
    `${DRIVE_ABOUT_URL}?fields=user(emailAddress)`,
    accessToken,
  )) as { user?: { emailAddress?: string } }

  const email = body.user?.emailAddress
  if (!email) throw new DriveRequestError('Drive did not return an account email')
  return { email }
}

async function listCairnFolders(accessToken: string): Promise<DriveFile[]> {
  // #73: no `'root' in parents` constraint — under `drive.file` this query
  // already only ever returns folders the app itself created, so the
  // parent filter never distinguished anything. It only cost something: a
  // `/Cairn/` folder the user tidied out of Drive root became invisible,
  // and the next sign-in created a duplicate at root instead of finding it.
  const query = [`name='${FOLDER_NAME}'`, `mimeType='${FOLDER_MIME_TYPE}'`, 'trashed=false'].join(
    ' and ',
  )

  const url = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=files(id,createdTime)`
  const body = (await driveFetch(url, accessToken)) as { files?: DriveFile[] }
  return body.files ?? []
}

async function createCairnFolder(accessToken: string): Promise<DriveFile> {
  return (await driveFetch(DRIVE_FILES_URL, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME_TYPE, parents: ['root'] }),
  })) as DriveFile
}

/** Reuses an existing `/Cairn/` folder rather than creating a duplicate. If
    more than one exists — created by hand outside the app — the oldest by
    `createdTime` wins; picking deterministically matters more than which
    one. */
export async function findOrCreateCairnFolder(accessToken: string): Promise<string> {
  const existing = await listCairnFolders(accessToken)
  if (existing.length > 0) {
    const oldest = [...existing].sort((a, b) => a.createdTime.localeCompare(b.createdTime))[0]
    return oldest.id
  }
  const created = await createCairnFolder(accessToken)
  return created.id
}
