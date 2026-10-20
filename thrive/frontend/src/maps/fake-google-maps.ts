// A small stand-in for `google.maps`, enough for the route map's tests: what it
// was asked to draw is recorded, and nothing needs a network or a real key.

export interface FakePolyline {
  options: Record<string, any>;
}

export interface FakeMapState {
  maps: Array<{ container: HTMLElement; options: Record<string, any>; fitted?: { padding: unknown }; zoom?: number }>;
  polylines: FakePolyline[];
}

/** Install the fake as `window.google`, and return what it records. */
export function installFakeGoogleMaps(): FakeMapState {
  const state: FakeMapState = { maps: [], polylines: [] };

  class LatLngBounds {
    private pts: Array<{ lat: number; lng: number }> = [];
    extend(p: { lat: number; lng: number }) {
      this.pts.push(p);
    }
    getNorthEast() {
      return this.corner(Math.max, Math.max);
    }
    getSouthWest() {
      return this.corner(Math.min, Math.min);
    }
    getCenter() {
      return { lat: 0, lng: 0 };
    }
    private corner(fa: (...n: number[]) => number, fb: (...n: number[]) => number) {
      const lat = fa(...this.pts.map((p) => p.lat));
      const lng = fb(...this.pts.map((p) => p.lng));
      return { lat, lng, equals: (o: { lat: number; lng: number }) => o.lat === lat && o.lng === lng };
    }
  }

  class FakeMap {
    private entry: FakeMapState['maps'][number];
    constructor(container: HTMLElement, options: Record<string, any>) {
      this.entry = { container, options };
      state.maps.push(this.entry);
    }
    fitBounds(_bounds: unknown, padding: unknown) {
      this.entry.fitted = { padding };
    }
    setCenter() {}
    setZoom(z: number) {
      this.entry.zoom = z;
    }
    getZoom() {
      return this.entry.zoom ?? 12;
    }
  }

  class Polyline {
    constructor(public options: Record<string, any>) {
      state.polylines.push(this);
    }
  }

  (window as any).google = {
    maps: {
      Map: FakeMap,
      Polyline,
      LatLngBounds,
      SymbolPath: { CIRCLE: 0 },
      ControlPosition: { LEFT_BOTTOM: 6, RIGHT_BOTTOM: 12 },
      MapTypeControlStyle: { HORIZONTAL_BAR: 1 },
      event: { addListenerOnce: () => ({}) },
      importLibrary: async () => ({}),
    },
  };
  return state;
}

export function removeFakeGoogleMaps() {
  delete (window as any).google;
}
