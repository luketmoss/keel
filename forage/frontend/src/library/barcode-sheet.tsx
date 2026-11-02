import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { BarcodeLookup, Food } from '../api/types';
import { Sheet } from '../ui/sheet';
import { barcodeDigits } from './food-math';

interface Props {
  api: ForageApi;
  /** Found (with or without nutrition): the form, prefilled. */
  onFound: (food: Partial<Food>, lookup: BarcodeLookup) => void;
  /** Not on Open Food Facts: the label form with the barcode kept. */
  onTypeIt: (barcode: string) => void;
  /** Already yours: that food's sheet. */
  onOpen: (id: string) => void;
  onClose: () => void;
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'yours'; id: string; name: string }
  | { kind: 'missing' }
  | { kind: 'failed'; text: string };

/** What the browser offers: BarcodeDetector with EAN-13 and UPC-A, or nothing. */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

function detectorClass(): DetectorClass | null {
  const c = (globalThis as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  return c ?? null;
}

/** The Barcode sheet (#707): type the digits, or scan where the browser can, then look it up. */
export function BarcodeSheet({ api, onFound, onTypeIt, onOpen, onClose }: Props) {
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const code = barcodeDigits(value);

  useEffect(() => {
    const C = detectorClass();
    if (!C) return;
    if (!C.getSupportedFormats) {
      setCanScan(true);
      return;
    }
    C.getSupportedFormats()
      .then((f) => setCanScan(f.includes('ean_13') && f.includes('upc_a')))
      .catch(() => setCanScan(false));
  }, []);

  function stopCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setScanning(false);
  }
  useEffect(() => stopCamera, []);

  async function lookUp(digits: string) {
    setOutcome({ kind: 'busy' });
    try {
      const res = await api.lookupBarcode(digits);
      if (res.already_in_library) {
        setOutcome({ kind: 'yours', ...res.already_in_library });
      } else if (!res.found || !res.food) {
        setOutcome({ kind: 'missing' });
      } else {
        onFound(res.food, res);
      }
    } catch (err) {
      const busy = err instanceof ApiError && err.code === 'busy';
      setOutcome({
        kind: 'failed',
        text: busy
          ? 'Open Food Facts is busy. Try again in a minute.'
          : "Couldn't reach Open Food Facts. Try again, or type it from the label.",
      });
    }
  }

  async function scan() {
    setCameraError(false);
    const C = detectorClass();
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      stream.current = media;
      setScanning(true);
      // Wait for the video element to mount.
      await new Promise((r) => setTimeout(r, 0));
      const el = video.current!;
      el.srcObject = media;
      await el.play();
      const detector = new C!({ formats: ['ean_13', 'upc_a', 'ean_8'] });
      const tick = async () => {
        if (!stream.current) return;
        try {
          const found = await detector.detect(el);
          const digits = found.map((b) => barcodeDigits(b.rawValue)).find(Boolean);
          if (digits) {
            stopCamera();
            setValue(digits);
            void lookUp(digits);
            return;
          }
        } catch {
          // A frame that could not be read; try the next.
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      stopCamera();
      setCameraError(true);
    }
  }

  const close = () => {
    stopCamera();
    onClose();
  };

  if (scanning) {
    return (
      <Sheet title="Scan a barcode" onClose={close} testId="barcode-camera">
        <div
          class="camera-view"
          onKeyDown={(e) => {
            if (e.key === 'Escape') stopCamera();
          }}
        >
          <video ref={video} class="camera-video" aria-hidden="true" muted playsInline />
          <div class="camera-guide" aria-hidden="true" />
        </div>
        <p class="hint">Hold the barcode inside the frame.</p>
        <button type="button" class="btn btn-secondary btn-block" onClick={stopCamera} data-autofocus>
          Cancel
        </button>
      </Sheet>
    );
  }

  const busy = outcome.kind === 'busy';
  return (
    <Sheet title="Barcode" onClose={close} testId="barcode-sheet">
      <label class="form-group">
        <span class="field-label">Barcode</span>
        <input
          class="field"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          data-autofocus
          onInput={(e) => {
            setValue(e.currentTarget.value.replace(/[^\d\s]/g, ''));
            setOutcome({ kind: 'idle' });
          }}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && code && !busy) void lookUp(code);
          }}
          data-testid="barcode-field"
        />
        {touched && value.trim() !== '' && !code && (
          <span class="field-error">A barcode is 8, 12, 13 or 14 digits.</span>
        )}
      </label>
      <button
        type="button"
        class="btn btn-primary btn-block"
        disabled={!code || busy}
        onClick={() => code && void lookUp(code)}
        data-testid="barcode-lookup"
      >
        Look up
      </button>
      {canScan && (
        <button type="button" class="btn btn-secondary btn-block" onClick={() => void scan()}>
          Scan with the camera
        </button>
      )}
      {cameraError && <p role="status">Couldn't use the camera. You can type the barcode instead.</p>}
      <div role="status" class="barcode-status">
        {busy && (
          <p>
            <span class="spinner" aria-hidden="true" /> Looking up…
          </p>
        )}
        {outcome.kind === 'yours' && (
          <>
            <p>That's already in your library as {outcome.name}.</p>
            <button type="button" class="text-btn" onClick={() => onOpen(outcome.id)}>
              Open it
            </button>
          </>
        )}
        {outcome.kind === 'missing' && (
          <>
            <p>Open Food Facts doesn't have this barcode.</p>
            <button type="button" class="text-btn" onClick={() => onTypeIt(code ?? value.replace(/\s+/g, ''))}>
              Type it from the label
            </button>
          </>
        )}
        {outcome.kind === 'failed' && <p class="field-error">{outcome.text}</p>}
      </div>
    </Sheet>
  );
}
