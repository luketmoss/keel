import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { ImportInput } from '../api/types';
import { Sheet } from '../ui/sheet';
import { BOOKMARKLET } from './bookmarklet';
import { readImportText } from './read-input';
import { openReview } from './review-state';

/** The fixed sentence for each reason a read failed. The API's own text is never shown. */
export const READ_MESSAGES: Record<string, string> = {
  blocked:
    "That site won't let Forage read the page. Open the recipe in your browser, tap the Forage import bookmark, then paste here.",
  unreachable: "Couldn't reach that page. Check the link and try again.",
  no_recipe: 'No recipe found on that page. Try the saved page, or paste the recipe as text.',
  bad_url: "That doesn't look like a web link.",
  too_large: "That page's recipe data is too big to send. Paste just the recipe text instead.",
  offline: "You're offline. Importing needs a connection.",
  other: "Couldn't read that recipe. Try again.",
};

const isWebLink = (s: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(s.trim());

type Failure = { code: string; route: 'link' | 'paste' };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface Props {
  api: ForageApi;
  onClose: () => void;
}

/** Import a recipe: a link, the open page (the bookmarklet), or a file or paste. */
export function ImportSheet({ api, onClose }: Props) {
  const [link, setLink] = useState('');
  const [paste, setPaste] = useState('');
  const [reading, setReading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [showPage, setShowPage] = useState(false);
  const online = useOnline();
  const abort = useRef<AbortController | null>(null);
  const pasteBox = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkField = useRef<HTMLInputElement>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // A blocked, empty or oversized read leads to the paste box, once it is enabled again.
  useEffect(() => {
    if (!reading && failure && ['blocked', 'no_recipe', 'too_large'].includes(failure.code)) pasteBox.current?.focus();
  }, [failure, reading]);

  async function read(input: ImportInput, route: Failure['route']) {
    setFailure(null);
    setReading(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const [preview, library] = await Promise.all([
        api.previewImport(input, controller.signal),
        api.getFoods().catch(() => []),
      ]);
      if (controller.signal.aborted) return;
      openReview(preview, library);
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return;
      const code = err instanceof ApiError && READ_MESSAGES[err.code] ? err.code : 'other';
      setFailure({ code, route });
      if (code === 'blocked') setShowPage(true);
    } finally {
      if (abort.current === controller) abort.current = null;
      setReading(false);
    }
  }

  function readLink() {
    if (!isWebLink(link)) {
      setFailure({ code: 'bad_url', route: 'link' });
      return;
    }
    void read({ url: link.trim() }, 'link');
  }

  function readText(text: string) {
    const result = readImportText(text);
    if ('error' in result) {
      setFailure({ code: result.error, route: 'paste' });
      return;
    }
    void read(result.input, 'paste');
  }

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    readText(await readFile(file));
    (e.target as HTMLInputElement).value = '';
  }

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setReading(false);
  }

  const disabled = reading || !online;
  const message = !online
    ? READ_MESSAGES.offline
    : failure && failure.code !== 'bad_url'
      ? READ_MESSAGES[failure.code]
      : null;

  return (
    <Sheet title="Import a recipe" onClose={onClose} testId="import-sheet">
      <form
        class="import-route"
        onSubmit={(e) => {
          e.preventDefault();
          readLink();
        }}
      >
        <label for="import-link" class="field-label">
          Recipe link
        </label>
        <input
          ref={linkField}
          id="import-link"
          class="field"
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellcheck={false}
          value={link}
          disabled={reading}
          data-autofocus
          aria-describedby={failure?.code === 'bad_url' ? 'import-link-error' : undefined}
          onInput={(e) => setLink(e.currentTarget.value)}
        />
        {failure?.code === 'bad_url' && (
          <p id="import-link-error" class="field-error">
            {READ_MESSAGES.bad_url}
          </p>
        )}
        <button type="submit" class="btn btn-primary" disabled={disabled || !/^https?:\/\//i.test(link.trim())}>
          Read recipe
        </button>
      </form>

      {reading && (
        <div class="import-status" role="status">
          <span class="spinner" aria-hidden="true" />
          <span>Reading the recipe…</span>
          <button type="button" class="text-btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {!reading && message && (
        <div
          class={`import-status ${failure?.code === 'blocked' ? 'is-warning' : ''}`}
          role="status"
          data-testid="import-message"
        >
          <span>{message}</span>
          {failure?.code === 'unreachable' && failure.route === 'link' && (
            <button type="button" class="btn btn-primary" onClick={readLink} disabled={disabled}>
              Try again
            </button>
          )}
        </div>
      )}

      <p class="import-divider">Site won't open? Use the page itself</p>
      <button
        type="button"
        class="disclosure"
        aria-expanded={showPage}
        aria-controls="import-bookmarklet"
        onClick={() => setShowPage(!showPage)}
      >
        From the open page
      </button>
      {showPage && (
        <div id="import-bookmarklet" class="import-bookmarklet" data-testid="bookmarklet">
          {/* A javascript: link is the bookmarklet itself; it is dragged, not followed here. */}
          <a class="bookmarklet-link" href={BOOKMARKLET} onClick={(e) => e.preventDefault()}>
            Forage import
          </a>
          <p class="hint">Drag this to your bookmarks bar. On a recipe page, tap it, then come back here and paste.</p>
        </div>
      )}

      <div class="import-route">
        <input
          ref={fileInput}
          type="file"
          accept=".html,.htm,.json,.txt,.md"
          class="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="import-file"
          onChange={onFile}
        />
        <button type="button" class="btn btn-secondary" disabled={disabled} onClick={() => fileInput.current?.click()}>
          Choose a file
        </button>
        <label for="import-paste" class="field-label">
          Or paste the copied recipe, or the recipe as text
        </label>
        <textarea
          ref={pasteBox}
          id="import-paste"
          class="field"
          rows={6}
          value={paste}
          disabled={reading}
          onInput={(e) => setPaste(e.currentTarget.value)}
        />
        <button
          type="button"
          class="btn btn-primary"
          disabled={disabled || !paste.trim()}
          onClick={() => readText(paste)}
        >
          Read pasted recipe
        </button>
      </div>
    </Sheet>
  );
}
